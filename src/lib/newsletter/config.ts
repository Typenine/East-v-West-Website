/**
 * Newsletter Configuration
 * Static configs for personas, relevance rules, and style sliders
 */

import type {
  PersonaConfig,
  StyleSliderConfig,
  RelevanceConfig,
  DynastyConfig,
} from './types';

// ============ Persona Configs ============

export const ENTERTAINER_PERSONA: PersonaConfig = {
  name: 'Entertainer',
  style: { sarcasm: 8, excite: 9, depth: 4, snark: 7, pacing: 'bursty' },
  rhetoric: {
    openers: ['Here we go.', 'Sound the alarms.', 'I told you.'],
    closers: ['Book it.', 'Clip this.', "I'm buying."],
    verdicts: ['love it', 'hate it', 'chaos energy', 'all gas, no brakes'],
  },
  stance: { riskBias: 'pro-ceiling', concedeRate: 0.15 },
};

export const ANALYST_PERSONA: PersonaConfig = {
  name: 'Analyst',
  style: { sarcasm: 2, excite: 3, depth: 9, snark: 2, pacing: 'measured' },
  rhetoric: {
    openers: ['Net-net:', 'Process check:', 'Signal over noise:'],
    closers: ['Sustainable if usage holds.', 'Monitor role stability.', 'Range widens if injuries hit.'],
    verdicts: ['value-aligned', 'role fit', 'portfolio balance', 'replaceable production'],
  },
  stance: { riskBias: 'floor-weighted', concedeRate: 0.45 },
};

// ============ Style Sliders ============

export const STYLE_SLIDERS: StyleSliderConfig = {
  defaults: {
    entertainer: { sarcasm: 7, emotion: 8, depth: 4, snark: 6, excitability: 8 },
    analyst: { sarcasm: 2, emotion: 3, depth: 9, snark: 2, excitability: 3 },
  },
  overrides: {
    Intro: {
      entertainer: { emotion: 2, excitability: 2 },
      analyst: { depth: -1 },
    },
    MatchupRecaps: {
      entertainer: { snark: 1 },
      analyst: { depth: 1 },
    },
    Trades: {
      entertainer: { sarcasm: 1, emotion: 1 },
      analyst: { depth: 1 },
    },
    Forecast: {
      entertainer: { excitability: 1 },
      analyst: { depth: 1, emotion: -1 },
    },
    FinalWord: {
      entertainer: { snark: 2, emotion: 1 },
      analyst: { depth: -1 },
    },
  },
};

// ============ Relevance Rules ============

export const RELEVANCE_CONFIG: RelevanceConfig = {
  thresholds: { lowMax: 39, moderateMax: 69 },
  trade: {
    weights: {
      dynastyRoleImpact: 20,
      positionalScarcity: 15,
      pointsImpact: 20,
      capitalPaid: 15,
      teamNeedFit: 15,
      tagShiftPotential: 15,
    },
    blockbuster_floor: 70,
    lateral_cap: 55,
    narrative_bonus: 5,
  },
  waiver: {
    weights: {
      faabSpentVsValue: 30,
      bidHeat: 15,
      needFit: 20,
      projectionRole: 20,
      timing: 15,
    },
    fa_only_min: 40,
    high_floor: 70,
  },
};

// ============ Dynasty Config ============

export const DYNASTY_CONFIG: DynastyConfig = {
  enabled: true,
  lineup: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2 },
  pickYearDecay: 0.07,
  ageCurves: {
    QB: { primeStart: 24, primeEnd: 33 },
    RB: { primeStart: 23, primeEnd: 26 },
    WR: { primeStart: 23, primeEnd: 28 },
    TE: { primeStart: 24, primeEnd: 30 },
  },
  draftRoundValue: { '1': 12, '2': 7, '3': 4, '4': 2, '5': 1, '6': 0, '7': 0, UDFA: -3 },
  injuryPenalty: 5,
  starterWeight: 1.0,
  benchWeight: 0.35,
};

// ============ Tone Rules ============

export const TONE_RULES = {
  entertainer: {
    win_big: ['dominant', 'statement game', 'flex-worthy'],
    win_close: ['gutsy', 'survived', 'escaped'],
    loss_big: ['yikes', 'brutal', 'got cooked'],
    loss_close: ['heartbreaker', 'tough beat', 'unlucky'],
  },
  analyst: {
    win_big: ['efficient ceiling game', 'process validated', 'sustainable output'],
    win_close: ['variance-aided', 'close margins', 'role stability key'],
    loss_big: ['concerning floor', 'structural issues', 'regression candidate'],
    loss_close: ['unlucky variance', 'margins tight', 'process sound'],
  },
};
