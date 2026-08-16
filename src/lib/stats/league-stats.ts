import { CHAMPIONS, CURRENT_SEASON, LEAGUE_IDS, getLeagueIdForSeason } from '@/lib/constants/league';
import { getKV } from '@/lib/server/kv';
import {
  getAllPlayersCached,
  getLeague,
  getLeagueMatchups,
  getLeaguePlayoffBrackets,
  getNFLState,
  getTeamsData,
  type SleeperBracketGame,
  type SleeperMatchup,
  type SleeperPlayer,
  type TeamData,
} from '@/lib/utils/sleeper-api';
import type {
  LeagueStatsDataset,
  StatsChampionRow,
  StatsFranchiseRow,
  StatsGameRow,
  StatsGameType,
  StatsPlayerCareerRow,
  StatsPlayerFranchiseSplit,
  StatsPlayerGameRow,
  StatsPlayerSeasonRow,
  StatsRecordEntry,
  StatsSeasonTeamRow,
} from './types';

const STATS_CACHE_VERSION = 'v1';
const MEMORY_TTL_MS = 5 * 60 * 1000;
const CURRENT_SEASON_TTL_MS = 15 * 60 * 1000;
const PAST_SEASON_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SeasonStatsSnapshot {
  season: string;
  playoffWeekStart: number;
  teams: StatsSeasonTeamRow[];
  games: StatsGameRow[];
  playerSeasons: StatsPlayerSeasonRow[];
  playerGames: StatsPlayerGameRow[];
}

interface CachedSeasonSnapshot {
  ts: number;
  data: SeasonStatsSnapshot | null;
}

interface MutablePlayerSeason {
  playerId: string;
  points: number;
  rosteredWeeks: number;
  starts: number;
  franchise: Map<string, { points: number; rosteredWeeks: number; starts: number }>;
  bestGamePoints: number | null;
  bestGameWeek: number | null;
  bestGameFranchise: string | null;
}

