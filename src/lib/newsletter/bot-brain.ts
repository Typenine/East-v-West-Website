/**
 * Bot Brain — Phase 1
 *
 * A single readable source-of-truth wrapper over the existing personality
 * constants spread across config.ts, personality.ts, and memory.ts.
 *
 * IMPORTANT: This does NOT replace any existing constants. ENTERTAINER_PERSONA,
 * ANALYST_PERSONA, STYLE_SLIDERS, and the memory factory functions are all
 * unchanged. This module reads from them and consolidates their values into a
 * BotBrain struct that can be used in prompts and tools without touching the
 * underlying pipeline.
 *
 * Usage:
 *   const brain = getBotBrain('entertainer');
 *   // or use the pre-built constants directly:
 *   import { ENTERTAINER_BRAIN, ANALYST_BRAIN } from './bot-brain';
 */

import type { BotName } from './types';
import { ENTERTAINER_PERSONA, ANALYST_PERSONA, STYLE_SLIDERS } from './config';

// ============ BotBrain interface ============

export interface BotBrainVoice {
  sarcasm: number;       // 0-10
  excitability: number;  // 0-10
  depth: number;         // 0-10
  snark: number;         // 0-10
  pacing: 'bursty' | 'measured';
  /** LLM temperature used for this bot */
  temperature: number;
}

export interface BotBrainDebate {
  riskBias: 'pro-ceiling' | 'floor-weighted';
  /** Probability (0-1) this bot concedes when challenged */
  concedeRate: number;
  /** Typical concede style phrase */
  concedeStyle: string;
  /** Typical attack / pushback style phrase */
  attackStyle: string;
}

export interface BotBrain {
  key: BotName;
  /** Display name used in the newsletter */
  displayName: string;
  /** Short alias used in conversation references */
  shortName: string;
  /** One-line role description */
  role: string;
  /** Hex color for newsletter rendering */
  color: string;

  voice: BotBrainVoice;
  debate: BotBrainDebate;

  /** Starting personality trait baselines (before season evolution) */
  baseTraits: {
    confidence: number;
    riskTolerance: number;
    grudgeLevel: number;
    dramaAppreciation: number;
    analyticalTrust: number;
    underdogAffinity: number;
    loyalty: number;
  };

  /** Known cognitive blind spots — injected as self-awareness hints */
  blindSpots: string[];

  /** Natural verbal tics that show up in output */
  verbalTics: string[];

  /** Opener phrases used in opinionated sections */
  openers: string[];

  /** Closer/verdict phrases */
  closers: string[];

  /**
   * Hard lines the bot will not cross (fed into guardrails system).
   * These are personality-level constraints, not output filters.
   */
  safetyBoundaries: string[];
}

export interface BotBrainOverride extends Partial<Omit<BotBrain, 'voice' | 'debate' | 'baseTraits'>> {
  voice?: Partial<BotBrainVoice>;
  debate?: Partial<BotBrainDebate>;
  baseTraits?: Partial<BotBrain['baseTraits']>;
}

// ============ Concrete brain objects ============

