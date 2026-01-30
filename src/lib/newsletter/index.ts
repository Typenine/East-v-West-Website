/**
 * Newsletter System
 * AI-powered sports personality analysis for the East v West league
 * 
 * This module provides the core functionality for generating weekly newsletters
 * with dual AI personalities (Entertainer and Analyst) that analyze matchups,
 * trades, waivers, and make predictions.
 */

// Types
export * from './types';

// Config
export {
  ENTERTAINER_PERSONA,
  ANALYST_PERSONA,
  STYLE_SLIDERS,
  RELEVANCE_CONFIG,
  DYNASTY_CONFIG,
  TONE_RULES,
} from './config';

// Core modules
export { buildDerived, mapUsersById, mapRosters } from './derive';
export { getProfile, openerFor, makeBlurt, getTonePhrase, determineOutcome } from './personality';
export { createFreshMemory, ensureTeams, updateMemoryAfterWeek, serializeMemory, deserializeMemory } from './memory';
export { buildDeepRecaps, generateSingleRecap } from './recaps';
export { makeForecast, gradePendingPicks } from './forecast';
export { composeNewsletter } from './compose';
export { renderHtml, renderNewsletterData } from './template';

// Generator
export { generateNewsletter, type GenerateNewsletterInput, type GenerateNewsletterResult } from './generator';
