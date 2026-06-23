/**
 * Boundary tests for the six-stage countdown resolver.
 * Run: npx vitest run src/lib/utils/__tests__/countdown-resolver.test.ts
 *
 * Key invariant: every returned countdown target must be strictly later
 * than the `now` date supplied to getCountdownCards().
 */

import { describe, it, expect } from 'vitest';
import { getCountdownCards, getHomepagePhase } from '../countdown-resolver';
import { IMPORTANT_DATES } from '@/lib/constants/league';

// Convenience: offset a date by N milliseconds
const offset = (base: Date, ms: number) => new Date(base.getTime() + ms);

const DRAFT       = IMPORTANT_DATES.NEXT_DRAFT;
const FA          = IMPORTANT_DATES.FA_BIDDING_START;
const WEEK1       = IMPORTANT_DATES.NFL_WEEK_1_START;
const DEADLINE    = IMPORTANT_DATES.TRADE_DEADLINE;
const PLAYOFFS    = IMPORTANT_DATES.PLAYOFFS_START;
const NEW_YEAR    = IMPORTANT_DATES.NEW_LEAGUE_YEAR;
const NEXT_DRAFT  = IMPORTANT_DATES.NEXT_LEAGUE_YEAR_DRAFT;
const NEXT_SEASON = IMPORTANT_DATES.NEXT_LEAGUE_YEAR_SEASON_START;

// ── Core invariant: every target must be in the future relative to `now` ──────

function assertNoExpiredTargets(now: Date) {
  const [c1, c2] = getCountdownCards(now);
  expect(c1.targetDate.getTime()).toBeGreaterThan(now.getTime());
  expect(c2.targetDate.getTime()).toBeGreaterThan(now.getTime());
}

describe('getCountdownCards – always returns exactly two cards', () => {
  it('returns exactly two cards for any arbitrary date', () => {
    const cards = getCountdownCards(new Date('2026-01-01'));
    expect(cards).toHaveLength(2);
    expect(cards[0].title).toBeTruthy();
    expect(cards[0].targetDate).toBeInstanceOf(Date);
    expect(cards[1].title).toBeTruthy();
    expect(cards[1].targetDate).toBeInstanceOf(Date);
  });
});

// ── Stage 1: post-championship, pre-draft ─────────────────────────────────────
describe('Stage 1 – post-championship pre-draft', () => {
  it('shows draft + season before the draft', () => {
    const now = offset(DRAFT, -1000); // 1 second before draft
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(DRAFT);
    expect(c2.targetDate).toEqual(WEEK1);
  });

  it('shows draft + season well into the offseason', () => {
    const now = new Date('2026-03-01T12:00:00Z');
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(DRAFT);
    expect(c2.targetDate).toEqual(WEEK1);
  });

  it('targets are in the future during Stage 1', () => {
    assertNoExpiredTargets(offset(DRAFT, -1000));
    assertNoExpiredTargets(new Date('2026-03-01T12:00:00Z'));
  });
});

// ── Stage 2: post-draft, pre-FA bidding ───────────────────────────────────────
describe('Stage 2 – post-draft, pre-FA bidding', () => {
  it('shows FA bidding + season immediately after draft', () => {
    const now = offset(DRAFT, 1000); // 1 second after draft
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(FA);
    expect(c2.targetDate).toEqual(WEEK1);
  });

  it('shows FA bidding + season 1 second before FA bidding starts', () => {
    const now = offset(FA, -1000);
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(FA);
    expect(c2.targetDate).toEqual(WEEK1);
  });

  it('uses the word "FA bidding" in the card title', () => {
    const [c1] = getCountdownCards(offset(DRAFT, 1000));
    expect(c1.title.toLowerCase()).toContain('fa');
  });

  it('targets are in the future during Stage 2', () => {
    assertNoExpiredTargets(offset(DRAFT, 1000));
    assertNoExpiredTargets(offset(FA, -1000));
  });
});

// ── Stage 3: FA bidding open, pre-season ──────────────────────────────────────
describe('Stage 3 – FA bidding open, pre-season', () => {
  it('shows season + trade deadline immediately after FA bidding opens', () => {
    const now = offset(FA, 1000);
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(WEEK1);
    expect(c2.targetDate).toEqual(DEADLINE);
  });

  it('shows season + trade deadline 1 second before season starts', () => {
    const now = offset(WEEK1, -1000);
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(WEEK1);
    expect(c2.targetDate).toEqual(DEADLINE);
  });

  it('targets are in the future during Stage 3', () => {
    assertNoExpiredTargets(offset(FA, 1000));
  });
});

