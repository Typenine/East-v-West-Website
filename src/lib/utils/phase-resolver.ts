/**
 * Phase resolver utility for determining the current site phase
 * Uses America/Chicago timezone for all date comparisons
 */

import { IMPORTANT_DATES } from '../constants/league';

export type SitePhase = 
  | 'post_championship_pre_draft'
  | 'post_draft_pre_season'
  | 'regular_season'
  | 'playoffs';

/**
 * Convert a date to America/Chicago timezone for comparison
 */
function toChicagoTime(date: Date): Date {
  return new Date(date.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
}

/**
 * Get the current site phase based on important dates
 * All comparisons use America/Chicago timezone
 */
export function getCurrentPhase(): SitePhase {
  const now = toChicagoTime(new Date());
  
  // Convert all important dates to Chicago time for comparison
  const draftDate = toChicagoTime(IMPORTANT_DATES.NEXT_DRAFT);
  const seasonStart = toChicagoTime(IMPORTANT_DATES.NFL_WEEK_1_START);
  const playoffsStart = toChicagoTime(IMPORTANT_DATES.PLAYOFFS_START);
  
  // Determine phase based on date comparisons
  if (now >= playoffsStart) {
    return 'playoffs';
  } else if (now >= seasonStart) {
    return 'regular_season';
  } else if (now >= draftDate) {
    return 'post_draft_pre_season';
  } else {
    return 'post_championship_pre_draft';
  }
}

/**
 * Check if the regular season has started
 * Uses America/Chicago timezone
 */
export function hasRegularSeasonStarted(): boolean {
  const now = toChicagoTime(new Date());
  const seasonStart = toChicagoTime(IMPORTANT_DATES.NFL_WEEK_1_START);
  return now >= seasonStart;
}

/**
 * Check if playoffs have started
 * Uses America/Chicago timezone
 */
export function havePlayoffsStarted(): boolean {
  const now = toChicagoTime(new Date());
  const playoffsStart = toChicagoTime(IMPORTANT_DATES.PLAYOFFS_START);
  return now >= playoffsStart;
}

/**
 * Get the year for the season recap to display
 * Returns the current NFL season year during regular season/playoffs,
 * or the last completed season during offseason
 */
export function getRecapYear(nflSeasonYear?: number): number {
  const phase = getCurrentPhase();
  
  // If we have the NFL season year from Sleeper, use it during active season
  if (nflSeasonYear && (phase === 'regular_season' || phase === 'playoffs')) {
    return nflSeasonYear;
  }
  
  // During post-championship pre-draft, show last completed season
  if (phase === 'post_championship_pre_draft') {
    // Current calendar year is 2026, but last completed season is 2025
    const currentYear = new Date().getFullYear();
    return currentYear - 1;
  }
  
  // During post-draft pre-season, we could show current year or hide recap
  // For now, return current year but caller can choose to hide
  return new Date().getFullYear();
}

/**
 * Check if the season recap should be shown by default
 */
export function shouldShowRecapByDefault(): boolean {
  const phase = getCurrentPhase();
  
  // Show recap during post-championship (before draft) and during active season
  return phase === 'post_championship_pre_draft' || 
         phase === 'regular_season' || 
         phase === 'playoffs';
}
