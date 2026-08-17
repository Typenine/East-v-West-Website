import { TEAM_ALIASES, normalizeName } from '@/lib/constants/team-mapping';
import { getLeagueIdForSeason } from '@/lib/constants/league';
import {
  buildAllEvwTeams,
  buildFranchiseHistory,
  buildLeagueMilestones,
  buildWeeklyGamebook,
  findFranchiseByHistoryId,
} from '@/lib/history/league-history';
import { getPlayerHonors, getPlayerProfileWithHonors } from '@/lib/players/player-honors';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';
import type {
  LeagueStatsDataset,
  StatsGameType,
  StatsPlayerCareerRow,
  StatsPlayerGameRow,
  StatsPlayerSeasonRow,
} from '@/lib/stats/types';
import { getSeasonAwardsUsingLeagueScoring, type SeasonAwards } from '@/lib/utils/sleeper-api';

const DEF_POSITIONS = new Set(['DEF', 'DST', 'D/ST']);
const MAX_LIMIT = 100;

export const EVW_DATA_SEMANTICS = {
  version: '2.0',
  scoring: 'EVW player points are ownership-attributed week by week from Sleeper matchup player points.',
  postseason: {
    playoffs: 'Only championship-path winners-bracket games count as Playoffs.',
    toiletBowl: 'Sleeper losers-bracket games count as Toilet Bowl and are tracked separately from Playoffs.',
    otherPostseason: 'Placement games after championship elimination are Other Postseason and count in neither Playoff nor Toilet Bowl records.',
  },
  allEvw: 'All-EVW teams use complete regular-season EVW points only. Starts are not a selection factor or tiebreaker.',
  franchises: 'Historical Sleeper roster slots and aliases are normalized to the current canonical East v. West franchise identity.',
  defenses: 'Defense/DST rows are included unless a tool explicitly requests exclude_defenses.',
} as const;

type Input = Record<string, unknown>;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function limit(value: unknown, fallback = 10): number {
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(num(value) ?? fallback)));
}

function meta(dataset: LeagueStatsDataset) {
  return {
    connectorVersion: '2.0',
    generatedAt: dataset.generatedAt,
    seasonsAvailable: dataset.seasons,
    latestSeasonWithGames: dataset.latestSeasonWithGames,
    coverageNotes: dataset.coverageNotes,
    semantics: EVW_DATA_SEMANTICS,
  };
}

function teamWeekKey(season: string, week: number, team: string): string {
  return `${season}:${week}:${team}`;
}

function gameTypeKeys(dataset: LeagueStatsDataset, gameType: StatsGameType | 'all'): Set<string> | null {
  if (gameType === 'all') return null;
  const keys = new Set<string>();
  for (const game of dataset.games) {
    if (game.gameType !== gameType) continue;
    keys.add(teamWeekKey(game.season, game.week, game.teamA));
    keys.add(teamWeekKey(game.season, game.week, game.teamB));
  }
  return keys;
}

function playerGames(dataset: LeagueStatsDataset, gameType: StatsGameType | 'all', playerId?: string) {
  const keys = gameTypeKeys(dataset, gameType);
  return dataset.playerGames.filter((row) =>
    (!playerId || row.playerId === playerId) &&
    (!keys || keys.has(teamWeekKey(row.season, row.week, row.franchiseName))),
  );
}

function playerSplit(rows: StatsPlayerGameRow[]) {
  const points = rows.reduce((sum, row) => sum + row.points, 0);
  return {
    points,
    rosteredWeeks: rows.length,
    starts: rows.filter((row) => row.started).length,
    pointsPerRosteredWeek: rows.length ? points / rows.length : 0,
  };
}

function resolveFranchise(dataset: LeagueStatsDataset, raw: string) {
  const byId = findFranchiseByHistoryId(dataset, raw);
  if (byId) return byId;
  const normalized = normalizeName(raw);
  const alias = Object.entries(TEAM_ALIASES).find(([name]) => normalizeName(name) === normalized)?.[1];
  const target = normalizeName(alias || raw);
  return dataset.franchises.find((row) => normalizeName(row.teamName) === target) || null;
}

async function awardsForSeason(dataset: LeagueStatsDataset, season: string): Promise<SeasonAwards | null> {
  const leagueId = getLeagueIdForSeason(season);
  if (!leagueId) return null;
  const endWeek = Math.max(0, ...dataset.games
    .filter((game) => game.season === season && game.gameType === 'regular')
    .map((game) => game.week));
  if (!endWeek) return null;
  return getSeasonAwardsUsingLeagueScoring(season, leagueId, endWeek).catch(() => null);
}

