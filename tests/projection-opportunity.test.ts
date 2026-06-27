import { describe, expect, it } from 'vitest';
import {
  projectTeamOpportunityPlan,
  reconcileTeamOpportunityBudgets,
  type PlayerProjectionCandidate,
} from '@/lib/fantasy/projection-opportunity';
import type { NflverseTeamWeek } from '@/lib/fantasy/nflverse-team-stats';
import type { WeeklyProjectedPlayer } from '@/lib/fantasy/lineup-types';
import type { SleeperPlayer } from '@/lib/utils/sleeper-api';

const scoring = { pass_yd: 0.04, pass_td: 4, pass_int: -2, rush_yd: 0.1, rush_td: 6, rec: 0.5, rec_yd: 0.1, rec_td: 6 };

const teamRows: NflverseTeamWeek[] = Array.from({ length: 8 }, (_, index) => ({
  season: 2026,
  week: index + 1,
  team: 'ARI',
  opponent: 'SEA',
  passAttempts: 35,
  rushAttempts: 26,
  passYards: 240,
  rushYards: 110,
  passTouchdowns: 1.6,
  rushTouchdowns: 0.8,
  interceptions: 0.7,
  sacksAllowed: 2.1,
  passEpaPerPlay: 0.05,
  rushEpaPerPlay: -0.01,
}));

function player(id: string, position: string, overrides: Partial<SleeperPlayer & { draft_round?: number }> = {}): SleeperPlayer {
  return {
    player_id: id,
    first_name: id,
    last_name: 'Player',
    position,
    team: 'ARI',
    status: 'Active',
    injury_status: '',
    years_exp: 2,
    ...overrides,
  } as SleeperPlayer;
}

function projected(id: string, position: string, args: Partial<WeeklyProjectedPlayer> = {}): WeeklyProjectedPlayer {
  const statLine = position === 'QB'
    ? { pass_att: 30, pass_cmp: 19, pass_yd: 210, pass_td: 1.3, pass_int: 0.7, rush_att: 3, rush_yd: 14, rush_td: 0.1 }
    : { rec_tgt: position === 'WR' ? 6 : 3, rec: position === 'WR' ? 4 : 2, rec_yd: position === 'WR' ? 52 : 18, rec_td: 0.25, rush_att: position === 'RB' ? 10 : 0.2, rush_yd: position === 'RB' ? 43 : 1, rush_td: position === 'RB' ? 0.25 : 0 };
  return {
    id,
    name: `${id} Player`,
    position,
    nflTeam: 'ARI',
    opponent: 'SEA',
    projection: 10,
    baseline: 10,
    matchupFactor: 1,
    availabilityWeight: 0.98,
    isBye: false,
    confidence: 'medium',
    rangeLow: 4,
    rangeHigh: 16,
    expectedRole: 'Expected starter',
    workload: 'base',
    assumption: null,
    startProbability: 0.9,
    activeProbability: 0.98,
    statLine,
    ...args,
  };
}

function candidate(id: string, position: string, targets: number, carries: number, args: Partial<PlayerProjectionCandidate> = {}): PlayerProjectionCandidate {
  return {
    id,
    player: player(id, position),
    games: Array.from({ length: 6 }, (_, index) => ({
      season: 2025,
      week: index + 1,
      stats: { team: 'ARI', rec_tgt: targets, rush_att: carries, pass_att: position === 'QB' ? 31 : 0 },
    })),
    base: projected(id, position),
    ...args,
  };
}

