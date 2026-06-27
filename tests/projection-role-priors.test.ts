import { describe, expect, it } from 'vitest';
import { buildUsageProfile, carryPrior, targetPrior } from '@/lib/fantasy/projection-usage';
import type { PlayerProjectionCandidate } from '@/lib/fantasy/projection-opportunity-types';
import type { WeeklyProjectedPlayer } from '@/lib/fantasy/lineup-types';
import type { SleeperPlayer } from '@/lib/utils/sleeper-api';

function projected(id: string, position: string, expectedRole: string, startProbability: number): WeeklyProjectedPlayer {
  return {
    id,
    name: `${id} Player`,
    position,
    nflTeam: 'ARI',
    opponent: null,
    projection: 8,
    baseline: 8,
    matchupFactor: 1,
    availabilityWeight: 0.92,
    isBye: false,
    confidence: 'low',
    rangeLow: 2,
    rangeHigh: 14,
    expectedRole,
    workload: 'uncertain',
    assumption: null,
    startProbability,
    activeProbability: 0.92,
    statLine: {},
  };
}

function candidate(args: {
  id: string;
  position: 'RB' | 'WR' | 'TE';
  expectedRole: string;
  startProbability: number;
  targets?: number;
  carries?: number;
  games?: number;
}): PlayerProjectionCandidate {
  const games = args.games ?? 0;
  const player: SleeperPlayer = {
    player_id: args.id,
    first_name: args.id,
    last_name: 'Player',
    position: args.position,
    team: 'ARI',
    status: 'Active',
    injury_status: '',
    years_exp: 2,
  } as SleeperPlayer;
  return {
    id: args.id,
    player,
    games: Array.from({ length: games }, (_, index) => ({
      season: 2025,
      week: index + 1,
      stats: {
        team: 'ARI',
        rec_tgt: args.targets || 0,
        rush_att: args.carries || 0,
      },
    })),
    base: projected(args.id, args.position, args.expectedRole, args.startProbability),
    projectionSeason: 2026,
  };
}

function targetWeight(entry: PlayerProjectionCandidate): number {
  const profile = buildUsageProfile(entry);
  return targetPrior(entry, profile);
}

describe('projection role priors', () => {
  it('does not rank an unconfirmed depth player above a confirmed secondary player', () => {
    const unknownReceiver = candidate({
      id: 'unknown-wr',
      position: 'WR',
      expectedRole: 'Uncertain role',
      startProbability: 0.52,
    });
    const confirmedSecondary = candidate({
      id: 'secondary-wr',
      position: 'WR',
      expectedRole: 'Slot / rotational receiver',
      startProbability: 0.42,
    });
    const unknownBack = candidate({
      id: 'unknown-rb',
      position: 'RB',
      expectedRole: 'Uncertain role',
      startProbability: 0.52,
    });
    const confirmedCommitteeBack = candidate({
      id: 'committee-rb',
      position: 'RB',
      expectedRole: 'Committee / secondary back',
      startProbability: 0.42,
    });

    expect(targetWeight(unknownReceiver)).toBeLessThan(targetWeight(confirmedSecondary));
    expect(carryPrior(unknownBack, buildUsageProfile(unknownBack))).toBeLessThan(
      carryPrior(confirmedCommitteeBack, buildUsageProfile(confirmedCommitteeBack)),
    );
  });

  it('prevents a large fringe group from siphoning a material share of team targets', () => {
    const core = [
      candidate({ id: 'wr1', position: 'WR', expectedRole: 'Expected starter', startProbability: 0.9, targets: 9, games: 6 }),
      candidate({ id: 'wr2', position: 'WR', expectedRole: 'Expected starter', startProbability: 0.9, targets: 7, games: 6 }),
      candidate({ id: 'wr3', position: 'WR', expectedRole: 'Expected starter', startProbability: 0.9, targets: 5, games: 6 }),
      candidate({ id: 'te1', position: 'TE', expectedRole: 'Expected starter', startProbability: 0.9, targets: 5, games: 6 }),
      candidate({ id: 'rb1', position: 'RB', expectedRole: 'Expected starter', startProbability: 0.9, targets: 4, carries: 12, games: 6 }),
    ];
    const fringe = Array.from({ length: 10 }, (_, index) => candidate({
      id: `fringe-${index}`,
      position: 'WR',
      expectedRole: 'Uncertain role',
      startProbability: 0.52,
    }));
    const coreWeight = core.reduce((sum, entry) => sum + targetWeight(entry), 0);
    const fringeWeight = fringe.reduce((sum, entry) => sum + targetWeight(entry), 0);

    expect(fringeWeight / (coreWeight + fringeWeight)).toBeLessThan(0.15);
  });
});
