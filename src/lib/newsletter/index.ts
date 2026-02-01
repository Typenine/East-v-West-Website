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
export { buildDerived, mapUsersById, mapRosters, setPlayerNameCache, resolvePlayerName } from './derive';
export { getProfile, openerFor, makeBlurt, getTonePhrase, determineOutcome } from './personality';
export { createFreshMemory, ensureTeams, updateMemoryAfterWeek, serializeMemory, deserializeMemory, ensureEnhancedTeams, updateEnhancedMemoryAfterWeek, upgradeToEnhancedMemory } from './memory';
// Note: recaps.ts contains legacy template-based recaps, now replaced by LLM-powered recaps in compose.ts
// export { buildDeepRecaps, generateSingleRecap } from './recaps';
export { makeForecast, gradePendingPicks } from './forecast';
export { 
  generateAllLLMFeatures,
  generateBotDebates,
  generateHotTakes,
  generateWeeklyAwards,
  generateWhatIfScenarios,
  generateDynastyAnalysis,
  detectRivalries,
  generatePlayoffOddsCommentary,
  generateNarrativeCallbacks,
} from './llm-features';
export { composeNewsletter } from './compose';
export { renderHtml, renderNewsletterData } from './template';

// League Knowledge (Tier 1 - Static)
export {
  LEAGUE_IDENTITY,
  CHAMPIONS,
  TEAM_FACTS,
  CHAMPIONSHIP_MEETINGS,
  LEAGUE_RECORDS,
  LEAGUE_RULES,
  getTeamFacts,
  getChampionshipMeetings,
  isDefendingChampion,
  buildStaticLeagueContext,
} from './league-knowledge';

// Context Builder (Tier 2 & 3)
export {
  buildFullContext,
  buildLiveContextFromDerived,
  type LiveContext,
  type LiveMatchupContext,
  type LiveStandingsContext,
  type FullContext,
} from './context-builder';

// Enhanced Context (All 8 improvements)
export {
  // Memory helpers
  createEnhancedMemory,
  recordPrediction,
  gradePrediction,
  recordHotTake,
  gradeHotTake,
  addNarrative,
  resolveNarrative,
  serializeEnhancedMemory,
  deserializeEnhancedMemory,
  // Context builders
  buildH2HContext,
  buildTradeContext,
  calculatePlayoffImplications,
  checkForRecords,
  trackDisagreement,
  resolveDisagreement,
  detectBreakouts,
  buildEnhancedContextString,
  // Types
  type H2HMatchupHistory,
  type TradeContext,
  type LeagueRecords,
  type PlayoffImplications,
  type BotDisagreement,
  type PlayerBreakout,
  type PreviousPrediction,
  type EnhancedContextData,
} from './enhanced-context';

// Generator
export { generateNewsletter, type GenerateNewsletterInput, type GenerateNewsletterResult } from './generator';

// Episodes and Season Management
export {
  LEAGUE_CALENDAR,
  detectEpisodeType,
  getEpisodeConfig,
  getCurrentSeason,
  getLeagueIdForSeason,
  checkSeasonTransition,
  initializeSeasonMemory,
  validateWeek,
  generateEpisodeTitle,
  getEpisodeWindows,
  suggestEpisodeType,
  getUpcomingEpisodes,
  type EpisodeWindow,
} from './episodes';

// Comprehensive Data Integration
export {
  fetchComprehensiveLeagueData,
  buildComprehensiveContextString,
  buildTeamContextString,
  buildMatchupH2HContext,
  // Current week context (standings, streaks, transactions, playoff implications)
  fetchCurrentWeekContext,
  buildCurrentStandingsContext,
  buildTransactionsContext,
  getLeagueRulesContext,
  // Additional data source context builders
  buildTeamMatchupHistoryContext,
  buildDraftHistoryContext,
  buildTradeBlockContext,
  buildTaxiSquadContext,
  buildRosterNewsContext,
  buildDefenseStrengthContext,
  buildPlayerGameLogsContext,
  // External API integration (ESPN, Sleeper trending, etc.)
  fetchAllExternalData,
  buildExternalDataContext,
  fetchSleeperTrending,
  fetchESPNInjuries,
  fetchESPNNews,
  fetchESPNScoreboard,
  type TeamProfile,
  type LeagueRecords as ComprehensiveLeagueRecords,
  type ComprehensiveLeagueData,
  type CurrentWeekContext,
  type CurrentSeasonTeamData,
  type PlayoffImplications as CurrentPlayoffImplications,
  type ExternalDataBundle,
  type ExternalNewsItem,
  type ExternalInjuryReport,
  type TrendingPlayer,
} from './data-integration';
