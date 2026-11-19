import { describe, expect, it } from 'vitest';
import { buildWeeklyRecapManifest } from '../weekly-recap-export';
import { EXTERNAL_EPISODE_FORMATS } from '../external-generation-core';
import type { SleeperMatchup } from '@/lib/utils/sleeper-api';

const rosters = Array.from({ length: 12 }, (_, i) => ({ rosterId: i + 1, team: 'Team ' + (i + 1) }));
const completedLineups = rosters.map((roster, i) => ({
  ...roster, matchupId: Math.floor(i / 2) + 1, teamPoints: 115.5 + i,
}));
const upcoming = rosters.map((roster, i) => ({
  roster_id: roster.rosterId,
  matchup_id: Math.floor(i / 2) + 1,
  points: 0,
  players: [],
  starters: [],
  matchup_week: 13,
}) satisfies SleeperMatchup);

describe('combined Week 12 and trade deadline issue', () => {
  it('includes all six Week 12 pairings and six Week 13 preview pairings', () => {
    const manifest = buildWeeklyRecapManifest({
      completedWeek: 12, upcomingWeek: 13, rosters, completedLineups,
      upcomingSleeperMatchups: upcoming,
    });
    expect(manifest.validation.status).toBe('complete_pairings');
    expect(manifest.completedMatchups).toHaveLength(6);
    expect(manifest.upcomingMatchups).toHaveLength(6);
    expect(manifest.completedScoresAreFinal).toBe(false);
    expect(manifest.upcomingMatchups[0].teams.map(t => t.team)).toEqual(['Team 1', 'Team 2']);
  });

  it('flags an incomplete schedule rather than inventing missing matchups', () => {
    const manifest = buildWeeklyRecapManifest({
      completedWeek: 12, upcomingWeek: 13, rosters, completedLineups,
      upcomingSleeperMatchups: upcoming.slice(0, 10),
    });
    expect(manifest.validation.status).toBe('incomplete_pairings');
    expect(manifest.validation.upcomingPairings).toBe(5);
    expect(manifest.validation.warnings.join(' ')).toContain('Required six next-week matchup pairings');
  });

  it('preserves all weekly segments before deadline additions and one final word', () => {
    const format = EXTERNAL_EPISODE_FORMATS.trade_deadline;
    expect(format.sections).toHaveLength(13);
    expect(format.sections.slice(0, 8).map(s => s.split(':')[0])).toEqual([
      '1. Opening Exchange',
      '2. Transactions Since the Last Issue',
      '3. All Six Completed Week 12 Matchup Reviews',
      '4. Weekly Power Rankings',
      '5. League Pulse',
      '6. Stock Watch',
      '7. Clancy\'s Receipt Desk',
      '8. All Six Upcoming Week 13 Matchup Previews',
    ]);
    expect(format.sections.slice(8, 12).every(s => s.includes('Trade Deadline Dossier'))).toBe(true);
    expect(format.sections[12]).toContain('Final Word');
    expect(format.publicationTarget?.targetPages).toBe(50);
    expect(format.purpose).toContain('ONE combined');
  });
});
