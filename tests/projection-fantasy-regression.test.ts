import { describe, expect, it } from 'vitest';
import { buildFantasyBaseline, eligibleProjection, normalizePreseasonActiveProbability } from '@/lib/fantasy/projection-fantasy-baseline';
import { reconcileTeamOpportunityBudgets } from '@/lib/fantasy/projection-allocation';
import type { PlayerProjectionCandidate } from '@/lib/fantasy/projection-opportunity-types';
import type { WeeklyProjectedPlayer } from '@/lib/fantasy/lineup-types';
import type { SleeperPlayer } from '@/lib/utils/sleeper-api';

const scoring = { pass_yd: 0.04, pass_td: 5, pass_int: -2, rush_yd: 0.1, rush_td: 6, rec: 0.5, rec_yd: 0.1, rec_td: 6, fum_lost: -2 };

function base(id: string, position: string, statLine: Record<string, number>, projection: number, role = 'Expected starter'): WeeklyProjectedPlayer {
  return { id, name: id, position, nflTeam: 'ARI', opponent: null, projection, baseline: projection, matchupFactor: 1, availabilityWeight: 0.98, isBye: false, confidence: 'medium', rangeLow: 0, rangeHigh: 25, expectedRole: role, workload: '', assumption: null, startProbability: 0.9, activeProbability: 0.98, statLine };
}
function player(id: string, position: string): SleeperPlayer {
  return { player_id: id, first_name: id, last_name: 'Player', position, team: 'ARI', status: 'Active', years_exp: 4 } as SleeperPlayer;
}
function games(count: number, stats: Record<string, number>): PlayerProjectionCandidate['games'] {
  return Array.from({ length: count }, (_, index) => ({ season: 2025, week: index + 1, stats: { team: 'ARI', ...stats } }));
}
function candidate(id: string, position: 'QB' | 'RB' | 'WR' | 'TE', statLine: Record<string, number>, projection: number, gameStats: Record<string, number>, role = 'Expected starter'): PlayerProjectionCandidate {
  const history = games(10, gameStats);
  return { id, player: player(id, position), games: history, base: base(id, position, statLine, projection, role), projectionSeason: 2026, fantasyBaseline: buildFantasyBaseline({ games: history, position, scoring, currentTeam: 'ARI' }) || undefined };
}
const run = (candidates: PlayerProjectionCandidate[]) => reconcileTeamOpportunityBudgets({ candidates, currentRowsByTeam: new Map(), previousRowsByTeam: new Map(), preseason: true, scoring, teamOverrides: new Map() }).players;