describe('team opportunity reconciliation', () => {
  it('forces player opportunities to add up to one team budget', () => {
    const candidates = [
      candidate('qb1', 'QB', 0, 4),
      candidate('qb2', 'QB', 0, 1, { base: projected('qb2', 'QB', { startProbability: 0.08 }) }),
      candidate('rb1', 'RB', 4, 14),
      candidate('rb2', 'RB', 2, 7, { base: projected('rb2', 'RB', { startProbability: 0.48 }) }),
      candidate('wr1', 'WR', 9, 0),
      candidate('wr2', 'WR', 7, 0),
      candidate('wr3', 'WR', 5, 0),
      candidate('te1', 'TE', 5, 0),
    ];
    const result = reconcileTeamOpportunityBudgets({
      candidates,
      currentRowsByTeam: new Map([['ARI', teamRows]]),
      previousRowsByTeam: new Map(),
      preseason: false,
      scoring,
      teamOverrides: new Map(),
    });
    const plan = result.plans.ARI;
    const passAttempts = result.players.filter((p) => p.position === 'QB').reduce((sum, p) => sum + (p.statLine.pass_att || 0), 0);
    const targets = result.players.filter((p) => ['RB', 'WR', 'TE'].includes(p.position)).reduce((sum, p) => sum + (p.statLine.rec_tgt || 0), 0);
    const carries = result.players.filter((p) => ['QB', 'RB', 'WR'].includes(p.position)).reduce((sum, p) => sum + (p.statLine.rush_att || 0), 0);
    expect(passAttempts).toBeCloseTo(plan.passAttempts, 2);
    expect(targets).toBeCloseTo(plan.targetPool, 2);
    expect(carries).toBeCloseTo(plan.rushAttempts, 2);
    const qb2 = result.players.find((entry) => entry.id === 'qb2')!;
    expect(qb2.statLine.pass_att).toBeLessThan(plan.passAttempts * 0.08);
  });

  it('redistributes an unavailable receiver’s targets to active teammates', () => {
    const healthy = [candidate('wr1', 'WR', 10, 0), candidate('wr2', 'WR', 6, 0), candidate('te1', 'TE', 4, 0), candidate('qb1', 'QB', 0, 3)];
    const injured = healthy.map((entry) => entry.id === 'wr1'
      ? { ...entry, base: projected('wr1', 'WR', { activeProbability: 0.01, availabilityWeight: 0.01 }) }
      : entry);
    const run = (candidates: PlayerProjectionCandidate[]) => reconcileTeamOpportunityBudgets({
      candidates,
      currentRowsByTeam: new Map([['ARI', teamRows]]),
      previousRowsByTeam: new Map(),
      preseason: false,
      scoring,
      teamOverrides: new Map(),
    }).players;
    const healthyWr2 = run(healthy).find((entry) => entry.id === 'wr2')!;
    const injuredWr2 = run(injured).find((entry) => entry.id === 'wr2')!;
    expect(injuredWr2.targetShare).toBeGreaterThan(healthyWr2.targetShare || 0);
    expect(injuredWr2.statLine.rec_tgt).toBeGreaterThan(healthyWr2.statLine.rec_tgt || 0);
  });

  it('discounts old-team volume after a player changes teams', () => {
    const moved = candidate('moved', 'WR', 10, 0, {
      player: player('moved', 'WR', { team: 'ARI' }),
      games: Array.from({ length: 6 }, (_, index) => ({ season: 2025, week: index + 1, stats: { team: 'BUF', rec_tgt: 10 } })),
    });
    const incumbent = candidate('incumbent', 'WR', 6, 0);
    const result = reconcileTeamOpportunityBudgets({
      candidates: [moved, incumbent, candidate('qb1', 'QB', 0, 3)],
      currentRowsByTeam: new Map([['ARI', teamRows]]),
      previousRowsByTeam: new Map(),
      preseason: false,
      scoring,
      teamOverrides: new Map(),
    }).players;
    expect(result.find((entry) => entry.id === 'moved')!.targetShare).toBeLessThan(0.65);
    expect(result.find((entry) => entry.id === 'incumbent')!.targetShare).toBeGreaterThan(0.25);
  });

  it('uses draft capital to separate rookies without NFL samples', () => {
    const early = candidate('early', 'WR', 0, 0, {
      player: player('early', 'WR', { years_exp: 0, rookie_year: 2026, draft_round: 1 } as Partial<SleeperPlayer & { draft_round?: number }>),
      games: [],
      projectionSeason: 2026,
    });
    const late = candidate('late', 'WR', 0, 0, {
      player: player('late', 'WR', { years_exp: 0, rookie_year: 2026, draft_round: 6 } as Partial<SleeperPlayer & { draft_round?: number }>),
      games: [],
      projectionSeason: 2026,
    });
    const result = reconcileTeamOpportunityBudgets({
      candidates: [early, late, candidate('qb1', 'QB', 0, 3)],
      currentRowsByTeam: new Map(),
      previousRowsByTeam: new Map([['ARI', teamRows]]),
      preseason: true,
      scoring,
      teamOverrides: new Map(),
    }).players;
    expect(result.find((entry) => entry.id === 'early')!.targetShare).toBeGreaterThan(result.find((entry) => entry.id === 'late')!.targetShare || 0);
  });

  it('shrinks preseason team volume toward league average', () => {
    const extreme = teamRows.map((row) => ({ ...row, passAttempts: 45, rushAttempts: 18 }));
    const plan = projectTeamOpportunityPlan({
      team: 'ARI',
      currentRows: [],
      previousRows: extreme,
      candidates: [candidate('qb1', 'QB', 0, 3)],
      preseason: true,
    });
    expect(plan.passAttempts).toBeLessThan(45);
    expect(plan.rushAttempts).toBeGreaterThan(18);
    expect(plan.source).toBe('preseason-prior');
  });
});
