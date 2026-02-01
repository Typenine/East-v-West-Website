/**
 * Newsletter System Types
 * AI-powered sports personality analysis for the league newsletter
 */

// ============ Core Data Types ============

export interface MatchupPair {
  matchup_id: string | number;
  teams: Array<{ name: string; points: number }>;
  winner: { name: string; points: number; topPlayers?: Array<{ name: string; points: number }> };
  loser: { name: string; points: number; topPlayers?: Array<{ name: string; points: number }> };
  margin: number;
  // Playoff bracket label (e.g., "Championship", "3rd Place", "5th Place", "Toilet Bowl")
  bracketLabel?: string;
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

// All possible team mood values (unified for type compatibility)
export type TeamMood = 'Neutral' | 'Confident' | 'Suspicious' | 'Irritated' | 'hot' | 'cold' | 'neutral' | 'chaotic' | 'dangerous';

// All possible bot mood values (unified for type compatibility)
export type BotMood = 'Focused' | 'Fired Up' | 'Deflated' | 'Chaotic' | 'Vindicated';

// Team memory - unified interface that works for both basic and enhanced
export interface TeamMemory {
  trust: number;       // -50 to 50
  frustration: number; // 0 to 50
  mood: TeamMood;
  // Optional enhanced fields (present in EnhancedTeamMemory)
  trajectory?: 'rising' | 'falling' | 'steady' | 'volatile';
  winStreak?: number;
  notableEvents?: Array<{
    week: number;
    event: string;
    sentiment: 'positive' | 'negative' | 'neutral';
  }>;
  lastAssessment?: {
    week: number;
    text: string;
  };
  seasonStats?: {
    wins: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
    playoffOdds?: number;
  };
}

// Bot memory - unified interface that works for both basic and enhanced
export interface BotMemory {
  bot: BotName;
  updated_at: string;
  summaryMood: BotMood;
  teams: Record<string, TeamMemory>;
  // Optional enhanced fields
  season?: number;
  lastGeneratedWeek?: number;
  personality?: PersonalityTraits;
  emotionalState?: EmotionalState;
  speechPatterns?: SpeechPatterns;
  personalGrowth?: PersonalGrowth;
  deepPlayerRelationships?: Record<string, DeepPlayerRelationship>;
  deepTeamRelationships?: Record<string, DeepTeamRelationship>;
  partnerDynamics?: {
    recentInteractions: Array<{
      week: number;
      matchup?: string;
      topic: string;
      agreed: boolean;
      myTake: string;
      theirTake: string;
      whoWasRight?: 'me' | 'them' | 'neither' | 'both';
      memorable?: boolean;
    }>;
    agreementRate: number;
    timesTheyWereRight: number;
    timesIWasRight: number;
    activeFeud?: {
      topic: string;
      myPosition: string;
      theirPosition: string;
      startedWeek: number;
      intensity: 'mild' | 'heated' | 'war';
    };
    lessonsLearned: Array<{
      week: number;
      lesson: string;
    }>;
    insideJokes: Array<{
      reference: string;
      week: number;
    }>;
  };
  narratives?: Narrative[];
  predictions?: PredictionRecord[];
  predictionStats?: {
    correct: number;
    wrong: number;
    winRate: number;
    hotStreak: number;
    bestStreak: number;
    worstStreak: number;
  };
  hotTakes?: HotTake[];
  milestones?: SeasonMilestone[];
  playerRelationships?: Record<string, PlayerRelationship>;
  favoritePlayers?: string[];
  disappointments?: string[];
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
// Note: TeamMoodEnhanced was removed - use TeamMood which includes all values

// Player relationship tracking - how the bot feels about individual players
export type PlayerSentiment = 'favorite' | 'trusted' | 'neutral' | 'skeptical' | 'disappointed' | 'enemy';

export interface PlayerRelationship {
  playerId: string;
  playerName: string;
  sentiment: PlayerSentiment;
  trustLevel: number;  // -100 to 100
  // Why they feel this way
  reasons: Array<{
    week: number;
    event: string;  // "Dropped 40 in championship", "Busted in playoffs", "Consistent 20+ weeks"
    impact: number; // How much this changed trust (-50 to +50)
  }>;
  // Key moments
  bestMoment?: { week: number; points: number; context: string };  // "35 pts in semifinal"
  worstMoment?: { week: number; points: number; context: string }; // "4 pts in championship"
  // Tracking
  gamesWatched: number;
  avgPoints: number;
  bigGamePerformance: number;  // Avg in weeks 14+ (playoffs)
}

/**
 * EnhancedTeamMemory is now just TeamMemory with required enhanced fields.
 * TeamMemory has all fields as optional, so this type makes some required.
 */
export type EnhancedTeamMemory = TeamMemory & {
  trajectory: TeamTrajectory;
  winStreak: number;
  notableEvents: Array<{
    week: number;
    event: string;
    sentiment: 'positive' | 'negative' | 'neutral';
  }>;
};

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

// ============ Personality Evolution Types ============

/**
 * Core personality traits that evolve over time based on experiences
 * Each trait is on a scale of -100 to 100
 */
export interface PersonalityTraits {
  // Confidence vs Humility: High = cocky/bold, Low = humble/cautious
  confidence: number;
  
