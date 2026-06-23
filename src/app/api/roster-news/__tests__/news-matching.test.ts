/**
 * Unit tests for news classification and matching helpers.
 *
 * All functions are imported from production modules — no reimplementation
 * in this file.
 *
 * Run: npx vitest run src/app/api/roster-news/__tests__/news-matching.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  classifyStory,
  isListicleOrRoundup,
  normalizeText,
  type StoryCategory,
} from '@/lib/news/news-classifier';
import { stripSuffixes } from '@/lib/news/news-matching';

// ── Story classification ───────────────────────────────────────────────────────

describe('classifyStory – injury (actual injury terms)', () => {
  it('classifies "ruled out with knee injury" → injury', () => {
    expect(classifyStory('Justin Jefferson did not practice with knee injury', '')).toBe<StoryCategory>('injury');
  });

  it('classifies hamstring → injury', () => {
    expect(classifyStory('CeeDee Lamb hamstring update', '')).toBe<StoryCategory>('injury');
  });

  it('classifies surgery → injury', () => {
    expect(classifyStory('QB undergoes shoulder surgery', '')).toBe<StoryCategory>('injury');
  });
});

describe('classifyStory – practice_availability (practice terms alone)', () => {
  it('"limited in practice" alone → practice_availability (not injury)', () => {
    expect(classifyStory('Travis Kelce limited in practice', '')).toBe<StoryCategory>('practice_availability');
  });

  it('"ruled out Sunday" alone → practice_availability (not injury)', () => {
    expect(classifyStory('Patrick Mahomes ruled out Sunday', '')).toBe<StoryCategory>('practice_availability');
  });

  it('GTD → practice_availability', () => {
    expect(classifyStory('Cooper Kupp game time decision', '')).toBe<StoryCategory>('practice_availability');
  });
});

describe('classifyStory – nfl_transaction', () => {
  it('classifies practice squad move → nfl_transaction', () => {
    expect(classifyStory('WR John Doe signed to practice squad', '')).toBe<StoryCategory>('nfl_transaction');
  });

  it('classifies waiver claim → nfl_transaction', () => {
    expect(classifyStory('Team claims RB off waivers', '')).toBe<StoryCategory>('nfl_transaction');
  });

  it('"released" → nfl_transaction (not contract)', () => {
    expect(classifyStory('Cowboys release veteran QB after disappointing season', '')).toBe<StoryCategory>('nfl_transaction');
  });

  it('"waived" → nfl_transaction (not contract)', () => {
    expect(classifyStory('Giants waive safety after roster move', '')).toBe<StoryCategory>('nfl_transaction');
  });
});

describe('classifyStory – contract', () => {
  it('classifies free-agent signing → contract', () => {
    expect(classifyStory('Chiefs sign free agent WR to one-year deal', '')).toBe<StoryCategory>('contract');
  });

  it('classifies re-signing → contract', () => {
    expect(classifyStory('Dolphins re-signed starting safety to extension', '')).toBe<StoryCategory>('contract');
  });

  it('classifies contract extension → contract', () => {
    expect(classifyStory('Chiefs agree on contract extension with Mahomes', '')).toBe<StoryCategory>('contract');
  });
});

describe('classifyStory – trade', () => {
  it('classifies completed trade', () => {
    expect(classifyStory('Broncos acquire WR in trade from Ravens', 'Player acquired via trade')).toBe<StoryCategory>('trade');
  });

  it('classifies "dealt to" as trade', () => {
    expect(classifyStory('QB dealt to Cowboys in blockbuster trade', '')).toBe<StoryCategory>('trade');
  });

  it('classifies "traded" → trade', () => {
    expect(classifyStory('Ravens trade TE to Eagles for draft picks', '')).toBe<StoryCategory>('trade');
  });
});

describe('classifyStory – trade_rumor', () => {
  it('classifies trade rumors → trade_rumor', () => {
    expect(classifyStory('Trade rumors swirl around veteran receiver', '')).toBe<StoryCategory>('trade_rumor');
  });

  it('classifies "being shopped" → trade_rumor', () => {
    expect(classifyStory('Team being shopped around the league', 'Sources say player being shopped')).toBe<StoryCategory>('trade_rumor');
  });
});

describe('classifyStory – suspension', () => {
  it('classifies suspension', () => {
    expect(classifyStory('Player suspended four games for violation', '')).toBe<StoryCategory>('suspension');
  });
});

describe('classifyStory – retirement', () => {
  it('classifies retirement announcement', () => {
    expect(classifyStory('Veteran QB retires after 15 seasons', '')).toBe<StoryCategory>('retirement');
  });
});

describe('classifyStory – depth_chart_role', () => {
  it('classifies starter designation', () => {
    expect(classifyStory('Rookie named starter for Week 1', '')).toBe<StoryCategory>('depth_chart_role');
  });

  it('classifies backup role', () => {
    expect(classifyStory('RB expected to remain backup behind starter', '')).toBe<StoryCategory>('depth_chart_role');
  });
});

describe('classifyStory – rookie_development', () => {
  it('classifies rookie news', () => {
    expect(classifyStory('Rookie impresses in camp', 'First-year player turning heads')).toBe<StoryCategory>('rookie_development');
  });
});

describe('classifyStory – general_analysis fallback', () => {
  it('returns general_analysis for unclassified content', () => {
    expect(classifyStory('Team preview for the upcoming season', 'Analysis of roster moves.')).toBe<StoryCategory>('general_analysis');
  });
});

// ── Listicle / roundup detection ──────────────────────────────────────────────

describe('isListicleOrRoundup', () => {
  it('flags top-N titles', () => {
    expect(isListicleOrRoundup('Top 10 WRs to start this week')).toBe(true);
  });

  it('flags mock drafts', () => {
    expect(isListicleOrRoundup('2026 NFL Mock Draft 2.0')).toBe(true);
  });

  it('flags power rankings', () => {
    expect(isListicleOrRoundup('NFL Power Rankings: Week 8 edition')).toBe(true);
  });

  it('does not flag normal player news', () => {
    expect(isListicleOrRoundup('Travis Kelce returns from injury')).toBe(false);
  });

  it('does not flag specific player analysis', () => {
    expect(isListicleOrRoundup('CeeDee Lamb injury update')).toBe(false);
  });
});

// ── normalizeText ──────────────────────────────────────────────────────────────

describe('normalizeText', () => {
  it('lowercases and removes non-alphanumeric', () => {
    expect(normalizeText("Patrick Mahomes' update")).toBe('patrick mahomes update');
  });
});

// ── Suffix stripping ───────────────────────────────────────────────────────────

describe('stripSuffixes', () => {
  it('strips Jr.', () => {
    expect(stripSuffixes('Calvin Ridley Jr')).toBe('calvin ridley');
  });

  it('strips II', () => {
    expect(stripSuffixes('DK Metcalf II')).toBe('dk metcalf');
  });

  it('does not strip non-suffix words', () => {
    expect(stripSuffixes('Patrick Mahomes')).toBe('patrick mahomes');
  });
});

// ── Transaction source tests (regression) ────────────────────────────────────

describe('transaction classification (regression)', () => {
  it('"signed" to roster → contract (not nfl_transaction)', () => {
    const category = classifyStory('Chiefs sign veteran WR John Doe to one-year deal', '');
    expect(category).toBe<StoryCategory>('contract');
    expect(category).not.toBe<StoryCategory>('general_analysis');
  });

  it('trade story → trade', () => {
    const category = classifyStory('Ravens trade TE to Eagles for draft picks', '');
    expect(category).toBe<StoryCategory>('trade');
  });

  it('"release" → nfl_transaction (not contract)', () => {
    const category = classifyStory('Cowboys release aging QB after Week 9', '');
    expect(category).toBe<StoryCategory>('nfl_transaction');
  });
});