interface MutableTeamSeason {
  season: string;
  teamName: string;
  ownerId: string;
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

const memorySeasonCache = new Map<string, CachedSeasonSnapshot>();

function round2(value: number): number {
  return Number((Number(value) || 0).toFixed(2));
}

function safePct(wins: number, losses: number, ties: number): number {
  const games = wins + losses + ties;
  return games > 0 ? Number(((wins + ties * 0.5) / games).toFixed(4)) : 0;
}

function listConfiguredSeasons(): string[] {
  const seasons = new Set<string>([CURRENT_SEASON, ...Object.keys(LEAG_IDS_PREVIOUS())]);
  return Array.from(seasons).sort((a, b) => a.localeCompare(b));
}

function LEAG_IDS_PREVIOUS(): Record<string, string> {
  return (LEAGUE_IDS.PREVIOUS || {}) as Record<string, string>;
}

function seasonCacheKey(season: string): string {
  return `league-stats:season:${STATS_CACHE_VERSION}:${season}`;
}

function seasonTtlMs(season: string): number {
  return season === CURRENT_SEASON ? CURRENT_SEASON_TTL_MS : PAST_SEASON_TTL_MS;
}

async function readSeasonCache(season: string): Promise<CachedSeasonSnapshot | null> {
  try {
    const kv = await getKV();
    if (!kv) return null;
    const raw = await kv.get(seasonCacheKey(season));
    if (!raw || typeof raw !== 'string') return null;
    const parsed = JSON.parse(raw) as CachedSeasonSnapshot;
    if (!parsed || Date.now() - parsed.ts >= seasonTtlMs(season)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeSeasonCache(season: string, entry: CachedSeasonSnapshot): Promise<void> {
  try {
    const kv = await getKV();
    if (!kv) return;
    const key = seasonCacheKey(season);
    await kv.set(key, JSON.stringify(entry));
    if (kv.expire) await kv.expire(key, Math.ceil(seasonTtlMs(season) / 1000));
  } catch {
    // Stats still work from in-memory cache and live Sleeper data if shared KV is unavailable.
  }
}

async function currentSeasonEndWeek(season: string): Promise<number> {
  if (season !== CURRENT_SEASON) return 17;
  try {
    const state = await getNFLState();
    if (String(state.season ?? '') !== season) return 0;
    const type = String(state.season_type ?? '').toLowerCase();
    if (type.startsWith('post')) return 17;
    if (!type.startsWith('regular')) return 0;
    const week = Number(state.week ?? 0);
    return Number.isFinite(week) ? Math.max(0, Math.min(17, Math.floor(week))) : 0;
  } catch {
    return 0;
  }
}

function matchupPoints(matchup: SleeperMatchup): number {
  return Number(matchup.custom_points ?? matchup.points ?? 0) || 0;
}

function weekHasScoring(matchups: SleeperMatchup[]): boolean {
  return matchups.some((matchup) => {
    if (Math.abs(matchupPoints(matchup)) > 0) return true;
    return Object.values(matchup.players_points || {}).some((points) => Math.abs(Number(points) || 0) > 0);
  });
}

function matchupPairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function bracketPairSet(bracket: SleeperBracketGame[]): Set<string> {
  const set = new Set<string>();
  for (const game of bracket) {
    const t1 = Number(game.t1);
    const t2 = Number(game.t2);
    if (Number.isFinite(t1) && Number.isFinite(t2) && t1 > 0 && t2 > 0) {
      set.add(matchupPairKey(t1, t2));
    }
  }
  return set;
}

function gameTypeFor(
  week: number,
  playoffWeekStart: number,
  rosterA: number,
  rosterB: number,
  winnersPairs: Set<string>,
  losersPairs: Set<string>,
): StatsGameType {
  if (week < playoffWeekStart) return 'regular';
  const key = matchupPairKey(rosterA, rosterB);
  if (winnersPairs.has(key)) return 'playoffs';
  if (losersPairs.has(key)) return 'toilet';
  return 'postseason';
}

function teamIdentity(teamsByRoster: Map<number, TeamData>, rosterId: number): { teamName: string; ownerId: string } {
  const team = teamsByRoster.get(rosterId);
  return {
    teamName: team?.teamName || `Roster ${rosterId}`,
    ownerId: team?.ownerId || '',
  };
}

function playerIdentity(players: Record<string, SleeperPlayer>, playerId: string): { name: string; position: string; nflTeam: string | null } {
  const player = players[playerId];
  if (!player) return { name: playerId, position: 'UNK', nflTeam: null };
  const name = `${player.first_name || ''} ${player.last_name || ''}`.trim() || playerId;
  return { name, position: player.position || 'UNK', nflTeam: player.team || null };
}

async function buildSeasonSnapshot(season: string): Promise<SeasonStatsSnapshot | null> {
  const leagueId = getLeagueIdForSeason(season);
  if (!leagueId) return null;

  const endWeek = await currentSeasonEndWeek(season);
  const [league, teams, brackets, allPlayers] = await Promise.all([
    getLeague(leagueId).catch(() => null),
    getTeamsData(leagueId).catch(() => [] as TeamData[]),
    getLeaguePlayoffBrackets(leagueId).catch(() => ({ winners: [], losers: [] })),
    endWeek > 0 ? getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)) : Promise.resolve({} as Record<string, SleeperPlayer>),
  ]);

  const settings = (league?.settings || {}) as { playoff_week_start?: number; playoff_start_week?: number };
  const playoffWeekStart = Number(settings.playoff_week_start ?? settings.playoff_start_week ?? 15) || 15;
  const winnersPairs = bracketPairSet(brackets.winners || []);
  const losersPairs = bracketPairSet(brackets.losers || []);
  const teamsByRoster = new Map<number, TeamData>(teams.map((team) => [team.rosterId, team]));

  const mutableTeams = new Map<number, MutableTeamSeason>();
  for (const team of teams) {
    mutableTeams.set(team.rosterId, {
      season,
      teamName: team.teamName,
      ownerId: team.ownerId,
      rosterId: team.rosterId,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    });
  }

  const mutablePlayers = new Map<string, MutablePlayerSeason>();
  const games: StatsGameRow[] = [];
  const playerGames: StatsPlayerGameRow[] = [];

  const weeklyMatchups = endWeek > 0
    ? await Promise.all(
        Array.from({ length: endWeek }, (_, index) => index + 1).map((week) =>
          getLeagueMatchups(leagueId, week).catch(() => [] as SleeperMatchup[]),
        ),
      )
    : [];

  for (let index = 0; index < weeklyMatchups.length; index++) {
    const week = index + 1;
    const matchups = weeklyMatchups[index] || [];
    if (!weekHasScoring(matchups)) continue;

    for (const matchup of matchups) {
      const identity = teamIdentity(teamsByRoster, matchup.roster_id);
      const pointsMap = matchup.players_points || {};
      const rosteredIds = new Set<string>(matchup.players || []);
      const starters = new Set<string>(matchup.starters || []);
      const playerIds = new Set<string>([...rosteredIds, ...Object.keys(pointsMap)]);

      for (const playerId of playerIds) {
        if (!playerId) continue;
        const points = Number(pointsMap[playerId] ?? 0) || 0;
        let row = mutablePlayers.get(playerId);
        if (!row) {
          row = {
            playerId,
            points: 0,
            rosteredWeeks: 0,
            starts: 0,
            franchise: new Map(),
            bestGamePoints: null,
            bestGameWeek: null,
            bestGameFranchise: null,
          };
          mutablePlayers.set(playerId, row);
        }
        row.points += points;
        row.rosteredWeeks += 1;
        if (starters.has(playerId)) row.starts += 1;

        const split = row.franchise.get(identity.teamName) || { points: 0, rosteredWeeks: 0, starts: 0 };
        split.points += points;
        split.rosteredWeeks += 1;
        if (starters.has(playerId)) split.starts += 1;
        row.franchise.set(identity.teamName, split);

        if (row.bestGamePoints == null || points > row.bestGamePoints) {
          row.bestGamePoints = points;
          row.bestGameWeek = week;
          row.bestGameFranchise = identity.teamName;
        }

        if (points !== 0) {
          const meta = playerIdentity(allPlayers, playerId);
          playerGames.push({
            id: `${season}-${week}-${playerId}-${matchup.roster_id}`,
            playerId,
            name: meta.name,
            position: meta.position,
            season,
            week,
            franchiseName: identity.teamName,
            points: round2(points),
            started: starters.has(playerId),
          });
        }
      }
    }

    const pairs = new Map<number, SleeperMatchup[]>();
    for (const matchup of matchups) {
      const arr = pairs.get(matchup.matchup_id) || [];
      arr.push(matchup);
      pairs.set(matchup.matchup_id, arr);
    }

    for (const [matchupId, pair] of pairs.entries()) {
      if (pair.length < 2) continue;
      const a = pair[0];
      const b = pair[1];
      const scoreA = round2(matchupPoints(a));
      const scoreB = round2(matchupPoints(b));
      const aIdentity = teamIdentity(teamsByRoster, a.roster_id);
      const bIdentity = teamIdentity(teamsByRoster, b.roster_id);
      const tie = scoreA === scoreB;
      const winner = tie ? null : scoreA > scoreB ? aIdentity.teamName : bIdentity.teamName;
      const loser = tie ? null : scoreA > scoreB ? bIdentity.teamName : aIdentity.teamName;
      const gameType = gameTypeFor(week, playoffWeekStart, a.roster_id, b.roster_id, winnersPairs, losersPairs);

      games.push({
        id: `${season}-${week}-${matchupId}`,
        season,
        week,
        gameType,
        teamA: aIdentity.teamName,
        teamB: bIdentity.teamName,
        rosterA: a.roster_id,
        rosterB: b.roster_id,
        scoreA,
        scoreB,
        winner,
        loser,
        margin: round2(Math.abs(scoreA - scoreB)),
        combined: round2(scoreA + scoreB),
        tie,
      });

      if (gameType === 'regular') {
        const teamA = mutableTeams.get(a.roster_id);
        const teamB = mutableTeams.get(b.roster_id);
        if (teamA && teamB) {
          teamA.pointsFor += scoreA;
          teamA.pointsAgainst += scoreB;
          teamB.pointsFor += scoreB;
          teamB.pointsAgainst += scoreA;
          if (tie) {
            teamA.ties += 1;
            teamB.ties += 1;
          } else if (scoreA > scoreB) {
            teamA.wins += 1;
            teamB.losses += 1;
          } else {
            teamB.wins += 1;
            teamA.losses += 1;
          }
        }
      }
    }
  }

  const teamRows: StatsSeasonTeamRow[] = Array.from(mutableTeams.values()).map((team) => {
    const gamesPlayed = team.wins + team.losses + team.ties;
    return {
      season,
      teamName: team.teamName,
      ownerId: team.ownerId,
      rosterId: team.rosterId,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      winPct: safePct(team.wins, team.losses, team.ties),
      pointsFor: round2(team.pointsFor),
      pointsAgainst: round2(team.pointsAgainst),
      avgScore: gamesPlayed > 0 ? round2(team.pointsFor / gamesPlayed) : 0,
    };
  });

  const playerSeasonRows: StatsPlayerSeasonRow[] = Array.from(mutablePlayers.values()).map((row) => {
    const meta = playerIdentity(allPlayers, row.playerId);
    const franchises: StatsPlayerFranchiseSplit[] = Array.from(row.franchise.entries())
      .map(([teamName, split]) => ({
        teamName,
        points: round2(split.points),
        rosteredWeeks: split.rosteredWeeks,
        starts: split.starts,
      }))
      .sort((a, b) => b.points - a.points || a.teamName.localeCompare(b.teamName));
    return {
      season,
      playerId: row.playerId,
      name: meta.name,
      position: meta.position,
      nflTeam: meta.nflTeam,
      points: round2(row.points),
      rosteredWeeks: row.rosteredWeeks,
      starts: row.starts,
      ppg: row.rosteredWeeks > 0 ? round2(row.points / row.rosteredWeeks) : 0,
      franchises,
      bestGamePoints: row.bestGamePoints == null ? null : round2(row.bestGamePoints),
      bestGameWeek: row.bestGameWeek,
      bestGameFranchise: row.bestGameFranchise,
    };
  });

  teamRows.sort((a, b) => b.winPct - a.winPct || b.pointsFor - a.pointsFor || a.teamName.localeCompare(b.teamName));
  playerSeasonRows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  games.sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));
  playerGames.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  return {
    season,
    playoffWeekStart,
    teams: teamRows,
    games,
    playerSeasons: playerSeasonRows,
    playerGames,
  };
}

