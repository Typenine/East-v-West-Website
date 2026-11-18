import type { StatsGameRow } from '../stats/types';

export interface HistoricalLuckWeek {
  week: number;
  score: number;
  result: 'W' | 'L' | 'T';
  historicalProbability: number;
  allPlayProbability: number;
}

export interface HistoricalLuckTeam {
  rosterId: number;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  historicalExpected: number;
  historicalLuck: number;
  combinedExpected: number;
  combinedLuck: number;
  allPlayExpected: number;
  allPlayLuck: number;
  weeks: HistoricalLuckWeek[];
}

export interface HistoricalLuckReport {
  season: string;
  throughWeek: number;
  baselineCount: number;
  baselineAverage: number;
  seasonCounts: Array<{ year: string; count: number }>;
  teams: HistoricalLuckTeam[];
}

const round2 = (number: number) => Number(number.toFixed(2));

export interface HistoricalReferenceWindow {
  season: string;
  throughWeek: number;
}

/** Schedule-neutral expected wins using an explicit league-wide reference window.
 * All seasons are evaluated against the same completed-score pool, starting in 2023.
 * The target team's season remains fixed; only the historical benchmark grows.
 * Ties count as half a win. All-Play still uses only the target week's scores.
 */
export function calculateHistoricalLuck(
  games: StatsGameRow[],
  season: string,
  throughWeek: number,
  teamCount: number,
  referenceWindow: HistoricalReferenceWindow = { season, throughWeek },
): HistoricalLuckReport {
  const { season: referenceSeason, throughWeek: referenceThroughWeek } = referenceWindow;
  if (!/^\d{4}$/.test(season) || season < '2023' || !Number.isInteger(throughWeek) ||
    throughWeek < 0 || throughWeek > 14 || !Number.isInteger(teamCount) ||
    teamCount < 2 || teamCount % 2 !== 0 ||
    !/^\d{4}$/.test(referenceSeason) || referenceSeason < season ||
    !Number.isInteger(referenceThroughWeek) || referenceThroughWeek < 0 ||
    referenceThroughWeek > 14 ||
    (referenceSeason === season && referenceThroughWeek < throughWeek)) {
    throw new Error('Invalid historical luck analysis parameters.');
  }

  // The reference pool must never contain partially completed weeks.
  // All seasons (including 2023) use the same global pool, supplied by the
  // API using the CURRENT season's finalized W/L/T as its cutoff.
  const selected = games.filter((g) =>
    g.gameType === 'regular' && g.season >= '2023' && g.season <= referenceSeason &&
    (g.season !== referenceSeason || g.week <= referenceThroughWeek)
  );
  const byWeek = new Map<string, StatsGameRow[]>();
  const seasonCounts = new Map<string, number>();
  for (const game of selected) {
    const key = game.season + '-' + game.week;
    byWeek.set(key, [...(byWeek.get(key) || []), game]);
    seasonCounts.set(game.season, (seasonCounts.get(game.season) || 0) + 2);
  }
  const reference = selected.flatMap((g) => [g.scoreA, g.scoreB]);
  if (reference.length === 0) throw new Error('No historical scores are available.');

  // Never calculate a luck table from a partial week or a duplicate matchup.
  for (const [key, weekGames] of byWeek) {
    const ids = new Set<number>();
    if (weekGames.length !== teamCount / 2) throw new Error('Incomplete luck data for ' + key);
    for (const game of weekGames) {
      if (!Number.isFinite(game.scoreA) || !Number.isFinite(game.scoreB) ||
          game.scoreA < 0 || game.scoreB < 0 || game.rosterA <= 0 || game.rosterB <= 0 ||
          game.rosterA === game.rosterB || ids.has(game.rosterA) || ids.has(game.rosterB)) {
        throw new Error('Invalid or duplicate luck data for ' + key);
      }
      ids.add(game.rosterA);
      ids.add(game.rosterB);
    }
    if (ids.size !== teamCount) throw new Error('Missing teams in ' + key);
  }
  // Require every expected historical week so missing scores cannot skew the
  // shared reference pool (including for seasons earlier than the target).
  for (let y = 2023; y <= Number(referenceSeason); y++) {
    const completeWeeks = String(y) === referenceSeason ? referenceThroughWeek : 14;
    for (let w = 1; w <= completeWeeks; w++) {
      if (!byWeek.has(y + '-' + w)) {
        throw new Error('Finalized Week ' + w + ' of ' + y + ' has no complete data.');
      }
    }
  }
  for (let w = 1; w <= throughWeek; w++) {
    if (!byWeek.has(season + '-' + w)) throw new Error('Target Week ' + w + ' has no complete data.');
  }

  const probability = (score: number) => {
    let wins = 0;
    let ties = 0;
    for (const value of reference) {
      if (score > value) wins++;
      else if (score === value) ties++;
    }
    return (wins + ties / 2) / reference.length;
  };

  const teams = new Map<number, HistoricalLuckTeam>();
  for (let week = 1; week <= throughWeek; week++) {
    const rows = (byWeek.get(season + '-' + week) || []).flatMap((g) => [
      { id: g.rosterA, name: g.teamA, score: g.scoreA, opponent: g.scoreB },
      { id: g.rosterB, name: g.teamB, score: g.scoreB, opponent: g.scoreA },
    ]);
    for (const score of rows) {
      let team = teams.get(score.id);
      if (!team) {
        team = { rosterId: score.id, name: score.name, wins: 0, losses: 0,
          ties: 0, pointsFor: 0, historicalExpected: 0, historicalLuck: 0,
          combinedExpected: 0, combinedLuck: 0,
          allPlayExpected: 0, allPlayLuck: 0, weeks: [] };
        teams.set(score.id, team);
      }
      const result = score.score > score.opponent ? 'W' : score.score < score.opponent ? 'L' : 'T';
      if (result === 'W') team.wins++;
      else if (result === 'L') team.losses++;
      else team.ties++;
      const histChance = probability(score.score);
      const allPlayChance = rows.reduce((sum, other) => {
        if (other.id === score.id) return sum;
        return sum + (score.score > other.score ? 1 : score.score === other.score ? 0.5 : 0);
      }, 0) / (rows.length - 1);
      team.pointsFor += score.score;
      team.historicalExpected += histChance;
      team.allPlayExpected += allPlayChance;
      team.weeks.push({ week, score: round2(score.score), result,
        historicalProbability: histChance, allPlayProbability: allPlayChance });
    }
  }

  for (const team of teams.values()) {
    const actual = team.wins + team.ties / 2;
    const combinedExpectedRaw = (team.historicalExpected + team.allPlayExpected) / 2;
    team.combinedExpected = round2(combinedExpectedRaw);
    team.combinedLuck = round2(actual - combinedExpectedRaw);
    team.pointsFor = round2(team.pointsFor);
    team.historicalLuck = round2(actual - team.historicalExpected);
    team.allPlayLuck = round2(actual - team.allPlayExpected);
    team.historicalExpected = round2(team.historicalExpected);
    team.allPlayExpected = round2(team.allPlayExpected);
  }

  return {
    season,
    throughWeek,
    baselineCount: reference.length,
    baselineAverage: round2(reference.reduce((sum, x) => sum + x, 0) / reference.length),
    seasonCounts: [...seasonCounts.entries()].map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year.localeCompare(b.year)),
    teams: [...teams.values()].sort((a, b) =>
      b.historicalLuck - a.historicalLuck || b.pointsFor - a.pointsFor || a.name.localeCompare(b.name)),
  };
}


