/**
 * Phase 1 unit tests
 *
 * Tests pure functions only — no I/O, no LLM calls, no DB.
 * Run with: npx vitest run src/lib/newsletter/__tests__/phase1.test.ts
 */

import { describe, it, expect } from 'vitest';

// ── memory dedupe ────────────────────────────────────────────────────────────
import {
  extractOutputSignatures,
  buildDedupeContext,
  updateRecentOutputLog,
  recordStanceUsed,
} from '../memory';
import type { BotMemory } from '../types';

function makeMem(bot: 'entertainer' | 'analyst' = 'entertainer'): BotMemory {
  return {
    bot,
    updated_at: new Date().toISOString(),
    summaryMood: 'Focused',
    teams: {},
  };
}

describe('extractOutputSignatures', () => {
  it('returns empty collections for blank text', () => {
    const result = extractOutputSignatures('', ['Double Trouble']);
    expect(result.narrativeAngles).toHaveLength(0);
    expect(result.recentPhrases).toHaveLength(0);
    expect(result.teamLabels).toEqual({});
  });

  it('extracts narrative angles from known keywords', () => {
    const text = 'Double Trouble is absolutely dominant this week. They look dangerous and I love the chaos they bring.';
    const result = extractOutputSignatures(text, ['Double Trouble']);
    expect(result.narrativeAngles).toContain('dominant');
    expect(result.narrativeAngles).toContain('dangerous');
    expect(result.narrativeAngles).toContain('chaos');
  });

  it('extracts team labels for mentioned teams', () => {
    const text = 'Double Trouble looks dominant. Belltown Raptors are struggling mightily.';
    const result = extractOutputSignatures(text, ['Double Trouble', 'Belltown Raptors']);
    expect(Object.keys(result.teamLabels)).toContain('Double Trouble');
    expect(Object.keys(result.teamLabels)).toContain('Belltown Raptors');
  });

  it('caps narrative angles at 8', () => {
    const text =
      'dominant dangerous struggling collapsing surging sneaky fraudulent legit inconsistent volatile cooked locked in';
    const result = extractOutputSignatures(text, []);
    expect(result.narrativeAngles.length).toBeLessThanOrEqual(8);
  });

  it('extracts phrases containing rhetorical markers', () => {
    const text = "Look, I'm telling you, this team is for real. Mark my words, they will make it far.";
    const result = extractOutputSignatures(text, []);
    expect(result.recentPhrases.length).toBeGreaterThan(0);
  });
});

describe('buildDedupeContext', () => {
  it('returns empty string when no log exists', () => {
    const mem = makeMem();
    expect(buildDedupeContext(mem)).toBe('');
  });

  it('returns empty string when weekLastUpdated is 0', () => {
    const mem = makeMem();
    mem.recentOutputLog = {
      weekLastUpdated: 0,
      teamLabels: {},
      narrativeAngles: ['dominant'],
      recentPhrases: [],
      recentStances: {},
    };
    expect(buildDedupeContext(mem)).toBe('');
  });

  it('includes narrative angles in the output block', () => {
    const mem = makeMem();
    mem.recentOutputLog = {
      weekLastUpdated: 5,
      teamLabels: {},
      narrativeAngles: ['dominant', 'chaos'],
      recentPhrases: [],
      recentStances: {},
    };
    const ctx = buildDedupeContext(mem);
    expect(ctx).toContain('dominant');
    expect(ctx).toContain('chaos');
    expect(ctx).toContain('AVOID REPEATING');
  });

  it('includes recent stances in the output block', () => {
    const mem = makeMem();
    mem.recentOutputLog = {
      weekLastUpdated: 3,
      teamLabels: {},
      narrativeAngles: [],
      recentPhrases: [],
      recentStances: { 'Double Trouble': 'Prosecutor' },
    };
    const ctx = buildDedupeContext(mem);
    expect(ctx).toContain('Double Trouble');
    expect(ctx).toContain('Prosecutor');
  });
});

describe('updateRecentOutputLog', () => {
  it('sets weekLastUpdated to the provided week', () => {
    const mem = makeMem();
    updateRecentOutputLog(mem, 7, 'The team is dominant.', []);
    expect(mem.recentOutputLog?.weekLastUpdated).toBe(7);
  });

  it('preserves existing recentStances', () => {
    const mem = makeMem();
    recordStanceUsed(mem, 'Double Trouble', 'Prosecutor');
    updateRecentOutputLog(mem, 8, 'dominant performance', ['Double Trouble']);
    expect(mem.recentOutputLog?.recentStances['Double Trouble']).toBe('Prosecutor');
  });
});

describe('recordStanceUsed', () => {
  it('creates recentOutputLog if absent', () => {
    const mem = makeMem();
    expect(mem.recentOutputLog).toBeUndefined();
    recordStanceUsed(mem, 'Belltown Raptors', 'Hype Man');
    expect(mem.recentOutputLog?.recentStances['Belltown Raptors']).toBe('Hype Man');
  });

  it('overwrites prior stance for the same team', () => {
    const mem = makeMem();
    recordStanceUsed(mem, 'Detroit Dawgs', 'Undertaker');
    recordStanceUsed(mem, 'Detroit Dawgs', 'Historian');
    expect(mem.recentOutputLog?.recentStances['Detroit Dawgs']).toBe('Historian');
  });
});

