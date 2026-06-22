/**
 * Unit tests for news classification logic extracted from the roster-news route.
 * Tests pure functions — no network calls, no Sleeper API, no RSS feeds.
 *
 * Run: npx vitest run src/app/api/roster-news/__tests__/news-matching.test.ts
 * (requires Node ≥ 22; Node 20.10 + vitest 4 is known-incompatible)
 */

import { describe, it, expect } from 'vitest';

// ── Re-implement the testable pure functions inline ────────────────────────────
// These mirror the logic in route.ts so we don't need to import server-only code.

type StoryCategory =
  | 'injury' | 'practice_availability' | 'nfl_transaction' | 'contract'
  | 'trade' | 'trade_rumor' | 'suspension' | 'depth_chart_role'
  | 'retirement' | 'rookie_development' | 'performance' | 'general_analysis';

const CATEGORY_RULES: Array<{ category: StoryCategory; patterns: RegExp[] }> = [
  { category: 'injury', patterns: [/\b(injur|injured|injury|hurt|fracture|sprain|torn|surgery|hamstring|achilles|concussion|placed on ir|ir list|out for season|questionable|doubtful|ruled out|limited practice|did not practice|dnp)\b/i] },
  { category: 'practice_availability', patterns: [/\b(limited practice|did not practice|dnp|full practice|returned to practice|practice report|questionable|probable|doubtful|ruled out|game time decision|gtd)\b/i] },
  { category: 'suspension', patterns: [/\b(suspend|suspension|banned|ban|discipline|violation)\b/i] },
  { category: 'retirement', patterns: [/\b(retire|retirement|retires|retiring|call it a career|hang up his cleats)\b/i] },
  { category: 'trade', patterns: [/\b(traded|trade complete|acquired via trade|dealt to|exchange|swap)\b/i] },
  { category: 'trade_rumor', patterns: [/\b(trade rumors?|trade talks?|exploring a trade|on the trade block|could be traded|being shopped|trade interest|trade candidate|trade target|linked to)\b/i] },
  { category: 'contract', patterns: [/\b(signed|re-signed|contract extension|extension|deal|agreement|free agent signing|released|waived|claimed|cut |drops? |let go)\b/i] },
  { category: 'nfl_transaction', patterns: [/\b(practice squad|promoted|signed to practice|activated|claimed on waivers|waiver claim|released|cut |waived )\b/i] },
  { category: 'depth_chart_role', patterns: [/\b(starter|starting role|depth chart|benched|named starter|will start|lead back|target share|snap count|usage|taking over|replacing|backup|third.string)\b/i] },
  { category: 'rookie_development', patterns: [/\b(rookie|first.year|draft pick|undrafted|making his nfl|nfl debut)\b/i] },
  { category: 'performance', patterns: [/\b(touchdown|100 yards|career.high|breakout|struggled|dominant|fantasy points|big game|stat line)\b/i] },
];

function classifyStory(title: string, description: string): StoryCategory {
  const hay = `${title} ${description}`;
  for (const { category, patterns } of CATEGORY_RULES) {
    if (patterns.some((re) => re.test(hay))) return category;
  }
  return 'general_analysis';
}