  // Optimism vs Pessimism: High = glass half full, Low = expects the worst
  optimism: number;
  
  // Loyalty vs Fickleness: High = sticks with teams through thick/thin, Low = quick to abandon
  loyalty: number;
  
  // Analytics vs Gut: High = trusts the numbers, Low = trusts instinct
  analyticalTrust: number;
  
  // Grudge-holding: High = never forgets, Low = forgives easily
  grudgeLevel: number;
  
  // Risk tolerance: High = loves bold picks, Low = plays it safe
  riskTolerance: number;
  
  // Emotional volatility: High = big swings, Low = steady eddie
  volatility: number;
  
  // === NEW TRAITS ===
  
  // Contrarianism: High = loves going against the grain, Low = follows consensus
  contrarianism: number;
  
  // Nostalgia: High = constantly references the past, Low = focused on present
  nostalgia: number;
  
  // Pettiness: High = remembers small slights, Low = lets things go
  pettiness: number;
  
  // Patience: High = willing to wait for long-term plays, Low = wants immediate results
  patience: number;
  
  // Superstition: High = believes in jinxes/curses/momentum, Low = purely rational
  superstition: number;
  
  // Competitiveness with co-host: High = always wants to be right, Low = collaborative
  competitiveness: number;
  
  // Attachment to underdogs: High = roots for longshots, Low = respects favorites
  underdogAffinity: number;
  
  // Drama appreciation: High = loves chaos and storylines, Low = prefers boring consistency
  dramaAppreciation: number;
}

/**
 * Emotional state that persists and influences commentary
 */
export interface EmotionalState {
  // Current dominant emotion
  primary: 'neutral' | 'excited' | 'frustrated' | 'smug' | 'anxious' | 'nostalgic' | 'vengeful' | 'hopeful';
  
  // Intensity of the emotion (0-100)
  intensity: number;
  
  // What triggered this state
  trigger?: {
    week: number;
    event: string;
    team?: string;
    player?: string;
  };
  
  // How long this has persisted (weeks)
  duration: number;
}

/**
 * Speech patterns and catchphrases that evolve ORGANICALLY over time
 * Catchphrases should NOT appear quickly - they need to be earned through repeated events
 */
export interface SpeechPatterns {
  // Potential catchphrases that are building (not ready yet)
  emergingPhrases: Array<{
    phrase: string;
    context: string;
    occurrences: number; // Must hit threshold before becoming a catchphrase
    firstSeen: number; // Week first used
    events: string[]; // What triggered each occurrence
  }>;
  
  // Established catchphrases (only after 3+ similar events over 3+ weeks)
  catchphrases: Array<{
    phrase: string;
    context: string; // When to use it
    frequency: number; // How often (0-100) - starts low, builds over time
    origin: { week: number; event: string };
    timesUsed: number; // Track actual usage
    lastUsed?: number; // Week last used - don't overuse
  }>;
  
  // Words/phrases they naturally gravitate toward (not forced catchphrases)
  verbalTics: string[];
  
  // Topics they keep coming back to (need 2+ weeks of relevance)
  obsessions: Array<{
    topic: string;
    reason: string;
    startedWeek: number;
    mentions: number; // How many times they've brought it up
  }>;
  
  // Things they refuse to talk about (sore subjects)
  avoidTopics: Array<{
    topic: string;
    reason: string;
    until?: number; // Week they might revisit
  }>;
  
  // Signature reactions (more natural than catchphrases)
  signatureReactions: Array<{
    trigger: string; // What causes this reaction
    reaction: string; // How they typically respond
    examples: string[]; // Past instances
  }>;
}

/**
 * Deep player relationship with history
 */
export interface DeepPlayerRelationship {
  playerId: string;
  playerName: string;
  team?: string;
  
  // Overall sentiment
  sentiment: 'beloved' | 'trusted' | 'neutral' | 'skeptical' | 'grudge' | 'enemy' | 'redeemed';
  trustLevel: number; // -100 to 100
  
  // The story of this relationship
  history: Array<{
    week: number;
    season: number;
    event: string;
    impact: number; // How much this changed trust
    emotional: boolean; // Was this an emotional moment?
  }>;
  