function scoreRows(dataset: LeagueStatsDataset, gameType: StatsGameType | 'all' = 'all') {
  return dataset.games
    .filter((game) => gameType === 'all' || game.gameType === gameType)
    .flatMap((game) => [
      {
        season: game.season, week: game.week, gameType: game.gameType,
        teamName: game.teamA, opponent: game.teamB, points: game.scoreA, opponentPoints: game.scoreB,
        result: game.tie ? 'T' as const : game.winner === game.teamA ? 'W' as const : 'L' as const,
      },
      {
        season: game.season, week: game.week, gameType: game.gameType,
        teamName: game.teamB, opponent: game.teamA, points: game.scoreB, opponentPoints: game.scoreA,
        result: game.tie ? 'T' as const : game.winner === game.teamB ? 'W' as const : 'L' as const,
      },
    ]);
}

function weeklyHighs(dataset: LeagueStatsDataset, season?: string) {
  const groups = new Map<string, ReturnType<typeof scoreRows>>();
  for (const row of scoreRows(dataset, 'regular')) {
    if (season && row.season !== season) continue;
    const key = `${row.season}:${row.week}`;
    const rows = groups.get(key) || [];
    rows.push(row);
    groups.set(key, rows);
  }
  const result: ReturnType<typeof scoreRows> = [];
  for (const rows of groups.values()) {
    const high = Math.max(...rows.map((row) => row.points));
    result.push(...rows.filter((row) => row.points === high));
  }
  return result.sort((a, b) => b.season.localeCompare(a.season) || a.week - b.week || a.teamName.localeCompare(b.teamName));
}

function aggregatePlayers(rows: StatsPlayerGameRow[]) {
  const careers = new Map<string, {
    playerId: string; name: string; position: string; points: number; rosteredWeeks: number; starts: number;
    seasons: Set<string>; franchises: Set<string>; bestGamePoints: number; bestGameSeason: string | null; bestGameWeek: number | null;
  }>();
  const seasons = new Map<string, {
    playerId: string; name: string; position: string; season: string; points: number; rosteredWeeks: number; starts: number;
    franchises: Set<string>; bestGamePoints: number; bestGameWeek: number | null;
  }>();

  for (const row of rows) {
    const career = careers.get(row.playerId) || {
      playerId: row.playerId, name: row.name, position: row.position, points: 0, rosteredWeeks: 0, starts: 0,
      seasons: new Set<string>(), franchises: new Set<string>(), bestGamePoints: Number.NEGATIVE_INFINITY,
      bestGameSeason: null, bestGameWeek: null,
    };
    career.points += row.points;
    career.rosteredWeeks += 1;
    if (row.started) career.starts += 1;
    career.seasons.add(row.season);
    career.franchises.add(row.franchiseName);
    if (row.points > career.bestGamePoints) {
      career.bestGamePoints = row.points;
      career.bestGameSeason = row.season;
      career.bestGameWeek = row.week;
    }
    careers.set(row.playerId, career);

    const key = `${row.season}:${row.playerId}`;
    const season = seasons.get(key) || {
      playerId: row.playerId, name: row.name, position: row.position, season: row.season,
      points: 0, rosteredWeeks: 0, starts: 0, franchises: new Set<string>(),
      bestGamePoints: Number.NEGATIVE_INFINITY, bestGameWeek: null,
    };
    season.points += row.points;
    season.rosteredWeeks += 1;
    if (row.started) season.starts += 1;
    season.franchises.add(row.franchiseName);
    if (row.points > season.bestGamePoints) {
      season.bestGamePoints = row.points;
      season.bestGameWeek = row.week;
    }
    seasons.set(key, season);
  }

  return {
    careers: Array.from(careers.values()).map((row) => ({
      ...row,
      seasons: Array.from(row.seasons).sort(),
      franchises: Array.from(row.franchises).sort(),
      ppg: row.rosteredWeeks ? row.points / row.rosteredWeeks : 0,
      bestGamePoints: Number.isFinite(row.bestGamePoints) ? row.bestGamePoints : 0,
    })),
    seasons: Array.from(seasons.values()).map((row) => ({
      ...row,
      franchises: Array.from(row.franchises).sort(),
      ppg: row.rosteredWeeks ? row.points / row.rosteredWeeks : 0,
      bestGamePoints: Number.isFinite(row.bestGamePoints) ? row.bestGamePoints : 0,
    })),
  };
}