export type OfficialLuckTeamRecord = {
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
};

export type HistoricalScoreDiscrepancy = {
  rosterId: number;
  name: string;
  weeklyPoints: number;
  officialPoints: number;
};

/**
 * The luck model is based on actual weekly matchup scores, not season PF totals.
 * Sleeper's stored PF can differ from its game-by-game scores following corrections.
 * Require all W/L/T records to match, but report PF discrepancies instead of
 * hiding a season whose weekly results are complete and internally consistent.
 */
export function assertHistoricalLuckMatchesOfficial(
  report: HistoricalLuckReport,
  officialTeams: OfficialLuckTeamRecord[],
): HistoricalScoreDiscrepancy[] {
  if (report.teams.length !== officialTeams.length) {
    throw new Error('Incomplete finalized league scores');
  }
  const officialById = new Map(officialTeams.map((t) => [t.rosterId, t] as const));
  if (officialById.size !== officialTeams.length) {
    throw new Error('Duplicate official roster IDs');
  }
  const discrepancies: HistoricalScoreDiscrepancy[] = [];
  for (const team of report.teams) {
    const official = officialById.get(team.rosterId);
    if (!official || team.wins !== official.wins || team.losses !== official.losses ||
        team.ties !== official.ties || !Number.isFinite(official.fpts)) {
      throw new Error('Finalized records do not match official standings for ' + team.name);
    }
    if (Math.abs(team.pointsFor - official.fpts) > 0.1) {
      discrepancies.push({
        rosterId: team.rosterId,
        name: team.name,
        weeklyPoints: team.pointsFor,
        officialPoints: official.fpts,
      });
    }
  }
  return discrepancies;
}
