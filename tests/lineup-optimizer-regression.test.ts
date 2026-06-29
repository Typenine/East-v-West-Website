import { describe, expect, it } from 'vitest';
import { optimizeProjectedLineup } from '@/lib/fantasy/weekly-projections';
import type { WeeklyProjectedPlayer } from '@/lib/fantasy/lineup-types';

function player(id: string, position: string, projection: number): WeeklyProjectedPlayer {
  return { id, name: id, position, nflTeam: 'NFL', opponent: null, projection, baseline: projection, matchupFactor: 1, availabilityWeight: 1, isBye: false, confidence: 'medium', rangeLow: 0, rangeHigh: 30, expectedRole: '', workload: '', assumption: null, startProbability: 1, activeProbability: 1, statLine: {} };
}

const slots = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DEF'];
const currentRosterShapes = [
  { team: 'Belltown Raptors', counts: { QB: 3, RB: 5, WR: 5, TE: 2, K: 1, DEF: 1 } },
  { team: 'Belleview Badgers', counts: { QB: 3, RB: 3, WR: 8, TE: 1, K: 1, DEF: 1 } },
  { team: 'Red Pandas', counts: { QB: 2, RB: 6, WR: 4, TE: 3, K: 1, DEF: 1 } },
  { team: 'Double Trouble', counts: { QB: 4, RB: 4, WR: 4, TE: 4, K: 1, DEF: 0 } },
  { team: 'Mt. Lebanon Cake Eaters', counts: { QB: 2, RB: 5, WR: 6, TE: 2, K: 1, DEF: 1 } },
  { team: 'Elemental Heroes', counts: { QB: 4, RB: 5, WR: 5, TE: 1, K: 1, DEF: 1 } },
  { team: 'bop pop', counts: { QB: 2, RB: 5, WR: 5, TE: 3, K: 1, DEF: 1 } },
  { team: 'Bimg Bamg Boomg', counts: { QB: 2, RB: 4, WR: 7, TE: 2, K: 1, DEF: 1 } },
  { team: 'Detroit Dawgs', counts: { QB: 2, RB: 4, WR: 7, TE: 1, K: 1, DEF: 1 } },
  { team: 'The Lone Ginger', counts: { QB: 4, RB: 6, WR: 4, TE: 2, K: 1, DEF: 1 } },
  { team: "Minshew's Maniacs", counts: { QB: 3, RB: 3, WR: 6, TE: 3, K: 1, DEF: 1 } },
  { team: 'BeerNeverBrokeMyHeart', counts: { QB: 3, RB: 4, WR: 5, TE: 2, K: 1, DEF: 0 } },
] as const;

function currentRoster(team: string, counts: Record<string, number>): WeeklyProjectedPlayer[] {
  const values: Record<string, number[]> = {
    QB: [22, 18, 7, 4],
    RB: [15, 13, 12, 8, 6, 4],
    WR: [14, 12, 11, 10, 8, 6, 4, 2],
    TE: [9, 7, 5, 3],
    K: [8],
    DEF: [7],
  };
  return Object.entries(counts).flatMap(([position, count]) =>
    Array.from({ length: count }, (_, index) => player(
      `${team}-${position}-${index + 1}`,
      position,
      values[position]?.[index] ?? Math.max(1, 8 - index),
    )),
  );
}

describe('legal lineup optimizer', () => {
  it('fills every required slot and uses a second quarterback in Superflex', () => {
    const output = optimizeProjectedLineup(currentRoster('test', { QB: 3, RB: 4, WR: 5, TE: 2, K: 1, DEF: 1 }), slots);
    expect(output.every(Boolean)).toBe(true);
    expect(output[7]?.position).toBe('QB');
    expect(new Set(output.map((entry) => entry?.id)).size).toBe(10);
  });

  it('chooses the best legal flex combination rather than fixed positional assumptions', () => {
    const roster = currentRoster('flex', { QB: 2, RB: 3, WR: 3, TE: 2, K: 1, DEF: 1 });
    roster.push(player('elite-te2', 'TE', 21));
    const output = optimizeProjectedLineup(roster, slots);
    expect(output[5]?.id).toBe('elite-te2');
    expect(output[6]?.position).toBe('RB');
  });

  it('audits all 12 current league roster shapes and distinguishes missing-position weakness', () => {
    for (const { team, counts } of currentRosterShapes) {
      const output = optimizeProjectedLineup(currentRoster(team, counts), slots);
      const filled = output.filter(Boolean).length;
      expect(filled, team).toBe(counts.DEF ? 10 : 9);
      if (!counts.DEF) expect(output.findIndex((entry) => entry == null)).toBe(9);
    }
  });
});
