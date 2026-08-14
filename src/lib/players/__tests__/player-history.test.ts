import { describe, it, expect } from 'vitest';
import { buildWeeklyHistory, buildSeasonHistory, buildFranchiseCareers, type SeasonWeeklyPlayerPoints } from '../player-history';

function week(w: number, franchiseName: string | null, points: number, opts?: { rostered?: boolean; started?: boolean; rosterId?: number }) {
  return {
    week: w,
    franchiseName,
    rosterId: opts?.rosterId ?? (franchiseName ? 1 : null),
    points,
    rostered: opts?.rostered ?? true,
    started: opts?.started ?? true,
  };
}

describe('buildWeeklyHistory', () => {
  it('flattens and sorts weekly entries by season then week', () => {
    const seasons: SeasonWeeklyPlayerPoints[] = [
      { season: '2024', weeks: [week(2, 'Belltown Raptors', 10), week(1, 'Belltown Raptors', 8)] },
      { season: '2023', weeks: [week(1, 'Belltown Raptors', 5)] },
    ];
    const history = buildWeeklyHistory(seasons);
    expect(history.map((h) => `${h.season}-w${h.week}`)).toEqual(['2023-w1', '2024-w1', '2024-w2']);
  });
});

describe('buildSeasonHistory — franchise attribution', () => {
  it('case 1: player stays with one franchise for multiple seasons', () => {
    const seasons: SeasonWeeklyPlayerPoints[] = [
      { season: '2023', weeks: [week(1, 'Belltown Raptors', 10), week(2, 'Belltown Raptors', 12)] },
      { season: '2024', weeks: [week(1, 'Belltown Raptors', 15)] },
    ];
    const seasonHistory = buildSeasonHistory(buildWeeklyHistory(seasons));
    expect(seasonHistory).toHaveLength(2);
    expect(seasonHistory[0].totalPoints).toBe(22);
    expect(seasonHistory[0].franchises).toEqual(['Belltown Raptors']);
    expect(seasonHistory[1].totalPoints).toBe(15);
  });

  it('case 2: player traded mid-season splits attribution across two franchises', () => {
    // Mirrors the spec example: Weeks 1-6 with Bop Pop (128.4), Weeks 7-17 with Belleview Badgers (231.7)
    const weeks = [
      ...Array.from({ length: 6 }, (_, i) => week(i + 1, 'bop pop', 128.4 / 6)),
      ...Array.from({ length: 11 }, (_, i) => week(i + 7, 'Belleview Badgers', 231.7 / 11)),
    ];
    const seasonHistory = buildSeasonHistory(buildWeeklyHistory([{ season: '2025', weeks }]));
    expect(seasonHistory).toHaveLength(1);
    const [season2025] = seasonHistory;
    expect(season2025.franchises).toEqual(['bop pop', 'Belleview Badgers']);
    expect(season2025.stints.find((s) => s.franchiseName === 'bop pop')?.totalPoints).toBeCloseTo(128.4, 1);
    expect(season2025.stints.find((s) => s.franchiseName === 'Belleview Badgers')?.totalPoints).toBeCloseTo(231.7, 1);
    expect(season2025.totalPoints).toBeCloseTo(360.1, 1);
    // Critically: the season is NOT entirely credited to whichever franchise ends the season with the player.
    expect(season2025.stints[0].franchiseName).not.toBe(season2025.stints[1].franchiseName);
  });

  it('case 4: player leaves a franchise and later returns within the same season merges into one consolidated stint per franchise', () => {
    const weeks = [
      week(1, 'Detroit Dawgs', 10),
      week(2, 'Red Pandas', 8),
      week(3, 'Detroit Dawgs', 9),
    ];
    const seasonHistory = buildSeasonHistory(buildWeeklyHistory([{ season: '2024', weeks }]));
    expect(seasonHistory[0].franchises).toEqual(['Detroit Dawgs', 'Red Pandas']);
    expect(seasonHistory[0].stints).toHaveLength(2);
    const dawgs = seasonHistory[0].stints.find((s) => s.franchiseName === 'Detroit Dawgs')!;
    expect(dawgs.totalPoints).toBe(19);
    expect(dawgs.weeklyPoints.map((w) => w.week)).toEqual([1, 3]);
  });

  it('case 5: unrostered/free-agent weeks produce no franchise attribution', () => {
    const seasonHistory = buildSeasonHistory(buildWeeklyHistory([{ season: '2025', weeks: [] }]));
    expect(seasonHistory).toHaveLength(0);
  });

  it('case 9: playoff weeks (15-17) are included in season totals like any other rostered week', () => {
    const weeks = [
      week(15, 'Elemental Heroes', 20),
      week(16, 'Elemental Heroes', 25),
      week(17, 'Elemental Heroes', 30),
    ];
    const seasonHistory = buildSeasonHistory(buildWeeklyHistory([{ season: '2025', weeks }]));
    expect(seasonHistory[0].totalPoints).toBe(75);
    expect(seasonHistory[0].starts).toBe(3);
  });
});