// ── Stage 4: regular season active ───────────────────────────────────────────
describe('Stage 4 – regular season through trade deadline', () => {
  it('shows trade deadline + postseason immediately after Week 1 kickoff', () => {
    const now = offset(WEEK1, 1000);
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(DEADLINE);
    expect(c2.targetDate).toEqual(PLAYOFFS);
  });

  it('shows trade deadline + postseason 1 second before trade deadline', () => {
    const now = offset(DEADLINE, -1000);
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(DEADLINE);
    expect(c2.targetDate).toEqual(PLAYOFFS);
  });

  it('targets are in the future during Stage 4', () => {
    assertNoExpiredTargets(offset(WEEK1, 1000));
    assertNoExpiredTargets(offset(DEADLINE, -1000));
  });
});

// ── Stage 5: post-deadline, pre-postseason ────────────────────────────────────
describe('Stage 5 – trade deadline through postseason start', () => {
  it('shows postseason + new league year immediately after trade deadline', () => {
    const now = offset(DEADLINE, 1000);
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(PLAYOFFS);
    expect(c2.targetDate).toEqual(NEW_YEAR);
  });

  it('shows postseason + new league year 1 second before postseason starts', () => {
    const now = offset(PLAYOFFS, -1000);
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(PLAYOFFS);
    expect(c2.targetDate).toEqual(NEW_YEAR);
  });

  it('targets are in the future during Stage 5', () => {
    assertNoExpiredTargets(offset(DEADLINE, 1000));
  });
});

// ── Stage 6: postseason active ────────────────────────────────────────────────
describe('Stage 6 – postseason through new league year', () => {
  it('shows new league year + next draft immediately after postseason starts', () => {
    const now = offset(PLAYOFFS, 1000);
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(NEW_YEAR);
    expect(c2.targetDate).toEqual(NEXT_DRAFT);
  });

  it('shows new league year + next draft during the championship week', () => {
    const now = offset(PLAYOFFS, 7 * 24 * 60 * 60 * 1000); // ~1 week in
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(NEW_YEAR);
    expect(c2.targetDate).toEqual(NEXT_DRAFT);
  });

  it('shows new league year + next draft 1 second before new league year', () => {
    const now = offset(NEW_YEAR, -1000);
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(NEW_YEAR);
    expect(c2.targetDate).toEqual(NEXT_DRAFT);
  });

  it('targets are in the future during Stage 6', () => {
    assertNoExpiredTargets(offset(PLAYOFFS, 1000));
    assertNoExpiredTargets(offset(NEW_YEAR, -1000));
  });
});

// ── Annual cycle rollover: after NEW_LEAGUE_YEAR (Feb 2027) ──────────────────
describe('Annual cycle rollover – after new league year', () => {
  it('shows next-year draft + next-year season 1 second after new league year', () => {
    const now = offset(NEW_YEAR, 1000);
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(NEXT_DRAFT);
    expect(c2.targetDate).toEqual(NEXT_SEASON);
  });

  it('shows next-year draft + next-year season in March 2027', () => {
    const now = new Date('2027-03-15T12:00:00Z');
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(NEXT_DRAFT);
    expect(c2.targetDate).toEqual(NEXT_SEASON);
  });

  it('shows next-year draft + next-year season 1 second before July 10 2027 draft', () => {
    const now = offset(NEXT_DRAFT, -1000);
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate).toEqual(NEXT_DRAFT);
    expect(c2.targetDate).toEqual(NEXT_SEASON);
  });

  it('shows next-year season after July 10 2027 draft has occurred', () => {
    const now = offset(NEXT_DRAFT, 1000);
    // At this point we're in 2027 post-draft phase; resolver falls back to post_draft_pre_fa
    // Both targets should still be in the future
    const [c1, c2] = getCountdownCards(now);
    expect(c1.targetDate.getTime()).toBeGreaterThan(now.getTime());
    expect(c2.targetDate.getTime()).toBeGreaterThan(now.getTime());
  });

  it('no expired targets at any rollover boundary', () => {
    assertNoExpiredTargets(offset(NEW_YEAR, 1));
    assertNoExpiredTargets(new Date('2027-03-15T12:00:00Z'));
    assertNoExpiredTargets(offset(NEXT_DRAFT, -1000));
    assertNoExpiredTargets(offset(NEXT_DRAFT, 1000));
  });

  it('current-year dates are never shown after new league year', () => {
    const now = offset(NEW_YEAR, 1000);
    const [c1, c2] = getCountdownCards(now);
    // DRAFT (July 2026) and WEEK1 (Sept 2026) must not appear
    expect(c1.targetDate).not.toEqual(DRAFT);
    expect(c1.targetDate).not.toEqual(WEEK1);
    expect(c2.targetDate).not.toEqual(DRAFT);
    expect(c2.targetDate).not.toEqual(WEEK1);
  });
});

