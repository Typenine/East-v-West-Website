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

// Legacy team memory (kept for backward compatibility)
export interface TeamMemory {
  trust: number;       // -50 to 50
  frustration: number; // 0 to 50
  mood: 'Neutral' | 'Confident' | 'Suspicious' | 'Irritated';
}

// Legacy bot memory (kept for backward compatibility)
export interface BotMemory {
  bot: BotName;
  updated_at: string;
  summaryMood: 'Focused' | 'Fired Up' | 'Deflated';
  teams: Record<string, TeamMemory>;
}

// ============ Enhanced Memory Types (Tier 2) ============

export type NarrativeType = 
  | 'streak'      // Win/loss streak
  | 'rivalry'     // Ongoing rivalry storyline
  | 'redemption'  // Comeback story
  | 'collapse'    // Team falling apart
  | 'underdog'    // Surprising success
  | 'dynasty'     // Sustained dominance
  | 'trade_saga'  // Multi-week trade storyline
  | 'injury'      // Key injury impact
  | 'breakout'    // Player/team breakout
  | 'bust'        // Disappointing performance;

export interface Narrative {
  id: string;
  type: NarrativeType;
  teams: string[];
  title: string;           // Short title: "Double Trouble's Revenge Tour"
  description: string;     // Current state of the narrative
  startedWeek: number;
  lastUpdated: number;
  resolved: boolean;
  resolution?: string;     // How it ended
}

export type TeamTrajectory = 'rising' | 'falling' | 'steady' | 'volatile';
export type TeamMoodEnhanced = 'hot' | 'cold' | 'neutral' | 'chaotic' | 'dangerous';

export interface EnhancedTeamMemory {
  // Current state
  mood: TeamMoodEnhanced;
  trajectory: TeamTrajectory;
  
  // Streaks (negative = loss streak)
  winStreak: number;
  
  // Trust/frustration from legacy
  trust: number;
  frustration: number;
  
  // Notable events this season
  notableEvents: Array<{
    week: number;
    event: string;
    sentiment: 'positive' | 'negative' | 'neutral';
  }>;
  
  // Bot's last written assessment
  lastAssessment?: {
    week: number;
    text: string;
  };
  
  // Season stats tracking
  seasonStats?: {
    wins: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
    playoffOdds?: number;
  };
}

export interface PredictionRecord {
  week: number;
  matchupId: string | number;
  team1: string;
  team2: string;
  pick: string;
  confidence: 'high' | 'medium' | 'low';
  reasoning?: string;
  result?: 'correct' | 'wrong';
  actualWinner?: string;
  margin?: number;
}

export interface HotTake {
  week: number;
  take: string;
  subject: string;        // Team or player name
  boldness: 'mild' | 'spicy' | 'nuclear';
  agedWell?: boolean;
  followUp?: string;      // "I was right!" or "I'll own this L"
}

export interface SeasonMilestone {
  week: number;
  event: string;
  teams?: string[];
  significance: 'minor' | 'major' | 'historic';
}

export interface EnhancedBotMemory {
  // Identity
  bot: BotName;
  season: number;
  updated_at: string;
  lastGeneratedWeek: number;
  
  // Overall mood
  summaryMood: 'Focused' | 'Fired Up' | 'Deflated' | 'Chaotic' | 'Vindicated';
  
  // Running narratives (the "stories" of the season)
  narratives: Narrative[];
  
  // Team-by-team assessments
  teams: Record<string, EnhancedTeamMemory>;
  
  // Prediction tracking
  predictions: PredictionRecord[];
  predictionStats: {
    correct: number;
    wrong: number;
    winRate: number;
    hotStreak: number;    // Current correct streak (negative = wrong streak)
    bestStreak: number;
    worstStreak: number;
  };
  
  // Hot takes archive
  hotTakes: HotTake[];
  
  // Season milestones observed
  milestones: SeasonMilestone[];
  
  // Feuds with the other bot
  botFeud?: {
    topic: string;
    myPosition: string;
    theirPosition: string;
    startedWeek: number;
    resolved: boolean;
  };
  
