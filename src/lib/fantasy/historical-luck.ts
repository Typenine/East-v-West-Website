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

/** A schedule-neutral historical baseline, updated whenever another week is finalized.
 * Every regular-season score since 2023 is included, and ties count as half a win.
 * The result is distinct from Bill James' Pythagorean expected wins.
 */
export function calculateHistoricalLuck(
  games: StatsGameRow[],
  season: string,
  throughWeek: number,
  teamCount: number,
): HistoricalLuckReport {
  if (!/^\d{4}$/.test(season) || season < '2023' || !Number.isInteger(throughWeek) ||
    throughWeek < 0 || throughWeek > 14 || !Number.isInteger(teamCount) ||
    teamCount < 2 || teamCount % 2 !== 0) {
    throw new Error('Invalid historical luck analysis parameters.');
  }

  const selected = games.filter((g) =>
    g.gameType === 'regular' && g.season >= '2023' && g.season <= season &&
    (g.season !== season || g.week <= throughWeek)
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
  for (let w = 1; w <= throughWeek; w++) {
    if (!byWeek.has(season + '-' + w)) throw new Error('Finalized Week ' + w + ' has no complete data.');
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
