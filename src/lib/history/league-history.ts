import type {
  LeagueStatsDataset,
  StatsFranchiseRow,
  StatsGameRow,
  StatsPlayerGameRow,
  StatsSeasonTeamRow,
} from '@/lib/stats/types';

const DEF_POSITIONS = new Set(['DEF', 'DST', 'D/ST']);
const OFFENSE_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

export type AllEvwSlot = 'QB' | 'RB1' | 'RB2' | 'WR1' | 'WR2' | 'TE' | 'FLEX' | 'SF' | 'DEF';

export interface AllEvwSelection {
  slot: AllEvwSlot;
  playerId: string;
  name: string;
  position: string;
  points: number;
  franchises: string[];
}

export interface AllEvwSeason {
  season: string;
  firstTeam: AllEvwSelection[];
  secondTeam: AllEvwSelection[];
}

export type LeagueMilestoneType = 'player' | 'franchise' | 'record' | 'championship';

export interface LeagueMilestone {
  id: string;
  season: string;
  week: number | null;
  type: LeagueMilestoneType;
  title: string;
  detail: string;
  playerId?: string;
  teamName?: string;
  value?: number;
}

export interface WeeklyGamebookSummary {
  season: string;
  week: number;
  games: StatsGameRow[];
  players: StatsPlayerGameRow[];
  high: { team: string; opponent: string; points: number } | null;
  low: { team: string; opponent: string; points: number } | null;
  averageScore: number;
  closest: StatsGameRow | null;
  biggest: StatsGameRow | null;
  positional: Array<{ position: string; rows: StatsPlayerGameRow[] }>;
  milestones: LeagueMilestone[];
}

export interface FranchiseHistoryPlayer {
  playerId: string;
  name: string;
  position: string;
  points: number;
  rosteredWeeks: number;
  starts: number;
  seasons: string[];
}

export interface FranchiseHistorySeason {
  regular: StatsSeasonTeamRow;
  playoffWins: number;
  playoffLosses: number;
  playoffTies: number;
  finish: 'Champion' | 'Runner-up' | '3rd' | null;
}

export interface FranchiseHistoryGame extends StatsGameRow {
  opponent: string;
  pointsFor: number;
  pointsAgainst: number;
  result: 'W' | 'L' | 'T';
}

export interface FranchiseHistoryRecord {
  label: string;
  value: string;
  note: string;
}

export interface FranchiseHistory {
  franchise: StatsFranchiseRow;
  seasons: FranchiseHistorySeason[];
  players: FranchiseHistoryPlayer[];
  games: FranchiseHistoryGame[];
  records: FranchiseHistoryRecord[];
  allEvw: Array<AllEvwSelection & { season: string; team: 'First Team' | 'Second Team' }>;
  milestones: LeagueMilestone[];
  championshipYears: string[];
  runnerUpYears: string[];
}

function gameKey(season: string, week: number, teamName: string): string {
  return `${season}:${week}:${teamName}`;
}