  // Legacy compatibility
  legacyTeams?: Record<string, TeamMemory>;
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
  // Team info for visual display
  winner?: string;
  loser?: string;
  winner_score?: number;
  loser_score?: number;
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

// ============ New LLM-Powered Section Types ============

/** Bot debate when they disagree on a pick */
export interface BotDebate {
  topic: string;
  team1: string;
  team2: string;
  entertainer_position: string;
  entertainer_argument: string;
  analyst_position: string;
  analyst_argument: string;
  verdict?: string; // Added after the game resolves
}

/** Weekly hot take with tracking */
export interface WeeklyHotTake {
  week: number;
  bot: 'entertainer' | 'analyst';
  take: string;
  subject: string; // Team or player
  boldness: 'mild' | 'spicy' | 'nuclear';
  graded?: boolean;
  correct?: boolean;
  followUp?: string;
}

/** Weekly awards section */
export interface WeeklyAwards {
  mvp: {
    team: string;
    player?: string;
    points?: number;
    entertainer_take: string;
    analyst_take: string;
  };
  bust: {
    team: string;
    player?: string;
    points?: number;
    entertainer_take: string;
    analyst_take: string;
  };
  waiver_winner?: {
    team: string;
    player: string;
    entertainer_take: string;
    analyst_take: string;
  };
  biggest_blowout?: {
    winner: string;
    loser: string;
    margin: number;
    commentary: string;
  };
  nail_biter?: {
    winner: string;
    loser: string;
    margin: number;
    commentary: string;
  };
}

/** What-if scenario for close games */
export interface WhatIfScenario {
  matchup_id: string | number;
  winner: string;
  loser: string;
  margin: number;
  scenario: string; // "If X had started Y instead of Z..."
  outcome_change: string; // "...they would have won by 5"
}

/** Dynasty value analysis for trades */
export interface DynastyAnalysis {
  trade_id: string;
  teams: string[];
  short_term_winner: string;
  long_term_winner: string;
  entertainer_dynasty_take: string;
  analyst_dynasty_take: string;
  key_assets: Array<{ asset: string; age?: number; value_trend: 'rising' | 'falling' | 'stable' }>;
}

/** Rivalry matchup special coverage */
export interface RivalryMatchup {
  team1: string;
  team2: string;
  rivalry_name?: string;
  all_time_record: { team1_wins: number; team2_wins: number };
  recent_meetings: string;
  stakes: string;
  entertainer_hype: string;
  analyst_breakdown: string;
}

/** Playoff odds commentary */
export interface PlayoffOddsSection {
  week: number;
  clinched: string[];
  eliminated: string[];
  bubble_teams: Array<{
    team: string;
    wins: number;
    losses: number;
    scenario: string; // "Must win + X loses"
  }>;
  entertainer_commentary: string;
  analyst_commentary: string;
}

/** Narrative callback referencing past events */
export interface NarrativeCallback {
  type: 'prediction_grade' | 'hot_take_followup' | 'streak_update' | 'rivalry_continuation';
  original_week: number;
  original_statement: string;
  current_status: string;
  bot_reaction: string;
}

export type NewsletterSection =
  // Standard sections (regular episodes)
  | { type: 'Intro'; data: IntroSection }
  | { type: 'Callbacks'; data: CallbacksSection }
  | { type: 'Blurt'; data: BlurtSection }
  | { type: 'MatchupRecaps'; data: RecapItem[] }
  | { type: 'WaiversAndFA'; data: WaiverItem[] }
  | { type: 'Trades'; data: TradeItem[] }
  | { type: 'SpotlightTeam'; data: SpotlightSection }
  | { type: 'Forecast'; data: ForecastData }
  | { type: 'FinalWord'; data: FinalWordSection }
  // New LLM-powered sections
  | { type: 'BotDebates'; data: BotDebate[] }
  | { type: 'HotTakes'; data: WeeklyHotTake[] }
  | { type: 'WeeklyAwards'; data: WeeklyAwards }
  | { type: 'WhatIf'; data: WhatIfScenario[] }
  | { type: 'DynastyAnalysis'; data: DynastyAnalysis[] }
  | { type: 'RivalryWatch'; data: RivalryMatchup[] }
  | { type: 'PlayoffOdds'; data: PlayoffOddsSection }
  | { type: 'NarrativeCallbacks'; data: NarrativeCallback[] }
  // Special episode sections
  | { type: 'PowerRankings'; data: PowerRankingsSection }
  | { type: 'SeasonPreview'; data: SeasonPreviewSection }
  | { type: 'TradeDeadline'; data: TradeDeadlineSection }
  | { type: 'PlayoffPicture'; data: PlayoffPictureSection }
  | { type: 'SeasonAwards'; data: SeasonAwardsSection }
  | { type: 'ChampionshipRecap'; data: ChampionshipRecapSection }
  // Draft episode sections
  | { type: 'DraftPreview'; data: DraftPreviewSection }
  | { type: 'DraftGrades'; data: DraftGradesSection };

// ============ Episode Types ============

/**
 * Special episode types for non-standard newsletters
 * - 'regular': Standard weekly recap (default)
 * - 'pre_draft': Before the rookie draft - draft preview, mock drafts
 * - 'post_draft': After the rookie draft - draft grades, analysis
 * - 'preseason': Season preview before Week 1 - ESPN/Athletic style predictions
 * - 'trade_deadline': Trade deadline special (after deadline passes)
 * - 'playoffs_preview': Week before playoffs start
 * - 'playoffs_round': Playoff round recap
 * - 'championship': Championship week special
 * - 'season_finale': End of season wrap-up
 * - 'offseason': General offseason updates
 */
export type EpisodeType = 
  | 'regular'
  | 'pre_draft'
  | 'post_draft'
  | 'preseason'
  | 'trade_deadline'
  | 'playoffs_preview'
  | 'playoffs_round'
  | 'championship'
  | 'season_finale'
  | 'offseason';

export interface EpisodeConfig {
  type: EpisodeType;
  title?: string;              // Custom title override
  subtitle?: string;           // Episode subtitle
  specialSections?: string[];  // Additional sections to include
  excludeSections?: string[];  // Sections to skip
  tone?: 'hype' | 'serious' | 'nostalgic' | 'celebratory';
}

// ============ Additional Section Types for Special Episodes ============

export interface PowerRankingsSection {
  rankings: Array<{
    rank: number;
    team: string;
    record: string;
    pointsFor: number;
    trend: 'up' | 'down' | 'steady';
    trendAmount?: number;
    bot1_blurb: string;
    bot2_blurb: string;
  }>;
  bot1_intro: string;
  bot2_intro: string;
}

export interface SeasonPreviewSection {
  contenders: Array<{ team: string; reason: string }>;
  sleepers: Array<{ team: string; reason: string }>;
  bustCandidates: Array<{ team: string; reason: string }>;
  boldPredictions: { bot1: string[]; bot2: string[] };
  championshipPick: { bot1: string; bot2: string };
}

export interface TradeDeadlineSection {
  winners: Array<{ team: string; analysis: string }>;
  losers: Array<{ team: string; analysis: string }>;
  mostActiveTrader: { team: string; trades: number; netAssets: string };
  biggestMove: { description: string; teams: string[] };
  missedOpportunities: Array<{ team: string; suggestion: string }>;
  bot1_summary: string;
  bot2_summary: string;
}

export interface PlayoffPictureSection {
  clinched: string[];
  inHunt: Array<{ team: string; scenario: string }>;
  eliminated: string[];
  bracketPreview?: {
    matchups: Array<{ seed1: string; seed2: string; bot1_pick: string; bot2_pick: string }>;
  };
  bot1_analysis: string;
  bot2_analysis: string;
}

export interface SeasonAwardsSection {
  mvpTeam: { winner: string; bot1_case: string; bot2_case: string };
  mostImproved: { winner: string; reason: string };
  biggestDisappointment: { winner: string; reason: string };
  bestTrade: { description: string; winner: string };
  worstTrade: { description: string; loser: string };
  bestWaiverPickup: { player: string; team: string };
  bot1_finalThoughts: string;
  bot2_finalThoughts: string;
}

export interface ChampionshipRecapSection {
  champion: string;
  runnerUp: string;
  finalScore: { winner: number; loser: number };
  mvpPlayer?: { name: string; points: number };
  championPath: string[];  // "Beat Team A in semis, Team B in finals"
  bot1_coronation: string;
  bot2_coronation: string;
  seasonInReview: string;
}

export interface DraftPreviewSection {
  draftOrder: Array<{ pick: number; team: string }>;
  topProspects: Array<{ name: string; position: string; analysis: string }>;
  teamNeeds: Array<{ team: string; needs: string[]; strategy: string }>;
  mockDraft?: Array<{ pick: number; team: string; player: string; analysis: string }>;
  bot1_preview: string;
  bot2_preview: string;
}

export interface DraftGradesSection {
  grades: Array<{
    team: string;
    picks: Array<{ round: number; pick: number; player: string; position: string }>;
    grade: string;  // A+, A, B+, etc.
    bot1_analysis: string;
    bot2_analysis: string;
  }>;
  bestPick: { team: string; player: string; reason: string };
  worstPick: { team: string; player: string; reason: string };
  stealOfTheDraft: { team: string; player: string; reason: string };
  bot1_summary: string;
  bot2_summary: string;
}

export interface NewsletterMeta {
  leagueName: string;
  week: number;
  date: string;
  season: number;
  episodeType?: EpisodeType;
  episodeTitle?: string;
  episodeSubtitle?: string;
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