// ── Exact boundary timestamps ─────────────────────────────────────────────────
describe('exact event timestamps', () => {
  it('at exactly DRAFT time → Stage 2', () => {
    const [c1] = getCountdownCards(DRAFT);
    expect(c1.targetDate).toEqual(FA);
  });

  it('at exactly FA time → Stage 3', () => {
    const [c1] = getCountdownCards(FA);
    expect(c1.targetDate).toEqual(WEEK1);
  });

  it('at exactly WEEK1 time → Stage 4', () => {
    const [c1] = getCountdownCards(WEEK1);
    expect(c1.targetDate).toEqual(DEADLINE);
  });

  it('at exactly DEADLINE time → Stage 5', () => {
    const [c1] = getCountdownCards(DEADLINE);
    expect(c1.targetDate).toEqual(PLAYOFFS);
  });

  it('at exactly PLAYOFFS time → Stage 6', () => {
    const [c1] = getCountdownCards(PLAYOFFS);
    expect(c1.targetDate).toEqual(NEW_YEAR);
  });

  it('at exactly NEW_YEAR time → next-cycle Stage 1', () => {
    const [c1] = getCountdownCards(NEW_YEAR);
    expect(c1.targetDate).toEqual(NEXT_DRAFT);
  });
});

// ── Never shows expired events ────────────────────────────────────────────────
describe('expired events are never displayed', () => {
  it('does not show the rookie draft after the draft has occurred', () => {
    assertNoExpiredTargets(offset(DRAFT, 60 * 60 * 1000));
  });

  it('does not show FA bidding start after it has opened', () => {
    assertNoExpiredTargets(offset(FA, 60 * 60 * 1000));
  });

  it('does not show trade deadline after it has passed', () => {
    assertNoExpiredTargets(offset(DEADLINE, 60 * 60 * 1000));
  });

  it('does not show playoffs start after postseason has begun', () => {
    assertNoExpiredTargets(offset(PLAYOFFS, 60 * 60 * 1000));
  });

  it('does not show new league year date after it has passed', () => {
    assertNoExpiredTargets(offset(NEW_YEAR, 60 * 60 * 1000));
  });

  it('all 2026 dates are expired and not shown one month after new league year', () => {
    const oneMonthAfter = offset(NEW_YEAR, 30 * 24 * 60 * 60 * 1000);
    assertNoExpiredTargets(oneMonthAfter);
    const [c1, c2] = getCountdownCards(oneMonthAfter);
    // Must be pointing at 2027 dates
    expect(c1.targetDate.getFullYear()).toBe(2027);
    expect(c2.targetDate.getFullYear()).toBe(2027);
  });
});

// ── Stage ordering: correct precedence when events overlap ────────────────────
describe('stage precedence', () => {
  it('new-year check wins over postseason check', () => {
    const [c1] = getCountdownCards(NEW_YEAR);
    expect(c1.targetDate).toEqual(NEXT_DRAFT);
    expect(c1.targetDate).not.toEqual(NEW_YEAR);
  });

  it('postseason check wins over all others (before new-year)', () => {
    const [c1] = getCountdownCards(offset(PLAYOFFS, 1));
    expect(c1.targetDate).toEqual(NEW_YEAR);
  });

  it('deadline check runs only when postseason has not started', () => {
    const [c1] = getCountdownCards(offset(DEADLINE, 1));
    expect(c1.targetDate).toEqual(PLAYOFFS);
  });
});

// ── getHomepagePhase boundaries ───────────────────────────────────────────────
describe('getHomepagePhase', () => {
  it('pre-draft → post_championship_pre_draft', () => {
    expect(getHomepagePhase(new Date('2026-03-01'))).toBe('post_championship_pre_draft');
  });

  it('after draft → post_draft_pre_fa', () => {
    expect(getHomepagePhase(offset(DRAFT, 1000))).toBe('post_draft_pre_fa');
  });

  it('after FA → fa_open_pre_season', () => {
    expect(getHomepagePhase(offset(FA, 1000))).toBe('fa_open_pre_season');
  });

  it('after Week 1 → regular_season', () => {
    expect(getHomepagePhase(offset(WEEK1, 1000))).toBe('regular_season');
  });

  it('after deadline → post_deadline_pre_postseason', () => {
    expect(getHomepagePhase(offset(DEADLINE, 1000))).toBe('post_deadline_pre_postseason');
  });

  it('after playoffs → postseason', () => {
    expect(getHomepagePhase(offset(PLAYOFFS, 1000))).toBe('postseason');
  });

  it('after new league year → post_championship_pre_draft (cycle reset)', () => {
    expect(getHomepagePhase(offset(NEW_YEAR, 1000))).toBe('post_championship_pre_draft');
  });

  it('after next-year draft → post_draft_pre_fa', () => {
    expect(getHomepagePhase(offset(NEXT_DRAFT, 1000))).toBe('post_draft_pre_fa');
  });
});