async function loadSeasonSnapshot(season: string): Promise<SeasonStatsSnapshot | null> {
  const memory = memorySeasonCache.get(season);
  if (memory && Date.now() - memory.ts < MEMORY_TTL_MS) return memory.data;

  const shared = await readSeasonCache(season);
  if (shared) {
    memorySeasonCache.set(season, shared);
    return shared.data;
  }

  const data = await buildSeasonSnapshot(season).catch(() => null);
  const entry: CachedSeasonSnapshot = { ts: Date.now(), data };
  memorySeasonCache.set(season, entry);
  await writeSeasonCache(season, entry);
  return data;
}

function aggregatePlayerCareers(playerSeasons: StatsPlayerSeasonRow[]): StatsPlayerCareerRow[] {
  type MutableCareer = {
    playerId: string;
    name: string;
    position: string;
    nflTeam: string | null;
    seasons: Set<string>;
    points: number;
    rosteredWeeks: number;
    starts: number;
    franchises: Map<string, { points: number; rosteredWeeks: number; starts: number }>;
    bestSeason: string | null;
    bestSeasonPoints: number | null;
    bestGamePoints: number | null;
    bestGameSeason: string | null;
    bestGameWeek: number | null;
    bestGameFranchise: string | null;
  };

  const map = new Map<string, MutableCareer>();
  for (const seasonRow of playerSeasons) {
    let row = map.get(seasonRow.playerId);
    if (!row) {
      row = {
        playerId: seasonRow.playerId,
        name: seasonRow.name,
        position: seasonRow.position,
        nflTeam: seasonRow.nflTeam,
        seasons: new Set(),
        points: 0,
        rosteredWeeks: 0,
        starts: 0,
        franchises: new Map(),
        bestSeason: null,
        bestSeasonPoints: null,
        bestGamePoints: null,
        bestGameSeason: null,
        bestGameWeek: null,
        bestGameFranchise: null,
      };
      map.set(seasonRow.playerId, row);
    }

    row.name = seasonRow.name || row.name;
    row.position = seasonRow.position || row.position;
    row.nflTeam = seasonRow.nflTeam ?? row.nflTeam;
    row.seasons.add(seasonRow.season);
    row.points += seasonRow.points;
    row.rosteredWeeks += seasonRow.rosteredWeeks;
    row.starts += seasonRow.starts;

    for (const franchise of seasonRow.franchises) {
      const split = row.franchises.get(franchise.teamName) || { points: 0, rosteredWeeks: 0, starts: 0 };
      split.points += franchise.points;
      split.rosteredWeeks += franchise.rosteredWeeks;
      split.starts += franchise.starts;
      row.franchises.set(franchise.teamName, split);
    }

    if (row.bestSeasonPoints == null || seasonRow.points > row.bestSeasonPoints) {
      row.bestSeason = seasonRow.season;
      row.bestSeasonPoints = seasonRow.points;
    }
    if (seasonRow.bestGamePoints != null && (row.bestGamePoints == null || seasonRow.bestGamePoints > row.bestGamePoints)) {
      row.bestGamePoints = seasonRow.bestGamePoints;
      row.bestGameSeason = seasonRow.season;
      row.bestGameWeek = seasonRow.bestGameWeek;
      row.bestGameFranchise = seasonRow.bestGameFranchise;
    }
  }

  return Array.from(map.values())
    .map((row) => {
      const seasons = Array.from(row.seasons).sort((a, b) => a.localeCompare(b));
      const franchises: StatsPlayerFranchiseSplit[] = Array.from(row.franchises.entries())
        .map(([teamName, split]) => ({
          teamName,
          points: round2(split.points),
          rosteredWeeks: split.rosteredWeeks,
          starts: split.starts,
        }))
        .sort((a, b) => b.points - a.points || a.teamName.localeCompare(b.teamName));
      return {
        playerId: row.playerId,
        name: row.name,
        position: row.position,
        nflTeam: row.nflTeam,
        seasons,
        firstSeason: seasons[0] || '',
        lastSeason: seasons[seasons.length - 1] || '',
        points: round2(row.points),
        rosteredWeeks: row.rosteredWeeks,
        starts: row.starts,
        ppg: row.rosteredWeeks > 0 ? round2(row.points / row.rosteredWeeks) : 0,
        franchises,
        bestSeason: row.bestSeason,
        bestSeasonPoints: row.bestSeasonPoints == null ? null : round2(row.bestSeasonPoints),
        bestGamePoints: row.bestGamePoints == null ? null : round2(row.bestGamePoints),
        bestGameSeason: row.bestGameSeason,
        bestGameWeek: row.bestGameWeek,
        bestGameFranchise: row.bestGameFranchise,
      } satisfies StatsPlayerCareerRow;
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

function normalizedChampions(): Record<string, StatsChampionRow> {
  const result: Record<string, StatsChampionRow> = {};
  for (const [season, value] of Object.entries(CHAMPIONS)) {
    const row = value as { champion?: string; runnerUp?: string; thirdPlace?: string };
    result[season] = {
      champion: row.champion || 'TBD',
      runnerUp: row.runnerUp || 'TBD',
      thirdPlace: row.thirdPlace || 'TBD',
    };
  }
  return result;
}

function aggregateFranchises(
  seasonTeams: StatsSeasonTeamRow[],
  games: StatsGameRow[],
  champions: Record<string, StatsChampionRow>,
): StatsFranchiseRow[] {
  type MutableFranchise = {
    teamName: string;
    seasons: Set<string>;
    latestSeason: string;
    currentRosterId: number | null;
    regularWins: number;
    regularLosses: number;
    regularTies: number;
    regularPointsFor: number;
    regularPointsAgainst: number;
    playoffWins: number;
    playoffLosses: number;
    playoffTies: number;
    titles: number;
    appearances: number;
    bestSeasonRow: StatsSeasonTeamRow | null;
  };

  const map = new Map<string, MutableFranchise>();
  const ensure = (teamName: string): MutableFranchise => {
    let row = map.get(teamName);
    if (!row) {
      row = {
        teamName,
        seasons: new Set(),
        latestSeason: '',
        currentRosterId: null,
        regularWins: 0,
        regularLosses: 0,
        regularTies: 0,
        regularPointsFor: 0,
        regularPointsAgainst: 0,
        playoffWins: 0,
        playoffLosses: 0,
        playoffTies: 0,
        titles: 0,
        appearances: 0,
        bestSeasonRow: null,
      };
      map.set(teamName, row);
    }
    return row;
  };

  for (const seasonRow of seasonTeams) {
    const row = ensure(seasonRow.teamName);
    row.seasons.add(seasonRow.season);
    row.regularWins += seasonRow.wins;
    row.regularLosses += seasonRow.losses;
    row.regularTies += seasonRow.ties;
    row.regularPointsFor += seasonRow.pointsFor;
    row.regularPointsAgainst += seasonRow.pointsAgainst;
    if (!row.latestSeason || seasonRow.season > row.latestSeason) {
      row.latestSeason = seasonRow.season;
      row.currentRosterId = seasonRow.rosterId;
    }
    const currentBest = row.bestSeasonRow;
    if (
      !currentBest ||
      seasonRow.winPct > currentBest.winPct ||
      (seasonRow.winPct === currentBest.winPct && seasonRow.wins > currentBest.wins) ||
      (seasonRow.winPct === currentBest.winPct && seasonRow.wins === currentBest.wins && seasonRow.pointsFor > currentBest.pointsFor)
    ) {
      row.bestSeasonRow = seasonRow;
    }
  }

  for (const game of games) {
    if (game.gameType !== 'playoffs') continue;
    const a = ensure(game.teamA);
    const b = ensure(game.teamB);
    if (game.tie) {
      a.playoffTies += 1;
      b.playoffTies += 1;
    } else if (game.winner === game.teamA) {
      a.playoffWins += 1;
      b.playoffLosses += 1;
    } else {
      b.playoffWins += 1;
      a.playoffLosses += 1;
    }
  }

  for (const value of Object.values(champions)) {
    if (value.champion && value.champion !== 'TBD') {
      const champion = ensure(value.champion);
      champion.titles += 1;
      champion.appearances += 1;
    }
    if (value.runnerUp && value.runnerUp !== 'TBD') ensure(value.runnerUp).appearances += 1;
  }

  return Array.from(map.values())
    .map((row) => {
      const seasons = Array.from(row.seasons).sort((a, b) => a.localeCompare(b));
      const regularGames = row.regularWins + row.regularLosses + row.regularTies;
      return {
        teamName: row.teamName,
        seasons,
        firstSeason: seasons[0] || '',
        lastSeason: seasons[seasons.length - 1] || '',
        currentRosterId: row.currentRosterId,
        regularWins: row.regularWins,
        regularLosses: row.regularLosses,
        regularTies: row.regularTies,
        regularWinPct: safePct(row.regularWins, row.regularLosses, row.regularTies),
        regularPointsFor: round2(row.regularPointsFor),
        regularPointsAgainst: round2(row.regularPointsAgainst),
        avgScore: regularGames > 0 ? round2(row.regularPointsFor / regularGames) : 0,
        playoffWins: row.playoffWins,
        playoffLosses: row.playoffLosses,
        playoffTies: row.playoffTies,
        titles: row.titles,
        championshipAppearances: row.appearances,
        bestSeason: row.bestSeasonRow?.season ?? null,
        bestSeasonWins: row.bestSeasonRow?.wins ?? null,
        bestSeasonLosses: row.bestSeasonRow?.losses ?? null,
        bestSeasonPointsFor: row.bestSeasonRow ? round2(row.bestSeasonRow.pointsFor) : null,
      } satisfies StatsFranchiseRow;
    })
    .sort((a, b) => b.regularWins - a.regularWins || b.regularPointsFor - a.regularPointsFor || a.teamName.localeCompare(b.teamName));
}

function recordEntry(
  id: string,
  label: string,
  holder: string,
  value: number,
  valueDisplay: string,
  extra: Partial<StatsRecordEntry> = {},
): StatsRecordEntry {
  return { id, label, holder, value, valueDisplay, ...extra };
}

function buildRecordBook(
  players: StatsPlayerCareerRow[],
  playerSeasons: StatsPlayerSeasonRow[],
  playerGames: StatsPlayerGameRow[],
  franchises: StatsFranchiseRow[],
  seasonTeams: StatsSeasonTeamRow[],
  games: StatsGameRow[],
): LeagueStatsDataset['records'] {
  const franchiseRecords: StatsRecordEntry[] = [];
  const byWins = [...franchises].sort((a, b) => b.regularWins - a.regularWins || b.regularPointsFor - a.regularPointsFor)[0];
  const byPct = [...franchises]
    .filter((row) => row.regularWins + row.regularLosses + row.regularTies > 0)
    .sort((a, b) => b.regularWinPct - a.regularWinPct || b.regularWins - a.regularWins)[0];
  const byPoints = [...franchises].sort((a, b) => b.regularPointsFor - a.regularPointsFor)[0];
  const byPlayoffWins = [...franchises].sort((a, b) => b.playoffWins - a.playoffWins)[0];
  const byTitles = [...franchises].sort((a, b) => b.titles - a.titles || b.championshipAppearances - a.championshipAppearances)[0];
  const byAppearances = [...franchises].sort((a, b) => b.championshipAppearances - a.championshipAppearances || b.titles - a.titles)[0];
  if (byWins) franchiseRecords.push(recordEntry('franchise-wins', 'Most Regular Season Wins', byWins.teamName, byWins.regularWins, `${byWins.regularWins} wins`, { teamName: byWins.teamName }));
  if (byPct) franchiseRecords.push(recordEntry('franchise-pct', 'Best Regular Season Win %', byPct.teamName, byPct.regularWinPct, `${(byPct.regularWinPct * 100).toFixed(1)}%`, { teamName: byPct.teamName }));
  if (byPoints) franchiseRecords.push(recordEntry('franchise-points', 'Most Regular Season Points', byPoints.teamName, byPoints.regularPointsFor, `${byPoints.regularPointsFor.toFixed(2)} pts`, { teamName: byPoints.teamName }));
  if (byPlayoffWins) franchiseRecords.push(recordEntry('franchise-playoff-wins', 'Most Playoff Wins', byPlayoffWins.teamName, byPlayoffWins.playoffWins, `${byPlayoffWins.playoffWins} wins`, { teamName: byPlayoffWins.teamName }));
  if (byTitles) franchiseRecords.push(recordEntry('franchise-titles', 'Most Championships', byTitles.teamName, byTitles.titles, `${byTitles.titles}`, { teamName: byTitles.teamName }));
  if (byAppearances) franchiseRecords.push(recordEntry('franchise-appearances', 'Most Championship Appearances', byAppearances.teamName, byAppearances.championshipAppearances, `${byAppearances.championshipAppearances}`, { teamName: byAppearances.teamName }));

  const sideRows = games.flatMap((game) => [
    { team: game.teamA, opponent: game.teamB, points: game.scoreA, opponentPoints: game.scoreB, game },
    { team: game.teamB, opponent: game.teamA, points: game.scoreB, opponentPoints: game.scoreA, game },
  ]);
  const highestScore = [...sideRows].sort((a, b) => b.points - a.points)[0];
  const lowestScore = [...sideRows].sort((a, b) => a.points - b.points)[0];
  const biggestVictory = [...games].filter((game) => !game.tie).sort((a, b) => b.margin - a.margin)[0];
  const closestVictory = [...games].filter((game) => !game.tie).sort((a, b) => a.margin - b.margin)[0];
  const highestCombined = [...games].sort((a, b) => b.combined - a.combined)[0];
  const highestLosing = [...sideRows].filter((row) => row.points < row.opponentPoints).sort((a, b) => b.points - a.points)[0];

  const gameRecords: StatsRecordEntry[] = [];
  if (highestScore) gameRecords.push(recordEntry('game-high-score', 'Highest Team Score', highestScore.team, highestScore.points, `${highestScore.points.toFixed(2)} pts`, { season: highestScore.game.season, week: highestScore.game.week, teamName: highestScore.team, opponent: highestScore.opponent }));
  if (lowestScore) gameRecords.push(recordEntry('game-low-score', 'Lowest Team Score', lowestScore.team, lowestScore.points, `${lowestScore.points.toFixed(2)} pts`, { season: lowestScore.game.season, week: lowestScore.game.week, teamName: lowestScore.team, opponent: lowestScore.opponent }));
  if (biggestVictory) gameRecords.push(recordEntry('game-biggest-win', 'Largest Margin of Victory', biggestVictory.winner || '', biggestVictory.margin, `${biggestVictory.margin.toFixed(2)} pts`, { season: biggestVictory.season, week: biggestVictory.week, teamName: biggestVictory.winner, opponent: biggestVictory.loser }));
  if (closestVictory) gameRecords.push(recordEntry('game-closest-win', 'Closest Victory', closestVictory.winner || '', closestVictory.margin, `${closestVictory.margin.toFixed(2)} pts`, { season: closestVictory.season, week: closestVictory.week, teamName: closestVictory.winner, opponent: closestVictory.loser }));
  if (highestCombined) gameRecords.push(recordEntry('game-combined', 'Highest Combined Score', `${highestCombined.teamA} vs. ${highestCombined.teamB}`, highestCombined.combined, `${highestCombined.combined.toFixed(2)} pts`, { season: highestCombined.season, week: highestCombined.week }));
  if (highestLosing) gameRecords.push(recordEntry('game-losing-score', 'Most Points in a Loss', highestLosing.team, highestLosing.points, `${highestLosing.points.toFixed(2)} pts`, { season: highestLosing.game.season, week: highestLosing.game.week, teamName: highestLosing.team, opponent: highestLosing.opponent }));

  const mostSeasonPoints = [...seasonTeams].sort((a, b) => b.pointsFor - a.pointsFor)[0];
  const mostSeasonWins = [...seasonTeams].sort((a, b) => b.wins - a.wins || b.winPct - a.winPct)[0];
  const bestSeasonPct = [...seasonTeams]
    .filter((row) => row.wins + row.losses + row.ties > 0)
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.pointsFor - a.pointsFor)[0];
  const bestSeasonAverage = [...seasonTeams].sort((a, b) => b.avgScore - a.avgScore)[0];
  const seasonRecords: StatsRecordEntry[] = [];
  if (mostSeasonPoints) seasonRecords.push(recordEntry('season-points', 'Most Team Points in a Season', mostSeasonPoints.teamName, mostSeasonPoints.pointsFor, `${mostSeasonPoints.pointsFor.toFixed(2)} pts`, { season: mostSeasonPoints.season, teamName: mostSeasonPoints.teamName }));
  if (mostSeasonWins) seasonRecords.push(recordEntry('season-wins', 'Most Regular Season Wins', mostSeasonWins.teamName, mostSeasonWins.wins, `${mostSeasonWins.wins} wins`, { season: mostSeasonWins.season, teamName: mostSeasonWins.teamName }));
  if (bestSeasonPct) seasonRecords.push(recordEntry('season-pct', 'Best Regular Season Win %', bestSeasonPct.teamName, bestSeasonPct.winPct, `${(bestSeasonPct.winPct * 100).toFixed(1)}%`, { season: bestSeasonPct.season, teamName: bestSeasonPct.teamName }));
  if (bestSeasonAverage) seasonRecords.push(recordEntry('season-average', 'Highest Average Team Score', bestSeasonAverage.teamName, bestSeasonAverage.avgScore, `${bestSeasonAverage.avgScore.toFixed(2)} pts/game`, { season: bestSeasonAverage.season, teamName: bestSeasonAverage.teamName }));

  return {
    franchise: franchiseRecords,
    games: gameRecords,
    seasons: seasonRecords,
    playerCareer: [...players].sort((a, b) => b.points - a.points).slice(0, 50),
    playerSeason: [...playerSeasons].sort((a, b) => b.points - a.points).slice(0, 50),
    playerGame: [...playerGames].sort((a, b) => b.points - a.points).slice(0, 100),
  };
}

export async function getLeagueStatsDataset(): Promise<LeagueStatsDataset> {
  const seasons = listConfiguredSeasons();
  const snapshots: SeasonStatsSnapshot[] = [];

  // Deliberately load season snapshots sequentially. A cold historical season fans out to
  // weekly Sleeper calls; doing every season at once creates a needless rate-limit burst.
  // Persistent season caches mean this loop is normally just a handful of fast KV reads.
  for (const season of seasons) {
    const snapshot = await loadSeasonSnapshot(season);
    if (snapshot) snapshots.push(snapshot);
  }

  const playerSeasons = snapshots.flatMap((snapshot) => snapshot.playerSeasons);
  const seasonTeams = snapshots.flatMap((snapshot) => snapshot.teams);
  const games = snapshots.flatMap((snapshot) => snapshot.games);
  const allPlayerGames = snapshots.flatMap((snapshot) => snapshot.playerGames);
  const players = aggregatePlayerCareers(playerSeasons);
  const champions = normalizedChampions();
  const franchises = aggregateFranchises(seasonTeams, games, champions);
  const playerGames = [...allPlayerGames]
    .sort((a, b) => b.points - a.points || b.season.localeCompare(a.season) || a.name.localeCompare(b.name))
    .slice(0, 500);
  const records = buildRecordBook(players, playerSeasons, playerGames, franchises, seasonTeams, games);
  const latestSeasonWithGames = [...snapshots]
    .filter((snapshot) => snapshot.games.length > 0)
    .map((snapshot) => snapshot.season)
    .sort((a, b) => b.localeCompare(a))[0] || null;

  return {
    generatedAt: new Date().toISOString(),
    seasons: snapshots.map((snapshot) => snapshot.season).sort((a, b) => b.localeCompare(a)),
    latestSeasonWithGames,
    players,
    playerSeasons: [...playerSeasons].sort((a, b) => b.season.localeCompare(a.season) || b.points - a.points),
    franchises,
    seasonTeams: [...seasonTeams].sort((a, b) => b.season.localeCompare(a.season) || b.winPct - a.winPct || b.pointsFor - a.pointsFor),
    games: [...games].sort((a, b) => b.season.localeCompare(a.season) || b.week - a.week || a.id.localeCompare(b.id)),
    playerGames,
    records,
    champions,
    coverageNotes: [
      'Player points are East v. West franchise-attributed production from Sleeper weekly matchup player points, matching league scoring.',
      'Player PPG is points per rostered scoring week. Starts are tracked separately.',
      'Regular-season franchise records exclude postseason weeks. Playoff records use Sleeper winners-bracket matchup pairs; toilet-bracket games are tracked separately from playoff records.',
      'Completed historical seasons are cached for 30 days. The current season refreshes every 15 minutes.',
    ],
  };
}
