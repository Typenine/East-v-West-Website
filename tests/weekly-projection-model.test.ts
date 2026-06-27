import { describe, expect, it } from 'vitest';
import { buildPlayerStatProjection, scoreProjectedStatLine } from '@/lib/fantasy/projection-model';

const scoring = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -2,
  rush_yd: 0.1,
  rush_td: 6,
  rec: 0.5,
  rec_yd: 0.1,
  rec_td: 6,
  fum_lost: -2,
};

const teamWeeks = Array.from({ length: 17 }, (_, index) => ({
  season: 2025,
  week: index + 1,
  team: 'GB',
  opponent: 'CHI',
  passAttempts: 33,
  rushAttempts: 26,
  passYards: 225,
  rushYards: 113,
  passTouchdowns: 1.5,
  rushTouchdowns: 0.9,
  interceptions: 0.8,
  sacksAllowed: 2.2,
}));

const quarterbackGames = [
  { season: 2024, week: 3, stats: { pass_att: 19, pass_cmp: 13, pass_yd: 202, pass_td: 1, pass_int: 0, rush_att: 6, rush_yd: 41, rush_td: 0 } },
  { season: 2024, week: 4, stats: { pass_att: 24, pass_cmp: 16, pass_yd: 209, pass_td: 1, pass_int: 0, rush_att: 5, rush_yd: 49, rush_td: 1 } },
  { season: 2024, week: 18, stats: { pass_att: 22, pass_cmp: 14, pass_yd: 136, pass_td: 0, pass_int: 1, rush_att: 4, rush_yd: 26, rush_td: 0 } },
];

describe('weekly stat-line projection model', () => {
  it('applies league scoring settings to a projected stat line', () => {
    expect(scoreProjectedStatLine({ pass_yd: 250, pass_td: 2, pass_int: 1, rush_yd: 20, rush_td: 1 }, scoring, 'QB')).toBe(24);
  });

  it('raises a rushing quarterback when he is expected to start without treating a few starts as his full baseline', () => {
    const starter = buildPlayerStatProjection({
      position: 'QB',
      games: quarterbackGames,
      availability: { tier: 'starter', weight: 1, reasons: ['espn-depth-1'] },
      currentTeam: 'GB',
      opponent: null,
      teamWeeks,
      opponentWeeks: [],
      currentSeasonGames: 0,
      projectionSeason: 2026,
      preseason: true,
      scoring,
      injuryStatus: null,
    });
    const backup = buildPlayerStatProjection({
      position: 'QB',
      games: quarterbackGames,
      availability: { tier: 'primary_backup', weight: 0.5, reasons: ['espn-depth-2'] },
      currentTeam: 'GB',
      opponent: null,
      teamWeeks,
      opponentWeeks: [],
      currentSeasonGames: 0,
      projectionSeason: 2026,
      preseason: true,
      scoring,
      injuryStatus: null,
    });
    expect(starter.points).toBeGreaterThan(backup.points + 5);
    expect(starter.statLine.rush_yd).toBeGreaterThan(15);
    expect(starter.points).toBeLessThan(20);
  });

  it('keeps preseason matchup adjustment neutral without same-season samples', () => {
    const result = buildPlayerStatProjection({
      position: 'RB',
      games: Array.from({ length: 8 }, (_, index) => ({
        season: 2025,
        week: index + 1,
        stats: { rush_att: 13, rush_yd: 55, rush_td: 0.25, rec_tgt: 3, rec: 2, rec_yd: 16, rec_td: 0.05 },
      })),
      availability: { tier: 'starter', weight: 1, reasons: ['espn-depth-1'] },
      currentTeam: 'KC',
      opponent: 'LV',
      teamWeeks,
      opponentWeeks: [],
      currentSeasonGames: 0,
      projectionSeason: 2026,
      preseason: true,
      scoring,
      injuryStatus: null,
    });
    expect(result.matchupFactor).toBe(1);
    expect(result.points).toBeGreaterThan(7);
  });
});