// ── guardrails ───────────────────────────────────────────────────────────────
import { checkOutput } from '../guardrails';

describe('checkOutput', () => {
  it('returns clean for safe text', () => {
    const result = checkOutput('Double Trouble had a great week and look dominant.');
    expect(result.warnings).toHaveLength(0);
    expect(result.blocked).toBe(false);
  });

  it('flags commissioner language as high severity', () => {
    const result = checkOutput('As commissioner, I am issuing an official ruling on this trade.');
    const w = result.warnings.find(w => w.rule === 'commissioner-language');
    expect(w).toBeDefined();
    expect(w?.severity).toBe('high');
    expect(result.blocked).toBe(true);
  });

  it('flags collusion accusation as high severity and blocks', () => {
    const result = checkOutput('These two teams are clearly colluding on their trades.');
    const w = result.warnings.find(w => w.rule === 'collusion-accusation');
    expect(w?.severity).toBe('high');
    expect(result.blocked).toBe(true);
  });

  it('flags unsupported rule claims at medium severity (does not block)', () => {
    const result = checkOutput('Per the rules, this trade must be voided.');
    const w = result.warnings.find(w => w.rule === 'unsupported-rule-claim');
    expect(w).toBeDefined();
    expect(w?.severity).toBe('medium');
    expect(result.blocked).toBe(false);
  });

  it('flags excessive length for known sections', () => {
    const longText = 'word '.repeat(100); // 100 words — over Blurt limit of 80
    const result = checkOutput(longText, { sectionType: 'Blurt' });
    const w = result.warnings.find(w => w.rule === 'excessive-length');
    expect(w).toBeDefined();
  });

  it('does not flag length when section is unknown', () => {
    const longText = 'word '.repeat(500);
    const result = checkOutput(longText, { sectionType: 'UnknownSection' });
    expect(result.warnings.find(w => w.rule === 'excessive-length')).toBeUndefined();
  });

  it('returns original text for non-blocking warnings', () => {
    const text = 'Per the rules, teams should manage their roster properly.';
    const result = checkOutput(text);
    expect(result.text).toBe(text);
  });

  it('replaces blocked text with safe fallback', () => {
    const result = checkOutput('As commissioner I am voiding this trade.');
    expect(result.blocked).toBe(true);
    expect(result.text).toContain('[Content removed');
  });
});

// ── bot-brain ────────────────────────────────────────────────────────────────
import { getBotBrain, getBotIdentityContext, ENTERTAINER_BRAIN, ANALYST_BRAIN } from '../bot-brain';

describe('getBotBrain', () => {
  it('returns entertainer brain for entertainer key', () => {
    const brain = getBotBrain('entertainer');
    expect(brain.key).toBe('entertainer');
    expect(brain.displayName).toBe('Mason Reed');
  });

  it('returns analyst brain for analyst key', () => {
    const brain = getBotBrain('analyst');
    expect(brain.key).toBe('analyst');
    expect(brain.displayName).toBe('Trent Weston');
  });

  it('entertainer has higher excitability than analyst', () => {
    expect(ENTERTAINER_BRAIN.voice.excitability).toBeGreaterThan(ANALYST_BRAIN.voice.excitability);
  });

  it('analyst has higher depth than entertainer', () => {
    expect(ANALYST_BRAIN.voice.depth).toBeGreaterThan(ENTERTAINER_BRAIN.voice.depth);
  });

  it('both bots have safety boundaries', () => {
    expect(ENTERTAINER_BRAIN.safetyBoundaries.length).toBeGreaterThan(0);
    expect(ANALYST_BRAIN.safetyBoundaries.length).toBeGreaterThan(0);
  });

  it('getBotIdentityContext returns a non-empty string', () => {
    const ctx = getBotIdentityContext('entertainer');
    expect(ctx.length).toBeGreaterThan(0);
    expect(ctx).toContain('Mason Reed');
  });
});

// ── judgment ─────────────────────────────────────────────────────────────────
import { judgeSection, buildJudgmentContext } from '../judgment';