function regularPlayerRows(dataset: LeagueStatsDataset, season: string) {
  const regularTeams = new Set<string>();
  for (const game of dataset.games) {
    if (game.season !== season || game.gameType !== 'regular') continue;
    regularTeams.add(gameKey(season, game.week, game.teamA));
    regularTeams.add(gameKey(season, game.week, game.teamB));
  }

  const byPlayer = new Map<string, {
    playerId: string;
    name: string;
    position: string;
    points: number;
    franchises: Map<string, number>;
  }>();

  for (const row of dataset.playerGames) {
    if (row.season !== season || !regularTeams.has(gameKey(row.season, row.week, row.franchiseName))) continue;
    const current = byPlayer.get(row.playerId) || {
      playerId: row.playerId,
      name: row.name,
      position: row.position,
      points: 0,
      franchises: new Map<string, number>(),
    };
    current.points += row.points;
    current.franchises.set(row.franchiseName, (current.franchises.get(row.franchiseName) || 0) + row.points);
    byPlayer.set(row.playerId, current);
  }

  return Array.from(byPlayer.values())
    .map((row) => ({
      ...row,
      franchises: Array.from(row.franchises.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([teamName]) => teamName),
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

function selectAllEvwTeam(
  rows: ReturnType<typeof regularPlayerRows>,
  used: Set<string>,
): AllEvwSelection[] {
  const picks: AllEvwSelection[] = [];
  const take = (slot: AllEvwSlot, eligible: (position: string) => boolean) => {
    const row = rows.find((candidate) => !used.has(candidate.playerId) && eligible(candidate.position));
    if (!row) return;
    used.add(row.playerId);
    picks.push({
      slot,
      playerId: row.playerId,
      name: row.name,
      position: row.position,
      points: row.points,
      franchises: row.franchises,
    });
  };

  take('QB', (position) => position === 'QB');
  take('RB1', (position) => position === 'RB');
  take('RB2', (position) => position === 'RB');
  take('WR1', (position) => position === 'WR');
  take('WR2', (position) => position === 'WR');
  take('TE', (position) => position === 'TE');
  take('FLEX', (position) => position === 'RB' || position === 'WR' || position === 'TE');
  take('SF', (position) => OFFENSE_POSITIONS.has(position));
  take('DEF', (position) => DEF_POSITIONS.has(position));

  return picks;
}

export function buildAllEvwTeams(dataset: LeagueStatsDataset): AllEvwSeason[] {
  return dataset.seasons
    .map((season) => {
      const rows = regularPlayerRows(dataset, season);
      const used = new Set<string>();
      return {
        season,
        firstTeam: selectAllEvwTeam(rows, used),
        secondTeam: selectAllEvwTeam(rows, used),
      };
    })
    .filter((season) => season.firstTeam.length > 0 || season.secondTeam.length > 0)
    .sort((a, b) => b.season.localeCompare(a.season));
}

function playerThresholds(max: number): number[] {
  const values: number[] = [];
  for (let value = 250; value <= max; value += 250) values.push(value);
  return values;
}

function franchiseWinThresholds(max: number): number[] {
  const fixed = [10, 25, 50, 75, 100];
  for (let value = 125; value <= max; value += 25) fixed.push(value);
  return fixed.filter((value) => value <= max);
}

function playoffWinThresholds(max: number): number[] {
  const values: number[] = [];
  for (let value = 5; value <= max; value += 5) values.push(value);
  return values;
}

function chronological<T extends { season: string; week: number; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.season.localeCompare(b.season) || a.week - b.week || a.id.localeCompare(b.id));
}

export function buildLeagueMilestones(dataset: LeagueStatsDataset): LeagueMilestone[] {
  const milestones: LeagueMilestone[] = [];
  const playerTotals = new Map<string, number>();
  const playerNextThreshold = new Map<string, number>();

  for (const row of chronological(dataset.playerGames)) {
    const before = playerTotals.get(row.playerId) || 0;
    const after = before + row.points;
    let next = playerNextThreshold.get(row.playerId) || 250;
    const possible = playerThresholds(Math.max(250, after));
    while (next <= after && possible.includes(next)) {
      if (before < next) {
        milestones.push({
          id: `player-points-${row.playerId}-${next}`,
          season: row.season,
          week: row.week,
          type: 'player',
          title: `${row.name} reaches ${next.toLocaleString()} EVW points`,
          detail: `${row.name} crossed ${next.toLocaleString()} career East v. West points while rostered by ${row.franchiseName}.`,
          playerId: row.playerId,
          teamName: row.franchiseName,
          value: next,
        });
      }
      next += 250;
    }
    playerNextThreshold.set(row.playerId, next);
    playerTotals.set(row.playerId, after);
  }

  const regularGames = chronological(dataset.games.filter((game) => game.gameType === 'regular'));
  const franchiseWins = new Map<string, number>();
  for (const game of regularGames) {
    if (!game.winner) continue;
    const wins = (franchiseWins.get(game.winner) || 0) + 1;
    franchiseWins.set(game.winner, wins);
    if (franchiseWinThresholds(wins).includes(wins)) {
      milestones.push({
        id: `franchise-wins-${game.winner}-${wins}`,
        season: game.season,
        week: game.week,
        type: 'franchise',
        title: `${game.winner} earns win No. ${wins}`,
        detail: `${game.winner} reached ${wins} regular-season victories in East v. West history.`,
        teamName: game.winner,
        value: wins,
      });
    }
  }

  const playoffGames = chronological(dataset.games.filter((game) => game.gameType === 'playoffs'));
  const playoffWins = new Map<string, number>();
  for (const game of playoffGames) {
    if (!game.winner) continue;
    const wins = (playoffWins.get(game.winner) || 0) + 1;
    playoffWins.set(game.winner, wins);
    if (playoffWinThresholds(wins).includes(wins)) {
      milestones.push({
        id: `playoff-wins-${game.winner}-${wins}`,
        season: game.season,
        week: game.week,
        type: 'franchise',
        title: `${game.winner} records playoff win No. ${wins}`,
        detail: `${game.winner} became the latest franchise to reach ${wins} championship-bracket victories.`,
        teamName: game.winner,
        value: wins,
      });
    }
  }

  let playerRecord: StatsPlayerGameRow | null = null;
  for (const row of chronological(dataset.playerGames)) {
    if (!playerRecord) {
      playerRecord = row;
      continue;
    }
    if (row.points > playerRecord.points) {
      milestones.push({
        id: `player-game-record-${row.id}`,
        season: row.season,
        week: row.week,
        type: 'record',
        title: `${row.name} sets the EVW single-game player record`,
        detail: `${row.name} scored ${row.points.toFixed(2)} points for ${row.franchiseName}, surpassing the previous record of ${playerRecord.points.toFixed(2)}.`,
        playerId: row.playerId,
        teamName: row.franchiseName,
        value: row.points,
      });
      playerRecord = row;
    }
  }

  let teamRecord: { points: number; teamName: string } | null = null;
  for (const game of chronological(dataset.games)) {
    const scores = [
      { teamName: game.teamA, points: game.scoreA, opponent: game.teamB },
      { teamName: game.teamB, points: game.scoreB, opponent: game.teamA },
    ];
    for (const score of scores) {
      if (!teamRecord) {
        teamRecord = { points: score.points, teamName: score.teamName };
        continue;
      }
      if (score.points > teamRecord.points) {
        milestones.push({
          id: `team-game-record-${game.id}-${score.teamName}`,
          season: game.season,
          week: game.week,
          type: 'record',
          title: `${score.teamName} sets the EVW team scoring record`,
          detail: `${score.teamName} scored ${score.points.toFixed(2)} against ${score.opponent}, breaking the previous team record of ${teamRecord.points.toFixed(2)}.`,
          teamName: score.teamName,
          value: score.points,
        });
        teamRecord = { points: score.points, teamName: score.teamName };
      }
    }
  }

  for (const [season, champion] of Object.entries(dataset.champions)) {
    if (!champion?.champion) continue;
    const titleGame = [...dataset.games]
      .filter((game) => game.season === season && game.gameType === 'playoffs' && (
        (game.teamA === champion.champion && game.teamB === champion.runnerUp) ||
        (game.teamB === champion.champion && game.teamA === champion.runnerUp)
      ))
      .sort((a, b) => b.week - a.week)[0];
    const fallbackWeek = [...dataset.games]
      .filter((game) => game.season === season && game.gameType === 'playoffs')
      .sort((a, b) => b.week - a.week)[0]?.week ?? null;
    milestones.push({
      id: `championship-${season}-${champion.champion}`,
      season,
      week: titleGame?.week ?? fallbackWeek,
      type: 'championship',
      title: `${champion.champion} wins the ${season} championship`,
      detail: champion.runnerUp ? `${champion.champion} finished the season as East v. West champion over ${champion.runnerUp}.` : `${champion.champion} finished the season as East v. West champion.`,
      teamName: champion.champion,
    });
  }

  return milestones.sort((a, b) => b.season.localeCompare(a.season) || (b.week ?? 99) - (a.week ?? 99) || a.title.localeCompare(b.title));
}

export function buildWeeklyGamebook(dataset: LeagueStatsDataset, season: string, week: number): WeeklyGamebookSummary | null {
  const games = dataset.games.filter((game) => game.season === season && game.week === week);
  if (games.length === 0) return null;
  const players = dataset.playerGames
    .filter((row) => row.season === season && row.week === week)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const scores = games.flatMap((game) => [
    { team: game.teamA, opponent: game.teamB, points: game.scoreA },
    { team: game.teamB, opponent: game.teamA, points: game.scoreB },
  ]);
  const high = [...scores].sort((a, b) => b.points - a.points)[0] || null;
  const low = [...scores].sort((a, b) => a.points - b.points)[0] || null;
  const averageScore = scores.length ? scores.reduce((sum, row) => sum + row.points, 0) / scores.length : 0;
  const closest = [...games].filter((game) => !game.tie).sort((a, b) => a.margin - b.margin)[0] || null;
  const biggest = [...games].filter((game) => !game.tie).sort((a, b) => b.margin - a.margin)[0] || null;
  const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
  const available = new Set(players.map((row) => row.position));
  const positions = [...order.filter((position) => available.has(position)), ...Array.from(available).filter((position) => !order.includes(position)).sort()];
  const positional = positions
    .map((position) => ({ position, rows: players.filter((row) => row.position === position).slice(0, 5) }))
    .filter((group) => group.rows.length > 0);
  const milestones = buildLeagueMilestones(dataset).filter((item) => item.season === season && item.week === week);

  return { season, week, games, players, high, low, averageScore, closest, biggest, positional, milestones };
}

function recordString(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

export function slugifyFranchise(teamName: string): string {
  return teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function franchiseHistoryId(franchise: StatsFranchiseRow): string {
  return franchise.currentRosterId != null ? String(franchise.currentRosterId) : slugifyFranchise(franchise.teamName);
}

export function findFranchiseByHistoryId(dataset: LeagueStatsDataset, id: string): StatsFranchiseRow | null {
  const numeric = Number(id);
  if (Number.isFinite(numeric)) {
    const byRoster = dataset.franchises.find((row) => row.currentRosterId === numeric);
    if (byRoster) return byRoster;
  }
  return dataset.franchises.find((row) => slugifyFranchise(row.teamName) === id.toLowerCase()) || null;
}

export function buildFranchiseHistory(dataset: LeagueStatsDataset, franchise: StatsFranchiseRow): FranchiseHistory {
  const teamName = franchise.teamName;
  const seasons = dataset.seasonTeams
    .filter((row) => row.teamName === teamName)
    .map((regular) => {
      const playoffGames = dataset.games.filter((game) => game.season === regular.season && game.gameType === 'playoffs' && (game.teamA === teamName || game.teamB === teamName));
      let playoffWins = 0;
      let playoffLosses = 0;
      let playoffTies = 0;
      for (const game of playoffGames) {
        if (game.tie) playoffTies += 1;
        else if (game.winner === teamName) playoffWins += 1;
        else playoffLosses += 1;
      }
      const champion = dataset.champions[regular.season];
      const finish = champion?.champion === teamName ? 'Champion' : champion?.runnerUp === teamName ? 'Runner-up' : champion?.thirdPlace === teamName ? '3rd' : null;
      return { regular, playoffWins, playoffLosses, playoffTies, finish } as FranchiseHistorySeason;
    })
    .sort((a, b) => b.regular.season.localeCompare(a.regular.season));

  const players = dataset.players
    .map((player) => {
      const split = player.franchises.find((row) => row.teamName === teamName);
      if (!split) return null;
      const playerSeasons = dataset.playerSeasons
        .filter((row) => row.playerId === player.playerId && row.franchises.some((franchiseSplit) => franchiseSplit.teamName === teamName))
        .map((row) => row.season)
        .sort();
      return {
        playerId: player.playerId,
        name: player.name,
        position: player.position,
        points: split.points,
        rosteredWeeks: split.rosteredWeeks,
        starts: split.starts,
        seasons: playerSeasons,
      } as FranchiseHistoryPlayer;
    })
    .filter((row): row is FranchiseHistoryPlayer => Boolean(row))
    .sort((a, b) => b.points - a.points || b.starts - a.starts || a.name.localeCompare(b.name));

  const games = dataset.games
    .filter((game) => game.teamA === teamName || game.teamB === teamName)
    .map((game) => {
      const isA = game.teamA === teamName;
      return {
        ...game,
        opponent: isA ? game.teamB : game.teamA,
        pointsFor: isA ? game.scoreA : game.scoreB,
        pointsAgainst: isA ? game.scoreB : game.scoreA,
        result: game.tie ? 'T' : game.winner === teamName ? 'W' : 'L',
      } as FranchiseHistoryGame;
    })
    .sort((a, b) => b.season.localeCompare(a.season) || b.week - a.week);

  const highest = [...games].sort((a, b) => b.pointsFor - a.pointsFor)[0];
  const lowest = [...games].sort((a, b) => a.pointsFor - b.pointsFor)[0];
  const biggestWin = [...games].filter((game) => game.result === 'W').sort((a, b) => b.margin - a.margin)[0];
  const closestWin = [...games].filter((game) => game.result === 'W').sort((a, b) => a.margin - b.margin)[0];
  const bestLoss = [...games].filter((game) => game.result === 'L').sort((a, b) => b.pointsFor - a.pointsFor)[0];
  const topPlayer = players[0];
  const records: FranchiseHistoryRecord[] = [
    { label: 'Highest Team Score', value: highest ? highest.pointsFor.toFixed(2) : '—', note: highest ? `${highest.season} W${highest.week} vs. ${highest.opponent}` : 'No games' },
    { label: 'Lowest Team Score', value: lowest ? lowest.pointsFor.toFixed(2) : '—', note: lowest ? `${lowest.season} W${lowest.week} vs. ${lowest.opponent}` : 'No games' },
    { label: 'Biggest Win', value: biggestWin ? biggestWin.margin.toFixed(2) : '—', note: biggestWin ? `${biggestWin.season} W${biggestWin.week} vs. ${biggestWin.opponent}` : 'No wins' },
    { label: 'Closest Win', value: closestWin ? closestWin.margin.toFixed(2) : '—', note: closestWin ? `${closestWin.season} W${closestWin.week} vs. ${closestWin.opponent}` : 'No wins' },
    { label: 'Most Points in a Loss', value: bestLoss ? bestLoss.pointsFor.toFixed(2) : '—', note: bestLoss ? `${bestLoss.season} W${bestLoss.week} vs. ${bestLoss.opponent}` : 'No losses' },
    { label: 'Career Scoring Leader', value: topPlayer ? topPlayer.points.toFixed(1) : '—', note: topPlayer ? `${topPlayer.name} · ${topPlayer.position}` : 'No player data' },
  ];

  const allEvw = buildAllEvwTeams(dataset).flatMap((season) => [
    ...season.firstTeam.filter((row) => row.franchises.includes(teamName)).map((row) => ({ ...row, season: season.season, team: 'First Team' as const })),
    ...season.secondTeam.filter((row) => row.franchises.includes(teamName)).map((row) => ({ ...row, season: season.season, team: 'Second Team' as const })),
  ]).sort((a, b) => b.season.localeCompare(a.season) || a.slot.localeCompare(b.slot));

  const milestones = buildLeagueMilestones(dataset).filter((item) => item.teamName === teamName);
  const championshipYears = Object.entries(dataset.champions).filter(([, row]) => row.champion === teamName).map(([season]) => season).sort((a, b) => b.localeCompare(a));
  const runnerUpYears = Object.entries(dataset.champions).filter(([, row]) => row.runnerUp === teamName).map(([season]) => season).sort((a, b) => b.localeCompare(a));

  return { franchise, seasons, players, games, records, allEvw, milestones, championshipYears, runnerUpYears };
}

export function describeFranchiseRecord(franchise: StatsFranchiseRow): string {
  return `${recordString(franchise.regularWins, franchise.regularLosses, franchise.regularTies)} regular season · ${recordString(franchise.playoffWins, franchise.playoffLosses, franchise.playoffTies)} playoffs`;
}