function progression(dataset: LeagueStatsDataset, gameType: StatsGameType | 'all') {
  const keys = gameTypeKeys(dataset, gameType);
  const playerRows = [...dataset.playerGames]
    .filter((row) => !keys || keys.has(teamWeekKey(row.season, row.week, row.franchiseName)))
    .sort((a, b) => a.season.localeCompare(b.season) || a.week - b.week || a.id.localeCompare(b.id));

  const playerGame: Array<Record<string, unknown>> = [];
  let playerRecord = Number.NEGATIVE_INFINITY;
  for (const row of playerRows) {
    if (row.points <= playerRecord) continue;
    playerRecord = row.points;
    playerGame.push({ season: row.season, week: row.week, playerId: row.playerId, player: row.name, position: row.position, franchise: row.franchiseName, points: row.points });
  }

  const teamGame: Array<Record<string, unknown>> = [];
  let teamRecord = Number.NEGATIVE_INFINITY;
  const games = dataset.games
    .filter((game) => gameType === 'all' || game.gameType === gameType)
    .sort((a, b) => a.season.localeCompare(b.season) || a.week - b.week || a.id.localeCompare(b.id));
  for (const row of games.flatMap((game) => [
    { season: game.season, week: game.week, team: game.teamA, opponent: game.teamB, points: game.scoreA },
    { season: game.season, week: game.week, team: game.teamB, opponent: game.teamA, points: game.scoreB },
  ])) {
    if (row.points <= teamRecord) continue;
    teamRecord = row.points;
    teamGame.push(row);
  }

  const playerSeason: Array<Record<string, unknown>> = [];
  let seasonRecord = Number.NEGATIVE_INFINITY;
  for (const row of aggregatePlayers(playerRows).seasons.sort((a, b) => a.season.localeCompare(b.season) || a.playerId.localeCompare(b.playerId))) {
    if (row.points <= seasonRecord) continue;
    seasonRecord = row.points;
    playerSeason.push({ season: row.season, playerId: row.playerId, player: row.name, position: row.position, franchises: row.franchises, points: row.points });
  }
  return { playerGame, playerSeason, teamGame };
}

export async function handleGetLeagueDataModelV2() {
  const dataset = await getLeagueStatsDatasetV3();
  return {
    meta: meta(dataset),
    dataModel: {
      playerCareer: 'Ownership-attributed EVW production by player across seasons and canonical franchises.',
      playerSeason: 'Ownership-attributed EVW production for one player-season.',
      playerGame: 'One player scoring row for one EVW franchise in one week.',
      franchise: 'Canonical franchise identity across renewed Sleeper league IDs and historical display-name changes.',
      gameTypes: ['regular', 'playoffs', 'toilet', 'postseason'],
      honors: ['First Team All-EVW', 'Second Team All-EVW', 'East v. West MVP', 'East v. West Rookie of the Year'],
    },
  };
}

export async function handleGetEvwPlayerV2(input: Input) {
  const playerId = text(input.id);
  if (!playerId) throw new Error('id is required');
  const [dataset, profile] = await Promise.all([getLeagueStatsDatasetV3(), getPlayerProfileWithHonors(playerId)]);
  if (!profile) throw new Error(`Player not found: ${playerId}`);
  const gameLog = playerGames(dataset, 'all', playerId).sort((a, b) => b.season.localeCompare(a.season) || b.week - a.week);
  return {
    meta: meta(dataset),
    player: profile,
    stats: {
      career: dataset.players.find((row) => row.playerId === playerId) || null,
      seasons: dataset.playerSeasons.filter((row) => row.playerId === playerId).sort((a, b) => b.season.localeCompare(a.season)),
      splits: {
        regular: playerSplit(playerGames(dataset, 'regular', playerId)),
        playoffs: playerSplit(playerGames(dataset, 'playoffs', playerId)),
        toiletBowl: playerSplit(playerGames(dataset, 'toilet', playerId)),
        otherPostseason: playerSplit(playerGames(dataset, 'postseason', playerId)),
      },
      gameLog,
    },
  };
}

