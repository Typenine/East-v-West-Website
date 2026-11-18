import { describe, expect, it } from 'vitest';
import { assertHistoricalLuckMatchesOfficial, calculateHistoricalLuck } from '../src/lib/fantasy/historical-luck';
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
    // Combine the two unrounded expected-win probabilities, 50/50.
    expect(alpha.combinedExpected).toBe(0.81);
    expect(alpha.combinedLuck).toBe(0.19);
  });

  it('uses a common future-year historical pool when analyzing 2023', () => {
    // A complete 2023 followed by Week 1 of 2024. Week 2 of 2024 is
    // deliberately unfinished and must not enter the reference distribution.
    const games = Array.from({ length: 14 }, (_, i) => game('2023', i + 1, 100, 50));
    games.push(game('2024', 1, 250, 200));
    games.push(game('2024', 2, 5, 500));

    const original = calculateHistoricalLuck(games, '2023', 14, 2);
    const updated = calculateHistoricalLuck(games, '2023', 14, 2, {
      season: '2024',
      throughWeek: 1,
    });
    expect(original.baselineCount).toBe(28);
    expect(updated.baselineCount).toBe(30);
    expect(updated.seasonCounts).toEqual([
      { year: '2023', count: 28 },
      { year: '2024', count: 2 },
    ]);
    const originalAlpha = original.teams.find((t) => t.name === 'Alpha')!;
    const updatedAlpha = updated.teams.find((t) => t.name === 'Alpha')!;
    expect(updatedAlpha.allPlayExpected).toBe(originalAlpha.allPlayExpected);
    expect(updatedAlpha.allPlayExpected).toBe(14);
    expect(originalAlpha.historicalExpected).toBe(10.5);
    expect(updatedAlpha.historicalExpected).toBe(9.8);
    expect(updatedAlpha.combinedExpected).toBe(11.9);
    expect(updatedAlpha.combinedLuck).toBe(2.1);
    expect(updatedAlpha.combinedLuck).not.toBe(originalAlpha.combinedLuck);
  });

  it('rejects an incomplete global comparison pool', () => {
    const games = Array.from({ length: 14 }, (_, i) => game('2023', i + 1, 100, 50));
    games.push(game('2024', 1, 250, 200));
    expect(() => calculateHistoricalLuck(games, '2023', 14, 2, {
      season: '2024', throughWeek: 2,
    })).toThrow(/Finalized Week 2 of 2024/);
    expect(() => calculateHistoricalLuck(games, '2023', 14, 2, {
      season: '2025', throughWeek: 0,
    })).toThrow(/Finalized Week 1 of 2024/);
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
    expect(report.teams[0].combinedExpected).toBe(0.5);
    expect(report.teams[0].combinedLuck).toBe(0);
  });

  it('uses complete weekly results despite a mismatch in stored season points', () => {
    const report = calculateHistoricalLuck([game('2023', 1, 80, 70)], '2023', 1, 2);
    const alpha = report.teams.find((t) => t.name === 'Alpha')!;
    alpha.pointsFor = 1296.96;
    const official = [
      { rosterId: 1, wins: 1, losses: 0, ties: 0, fpts: 1295.96 },
      { rosterId: 2, wins: 0, losses: 1, ties: 0, fpts: 70 },
    ];
    const discrepancies = assertHistoricalLuckMatchesOfficial(report, official);
    expect(discrepancies).toEqual([{
      rosterId: 1, name: 'Alpha', weeklyPoints: 1296.96, officialPoints: 1295.96,
    }]);

    expect(() => assertHistoricalLuckMatchesOfficial(report, [
      { ...official[0], fpts: 1294.96 }, official[1],
    ])).not.toThrow();

    expect(() => assertHistoricalLuckMatchesOfficial(report, [
      { ...official[0], wins: 0 }, official[1],
    ])).toThrow(/Finalized records/);

    expect(() => assertHistoricalLuckMatchesOfficial(report, [official[0]]))
      .toThrow(/Incomplete finalized/);
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
