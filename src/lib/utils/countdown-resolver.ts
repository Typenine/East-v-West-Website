/**
 * Six-stage countdown resolver for the East v. West homepage.
 *
 * Always returns exactly two CountdownCard objects representing the two most
 * relevant upcoming events for the current moment in the league calendar.
 *
 * Stage precedence (checked from latest to earliest to avoid overlap):
 *   0. New league year has passed  → roll forward to next cycle (Stage 1 of new year)
 *   6. Postseason has started       → Stage 6
 *   5. Trade deadline passed        → Stage 5
 *   4. Regular season started       → Stage 4
 *   3. FA bidding opened            → Stage 3
 *   2. Rookie draft occurred        → Stage 2
 *   1. Otherwise                    → Stage 1  (post-championship, pre-draft offseason)
 *
 * Annual cycle: after NEW_LEAGUE_YEAR fires every countdown target from the
 * current year is in the past. The resolver resets to Stage 1 of the next
 * calendar year using NEXT_LEAGUE_YEAR_DRAFT and NEXT_LEAGUE_YEAR_SEASON_START.
 * Update those constants in league.ts each year once the new draft date is set.
 */

import { IMPORTANT_DATES } from '@/lib/constants/league';

export type CountdownCard = {
  title: string;
  targetDate: Date;
};

/**
 * Homepage phase — drives which content sections are shown.
 *
 * Matches the six countdown stages:
 *   1  post_championship_pre_draft   – offseason recap is primary
 *   2  post_draft_pre_fa             – roster consequences of draft
 *   3  fa_open_pre_season            – free agency active
 *   4  regular_season                – live matchups, through trade deadline
 *   5  post_deadline_pre_postseason  – playoff race
 *   6  postseason                    – playoff center
 */
export type HomepagePhase =
  | 'post_championship_pre_draft'
  | 'post_draft_pre_fa'
  | 'fa_open_pre_season'
  | 'regular_season'
  | 'post_deadline_pre_postseason'
  | 'postseason';

export function getHomepagePhase(now: Date = new Date()): HomepagePhase {
  const ts = now.getTime();

  // After new league year: reset to next cycle.
  if (ts >= IMPORTANT_DATES.NEW_LEAGUE_YEAR.getTime()) {
    if (ts >= IMPORTANT_DATES.NEXT_LEAGUE_YEAR_DRAFT.getTime()) {
      // After next year's draft we don't yet have FA/season dates; show post_draft phase.
      return 'post_draft_pre_fa';
    }
    return 'post_championship_pre_draft';
  }

  if (ts >= IMPORTANT_DATES.PLAYOFFS_START.getTime()) return 'postseason';
  if (ts >= IMPORTANT_DATES.TRADE_DEADLINE.getTime()) return 'post_deadline_pre_postseason';
  if (ts >= IMPORTANT_DATES.NFL_WEEK_1_START.getTime()) return 'regular_season';
  if (ts >= IMPORTANT_DATES.FA_BIDDING_START.getTime()) return 'fa_open_pre_season';
  if (ts >= IMPORTANT_DATES.NEXT_DRAFT.getTime()) return 'post_draft_pre_fa';
  return 'post_championship_pre_draft';
}

/** The two-card pair for the current date. */
export function getCountdownCards(now: Date = new Date()): [CountdownCard, CountdownCard] {
  const ts = now.getTime();

  const newYearTs    = IMPORTANT_DATES.NEW_LEAGUE_YEAR.getTime();
  const postseasonTs = IMPORTANT_DATES.PLAYOFFS_START.getTime();
  const deadlineTs   = IMPORTANT_DATES.TRADE_DEADLINE.getTime();
  const week1Ts      = IMPORTANT_DATES.NFL_WEEK_1_START.getTime();
  const faBiddingTs  = IMPORTANT_DATES.FA_BIDDING_START.getTime();
  const draftTs      = IMPORTANT_DATES.NEXT_DRAFT.getTime();

  // Stage 0: new league year has fired — current-cycle dates are all in the past.
  // Reset to next-year draft + next-year season start so no expired target is shown.
  if (ts >= newYearTs) {
    return [
      { title: 'Draft in',          targetDate: IMPORTANT_DATES.NEXT_LEAGUE_YEAR_DRAFT },
      { title: 'Season starts in',  targetDate: IMPORTANT_DATES.NEXT_LEAGUE_YEAR_SEASON_START },
    ];
  }

  // Stage 6: postseason has started — count down to new league year + next draft
  if (ts >= postseasonTs) {
    return [
      { title: 'New league year in', targetDate: IMPORTANT_DATES.NEW_LEAGUE_YEAR },
      { title: 'Next draft in',      targetDate: IMPORTANT_DATES.NEXT_LEAGUE_YEAR_DRAFT },
    ];
  }

  // Stage 5: trade deadline passed — count down to postseason + new league year
  if (ts >= deadlineTs) {
    return [
      { title: 'Postseason starts in', targetDate: IMPORTANT_DATES.PLAYOFFS_START },
      { title: 'New league year in',   targetDate: IMPORTANT_DATES.NEW_LEAGUE_YEAR },
    ];
  }

  // Stage 4: regular season started — count down to trade deadline + postseason
  if (ts >= week1Ts) {
    return [
      { title: 'Trade deadline in',    targetDate: IMPORTANT_DATES.TRADE_DEADLINE },
      { title: 'Postseason starts in', targetDate: IMPORTANT_DATES.PLAYOFFS_START },
    ];
  }

  // Stage 3: FA bidding opened — count down to regular season + trade deadline
  if (ts >= faBiddingTs) {
    return [
      { title: 'Season starts in',  targetDate: IMPORTANT_DATES.NFL_WEEK_1_START },
      { title: 'Trade deadline in', targetDate: IMPORTANT_DATES.TRADE_DEADLINE },
    ];
  }

  // Stage 2: rookie draft occurred — count down to FA bidding + regular season
  if (ts >= draftTs) {
    return [
      { title: 'FA bidding opens in', targetDate: IMPORTANT_DATES.FA_BIDDING_START },
      { title: 'Season starts in',    targetDate: IMPORTANT_DATES.NFL_WEEK_1_START },
    ];
  }

  // Stage 1: default offseason (post-championship, pre-draft)
  return [
    { title: 'Draft in',         targetDate: IMPORTANT_DATES.NEXT_DRAFT },
    { title: 'Season starts in', targetDate: IMPORTANT_DATES.NFL_WEEK_1_START },
  ];
}