describe('judgeSection', () => {
  it('returns critical stakes for championship episode', () => {
    const j = judgeSection({
      sectionType: 'Recap_0',
      episodeType: 'championship',
      week: 17,
      season: 2025,
      isChampionship: true,
    });
    expect(j.stakes).toBe('critical');
  });

  it('returns high stakes for playoff with high-relevance trade', () => {
    const j = judgeSection({
      sectionType: 'Trade_0',
      episodeType: 'playoffs_round',
      week: 15,
      season: 2025,
      isPlayoffs: true,
      eventRelevanceScore: 80,
    });
    expect(j.stakes).toBe('high');
  });

  it('returns low stakes for a regular week with low relevance event', () => {
    const j = judgeSection({
      sectionType: 'WaiversAndFA',
      episodeType: 'regular',
      week: 5,
      season: 2025,
      eventRelevanceScore: 20,
    });
    expect(j.stakes).toBe('low');
  });

  it('blowout recap gets higher comedy value', () => {
    const jBlowout = judgeSection({
      sectionType: 'Recap_0',
      episodeType: 'regular',
      week: 6,
      season: 2025,
      isBlowout: true,
      matchupMargin: 45,
    });
    const jNormal = judgeSection({
      sectionType: 'Recap_0',
      episodeType: 'regular',
      week: 6,
      season: 2025,
      matchupMargin: 12,
    });
    expect(jBlowout.comedyValue).toBeGreaterThan(jNormal.comedyValue);
  });

  it('championship reduces comedy value', () => {
    const jChamp = judgeSection({
      sectionType: 'Recap_0',
      episodeType: 'championship',
      week: 17,
      season: 2025,
      isChampionship: true,
    });
    expect(jChamp.comedyValue).toBeLessThanOrEqual(3);
  });

  it('buildJudgmentContext returns a non-empty string', () => {
    const j = judgeSection({
      sectionType: 'Intro',
      episodeType: 'regular',
      week: 8,
      season: 2025,
    });
    const ctx = buildJudgmentContext(j);
    expect(ctx.length).toBeGreaterThan(0);
    expect(ctx).toContain('SECTION GUIDANCE');
  });

  it('shouldLeanIn is true for championship', () => {
    const j = judgeSection({
      sectionType: 'Recap_0',
      episodeType: 'championship',
      week: 17,
      season: 2025,
      isChampionship: true,
    });
    expect(j.shouldLeanIn).toBe(true);
  });
});

// ── stance ───────────────────────────────────────────────────────────────────
import { selectStance, getStanceInstructions } from '../stance';
import { judgeSection as js } from '../judgment';

function baseJudgment() {
  return js({ sectionType: 'Recap_0', episodeType: 'regular', week: 6, season: 2025 });
}

describe('selectStance', () => {
  it('returns a valid Stance string', () => {
    const valid = [
      'Historian', 'Prosecutor', 'Defense Attorney', 'Rivalry Arsonist',
      'Undertaker', 'Accountant', 'Sicko Scout', 'Hype Man', 'Town Crier',
    ];
    const stance = selectStance({
      sectionType: 'Intro',
      episodeType: 'regular',
      bot: 'entertainer',
      judgment: baseJudgment(),
      week: 5,
    });
    expect(valid).toContain(stance);
  });

  it('avoids repeating the prior stance', () => {
    const judgment = baseJudgment();
    const priorStance = 'Prosecutor';
    const stance = selectStance({
      sectionType: 'Trade_0',
      episodeType: 'regular',
      bot: 'entertainer',
      judgment,
      week: 5,
      priorStance,
    });
    expect(stance).not.toBe(priorStance);
  });

  it('analyst prefers Accountant over Town Crier when analytical trust is high', () => {
    const judgment = js({ sectionType: 'Trade_0', episodeType: 'regular', week: 7, season: 2025 });
    const stance = selectStance({
      sectionType: 'Trade_0',
      episodeType: 'regular',
      bot: 'analyst',
      judgment,
      week: 7,
      personality: { riskTolerance: 20, dramaAppreciation: 10, grudgeLevel: 20, analyticalTrust: 80, underdogAffinity: -20, contrarianism: -10 },
    });
    // analyst with high analyticalTrust on a Trade section → Accountant or Sicko Scout
    const analyticalStances = ['Accountant', 'Sicko Scout', 'Historian', 'Prosecutor'];
    expect(analyticalStances).toContain(stance);
  });

  it('entertainer with high drama appreciation avoids Town Crier on blowout', () => {
    const judgment = js({
      sectionType: 'Recap_0', episodeType: 'regular', week: 5, season: 2025,
      isBlowout: true, matchupMargin: 40,
    });
    const stance = selectStance({
      sectionType: 'Recap_0',
      episodeType: 'regular',
      bot: 'entertainer',
      judgment,
      week: 5,
      personality: { riskTolerance: 70, dramaAppreciation: 80, grudgeLevel: 50, analyticalTrust: -20, underdogAffinity: 60, contrarianism: 55 },
    });
    expect(stance).not.toBe('Town Crier');
  });
});

describe('getStanceInstructions', () => {
  const stances = [
    'Historian', 'Prosecutor', 'Defense Attorney', 'Rivalry Arsonist',
    'Undertaker', 'Accountant', 'Sicko Scout', 'Hype Man', 'Town Crier',
  ] as const;

  for (const stance of stances) {
    it(`returns non-empty instructions for ${stance} as entertainer`, () => {
      const instructions = getStanceInstructions(stance, 'entertainer');
      expect(instructions.length).toBeGreaterThan(10);
    });

    it(`returns non-empty instructions for ${stance} as analyst`, () => {
      const instructions = getStanceInstructions(stance, 'analyst');
      expect(instructions.length).toBeGreaterThan(10);
    });

    it(`entertainer and analyst get different instructions for ${stance}`, () => {
      const ent = getStanceInstructions(stance, 'entertainer');
      const ana = getStanceInstructions(stance, 'analyst');
      expect(ent).not.toBe(ana);
    });
  }
});
