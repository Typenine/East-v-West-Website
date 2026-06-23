/**
 * Tests for the shared news classifier.
 *
 * All tests import from the production module — no reimplementation here.
 *
 * Run: npx vitest run src/lib/news/__tests__/news-classifier.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  classifyStory,
  isListicleOrRoundup,
  isWatchOrTVGuide,
  isBettingContent,
  normalizeText,
  type StoryCategory,
} from '../news-classifier';
import { stripSuffixes } from '../news-matching';

// ── Injury classification ─────────────────────────────────────────────────────

describe('classifyStory – injury', () => {
  it('hamstring → injury', () => {
    expect(classifyStory('CeeDee Lamb hamstring update', '')).toBe<StoryCategory>('injury');
  });

  it('surgery → injury', () => {
    expect(classifyStory('QB undergoes shoulder surgery', '')).toBe<StoryCategory>('injury');
  });

  it('torn → injury', () => {
    expect(classifyStory('WR suffers torn ACL', '')).toBe<StoryCategory>('injury');
  });

  it('placed on IR → injury', () => {
    expect(classifyStory('RB placed on IR with ankle', '')).toBe<StoryCategory>('injury');
  });

  it('concussion → injury', () => {
    expect(classifyStory('QB in concussion protocol', '')).toBe<StoryCategory>('injury');
  });

  it('"did not practice with knee injury" → injury (injury keyword wins over practice keyword)', () => {
    expect(classifyStory('Justin Jefferson did not practice with knee injury', '')).toBe<StoryCategory>('injury');
  });

  it('out for season → injury', () => {
    expect(classifyStory('Star TE out for season after procedure', '')).toBe<StoryCategory>('injury');
  });

  it('Achilles → injury', () => {
    expect(classifyStory('WR tears Achilles during practice', '')).toBe<StoryCategory>('injury');
  });
});

// ── Practice availability: practice-only terms do NOT fire injury rule ────────

describe('classifyStory – practice_availability', () => {
  it('"limited in practice" alone → practice_availability (not injury)', () => {
    expect(classifyStory('Travis Kelce limited in practice', '')).toBe<StoryCategory>('practice_availability');
  });

  it('DNP without injury word → practice_availability', () => {
    expect(classifyStory('Patrick Mahomes DNP Thursday', '')).toBe<StoryCategory>('practice_availability');
  });

  it('"did not practice" alone → practice_availability', () => {
    expect(classifyStory('WR did not practice Wednesday', '')).toBe<StoryCategory>('practice_availability');
  });

  it('game-time decision → practice_availability', () => {
    expect(classifyStory('Cooper Kupp game time decision for Sunday', '')).toBe<StoryCategory>('practice_availability');
  });

  it('GTD → practice_availability', () => {
    expect(classifyStory('RB listed as GTD on injury report', '')).toBe<StoryCategory>('practice_availability');
  });

  it('"ruled out Sunday" alone → practice_availability (not injury)', () => {
    expect(classifyStory('Patrick Mahomes ruled out Sunday', '')).toBe<StoryCategory>('practice_availability');
  });

  it('full practice → practice_availability', () => {
    expect(classifyStory('WR returns to full practice', '')).toBe<StoryCategory>('practice_availability');
  });

  it('questionable alone → practice_availability', () => {
    expect(classifyStory('TE listed as questionable for Week 8', '')).toBe<StoryCategory>('practice_availability');
  });
});

// ── NFL transaction ───────────────────────────────────────────────────────────

describe('classifyStory – nfl_transaction', () => {
  it('practice squad move → nfl_transaction', () => {
    expect(classifyStory('WR John Doe signed to practice squad', '')).toBe<StoryCategory>('nfl_transaction');
  });

  it('waiver claim → nfl_transaction', () => {
    expect(classifyStory('Team claims RB off waivers', '')).toBe<StoryCategory>('nfl_transaction');
  });

  it('"waived" → nfl_transaction', () => {
    expect(classifyStory('Giants waive veteran safety', '')).toBe<StoryCategory>('nfl_transaction');
  });

  it('"released" → nfl_transaction (not contract)', () => {
    expect(classifyStory('Cowboys release aging QB after Week 9', '')).toBe<StoryCategory>('nfl_transaction');
  });

  it('"cut" → nfl_transaction', () => {
    expect(classifyStory('Team cut the receiver to make room on roster', '')).toBe<StoryCategory>('nfl_transaction');
  });

  it('"claimed on waivers" → nfl_transaction', () => {
    expect(classifyStory('Patriots claimed WR on waivers', '')).toBe<StoryCategory>('nfl_transaction');
  });
});

// ── Contract ──────────────────────────────────────────────────────────────────

describe('classifyStory – contract', () => {
  it('contract extension → contract', () => {
    expect(classifyStory('Chiefs and Patrick Mahomes agree on contract extension', '')).toBe<StoryCategory>('contract');
  });

  it('re-signed → contract', () => {
    expect(classifyStory('Dolphins re-signed starting safety to extension', '')).toBe<StoryCategory>('contract');
  });

  it('free agent signing (development is the contract) → contract', () => {
    expect(classifyStory('Chiefs sign free agent WR to one-year deal', '')).toBe<StoryCategory>('contract');
  });

  it('new contract → contract', () => {
    expect(classifyStory('QB agrees to new contract with new team', '')).toBe<StoryCategory>('contract');
  });

  it('multi-year deal → contract', () => {
    expect(classifyStory('RB signs multi-year deal to stay', '')).toBe<StoryCategory>('contract');
  });
});

// ── Trade ─────────────────────────────────────────────────────────────────────

describe('classifyStory – trade (completed)', () => {
  it('"acquired via trade" → trade', () => {
    expect(classifyStory('Broncos acquire WR in trade from Ravens', 'Player acquired via trade')).toBe<StoryCategory>('trade');
  });

  it('"dealt to" → trade', () => {
    expect(classifyStory('QB dealt to Cowboys in blockbuster trade', '')).toBe<StoryCategory>('trade');
  });

  it('"traded" → trade', () => {
    expect(classifyStory('Ravens trade TE to Eagles for draft picks', '')).toBe<StoryCategory>('trade');
  });
});

// ── Trade rumor ───────────────────────────────────────────────────────────────

describe('classifyStory – trade_rumor', () => {
  it('"trade rumors" → trade_rumor', () => {
    expect(classifyStory('Trade rumors swirl around veteran receiver', '')).toBe<StoryCategory>('trade_rumor');
  });

  it('"being shopped" → trade_rumor', () => {
    expect(classifyStory('Sources say player being shopped', '')).toBe<StoryCategory>('trade_rumor');
  });

  it('"on the trade block" → trade_rumor', () => {
    expect(classifyStory('Star WR on the trade block', '')).toBe<StoryCategory>('trade_rumor');
  });
});

// ── Suspension ────────────────────────────────────────────────────────────────

describe('classifyStory – suspension', () => {
  it('player suspended → suspension', () => {
    expect(classifyStory('Player suspended four games for violation', '')).toBe<StoryCategory>('suspension');
  });

  it('banned → suspension', () => {
    expect(classifyStory('RB banned for PED violation', '')).toBe<StoryCategory>('suspension');
  });
});

// ── Retirement ────────────────────────────────────────────────────────────────

describe('classifyStory – retirement', () => {
  it('retires → retirement', () => {
    expect(classifyStory('Veteran QB retires after 15 seasons', '')).toBe<StoryCategory>('retirement');
  });
});

// ── Rookie development ────────────────────────────────────────────────────────

describe('classifyStory – rookie_development', () => {
  it('rookie news → rookie_development', () => {
    expect(classifyStory('Rookie impresses in camp', 'First-year player turning heads')).toBe<StoryCategory>('rookie_development');
  });

  it('draft pick → rookie_development', () => {
    expect(classifyStory('Draft pick makes his NFL debut', '')).toBe<StoryCategory>('rookie_development');
  });
});

// ── Depth chart role ──────────────────────────────────────────────────────────

describe('classifyStory – depth_chart_role', () => {
  it('"named starter" → depth_chart_role', () => {
    expect(classifyStory('Rookie named starter for Week 1', '')).toBe<StoryCategory>('depth_chart_role');
  });

  it('"backup" → depth_chart_role', () => {
    expect(classifyStory('RB expected to remain backup behind starter', '')).toBe<StoryCategory>('depth_chart_role');
  });

  it('"depth chart" → depth_chart_role', () => {
    expect(classifyStory('WR rises on depth chart after strong camp', '')).toBe<StoryCategory>('depth_chart_role');
  });
});

// ── General analysis fallback ─────────────────────────────────────────────────

describe('classifyStory – general_analysis', () => {
  it('returns general_analysis for unclassified content', () => {
    expect(classifyStory('Team preview for the upcoming season', 'Analysis of roster moves.')).toBe<StoryCategory>('general_analysis');
  });
});

// ── Listicle / roundup detection ─────────────────────────────────────────────

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

// ── Noise filters ─────────────────────────────────────────────────────────────

describe('isWatchOrTVGuide', () => {
  it('flags TV guide content', () => {
    expect(isWatchOrTVGuide('How to watch Chiefs vs Broncos Sunday', '')).toBe(true);
  });

  it('does not flag player news', () => {
    expect(isWatchOrTVGuide('Patrick Mahomes injury update', '')).toBe(false);
  });
});

describe('isBettingContent', () => {
  it('flags betting content', () => {
    expect(isBettingContent('Week 8 odds and betting lines', '')).toBe(true);
  });

  it('does not flag player news', () => {
    expect(isBettingContent('CeeDee Lamb ruled out Sunday', '')).toBe(false);
  });
});

// ── normalizeText ─────────────────────────────────────────────────────────────

describe('normalizeText', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeText("Patrick Mahomes' injury")).toBe('patrick mahomes injury');
  });

  it('collapses whitespace', () => {
    expect(normalizeText('  hello   world  ')).toBe('hello world');
  });
});

// ── stripSuffixes ─────────────────────────────────────────────────────────────

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

// ── Category precedence edge cases ────────────────────────────────────────────

describe('category precedence', () => {
  it('"waived" hits nfl_transaction before contract', () => {
    expect(classifyStory('Team waived the veteran linebacker', '')).toBe<StoryCategory>('nfl_transaction');
  });

  it('completed trade beats trade rumor', () => {
    expect(classifyStory('Trade rumor confirmed: WR traded to Buffalo', '')).toBe<StoryCategory>('trade');
  });

  it('practice phrase alone never fires injury', () => {
    const practiceOnlyHeadlines = [
      'RB limited in practice',
      'TE did not practice Wednesday',
      'WR listed as DNP',
      'QB returned to full practice',
    ];
    for (const h of practiceOnlyHeadlines) {
      const result = classifyStory(h, '');
      expect(result, `"${h}" should not be injury`).not.toBe<StoryCategory>('injury');
    }
  });
});