  // Key moments
  definingMoment?: {
    week: number;
    season: number;
    event: string;
    sentiment: 'positive' | 'negative';
  };
  
  // Predictions about this player
  predictions: Array<{
    week: number;
    prediction: string;
    wasRight?: boolean;
  }>;
  
  // Nicknames given
  nicknames: string[];
  
  // How often they mention this player (0-100)
  mentionFrequency: number;
}

/**
 * Team relationship with deep history
 */
export interface DeepTeamRelationship {
  teamName: string;
  
  // Overall stance
  stance: 'believer' | 'skeptic' | 'neutral' | 'grudging_respect' | 'nemesis' | 'bandwagon';
  trustLevel: number;
  
  // History of takes
  takeHistory: Array<{
    week: number;
    season: number;
    take: string;
    wasRight?: boolean;
    memorable?: boolean;
  }>;
  
  // Times they've been burned/vindicated
  timesBurned: number;
  timesVindicated: number;
  
  // Current narrative about this team
  currentNarrative?: string;
  
  // Specific players on this team they have opinions about
  playerOpinions: Record<string, 'love' | 'hate' | 'neutral' | 'intrigued'>;
}

/**
 * Growth and learning over time
 */
export interface PersonalGrowth {
  // Lessons learned the hard way
  hardLessons: Array<{
    week: number;
    season: number;
    lesson: string;
    context: string;
    appliedSince: boolean;
  }>;
  
  // Biases they've recognized
  recognizedBiases: Array<{
    bias: string;
    discoveredWeek: number;
    workingOnIt: boolean;
  }>;
  
  // Things they've gotten better at
  improvements: Array<{
    skill: string;
    evidence: string;
  }>;
  
  // Blind spots they still have
  blindSpots: string[];
}

/**
 * Enhanced memory shape - BotMemory with all critical enhanced fields present.
 * Used as the narrowed type after isEnhancedMemory guard passes.
 */
export type EnhancedBotMemory = BotMemory & {
  personality: PersonalityTraits;
  predictionStats: {
    correct: number;
    wrong: number;
    winRate: number;
    hotStreak: number;
    bestStreak: number;
    worstStreak: number;
  };
  narratives: Narrative[];
  emotionalState: EmotionalState;
  speechPatterns: SpeechPatterns;
};

/**
 * Canonical type guard to check if a memory object has enhanced fields.
 * Use this instead of ad-hoc checks like `'personality' in mem`.
 */
export function isEnhancedMemory(mem: BotMemory): mem is EnhancedBotMemory {
  return (
    mem.personality !== undefined &&
    mem.predictionStats !== undefined &&
    mem.narratives !== undefined &&
    mem.emotionalState !== undefined &&
    mem.speechPatterns !== undefined
  );
}

/**
 * @deprecated Use isEnhancedMemory() instead. This alias exists for backwards compatibility.
 */
export function hasNormalizedMemory(mem: BotMemory): mem is EnhancedBotMemory {
  return isEnhancedMemory(mem);
}

/**
 * Default values for enhanced memory fields.
 * Used by memory creation to ensure all fields exist.
 */
export const DEFAULT_PERSONALITY_TRAITS: PersonalityTraits = {
  confidence: 50,
  optimism: 50,
  loyalty: 50,
  analyticalTrust: 50,
  grudgeLevel: 30,
  riskTolerance: 50,
  volatility: 40,
  contrarianism: 40,
  nostalgia: 30,
  pettiness: 20,
  patience: 50,
  superstition: 20,
  competitiveness: 50,
  underdogAffinity: 50,
  dramaAppreciation: 50,
};

export const DEFAULT_PREDICTION_STATS = {
  correct: 0,
  wrong: 0,
  winRate: 0.5,
  hotStreak: 0,
  bestStreak: 0,
  worstStreak: 0,
};

export const DEFAULT_SPEECH_PATTERNS: SpeechPatterns = {
  emergingPhrases: [],
  catchphrases: [],
  verbalTics: [],
  obsessions: [],
  avoidTopics: [],
  signatureReactions: [],
};

export const DEFAULT_PERSONAL_GROWTH: PersonalGrowth = {
  hardLessons: [],
  recognizedBiases: [],
  improvements: [],
  blindSpots: [],
};

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
  // Playoff bracket label (e.g., "🏆 Championship", "🥉 3rd Place Game", "🚽 Toilet Bowl")
  bracketLabel?: string;
  // Dialogue format - array of back-and-forth exchanges
  dialogue?: Array<{
    speaker: 'entertainer' | 'analyst';
    text: string;
  }>;
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
