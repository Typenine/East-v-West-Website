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
 * Get current time in America/Chicago timezone as timestamp
 */
function getNowInChicago(): number {
  // Get current time and format it in Chicago timezone
  const nowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
  return new Date(nowStr).getTime();
}

/**
 * Get the current site phase based on important dates
 * All comparisons use America/Chicago timezone
 */
export function getCurrentPhase(): SitePhase {
  const now = getNowInChicago();
  
  // Important dates are already in their respective timezones, just get timestamps
  const draftDate = IMPORTANT_DATES.NEXT_DRAFT.getTime();
  const seasonStart = IMPORTANT_DATES.NFL_WEEK_1_START.getTime();
  const playoffsStart = IMPORTANT_DATES.PLAYOFFS_START.getTime();
  
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
  const now = getNowInChicago();
  const seasonStart = IMPORTANT_DATES.NFL_WEEK_1_START.getTime();
  return now >= seasonStart;
}

/**
 * Check if playoffs have started
 * Uses America/Chicago timezone
 */
export function havePlayoffsStarted(): boolean {
  const now = getNowInChicago();
  const playoffsStart = IMPORTANT_DATES.PLAYOFFS_START.getTime();
  return now >= playoffsStart;
}

/**
 * Get the year for the season recap to display
 * Returns the current NFL season year during regular season/playoffs,
 * or the last completed season during offseason
 */
export function getRecapYear(nflSeasonYear?: number): number {
  const phase = getCurrentPhase();
  
  // During active season (regular season or playoffs), use NFL season year from Sleeper
  if (phase === 'regular_season' || phase === 'playoffs') {
    return nflSeasonYear || new Date().getFullYear();
  }
  
  // During post-championship pre-draft, always show last completed season
  // This is the period after Super Bowl but before the draft
  if (phase === 'post_championship_pre_draft') {
    // The last completed season is always the previous calendar year
    // (e.g., in Feb 2026, show 2025 season recap)
    const currentYear = new Date().getFullYear();
    return currentYear - 1;
  }
  
  // During post-draft pre-season, show the upcoming season year
  // but this recap should be hidden by default (handled by caller)
  if (phase === 'post_draft_pre_season') {
    return new Date().getFullYear();
  }
  
  // Fallback
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