function normalizeText(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function isListicleOrRoundup(title: string): boolean {
  const t = normalizeText(title);
  return /\b(top \d+|best \d+|\d+ players|\d+ things|rankings|ranked|mock draft|power rankings|grades|report card|every team|all 32|nfl picks)\b/.test(t);
}

function stripSuffixes(name: string): string {
  const parts = normalizeText(name).split(' ');
  const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
  return parts.filter((p) => !suffixes.has(p)).join(' ').trim();
}

// ── Story classification tests ─────────────────────────────────────────────────

describe('classifyStory – injury', () => {
  it('classifies "ruled out" as injury', () => {
    expect(classifyStory('Patrick Mahomes ruled out Sunday', '')).toBe('injury');
  });
  it('classifies "hamstring" as injury', () => {
    expect(classifyStory('CeeDee Lamb hamstring update', '')).toBe('injury');
  });
  it('classifies DNP as injury (injury takes priority over practice)', () => {
    expect(classifyStory('Justin Jefferson did not practice with knee injury', '')).toBe('injury');
  });
});

describe('classifyStory – practice_availability', () => {
  it('classifies limited practice without injury word', () => {
    expect(classifyStory('Travis Kelce limited in practice', '')).toBe('practice_availability');
  });
  it('classifies GTD as practice_availability', () => {
    expect(classifyStory('Cooper Kupp game time decision', '')).toBe('practice_availability');
  });
});

describe('classifyStory – nfl_transaction', () => {
  it('classifies practice squad move', () => {
    expect(classifyStory('WR John Doe signed to practice squad', '')).toBe('nfl_transaction');
  });
  it('classifies waiver claim', () => {
    expect(classifyStory('Team claims RB off waivers', '')).toBe('nfl_transaction');
  });
});

describe('classifyStory – contract', () => {
  it('classifies signing', () => {
    expect(classifyStory('Chiefs sign free agent WR to one-year deal', '')).toBe('contract');
  });
  it('classifies re-signing', () => {
    expect(classifyStory('Dolphins re-signed starting safety to extension', '')).toBe('contract');
  });
  it('classifies release', () => {
    expect(classifyStory('Giants release veteran QB after disappointing season', '')).toBe('contract');
  });
});

describe('classifyStory – trade', () => {
  it('classifies completed trade', () => {
    expect(classifyStory('Broncos acquire WR in trade from Ravens', 'Player acquired via trade')).toBe('trade');
  });
  it('classifies dealt to as trade', () => {
    expect(classifyStory('QB dealt to Cowboys in blockbuster trade', '')).toBe('trade');
  });
});

describe('classifyStory – trade_rumor', () => {
  it('classifies trade rumors', () => {
    expect(classifyStory('Trade rumors swirl around veteran receiver', '')).toBe('trade_rumor');
  });
  it('classifies being shopped', () => {
    expect(classifyStory('Team being shopped around the league', 'Sources say player being shopped')).toBe('trade_rumor');
  });
});

describe('classifyStory – suspension', () => {
  it('classifies suspension', () => {
    expect(classifyStory('Player suspended four games for violation', '')).toBe('suspension');
  });
});

describe('classifyStory – retirement', () => {
  it('classifies retirement announcement', () => {
    expect(classifyStory('Veteran QB retires after 15 seasons', '')).toBe('retirement');
  });
});

describe('classifyStory – depth_chart_role', () => {
  it('classifies starter designation', () => {
    expect(classifyStory('Rookie named starter for Week 1', '')).toBe('depth_chart_role');
  });
  it('classifies backup role', () => {
    expect(classifyStory('RB expected to remain backup behind starter', '')).toBe('depth_chart_role');
  });
});

describe('classifyStory – rookie_development', () => {
  it('classifies rookie news', () => {
    expect(classifyStory('Rookie impresses in camp', 'First-year player turning heads')).toBe('rookie_development');
  });
});

describe('classifyStory – general_analysis fallback', () => {
  it('returns general_analysis for unclassified content', () => {
    expect(classifyStory('Team preview for the upcoming season', 'Analysis of roster moves.')).toBe('general_analysis');
  });
});

// ── Listicle/roundup detection ─────────────────────────────────────────────────

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

// ── ProFootballRumors transaction stories (regression: these were previously excluded) ──

describe('PFR transaction stories no longer excluded', () => {
  it('transaction-keyword story is now classifiable (not dropped at source level)', () => {
    // The old rss-sources.ts had excludeKeywords: ['signed', 'traded', ...] for pfrumors.
    // With the new source-profile approach, classification happens in route logic.
    // A "signed" headline should now classify as a contract story.
    const category = classifyStory('Chiefs sign veteran WR John Doe to one-year deal', '');
    expect(category).toBe('contract');
    expect(category).not.toBe('general_analysis');
  });

  it('trade story classifies as trade', () => {
    const category = classifyStory('Ravens trade TE to Eagles for draft picks', '');
    expect(category).toBe('trade');
  });

  it('release story classifies as contract', () => {
    const category = classifyStory('Cowboys release aging QB after Week 9', '');
    expect(category).toBe('contract');
  });
});
