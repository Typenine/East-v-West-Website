/**
 * Pure East v. West franchise-attribution logic for a single player.
 *
 * These functions take already-fetched weekly points (see PlayerProfileService for the
 * Sleeper fetching side) and turn them into season/franchise-career aggregates. Keeping
 * this logic pure (no network calls) makes it straightforward to unit test the tricky
 * cases: midseason trades, players who leave and return to a franchise, franchise
 * renames (collapsed upstream into one canonical name), etc.
 */

import type {
  PlayerFranchiseCareer,
  PlayerFranchiseSeasonStint,
  PlayerSeasonHistoryEntry,
  PlayerWeeklyHistoryEntry,
} from '@/lib/types/player';

export interface SeasonWeeklyPlayerPoints {
  season: string;
  weeks: Array<{
    week: number;
    franchiseName: string | null;
    rosterId: number | null;
    points: number;
    rostered: boolean;
    started: boolean;
  }>;
}

/** Flattens per-season weekly points into a single sorted weekly history list. */
export function buildWeeklyHistory(seasonsData: SeasonWeeklyPlayerPoints[]): PlayerWeeklyHistoryEntry[] {
  const out: PlayerWeeklyHistoryEntry[] = [];
  for (const s of seasonsData) {
    for (const w of s.weeks) {
      out.push({
        season: s.season,
        week: w.week,
        franchiseName: w.franchiseName,
        rosterId: w.rosterId,
        points: w.points,
        rostered: w.rostered,
        started: w.started,
      });
    }
  }
  out.sort((a, b) => (a.season === b.season ? a.week - b.week : a.season.localeCompare(b.season)));
  return out;
}

/**
 * Groups weekly history into per-season franchise stints. A player traded mid-season gets
 * one stint per franchise they were attributed points for that season — the whole season is
 * never credited to whichever franchise happens to own the player at season's end.
 */
export function buildSeasonHistory(weeklyHistory: PlayerWeeklyHistoryEntry[]): PlayerSeasonHistoryEntry[] {
  const bySeason = new Map<string, PlayerWeeklyHistoryEntry[]>();
  for (const w of weeklyHistory) {
    const arr = bySeason.get(w.season) || [];
    arr.push(w);
    bySeason.set(w.season, arr);
  }

  const seasons = Array.from(bySeason.keys()).sort((a, b) => a.localeCompare(b));
  return seasons.map((season) => {
    const weeks = [...bySeason.get(season)!].sort((a, b) => a.week - b.week);
    const stintsByFranchise = new Map<string, PlayerFranchiseSeasonStint>();
    const franchiseOrder: string[] = [];

    for (const w of weeks) {
      const key = w.franchiseName ?? 'Unknown';
      let stint = stintsByFranchise.get(key);
      if (!stint) {
        stint = { season, franchiseName: key, totalPoints: 0, rosteredWeeks: 0, starts: 0, weeklyPoints: [] };
        stintsByFranchise.set(key, stint);
        franchiseOrder.push(key);
      }
      stint.weeklyPoints.push(w);
      stint.totalPoints = Number((stint.totalPoints + w.points).toFixed(2));
      if (w.rostered) stint.rosteredWeeks += 1;
      if (w.started) stint.starts += 1;
    }

    const stints = franchiseOrder.map((k) => stintsByFranchise.get(k)!);
    const totalPoints = Number(stints.reduce((sum, s) => sum + s.totalPoints, 0).toFixed(2));
    const rosteredWeeks = stints.reduce((sum, s) => sum + s.rosteredWeeks, 0);
    const starts = stints.reduce((sum, s) => sum + s.starts, 0);

    return { season, franchises: franchiseOrder, stints, totalPoints, rosteredWeeks, starts };
  });
}

/**
 * Consolidates franchise season stints into one career record per canonical franchise. If a
 * player leaves and later returns to the same franchise (even non-contiguously), the totals
 * merge into a single record with every season's stint preserved underneath it.
 */
export function buildFranchiseCareers(seasonHistory: PlayerSeasonHistoryEntry[]): PlayerFranchiseCareer[] {
  const byFranchise = new Map<string, PlayerFranchiseCareer>();
  const order: string[] = [];

  for (const s of seasonHistory) {
    for (const stint of s.stints) {
      const name = stint.franchiseName;
      let career = byFranchise.get(name);
      if (!career) {
        career = {
          franchiseName: name,
          seasons: [],
          firstSeason: s.season,
          lastSeason: s.season,
          totalPoints: 0,
          rosteredWeeks: 0,
          starts: 0,
          seasonBreakdown: [],
        };
        byFranchise.set(name, career);
        order.push(name);
      }
      if (!career.seasons.includes(s.season)) career.seasons.push(s.season);
      if (s.season.localeCompare(career.firstSeason) < 0) career.firstSeason = s.season;
      if (s.season.localeCompare(career.lastSeason) > 0) career.lastSeason = s.season;
      career.totalPoints = Number((career.totalPoints + stint.totalPoints).toFixed(2));
      career.rosteredWeeks += stint.rosteredWeeks;
      career.starts += stint.starts;
      career.seasonBreakdown.push(stint);
    }
  }

  for (const name of order) {
    byFranchise.get(name)!.seasons.sort((a, b) => a.localeCompare(b));
  }

  return order.map((name) => byFranchise.get(name)!);
}