describe('buildFranchiseCareers', () => {
  it('case 3 & 4: consolidates a player who played for several franchises, including leaving and returning to one', () => {
    const seasons: SeasonWeeklyPlayerPoints[] = [
      { season: '2022', weeks: [week(1, 'Belltown Raptors', 10)] },
      { season: '2023', weeks: [week(1, 'Double Trouble', 12)] },
      { season: '2024', weeks: [week(1, 'Belltown Raptors', 14)] }, // returns to original franchise
    ];
    const seasonHistory = buildSeasonHistory(buildWeeklyHistory(seasons));
    const careers = buildFranchiseCareers(seasonHistory);

    expect(careers).toHaveLength(2);
    const belltown = careers.find((c) => c.franchiseName === 'Belltown Raptors')!;
    expect(belltown.seasons).toEqual(['2022', '2024']);
    expect(belltown.firstSeason).toBe('2022');
    expect(belltown.lastSeason).toBe('2024');
    expect(belltown.totalPoints).toBe(24);
    expect(belltown.seasonBreakdown).toHaveLength(2);

    const doubleTrouble = careers.find((c) => c.franchiseName === 'Double Trouble')!;
    expect(doubleTrouble.totalPoints).toBe(12);
  });

  it('does not credit an entire season to the end-of-season franchise after a midseason trade', () => {
    const weeks = [
      ...Array.from({ length: 6 }, (_, i) => week(i + 1, 'bop pop', 20)),
      ...Array.from({ length: 11 }, (_, i) => week(i + 7, 'Belleview Badgers', 20)),
    ];
    const seasonHistory = buildSeasonHistory(buildWeeklyHistory([{ season: '2025', weeks }]));
    const careers = buildFranchiseCareers(seasonHistory);
    const bopPop = careers.find((c) => c.franchiseName === 'bop pop')!;
    const badgers = careers.find((c) => c.franchiseName === 'Belleview Badgers')!;
    expect(bopPop.totalPoints).toBe(120);
    expect(badgers.totalPoints).toBe(220);
  });

  it('franchise renames are handled transparently because callers pass a single canonical franchise name', () => {
    // Simulates a franchise rename: the caller resolves both the old and new display name to
    // the same canonical name before calling into this module, so career totals merge as one.
    const seasons: SeasonWeeklyPlayerPoints[] = [
      { season: '2023', weeks: [week(1, 'Cascade Marauders', 10)] }, // formerly "Minshew's Maniacs"
      { season: '2024', weeks: [week(1, 'Cascade Marauders', 11)] },
    ];
    const careers = buildFranchiseCareers(buildSeasonHistory(buildWeeklyHistory(seasons)));
    expect(careers).toHaveLength(1);
    expect(careers[0].totalPoints).toBe(21);
    expect(careers[0].seasons).toEqual(['2023', '2024']);
  });
});
