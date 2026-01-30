/**
 * Personality Module
 * Handles bot profiles, style sliders, and variability for the two AI personalities
 */

import type { BotName, StyleProfile } from './types';
import { STYLE_SLIDERS } from './config';

// ============ Style Profile ============

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function getProfile(bot: BotName, section: string): StyleProfile {
  const base = { ...STYLE_SLIDERS.defaults[bot] };
  const delta = STYLE_SLIDERS.overrides[section]?.[bot] || {};
  
  for (const k of Object.keys(delta) as Array<keyof StyleProfile>) {
    base[k] = clamp((base[k] ?? 0) + (delta[k] ?? 0), 0, 10);
  }
  
  return base;
}

// ============ Variability Helpers ============

function pick<T>(arr: T[] | undefined, indexSeed = 0): T | '' {
  if (!arr?.length) return '' as T;
  const i = Math.abs(indexSeed) % arr.length;
  return arr[i];
}

const OPENERS: Record<string, Record<BotName, { excited: string[]; normal: string[] } | { deep: string[]; normal: string[] }>> = {
  Intro: {
    entertainer: {
      excited: ['Okay, breathe.', 'Sound the alarms.', 'Oh we cooking.'],
      normal: ["Let's talk.", 'Real quick:', "Here's the vibe."],
    },
    analyst: {
      deep: ['Context first:', 'Signal check:', 'Quick calibration:'],
      normal: ['Big picture:', 'The read:', 'Net-net:'],
    },
  },
  FinalWord: {
    entertainer: {
      excited: ['I said what I said.', 'Clip this.', 'Book it.'],
      normal: ["That's the note.", "We'll see.", 'Keep receipts.'],
    },
    analyst: {
      deep: ['Actionables:', 'Final note:', 'One last thing:'],
      normal: ['Bottom line:', "That's it.", 'Wrap:'],
    },
  },
};

export function openerFor(section: string, bot: BotName, profile: StyleProfile, seed = 0): string {
  const sectionOpeners = OPENERS[section]?.[bot];
  if (!sectionOpeners) return '';

  if (bot === 'entertainer') {
    const excited = profile.excitability >= 8;
    const pool = excited 
      ? (sectionOpeners as { excited: string[]; normal: string[] }).excited 
      : (sectionOpeners as { excited: string[]; normal: string[] }).normal;
    return pick(pool, seed);
  } else {
    const deep = profile.depth >= 8;
    const pool = deep 
      ? (sectionOpeners as { deep: string[]; normal: string[] }).deep 
      : (sectionOpeners as { deep: string[]; normal: string[] }).normal;
    return pick(pool, seed);
  }
}

// ============ Blurts ============

export type SummaryMood = 'Focused' | 'Fired Up' | 'Deflated';

export function makeBlurt(bot: BotName, summaryMood: SummaryMood | undefined): string | null {
  if (bot === 'entertainer') {
    if (summaryMood === 'Fired Up') return 'This league finally has a pulse. Keep the chaos coming.';
    if (summaryMood === 'Deflated') return 'I need a palate cleanser. Somebody trade something spicy.';
    return null; // Focused → no blurt
  }
  
  // analyst
  if (summaryMood === 'Fired Up') return 'Trends are stabilizing; small edges matter more this week.';
  if (summaryMood === 'Deflated') return 'Variance spiked. Tighten risk and play the floor where it counts.';
  return null;
}

// ============ Tone Selection ============

import { TONE_RULES } from './config';

export type GameOutcome = 'win_big' | 'win_close' | 'loss_big' | 'loss_close';

export function getTonePhrase(bot: BotName, outcome: GameOutcome, seed = 0): string {
  const phrases = TONE_RULES[bot][outcome];
  return pick(phrases, seed);
}

export function determineOutcome(margin: number, isWinner: boolean): GameOutcome {
  if (isWinner) {
    return margin >= 30 ? 'win_big' : 'win_close';
  }
  return margin >= 30 ? 'loss_big' : 'loss_close';
}
