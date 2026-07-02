/**
 * Editorial-queue target mapping + market-value output guard.
 *
 * Pure functions only — no I/O, no LLM calls, no DB.
 * Run with: npx vitest run src/lib/newsletter/__tests__/queue-target.test.ts
 */

import { describe, it, expect } from 'vitest';
import { resolveQueueTarget, EPISODE_WEEK_STORAGE } from '../queue-target';
import { stripValueDisclosures } from '../guardrails';

describe('resolveQueueTarget', () => {
  it('maps each weekless episode type to its own distinct storage week', () => {
    const storageWeeks = (['preseason', 'pre_draft', 'post_draft', 'offseason'] as const).map(
      episodeType => resolveQueueTarget({ id: 'x', season: 2026, week: null, episodeType }, 5).storageWeek,
    );
    expect(storageWeeks).toEqual([900, 901, 902, 903]);
    expect(new Set(storageWeeks).size).toBe(4);
  });

  it('offseason no longer collides with week-0 regular items', () => {
    const offseason = resolveQueueTarget({ id: 'a', season: 2026, week: null, episodeType: 'offseason' }, 3);
    const regular = resolveQueueTarget({ id: 'b', season: 2026, week: 3, episodeType: 'regular' }, 3);
    expect(offseason.storageWeek).toBe(EPISODE_WEEK_STORAGE.offseason);
    expect(offseason.storageWeek).not.toBe(regular.storageWeek);
  });

  it('regular item with a blank week resolves to the current NFL week, not week 0', () => {
    const target = resolveQueueTarget({ id: 'c', season: 2026, week: null, episodeType: 'regular' }, 7);
    expect(target.week).toBe(7);
    expect(target.storageWeek).toBe(7);
  });

  it('regular item with an explicit week keeps that week', () => {
    const target = resolveQueueTarget({ id: 'd', season: 2026, week: 11, episodeType: 'regular' }, 7);
    expect(target.week).toBe(11);
    expect(target.storageWeek).toBe(11);
  });

  it('weekly special episode types resolve like regular items', () => {
    const target = resolveQueueTarget({ id: 'e', season: 2026, week: null, episodeType: 'trade_deadline' }, 12);
    expect(target.week).toBe(12);
    expect(target.storageWeek).toBe(12);
  });

  it('falls back to week 1 when the current NFL week is unusable', () => {
    const target = resolveQueueTarget({ id: 'f', season: 2026, week: null, episodeType: 'regular' }, 0);
    expect(target.week).toBe(1);
  });

  it('null episodeType defaults to regular', () => {
    const target = resolveQueueTarget({ id: 'g', season: 2026, week: 4, episodeType: null }, 4);
    expect(target.episodeType).toBe('regular');
    expect(target.storageWeek).toBe(4);
  });
});

describe('stripValueDisclosures', () => {
  it('returns clean text unchanged', () => {
    const text = 'Belltown wins this deal. Nacua is a top-5 dynasty WR and McCaffrey is 29 with 124.5 points through Week 8.';
    expect(stripValueDisclosures(text)).toBe(text);
  });

  it('removes a sentence quoting a raw market value', () => {
    const text = 'This is a heist. Nacua carries a market value of 8900 right now. Belltown gets younger and better.';
    const out = stripValueDisclosures(text);
    expect(out).not.toContain('8900');
    expect(out).toContain('This is a heist.');
    expect(out).toContain('Belltown gets younger and better.');
  });

  it('removes "valued at" and "<n> value" phrasings without touching normal stats', () => {
    const text = 'McCaffrey is valued at 4700 by the market. He scored 22.4 points in Week 9. That 4700 value will not age well.';
    const out = stripValueDisclosures(text);
    expect(out).not.toContain('4700');
    expect(out).toContain('22.4 points in Week 9');
  });

  it('drops an entire paragraph when every sentence discloses values', () => {
    const text = 'Great trade for the Raptors.\n\nNacua has a dynasty value of 8900. The pick is valued at 3200.';
    const out = stripValueDisclosures(text);
    expect(out).toBe('Great trade for the Raptors.');
  });

  it('leaves records, FAAB, picks, and years alone', () => {
    const text = 'They are 8-2, spent $23 FAAB, own pick 1.08, and a 2027 1st. KTC value talk is for nerds.';
    const out = stripValueDisclosures(text);
    expect(out).toContain('8-2');
    expect(out).toContain('$23 FAAB');
    expect(out).toContain('1.08');
    expect(out).toContain('2027 1st');
    // "KTC value" without a number still matches the fixed-term pattern:
    expect(out).not.toContain('KTC value talk');
  });
});