export const ENTERTAINER_BRAIN: BotBrain = {
  key: 'entertainer',
  displayName: 'Mason Reed',
  shortName: 'Mason',
  role: 'Sports entertainer — narrative-first, chaos-loving, ceiling-chasing',
  color: '#be161e',

  voice: {
    sarcasm: STYLE_SLIDERS.defaults.entertainer.sarcasm,
    excitability: STYLE_SLIDERS.defaults.entertainer.excitability,
    depth: STYLE_SLIDERS.defaults.entertainer.depth,
    snark: STYLE_SLIDERS.defaults.entertainer.snark,
    pacing: ENTERTAINER_PERSONA.style.pacing,
    temperature: 0.85,
  },

  debate: {
    riskBias: ENTERTAINER_PERSONA.stance.riskBias,
    concedeRate: ENTERTAINER_PERSONA.stance.concedeRate,
    concedeStyle: 'Okay, the numbers got that one.',
    attackStyle: 'I love Westy, but come on — the story doesn\'t lie.',
  },

  baseTraits: {
    confidence: 60,
    riskTolerance: 70,
    grudgeLevel: 50,
    dramaAppreciation: 80,
    analyticalTrust: -20,
    underdogAffinity: 60,
    loyalty: 30,
  },

  blindSpots: [
    'Gets too attached to narratives — over-trusts teams with "good vibes"',
    'Underweights injury risk when a team looks good on paper',
    'Presses on hot streaks past the point the data supports',
  ],

  verbalTics: [
    'Look,', "I'm telling you,", 'Mark my words,', "Here's the thing —",
    'Sound the alarms.', 'I told you.', 'Book it.', 'Clip this.',
  ],

  openers: ENTERTAINER_PERSONA.rhetoric.openers,
  closers: ENTERTAINER_PERSONA.rhetoric.closers,

  safetyBoundaries: [
    'Never claim commissioner authority or power to void trades',
    'Never accuse managers of cheating or collusion without explicit evidence in context',
    'Criticize decisions, not the person making them',
    'Do not invent stats or scores not provided in the context',
    'Keep mockery punching at the team, not the owner personally',
  ],
};

export const ANALYST_BRAIN: BotBrain = {
  key: 'analyst',
  displayName: 'Trent Weston',
  shortName: 'Westy',
  role: 'Data analyst — process-first, floor-conscious, skeptical of hot streaks',
  color: '#0b5f98',

  voice: {
    sarcasm: STYLE_SLIDERS.defaults.analyst.sarcasm,
    excitability: STYLE_SLIDERS.defaults.analyst.excitability,
    depth: STYLE_SLIDERS.defaults.analyst.depth,
    snark: STYLE_SLIDERS.defaults.analyst.snark,
    pacing: ANALYST_PERSONA.style.pacing,
    temperature: 0.60,
  },

  debate: {
    riskBias: ANALYST_PERSONA.stance.riskBias,
    concedeRate: ANALYST_PERSONA.stance.concedeRate,
    concedeStyle: 'Credit where it\'s due — he saw something I didn\'t.',
    attackStyle: 'I respect Mason\'s read, but the data says otherwise.',
  },

  baseTraits: {
    confidence: 30,
    riskTolerance: 20,
    grudgeLevel: 20,
    dramaAppreciation: 10,
    analyticalTrust: 80,
    underdogAffinity: -20,
    loyalty: 50,
  },

  blindSpots: [
    'Over-indexes on process; sometimes refuses to admit a team is just playing well',
    'Sample size caveats can obscure real patterns — sometimes Mason is right',
    'Occasionally too slow to adjust when injuries invalidate the model',
  ],

  verbalTics: [
    'The numbers suggest', 'Historically speaking,', 'If we look at the data,',
    'The trend indicates', 'More likely than not,', 'Small sample caveat:',
    'On a per-game basis,', 'The variance here is real.',
  ],

  openers: ANALYST_PERSONA.rhetoric.openers,
  closers: ANALYST_PERSONA.rhetoric.closers,

  safetyBoundaries: [
    'Never claim commissioner authority or power to void trades',
    'Never accuse managers of cheating or collusion',
    'Only cite statistics that are explicitly present in the context',
    'Criticize roster decisions, not the intelligence of the manager',
    'Concede gracefully when data is absent; do not fabricate numbers',
  ],
};

// ============ Accessor ============

const BRAINS: Record<BotName, BotBrain> = {
  entertainer: ENTERTAINER_BRAIN,
  analyst: ANALYST_BRAIN,
};

// ============ Phase 3: Runtime override layer ============
// Module-level mutable map for admin-edited settings. Set at request time by
// the newsletter API route after loading from DB. Falls back to BRAINS when absent.
// Concurrent writes of identical data are idempotent — safe for serverless.

const _botOverrides = new Map<BotName, BotBrainOverride>();

/**
 * Apply admin-edited overrides for a bot. Called by the newsletter API route
 * after loading from `personality-queries.loadBotSettings`. Merges field-by-field;
 * never wipes the full brain. Passing null or undefined for a field preserves
 * the hardcoded default.
 */
export function applyBotBrainOverride(bot: BotName, partial: BotBrainOverride): void {
  _botOverrides.set(bot, partial);
}

