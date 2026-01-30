/**
 * Newsletter System Types
 * AI-powered sports personality analysis for the league newsletter
 */

// ============ Core Data Types ============

export interface MatchupPair {
  matchup_id: string | number;
  teams: Array<{ name: string; points: number }>;
  winner: { name: string; points: number };
  loser: { name: string; points: number };
  margin: number;
}

export interface UpcomingPair {
  matchup_id: string | number;
  teams: [string, string];
}

export interface ScoredEvent {
  event_id: string;
  type: 'trade' | 'waiver' | 'fa_add';
  week: number | null;
  relevance_score: number;
  coverage_level: 'low' | 'moderate' | 'high';
  reasons: string[];
  // Trade-specific
  parties?: string[];
  assets_moved?: number;
  picks_moved?: number;
  details?: {
    headline?: string;
    by_team?: Record<string, { gets: string[]; gives: string[] }>;
  };
  // Waiver/FA-specific
  team?: string;
  player?: string;
  faab_spent?: number;
}

export interface DerivedData {
  matchup_pairs: MatchupPair[];
  upcoming_pairs: UpcomingPair[];
  events_scored: ScoredEvent[];
}

// ============ Personality Types ============

export type BotName = 'entertainer' | 'analyst';

export interface StyleProfile {
  sarcasm: number;
  emotion: number;
  depth: number;
  snark: number;
  excitability: number;
}

export interface PersonaConfig {
  name: string;
  style: {
    sarcasm: number;
    excite: number;
    depth: number;
    snark: number;
    pacing: 'bursty' | 'measured';
  };
  rhetoric: {
    openers: string[];
    closers: string[];
    verdicts: string[];
  };
  stance: {
    riskBias: 'pro-ceiling' | 'floor-weighted';
    concedeRate: number;
  };
}

export interface StyleSliderConfig {
  defaults: Record<BotName, StyleProfile>;
  overrides: Record<string, Record<BotName, Partial<StyleProfile>>>;
}

// ============ Memory Types ============

export interface TeamMemory {
  trust: number;       // -50 to 50
  frustration: number; // 0 to 50
  mood: 'Neutral' | 'Confident' | 'Suspicious' | 'Irritated';
}

export interface BotMemory {
  bot: BotName;
  updated_at: string;
  summaryMood: 'Focused' | 'Fired Up' | 'Deflated';
  teams: Record<string, TeamMemory>;
}

// ============ Forecast Types ============

export interface ForecastPick {
  matchup_id: string | number;
  team1: string;
  team2: string;
  bot1_pick: string;
  bot2_pick: string;
  confidence_bot1: 'high' | 'medium' | 'low';
  confidence_bot2: 'high' | 'medium' | 'low';
  est_bot1?: string;
  est_bot2?: string;
  note_bot1?: string;
  note_bot2?: string;
  upset_bot1?: boolean;
  upset_bot2?: boolean;
}

export interface ForecastData {
  picks: ForecastPick[];
  bot1_matchup_of_the_week?: string;
  bot2_matchup_of_the_week?: string;
  bot1_bold_player?: string;
  bot2_bold_player?: string;
  records?: {
    entertainer: { w: number; l: number };
    analyst: { w: number; l: number };
  };
  summary?: {
    agree_count: number;
    total: number;
    disagreements: string[];
  };
}

// ============ Newsletter Section Types ============

export interface IntroSection {
  bot1_text: string;
  bot2_text: string;
}

export interface BlurtSection {
  bot1: string | null;
  bot2: string | null;
}

export interface RecapItem {
  matchup_id: string | number;
  bot1: string;
  bot2: string;
}

export interface WaiverItem {
  event_id: string;
  coverage_level: string;
  reasons: string[];
  bot1: string;
  bot2: string;
}

export interface TradeAnalysis {
  grade: string;
  deltaText: string;
  entertainer_paragraph: string;
  analyst_paragraph: string;
}

export interface TradeItem {
  event_id: string;
  coverage_level: string;
  reasons: string[];
  context: string;
  teams: Record<string, { gets: string[]; gives: string[] }> | null;
  analysis: Record<string, TradeAnalysis>;
  debate_line?: string;
}

export interface SpotlightSection {
  team: string;
  bot1: string;
  bot2: string;
}

export interface FinalWordSection {
  bot1: string;
  bot2: string;
}

export interface CallbacksSection {
  saved_at: string;
  spotlight_team: string;
  forecast_picks: Array<{
    matchup_id: string | number;
    team1?: string;
    team2?: string;
    entertainer_pick?: string;
    analyst_pick?: string;
  }>;
  trade_grades: Array<{ team: string; grade: string }>;
}

export type NewsletterSection =
  | { type: 'Intro'; data: IntroSection }
  | { type: 'Callbacks'; data: CallbacksSection }
  | { type: 'Blurt'; data: BlurtSection }
  | { type: 'MatchupRecaps'; data: RecapItem[] }
  | { type: 'WaiversAndFA'; data: WaiverItem[] }
  | { type: 'Trades'; data: TradeItem[] }
  | { type: 'SpotlightTeam'; data: SpotlightSection }
  | { type: 'Forecast'; data: ForecastData }
  | { type: 'FinalWord'; data: FinalWordSection };

export interface NewsletterMeta {
  leagueName: string;
  week: number;
  date: string;
  season: number;
}

export interface Newsletter {
  meta: NewsletterMeta;
  sections: NewsletterSection[];
  _forCallbacks?: {
    tradeItems: TradeItem[];
    spotlight: SpotlightSection | null;
  };
}

// ============ Config Types ============

export interface RelevanceConfig {
  thresholds: { lowMax: number; moderateMax: number };
  trade: {
    weights: Record<string, number>;
    blockbuster_floor: number;
    lateral_cap: number;
    narrative_bonus: number;
  };
  waiver: {
    weights: Record<string, number>;
    fa_only_min: number;
    high_floor: number;
  };
}

export interface DynastyConfig {
  enabled: boolean;
  lineup: Record<string, number>;
  pickYearDecay: number;
  ageCurves: Record<string, { primeStart: number; primeEnd: number }>;
  draftRoundValue: Record<string, number>;
  injuryPenalty: number;
  starterWeight: number;
  benchWeight: number;
}
