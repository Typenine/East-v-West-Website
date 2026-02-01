/**
 * Newsletter Configuration
 * Static configs for personas, relevance rules, and style sliders
 */

import type {
  PersonaConfig,
  StyleSliderConfig,
  RelevanceConfig,
  DynastyConfig,
  BotMemory,
  BotName,
  EpisodeType,
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

// ============ Episode-Specific Style Modifiers ============

const EPISODE_STYLE_MODIFIERS: Partial<Record<EpisodeType, { exciteBoost: number; depthBoost: number; snarkBoost: number }>> = {
  championship: { exciteBoost: 3, depthBoost: 0, snarkBoost: 2 },
  playoffs_round: { exciteBoost: 2, depthBoost: 1, snarkBoost: 1 },
  playoffs_preview: { exciteBoost: 2, depthBoost: 2, snarkBoost: 0 },
  trade_deadline: { exciteBoost: 1, depthBoost: 1, snarkBoost: 2 },
  season_finale: { exciteBoost: 2, depthBoost: 1, snarkBoost: 1 },
  preseason: { exciteBoost: 1, depthBoost: 2, snarkBoost: 0 },
};

// ============ Merged Persona Context ============

export interface MergedPersonaContext {
  basePersona: PersonaConfig;
  evolvedStyle: {
    sarcasm: number;
    excite: number;
    depth: number;
    snark: number;
    pacing: 'bursty' | 'measured';
  };
  emotionalModifier: string;
  personalityNotes: string[];
}

/**
 * Merge static persona with evolved personality traits from memory and episode overrides.
 * Returns a context object that can be used in LLM prompts.
 */
export function getPersonaContext(
  role: BotName,
  mem: BotMemory | null,
  episodeType: EpisodeType = 'regular',
  weekContext?: { week: number; isPlayoffs: boolean }
): MergedPersonaContext {
  const basePersona = role === 'entertainer' ? ENTERTAINER_PERSONA : ANALYST_PERSONA;
  
  // Start with base style
  const evolvedStyle = { ...basePersona.style };
  
  // Apply episode modifiers
  const episodeMod = EPISODE_STYLE_MODIFIERS[episodeType];
  if (episodeMod) {
    evolvedStyle.excite = Math.min(10, evolvedStyle.excite + episodeMod.exciteBoost);
    evolvedStyle.depth = Math.min(10, evolvedStyle.depth + episodeMod.depthBoost);
    evolvedStyle.snark = Math.min(10, evolvedStyle.snark + episodeMod.snarkBoost);
  }
  
  // Apply evolved personality traits from memory (if present)
  const personalityNotes: string[] = [];
  let emotionalModifier = '';
  
  if (mem?.personality) {
    const p = mem.personality;
    
    // Confidence affects sarcasm and snark
    if (p.confidence > 70) {
      evolvedStyle.sarcasm = Math.min(10, evolvedStyle.sarcasm + 1);
      personalityNotes.push('Feeling confident - more bold takes');
    } else if (p.confidence < 30) {
      evolvedStyle.sarcasm = Math.max(0, evolvedStyle.sarcasm - 1);
      personalityNotes.push('Confidence shaken - more measured');
    }
    
    // Optimism affects excitability
    if (p.optimism > 70) {
      evolvedStyle.excite = Math.min(10, evolvedStyle.excite + 1);
      personalityNotes.push('Optimistic outlook');
    } else if (p.optimism < 30) {
      evolvedStyle.excite = Math.max(0, evolvedStyle.excite - 1);
      personalityNotes.push('Pessimistic this week');
    }
    
    // Volatility affects pacing
    if (p.volatility > 70 && evolvedStyle.pacing === 'measured') {
      personalityNotes.push('More reactive than usual');
    }
    
    // Grudge level affects snark
    if (p.grudgeLevel > 60) {
      evolvedStyle.snark = Math.min(10, evolvedStyle.snark + 1);
      personalityNotes.push('Holding grudges - expect callbacks');
    }
  }
  
  // Apply emotional state modifier
  if (mem?.emotionalState) {
    const es = mem.emotionalState;
    if (es.intensity > 50) {
      switch (es.primary) {
        case 'excited': emotionalModifier = 'Currently hyped up'; break;
        case 'frustrated': emotionalModifier = 'Frustrated with recent events'; break;
        case 'smug': emotionalModifier = 'Feeling vindicated'; break;
        case 'anxious': emotionalModifier = 'Anxious about outcomes'; break;
        case 'vengeful': emotionalModifier = 'Looking for payback'; break;
        case 'nostalgic': emotionalModifier = 'In a reminiscing mood'; break;
        case 'hopeful': emotionalModifier = 'Cautiously optimistic'; break;
      }
    }
  }
  
  // Playoff intensity boost
  if (weekContext?.isPlayoffs) {
    evolvedStyle.excite = Math.min(10, evolvedStyle.excite + 1);
    personalityNotes.push('Playoff intensity mode');
  }
  
  return {
    basePersona,
    evolvedStyle,
    emotionalModifier,
    personalityNotes,
  };
}
