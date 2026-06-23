/**
 * Tests for unique roster player counting.
 *
 * Sleeper's roster.players already includes players listed in .taxi and .reserve.
 * Naively concatenating all three arrays double-counts those players.
 * The page.tsx deduplication logic must count each player exactly once.
 */

import { describe, it, expect } from 'vitest';

// Mirror the deduplication logic from page.tsx
function computePositionCounts(
  players: string[],
  taxi: string[],
  reserve: string[],
  playerPositions: Record<string, string>,
): Record<string, number> {
  // Sleeper: players already includes taxi and reserve members.
  // Combine all three arrays then deduplicate before counting.
  const uniquePids = new Set<string>(players);
  for (const pid of [...taxi, ...reserve]) uniquePids.add(pid);

  const counts: Record<string, number> = {};
  for (const pid of uniquePids) {
    const pos = playerPositions[pid];
    if (pos) counts[pos] = (counts[pos] ?? 0) + 1;
  }
  return counts;
}

describe('roster position counting – deduplication', () => {
  it('counts a player in both players[] and taxi[] only once', () => {
    const players = ['p1', 'p2', 'p3'];
    const taxi = ['p3'];          // p3 is also in players
    const reserve: string[] = [];
    const positions = { p1: 'WR', p2: 'RB', p3: 'QB' };

    const counts = computePositionCounts(players, taxi, reserve, positions);
    expect(counts.QB).toBe(1);   // p3 counted once
    expect(counts.WR).toBe(1);
    expect(counts.RB).toBe(1);
  });

  it('counts a player in both players[] and reserve[] only once', () => {
    const players = ['p1', 'p2', 'p3'];
    const taxi: string[] = [];
    const reserve = ['p2'];       // p2 is also in players
    const positions = { p1: 'WR', p2: 'TE', p3: 'RB' };

    const counts = computePositionCounts(players, taxi, reserve, positions);
    expect(counts.TE).toBe(1);   // p2 counted once
    expect(counts.WR).toBe(1);
    expect(counts.RB).toBe(1);
  });

  it('counts a player in players[], taxi[], and reserve[] only once', () => {
    const players = ['p1', 'p2'];
    const taxi = ['p1'];
    const reserve = ['p1'];
    const positions = { p1: 'QB', p2: 'WR' };

    const counts = computePositionCounts(players, taxi, reserve, positions);
    expect(counts.QB).toBe(1);   // p1 counted once despite appearing 3 times
    expect(counts.WR).toBe(1);
  });

  it('total player count equals the unique set size', () => {
    const players = ['p1', 'p2', 'p3', 'p4'];
    const taxi = ['p3', 'p4'];
    const reserve = ['p4'];
    const positions = { p1: 'WR', p2: 'RB', p3: 'TE', p4: 'QB' };

    const counts = computePositionCounts(players, taxi, reserve, positions);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    expect(total).toBe(4); // unique player count
  });

  it('handles empty taxi and reserve arrays', () => {
    const players = ['p1', 'p2'];
    const positions = { p1: 'WR', p2: 'RB' };

    const counts = computePositionCounts(players, [], [], positions);
    expect(counts.WR).toBe(1);
    expect(counts.RB).toBe(1);
  });

  it('ignores players with no position in the map', () => {
    const players = ['p1', 'p2', 'p99'];
    const positions = { p1: 'WR', p2: 'RB' }; // p99 not in map

    const counts = computePositionCounts(players, [], [], positions);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    expect(total).toBe(2); // p99 excluded
  });
});
