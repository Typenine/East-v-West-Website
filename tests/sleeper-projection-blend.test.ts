import { describe, expect, it } from 'vitest';
import { blendSleeperProjection, normalizeSleeperProjection } from '@/lib/fantasy/sleeper-projections';

const halfPprScoring = {
  rec: 0.5,
  rec_yd: 0.1,
  rec_td: 6,
  rush_yd: 0.1,
  rush_td: 6,
  fum_lost: -2,
};

describe('Sleeper projection supplement', () => {
  it('normalizes a season projection to per-game East v. West scoring', () => {
    const projection = normalizeSleeperProjection({
      playerId: 'wr-season',
      position: 'WR',
      source: 'sleeper-season',
      scoring: halfPprScoring,
      payload: {
        stats: {
          gp: 17,
          rec: 68,
          rec_yd: 1020,
          rec_td: 8.5,
          pts_half_ppr: 187,
        },
      },
    });

    expect(projection).not.toBeNull();
    expect(projection?.games).toBe(17);
    expect(projection?.statLine.rec).toBe(4);
    expect(projection?.statLine.rec_yd).toBe(60);
    expect(projection?.points).toBe(11);
  });

  it('uses weekly projections without dividing the stat line', () => {
    const projection = normalizeSleeperProjection({
      playerId: 'wr-weekly',
      position: 'WR',
      source: 'sleeper-weekly',
      scoring: halfPprScoring,
      payload: {
        rec: 4.2,
        rec_yd: 58,
        rec_td: 0.3,
        pts_half_ppr: 9.7,
      },
    });

    expect(projection).not.toBeNull();
    expect(projection?.games).toBe(1);
    expect(projection?.points).toBe(9.7);
  });

  it('uses a consistent 95% preseason anchor to correct an implausible internal ordering', () => {
    const evans = blendSleeperProjection({
      internalPoints: 7.3,
      external: {
        playerId: 'evans',
        points: 9.7,
        statLine: {},
        source: 'sleeper-season',
        games: 17,
        directPoints: 9.7,
      },
      preseason: true,
      activeProbability: 0.98,
      roleTrend: 'expanded',
      manualOverride: false,
    });
    const washington = blendSleeperProjection({
      internalPoints: 11,
      external: {
        playerId: 'washington',
        points: 8.7,
        statLine: {},
        source: 'sleeper-season',
        games: 17,
        directPoints: 8.7,
      },
      preseason: true,
      activeProbability: 0.98,
      roleTrend: 'expanded',
      manualOverride: false,
    });

    expect(evans.weight).toBe(0.95);
    expect(washington.weight).toBe(0.95);
    expect(evans.points).toBeGreaterThan(washington.points);
  });

  it('falls back to the internal model when Sleeper has not published data', () => {
    const result = blendSleeperProjection({
      internalPoints: 8.4,
      external: undefined,
      preseason: true,
      activeProbability: 0.98,
      roleTrend: 'stable',
      manualOverride: false,
    });

    expect(result.points).toBe(8.4);
    expect(result.weight).toBe(0);
  });

  it('does not supersede a manual projection override', () => {
    const result = blendSleeperProjection({
      internalPoints: 8.4,
      external: {
        playerId: 'override',
        points: 15,
        statLine: {},
        source: 'sleeper-season',
        games: 17,
        directPoints: 15,
      },
      preseason: true,
      activeProbability: 0.98,
      roleTrend: 'stable',
      manualOverride: true,
    });

    expect(result.points).toBe(8.4);
    expect(result.weight).toBe(0);
  });
});
