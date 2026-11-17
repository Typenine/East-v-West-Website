import { describe, expect, it } from 'vitest';
import { calculateHistoricalLuck } from '../src/lib/fantasy/historical-luck';
import type { StatsGameRow } from '../src/lib/stats/types';

function game(season: string, week: number, a: number, b: number, gameType: StatsGameRow['gameType'] = 'regular'): StatsGameRow {
  return {
    id: season + '-' + week, season, week, gameType,
    rosterA: 1, rosterB: 2, teamA: 'Alpha', teamB: 'Bravo',
    scoreA: a, scoreB: b, winner: a === b ? null : a > b ? 'Alpha' : 'Bravo',
    loser: a === b ? null : a < b ? 'Alpha' : 'Bravo',
    tie: a === b, margin: Math.abs(a - b), combined: a + b,
  };
}

describe('historical luck calculations', () => {
  it('appends finalized weeks to the all-team historical baseline', () => {
    const report = calculateHistoricalLuck([
      game('2023', 1, 100, 200),
      game('2026', 1, 150, 80),
      game('2026', 2, 90, 70),
    ], '2026', 1, 2);
    expect(report.baselineCount).toBe(4);
    expect(report.seasonCounts).toEqual([
      { year: '2023', count: 2 }, { year: '2026', count: 2 },
    ]);
    const alpha = report.teams.find((t) => t.name === 'Alpha')!;
    expect(alpha.historicalExpected).toBe(0.63);
    expect(alpha.historicalLuck).toBe(0.38);
    expect(alpha.allPlayExpected).toBe(1);
    expect(alpha.allPlayLuck).toBe(0);
  });

  it('treats ties as half-wins and excludes postseason scores', () => {
    const report = calculateHistoricalLuck([
      game('2023', 1, 100, 100),
      game('2026', 1, 100, 100),
      game('2023', 15, 500, 0, 'playoffs'),
    ], '2026', 1, 2);
    expect(report.baselineCount).toBe(4);
    expect(report.teams[0].historicalExpected).toBe(0.5);
    expect(report.teams[0].historicalLuck).toBe(0);
    expect(report.teams[0].allPlayExpected).toBe(0.5);
  });

  it('refuses partial historical or missing finalized weeks', () => {
    expect(() => calculateHistoricalLuck([
      game('2026', 1, 100, 90),
    ], '2026', 2, 2)).toThrow(/no complete data/);
    expect(() => calculateHistoricalLuck([
      game('2026', 1, 100, 90),
    ], '2026', 1, 12)).toThrow(/Incomplete luck data/);
  });
});