export async function handleSearchEvwPlayersV2(input: Input) {
  const dataset = await getLeagueStatsDatasetV3();
  const query = normalizeName(text(input.query) || '');
  const position = text(input.position)?.toUpperCase();
  const season = text(input.season);
  const rawFranchise = text(input.franchise);
  const franchise = rawFranchise ? resolveFranchise(dataset, rawFranchise)?.teamName || rawFranchise : undefined;
  const minPoints = num(input.min_points) ?? 0;
  const minStarts = num(input.min_starts) ?? 0;
  const minWeeks = num(input.min_weeks) ?? 0;
  const excludeDefenses = bool(input.exclude_defenses) ?? false;
  const award = text(input.award);
  const max = limit(input.limit, 20);

  let rows = dataset.players.filter((row) => {
    if (query && !normalizeName(row.name).includes(query)) return false;
    if (position && row.position.toUpperCase() !== position) return false;
    if (season && !row.seasons.includes(season)) return false;
    if (franchise && !row.franchises.some((split) => normalizeName(split.teamName) === normalizeName(franchise))) return false;
    if (row.points < minPoints || row.starts < minStarts || row.rosteredWeeks < minWeeks) return false;
    if (excludeDefenses && DEF_POSITIONS.has(row.position.toUpperCase())) return false;
    return true;
  });

  if (award) {
    const wanted = award.toLowerCase();
    const honors = await Promise.all(rows.map(async (row) => ({ row, honors: await getPlayerHonors(row.playerId).catch(() => []) })));
    rows = honors.filter(({ honors: items }) => items.some((honor) => honor.kind === wanted || honor.label.toLowerCase().includes(wanted.replace(/_/g, ' ')))).map(({ row }) => row);
  }

  rows.sort((a, b) => b.points - a.points || b.starts - a.starts || a.name.localeCompare(b.name));
  return { meta: meta(dataset), totalMatches: rows.length, players: rows.slice(0, max) };
}

export async function handleGetFranchiseHistoryV2(input: Input) {
  const dataset = await getLeagueStatsDatasetV3();
  const team = text(input.team);
  if (!team) throw new Error('team is required');
  const franchise = resolveFranchise(dataset, team);
  if (!franchise) throw new Error(`Franchise not found: ${team}`);
  const history = buildFranchiseHistory(dataset, franchise);
  const max = limit(input.limit, 50);
  const split = (gameType: StatsGameType) => {
    const games = history.games.filter((game) => game.gameType === gameType);
    return {
      wins: games.filter((game) => game.result === 'W').length,
      losses: games.filter((game) => game.result === 'L').length,
      ties: games.filter((game) => game.result === 'T').length,
      games: games.length,
      pointsFor: games.reduce((sum, game) => sum + game.pointsFor, 0),
      pointsAgainst: games.reduce((sum, game) => sum + game.pointsAgainst, 0),
    };
  };
  return {
    meta: meta(dataset),
    franchise: history.franchise,
    postseason: { playoffs: split('playoffs'), toiletBowl: split('toilet'), otherPostseason: split('postseason') },
    championshipYears: history.championshipYears,
    runnerUpYears: history.runnerUpYears,
    seasons: history.seasons,
    playerLeaders: history.players.slice(0, 25),
    records: history.records,
    allEvw: history.allEvw,
    milestones: history.milestones.slice(0, max),
    ...(bool(input.include_games) ? { games: history.games.slice(0, max) } : {}),
  };
}