describe('fantasy-aware projection regression', () => {
  it('scores half-PPR production and preserves established fantasy baselines', () => {
    const baseline = buildFantasyBaseline({ position: 'WR', scoring, currentTeam: 'ARI', games: games(8, { rec_tgt: 9, rec: 6, rec_yd: 84, rec_td: 0.45 }) });
    expect(baseline).not.toBeNull();
    expect(baseline!.weightedPoints).toBeGreaterThan(13);
    expect(baseline!.anchorWeight).toBeGreaterThan(0.25);
    expect(baseline!.established).toBe(true);
  });

  it('does not push established RB, WR, and TE starters to replacement level', () => {
    const candidates = [
      candidate('qb', 'QB', { pass_att: 34, pass_cmp: 22, pass_yd: 245, pass_td: 1.7, pass_int: 0.7, rush_att: 4, rush_yd: 20, rush_td: 0.15 }, 20, { pass_att: 34, pass_cmp: 22, pass_yd: 245, pass_td: 1.7, pass_int: 0.7, rush_att: 4, rush_yd: 20, rush_td: 0.15 }),
      candidate('rb1', 'RB', { rush_att: 16, rush_yd: 72, rush_td: 0.55, rec_tgt: 5, rec: 4, rec_yd: 32, rec_td: 0.15 }, 15, { rush_att: 16, rush_yd: 72, rush_td: 0.55, rec_tgt: 5, rec: 4, rec_yd: 32, rec_td: 0.15 }),
      candidate('wr1', 'WR', { rec_tgt: 10, rec: 6.5, rec_yd: 91, rec_td: 0.55, rush_att: 0.2, rush_yd: 1 }, 15, { rec_tgt: 10, rec: 6.5, rec_yd: 91, rec_td: 0.55 }),
      candidate('te1', 'TE', { rec_tgt: 8, rec: 5.5, rec_yd: 68, rec_td: 0.5 }, 12, { rec_tgt: 8, rec: 5.5, rec_yd: 68, rec_td: 0.5 }),
      candidate('wr2', 'WR', { rec_tgt: 6, rec: 4, rec_yd: 52, rec_td: 0.25 }, 9, { rec_tgt: 6, rec: 4, rec_yd: 52, rec_td: 0.25 }),
      ...Array.from({ length: 8 }, (_, index) => candidate(`fringe${index}`, 'WR', { rec_tgt: 1, rec: 0.6, rec_yd: 6, rec_td: 0.02 }, 1, { rec_tgt: 0.4, rec: 0.2, rec_yd: 3 }, 'Uncertain role')),
    ];
    const output = run(candidates);
    expect(output.find((entry) => entry.id === 'rb1')!.projection).toBeGreaterThan(11);
    expect(output.find((entry) => entry.id === 'wr1')!.projection).toBeGreaterThan(11);
    expect(output.find((entry) => entry.id === 'te1')!.projection).toBeGreaterThan(8);
  });

  it('keeps fringe players from siphoning material team opportunity', () => {
    const core = candidate('core', 'WR', { rec_tgt: 10, rec: 7, rec_yd: 90, rec_td: 0.5 }, 15, { rec_tgt: 10, rec: 7, rec_yd: 90, rec_td: 0.5 });
    const fringe = Array.from({ length: 12 }, (_, index) => candidate(`f${index}`, 'WR', { rec_tgt: 1, rec: 0.5, rec_yd: 5, rec_td: 0.01 }, 1, { rec_tgt: 0.2, rec: 0.1, rec_yd: 1 }, 'Uncertain role'));
    const output = run([core, ...fringe, candidate('qb', 'QB', { pass_att: 34, pass_cmp: 22, pass_yd: 240, pass_td: 1.5, pass_int: 0.7, rush_att: 3, rush_yd: 15, rush_td: 0.1 }, 18, { pass_att: 34, pass_cmp: 22, pass_yd: 240, pass_td: 1.5, pass_int: 0.7 })]);
    expect(output.find((entry) => entry.id === 'core')!.targetShare).toBeGreaterThan(0.25);
    expect(fringe.reduce((sum, entry) => sum + (output.find((player) => player.id === entry.id)!.targetShare || 0), 0)).toBeLessThan(0.18);
  });

  it('does not erase established production after a team change', () => {
    const moved = candidate('moved', 'WR', { rec_tgt: 8, rec: 5.5, rec_yd: 75, rec_td: 0.45 }, 13, { rec_tgt: 9, rec: 6, rec_yd: 82, rec_td: 0.5 });
    moved.player = { ...moved.player!, team: 'BUF' };
    moved.base = { ...moved.base, nflTeam: 'BUF' };
    moved.fantasyBaseline = buildFantasyBaseline({ games: moved.games, position: 'WR', scoring, currentTeam: 'BUF' }) || undefined;
    const quarterback = candidate('qb2', 'QB', { pass_att: 34, pass_cmp: 22, pass_yd: 240, pass_td: 1.5, pass_int: 0.7, rush_att: 3, rush_yd: 15, rush_td: 0.1 }, 18, { pass_att: 34, pass_cmp: 22, pass_yd: 240, pass_td: 1.5, pass_int: 0.7 });
    quarterback.player = { ...quarterback.player!, team: 'BUF' };
    quarterback.base = { ...quarterback.base, nflTeam: 'BUF' };
    const result = run([moved, quarterback]).find((entry) => entry.id === 'moved')!;
    expect(result.projection).toBeGreaterThan(9);
    expect(result.projectionTrace?.adjustments).toContain('team-change-continuity');
  });

  it('does not treat an offseason questionable label as a weekly inactive chance', () => {
    expect(normalizePreseasonActiveProbability({ weight: 0.82, tier: 'starter', status: 'Questionable' })).toBe(0.97);
    expect(normalizePreseasonActiveProbability({ weight: 0.02, tier: 'inactive', status: 'Out' })).toBe(0.02);
  });

  it('keeps unsigned players at zero', () => {
    expect(eligibleProjection(16, null, false)).toBe(0);
    expect(eligibleProjection(16, 'BUF', false)).toBe(16);
  });

  it('does not let an established fantasy baseline override an inactive designation', () => {
    const out = candidate('out-player', 'WR', { rec_tgt: 9, rec: 6, rec_yd: 80, rec_td: 0.4 }, 0.2, { rec_tgt: 9, rec: 6, rec_yd: 80, rec_td: 0.4 });
    out.base = { ...out.base, activeProbability: 0.01, availabilityWeight: 0.01, startProbability: 0.01, expectedRole: 'Not expected to be active' };
    const quarterback = candidate('active-qb', 'QB', { pass_att: 34, pass_cmp: 22, pass_yd: 240, pass_td: 1.5, pass_int: 0.7, rush_att: 3, rush_yd: 15, rush_td: 0.1 }, 18, { pass_att: 34, pass_cmp: 22, pass_yd: 240, pass_td: 1.5, pass_int: 0.7 });
    const result = run([out, quarterback]).find((entry) => entry.id === 'out-player')!;
    expect(result.projection).toBeLessThan(0.5);
  });

  it('does not change based on fantasy roster ownership or request ordering', () => {
    const core = candidate('same', 'WR', { rec_tgt: 9, rec: 6, rec_yd: 80, rec_td: 0.4 }, 13, { rec_tgt: 9, rec: 6, rec_yd: 80, rec_td: 0.4 });
    const quarterback = candidate('q', 'QB', { pass_att: 34, pass_cmp: 22, pass_yd: 240, pass_td: 1.5, pass_int: 0.7, rush_att: 3, rush_yd: 15, rush_td: 0.1 }, 18, { pass_att: 34, pass_cmp: 22, pass_yd: 240, pass_td: 1.5, pass_int: 0.7 });
    const first = run([core, quarterback]).find((entry) => entry.id === 'same')!.projection;
    const unrelated = candidate('other', 'WR', { rec_tgt: 10, rec: 7, rec_yd: 90, rec_td: 0.5 }, 15, { rec_tgt: 10, rec: 7, rec_yd: 90, rec_td: 0.5 });
    unrelated.player = { ...unrelated.player!, team: 'BUF' };
    unrelated.base = { ...unrelated.base, nflTeam: 'BUF' };
    const second = run([unrelated, quarterback, core]).find((entry) => entry.id === 'same')!.projection;
    expect(second).toBe(first);
  });
});