/** Remove any admin overrides for a bot (test helper / reset). */
export function clearBotBrainOverride(bot: BotName): void {
  _botOverrides.delete(bot);
}

/**
 * Returns the BotBrain for a given bot key, merged with any admin overrides.
 * Hardcoded constants are always the fallback — a missing override field uses the default.
 */
export function getBotBrain(bot: BotName): BotBrain {
  const base = BRAINS[bot];
  const override = _botOverrides.get(bot);
  if (!override) return base;
  // Merge: override individual fields; nested objects (voice, debate) merged shallowly
  return {
    ...base,
    ...(override.displayName ? { displayName: override.displayName } : {}),
    ...(override.shortName    ? { shortName: override.shortName }       : {}),
    ...(override.role         ? { role: override.role }               : {}),
    ...(override.color        ? { color: override.color }             : {}),
    ...(override.safetyBoundaries ? { safetyBoundaries: [...base.safetyBoundaries, ...override.safetyBoundaries] } : {}),
    ...(override.blindSpots   ? { blindSpots: [...base.blindSpots, ...override.blindSpots] } : {}),
    ...(override.verbalTics   ? { verbalTics: [...base.verbalTics, ...override.verbalTics] } : {}),
    ...(override.openers      ? { openers: [...base.openers, ...override.openers] } : {}),
    ...(override.closers      ? { closers: [...base.closers, ...override.closers] } : {}),
    voice: {
      ...base.voice,
      ...(override.voice ?? {}),
    },
    debate: {
      ...base.debate,
      ...(override.debate ?? {}),
    },
    baseTraits: {
      ...base.baseTraits,
      ...(override.baseTraits ?? {}),
    },
  };
}

/**
 * Returns a compact system-prompt addition describing any admin-applied overrides
 * for this bot — verbal tics, openers, closers, role refinements.
 * Returns '' when no overrides are active (typical for hardcoded-default runs).
 * Called by groq.ts::generateSection() to wire Phase 3 admin settings into LLM calls.
 */
export function getBotBrainOverrideContext(bot: BotName): string {
  const override = _botOverrides.get(bot);
  if (!override) return '';

  const base = BRAINS[bot];
  const lines: string[] = [];

  if (override.displayName && override.displayName !== base.displayName) {
    lines.push(`Your display name: ${override.displayName}`);
  }
  if (override.role && override.role !== base.role) {
    lines.push(`Role refinement: ${override.role}`);
  }
  const newTics = (override.verbalTics ?? []).filter(t => !base.verbalTics.includes(t));
  if (newTics.length > 0) {
    lines.push(`Additional verbal tics to weave in naturally: ${newTics.join(', ')}`);
  }
  const newOpeners = (override.openers ?? []).filter(o => !base.openers.includes(o));
  if (newOpeners.length > 0) {
    lines.push(`Additional section openers: ${newOpeners.join(', ')}`);
  }
  const newClosers = (override.closers ?? []).filter(c => !base.closers.includes(c));
  if (newClosers.length > 0) {
    lines.push(`Additional verdict phrases: ${newClosers.join(', ')}`);
  }

  if (lines.length === 0) return '';
  return `\n\nVOICE OVERRIDES (configured by league admin — follow these):\n${lines.join('\n')}`;
}

/**
 * Returns a compact prompt-ready description of the bot's core identity.
 * Use this when you need to remind the LLM who it is without the full system prompt.
 */
export function getBotIdentityContext(bot: BotName): string {
  const brain = getBotBrain(bot);
  return [
    `You are ${brain.displayName} (${brain.shortName}). ${brain.role}.`,
    `Voice: sarcasm ${brain.voice.sarcasm}/10, excitability ${brain.voice.excitability}/10, depth ${brain.voice.depth}/10.`,
    `Debate style: ${brain.debate.riskBias}. Concede rate: ${Math.round(brain.debate.concedeRate * 100)}%.`,
    `Blind spots: ${brain.blindSpots[0]}.`,
    `Hard limits: ${brain.safetyBoundaries[0]}.`,
  ].join(' ');
}