export async function handleGetLeagueRecordsV2(input: Input) {
  const dataset = await getLeagueStatsDatasetV3();
  const category = text(input.category) || 'all';
  const position = text(input.position)?.toUpperCase();
  const gameType = (text(input.game_type) || 'all') as StatsGameType | 'all';
  const excludeDefenses = bool(input.exclude_defenses) ?? false;
  const max = limit(input.limit, 10);
  const rows = playerGames(dataset, gameType);
  const aggregates = aggregatePlayers(rows);
  const positionOk = (value: string) => (!position || value.toUpperCase() === position) && (!excludeDefenses || !DEF_POSITIONS.has(value.toUpperCase()));

  const records: Record<string, unknown> = {};
  if (category === 'all' || category === 'player_career') records.playerCareer = aggregates.careers.filter((row) => positionOk(row.position)).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)).slice(0, max);
  if (category === 'all' || category === 'player_season') records.playerSeason = aggregates.seasons.filter((row) => positionOk(row.position)).sort((a, b) => b.points - a.points || b.season.localeCompare(a.season)).slice(0, max);
  if (category === 'all' || category === 'player_game') records.playerGame = rows.filter((row) => positionOk(row.position)).sort((a, b) => b.points - a.points || b.season.localeCompare(a.season) || b.week - a.week).slice(0, max);
  if (category === 'all' || category === 'team_game') records.teamGame = scoreRows(dataset, gameType).sort((a, b) => b.points - a.points || b.season.localeCompare(a.season) || b.week - a.week).slice(0, max);
  if (category === 'all' || category === 'franchise') {
    const map = new Map<string, { teamName: string; wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number; games: number }>();
    for (const row of scoreRows(dataset, gameType)) {
      const item = map.get(row.teamName) || { teamName: row.teamName, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, games: 0 };
      item.games += 1; item.pointsFor += row.points; item.pointsAgainst += row.opponentPoints;
      if (row.result === 'W') item.wins += 1; else if (row.result === 'L') item.losses += 1; else item.ties += 1;
      map.set(row.teamName, item);
    }
    records.franchises = Array.from(map.values()).map((row) => ({ ...row, winPct: row.games ? (row.wins + row.ties * 0.5) / row.games : 0, avgScore: row.games ? row.pointsFor / row.games : 0 })).sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || b.pointsFor - a.pointsFor).slice(0, max);
  }
  return {
    meta: meta(dataset),
    filters: { category, position: position || null, gameType, excludeDefenses, limit: max },
    records,
    ...(bool(input.include_progression) ? { progression: progression(dataset, gameType) } : {}),
  };
}

export async function handleGetSeasonArchiveV2(input: Input) {
  const dataset = await getLeagueStatsDatasetV3();
  const season = text(input.season);
  if (!season) throw new Error('season is required');
  if (!dataset.seasons.includes(season)) throw new Error(`Season not available: ${season}`);
  const games = dataset.games.filter((game) => game.season === season);
  const standings = dataset.seasonTeams.filter((row) => row.season === season).sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || b.pointsFor - a.pointsFor);
  return {
    meta: meta(dataset),
    season,
    champion: dataset.champions[season] || null,
    standings,
    playerLeaders: dataset.playerSeasons.filter((row) => row.season === season).sort((a, b) => b.points - a.points).slice(0, limit(input.leader_limit, 25)),
    allEvw: buildAllEvwTeams(dataset).find((row) => row.season === season) || null,
    awards: await awardsForSeason(dataset, season),
    weeklyHighs: weeklyHighs(dataset, season),
    weeks: Array.from(new Set(games.map((game) => game.week))).sort((a, b) => a - b),
    gamesByType: {
      regular: games.filter((game) => game.gameType === 'regular'),
      playoffs: games.filter((game) => game.gameType === 'playoffs'),
      toiletBowl: games.filter((game) => game.gameType === 'toilet'),
      otherPostseason: games.filter((game) => game.gameType === 'postseason'),
    },
    milestones: buildLeagueMilestones(dataset).filter((row) => row.season === season),
    relatedTools: { draft: 'get_draft_history', week: 'get_week_gamebook' },
  };
}

export async function handleGetWeekGamebookV2(input: Input) {
  const dataset = await getLeagueStatsDatasetV3();
  const season = text(input.season);
  const week = num(input.week);
  if (!season || week == null) throw new Error('season and week are required');
  const gamebook = buildWeeklyGamebook(dataset, season, Math.floor(week));
  if (!gamebook) throw new Error(`No EVW games found for ${season} Week ${week}`);
  return { meta: meta(dataset), gamebook };
}

