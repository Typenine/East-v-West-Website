/**
 * Boundary tests for the six-stage countdown resolver.
 * Run: npx vitest run src/lib/utils/__tests__/countdown-resolver.test.ts
 */

import { describe, it, expect } from 'vitest';
import { getCountdownCards } from '../countdown-resolver';
import { IMPORTANT_DATES } from '@/lib/constants/league';

// Convenience: offset a date by N milliseconds
const offset = (base: Date, ms: number) => new Date(base.getTime() + ms);

const DRAFT     = IMPORTANT_DATES.NEXT_DRAFT;
const FA        = IMPORTANT_DATES.FA_BIDDING_START;
const WEEK1     = IMPORTANT_DATES.NFL_WEEK_1_START;
const DEADLINE  = IMPORTANT_DATES.TRADE_DEADLINE;
const PLAYOFFS  = IMPORTANT_DATES.PLAYOFFS_START;
const NEW_YEAR  = IMPORTANT_DATES.NEW_LEAGUE_YEAR;
const NEXT_DRAFT = IMPORTANT_DATES.NEXT_LEAGUE_YEAR_DRAFT;

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

  it('shows draft + season after the new league year starts (cycle reset)', () => {
    // After NEW_LEAGUE_YEAR but before NEXT_DRAFT: still Stage 1 with NEXT_DRAFT and WEEK1
    const now = offset(NEW_YEAR, 1000);
    const [c1, c2] = getCountdownCards(now);
    // After the new league year the draft is NEXT_DRAFT (current year's draft), still upcoming
    expect(c1.targetDate).toEqual(DRAFT);
    expect(c2.targetDate).toEqual(WEEK1);
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
});

// ── Never shows expired events ────────────────────────────────────────────────
describe('expired events are never displayed', () => {
  it('does not show the rookie draft after the draft has occurred', () => {
    const now = offset(DRAFT, 60 * 60 * 1000); // 1 hour after draft
    const cards = getCountdownCards(now);
    expect(cards.every((c) => c.targetDate.getTime() > now.getTime())).toBe(true);
  });

  it('does not show FA bidding start after it has opened', () => {
    const now = offset(FA, 60 * 60 * 1000);
    const cards = getCountdownCards(now);
    expect(cards.every((c) => c.targetDate.getTime() > now.getTime())).toBe(true);
  });

  it('does not show trade deadline after it has passed', () => {
    const now = offset(DEADLINE, 60 * 60 * 1000);
    const cards = getCountdownCards(now);
    expect(cards.every((c) => c.targetDate.getTime() > now.getTime())).toBe(true);
  });

  it('does not show playoffs start after postseason has begun', () => {
    const now = offset(PLAYOFFS, 60 * 60 * 1000);
    const cards = getCountdownCards(now);
    expect(cards.every((c) => c.targetDate.getTime() > now.getTime())).toBe(true);
  });
});

// ── Stage ordering: correct precedence when events overlap ────────────────────
describe('stage precedence', () => {
  it('postseason check wins over all others', () => {
    // Even if PLAYOFFS > DEADLINE > WEEK1 etc., postseason wins
    const [c1] = getCountdownCards(offset(PLAYOFFS, 1));
    expect(c1.targetDate).toEqual(NEW_YEAR);
  });

  it('deadline check runs only when postseason has not started', () => {
    const [c1] = getCountdownCards(offset(DEADLINE, 1));
    expect(c1.targetDate).toEqual(PLAYOFFS);
  });
});