export async function handleGetLeagueAwardsV2(input: Input) {
  const dataset = await getLeagueStatsDatasetV3();
  const seasonFilter = text(input.season);
  const max = limit(input.limit, 10);
  const seasons = (seasonFilter ? [seasonFilter] : dataset.seasons)
    .filter((season) => dataset.games.some((game) => game.season === season && game.gameType === 'regular'))
    .sort((a, b) => b.localeCompare(a));
  const annualAwards = await Promise.all(seasons.map(async (season) => ({ season, awards: await awardsForSeason(dataset, season) })));
  const highs = weeklyHighs(dataset, seasonFilter);
  const tally = new Map<string, number>();
  for (const row of highs) tally.set(row.teamName, (tally.get(row.teamName) || 0) + 1);
  const top = (gameType: StatsGameType) => scoreRows(dataset, gameType).filter((row) => !seasonFilter || row.season === seasonFilter).sort((a, b) => b.points - a.points).slice(0, max);
  return {
    meta: meta(dataset), season: seasonFilter || null,
    annualAwards: annualAwards.filter((row) => row.awards !== null),
    allEvw: buildAllEvwTeams(dataset).filter((row) => !seasonFilter || row.season === seasonFilter),
    weeklyHighs: highs,
    weeklyHighLeaders: Array.from(tally.entries()).map(([teamName, count]) => ({ teamName, count })).sort((a, b) => b.count - a.count || a.teamName.localeCompare(b.teamName)),
    scoringHighs: { regular: top('regular'), playoffs: top('playoffs'), toiletBowl: top('toilet'), otherPostseason: top('postseason') },
  };
}

function filterCareers(rows: StatsPlayerCareerRow[], input: Input) {
  const query = normalizeName(text(input.query) || '');
  const position = text(input.position)?.toUpperCase();
  const franchise = text(input.franchise);
  const from = text(input.season_from); const to = text(input.season_to);
  const minPoints = num(input.min_points) ?? Number.NEGATIVE_INFINITY; const maxPoints = num(input.max_points) ?? Number.POSITIVE_INFINITY;
  const minStarts = num(input.min_starts) ?? 0; const minWeeks = num(input.min_weeks) ?? 0; const minPpg = num(input.min_ppg) ?? Number.NEGATIVE_INFINITY;
  const excludeDefenses = bool(input.exclude_defenses) ?? false;
  return rows.filter((row) => {
    if (query && !normalizeName(row.name).includes(query)) return false;
    if (position && row.position.toUpperCase() !== position) return false;
    if (franchise && !row.franchises.some((split) => normalizeName(split.teamName) === normalizeName(franchise))) return false;
    if (from && row.lastSeason < from) return false; if (to && row.firstSeason > to) return false;
    if (row.points < minPoints || row.points > maxPoints || row.starts < minStarts || row.rosteredWeeks < minWeeks || row.ppg < minPpg) return false;
    return !excludeDefenses || !DEF_POSITIONS.has(row.position.toUpperCase());
  });
}

function filterSeasons(rows: StatsPlayerSeasonRow[], input: Input) {
  const query = normalizeName(text(input.query) || '');
  const position = text(input.position)?.toUpperCase(); const franchise = text(input.franchise);
  const from = text(input.season_from); const to = text(input.season_to);
  const minPoints = num(input.min_points) ?? Number.NEGATIVE_INFINITY; const maxPoints = num(input.max_points) ?? Number.POSITIVE_INFINITY;
  const minStarts = num(input.min_starts) ?? 0; const minWeeks = num(input.min_weeks) ?? 0; const minPpg = num(input.min_ppg) ?? Number.NEGATIVE_INFINITY;
  const excludeDefenses = bool(input.exclude_defenses) ?? false;
  return rows.filter((row) => {
    if (query && !normalizeName(row.name).includes(query)) return false;
    if (position && row.position.toUpperCase() !== position) return false;
    if (franchise && !row.franchises.some((split) => normalizeName(split.teamName) === normalizeName(franchise))) return false;
    if (from && row.season < from) return false; if (to && row.season > to) return false;
    if (row.points < minPoints || row.points > maxPoints || row.starts < minStarts || row.rosteredWeeks < minWeeks || row.ppg < minPpg) return false;
    return !excludeDefenses || !DEF_POSITIONS.has(row.position.toUpperCase());
  });
}

export async function handleQueryStatsV2(input: Input) {
  const dataset = await getLeagueStatsDatasetV3();
  const entity = text(input.entity);
  if (!entity) throw new Error('entity is required');
  const max = limit(input.limit, 25);
  const asc = text(input.order)?.toLowerCase() === 'asc';
  const sort = text(input.sort) || 'points';

  if (entity === 'player_career') {
    const rows = filterCareers(dataset.players, input);
    const value = (row: StatsPlayerCareerRow) => sort === 'ppg' ? row.ppg : sort === 'starts' ? row.starts : sort === 'weeks' ? row.rosteredWeeks : sort === 'best_game' ? row.bestGamePoints || 0 : sort === 'best_season' ? row.bestSeasonPoints || 0 : sort === 'franchises' ? row.franchises.length : row.points;
    rows.sort((a, b) => (asc ? value(a) - value(b) : value(b) - value(a)) || a.name.localeCompare(b.name));
    return { meta: meta(dataset), entity, totalMatches: rows.length, rows: rows.slice(0, max) };
  }
  if (entity === 'player_season') {
    const rows = filterSeasons(dataset.playerSeasons, input);
    const value = (row: StatsPlayerSeasonRow) => sort === 'ppg' ? row.ppg : sort === 'starts' ? row.starts : sort === 'weeks' ? row.rosteredWeeks : sort === 'best_game' ? row.bestGamePoints || 0 : row.points;
    rows.sort((a, b) => (asc ? value(a) - value(b) : value(b) - value(a)) || b.season.localeCompare(a.season));
    return { meta: meta(dataset), entity, totalMatches: rows.length, rows: rows.slice(0, max) };
  }
  if (entity === 'player_games') {
    const gameType = (text(input.game_type) || 'all') as StatsGameType | 'all';
    const query = normalizeName(text(input.query) || ''); const position = text(input.position)?.toUpperCase(); const franchise = text(input.franchise);
    const minPoints = num(input.min_points) ?? Number.NEGATIVE_INFINITY; const maxPoints = num(input.max_points) ?? Number.POSITIVE_INFINITY;
    const from = text(input.season_from); const to = text(input.season_to); const excludeDefenses = bool(input.exclude_defenses) ?? false;
    const rows = playerGames(dataset, gameType).filter((row) => {
      if (query && !normalizeName(row.name).includes(query)) return false; if (position && row.position.toUpperCase() !== position) return false;
      if (franchise && normalizeName(row.franchiseName) !== normalizeName(franchise)) return false; if (from && row.season < from) return false; if (to && row.season > to) return false;
      if (row.points < minPoints || row.points > maxPoints) return false; return !excludeDefenses || !DEF_POSITIONS.has(row.position.toUpperCase());
    });
    rows.sort((a, b) => (asc ? a.points - b.points : b.points - a.points) || b.season.localeCompare(a.season) || b.week - a.week);
    return { meta: meta(dataset), entity, filters: { gameType }, totalMatches: rows.length, rows: rows.slice(0, max) };
  }
  if (entity === 'games') {
    const season = text(input.season); const team = text(input.franchise); const opponent = text(input.opponent); const gameType = text(input.game_type); const result = text(input.result)?.toUpperCase();
    const minScore = num(input.min_points) ?? Number.NEGATIVE_INFINITY; const maxMargin = num(input.max_margin) ?? Number.POSITIVE_INFINITY;
    const rows = dataset.games.flatMap((game) => {
      const sides = [
        { game, team: game.teamA, opponent: game.teamB, score: game.scoreA, opponentScore: game.scoreB, result: game.tie ? 'T' : game.winner === game.teamA ? 'W' : 'L' },
        { game, team: game.teamB, opponent: game.teamA, score: game.scoreB, opponentScore: game.scoreA, result: game.tie ? 'T' : game.winner === game.teamB ? 'W' : 'L' },
      ];
      return team ? sides.filter((row) => normalizeName(row.team) === normalizeName(team)) : [sides[0]];
    }).filter((row) => {
      if (season && row.game.season !== season) return false; if (opponent && normalizeName(row.opponent) !== normalizeName(opponent)) return false;
      if (gameType && gameType !== 'all' && row.game.gameType !== gameType) return false; if (result && row.result !== result) return false;
      return row.score >= minScore && row.game.margin <= maxMargin;
    });
    const value = (row: (typeof rows)[number]) => sort === 'margin' ? row.game.margin : sort === 'combined' ? row.game.combined : row.score;
    rows.sort((a, b) => (asc ? value(a) - value(b) : value(b) - value(a)) || b.game.season.localeCompare(a.game.season) || b.game.week - a.game.week);
    return { meta: meta(dataset), entity, totalMatches: rows.length, rows: rows.slice(0, max).map((row) => ({ id: row.game.id, season: row.game.season, week: row.game.week, gameType: row.game.gameType, team: row.team, opponent: row.opponent, score: row.score, opponentScore: row.opponentScore, result: row.result, margin: row.game.margin, combined: row.game.combined })) };
  }
  throw new Error(`Unsupported entity: ${entity}`);
}
