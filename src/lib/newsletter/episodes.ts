/**
 * Episode Configuration and Season Management
 * Handles special episode types and season-to-season transitions
 */

import type { EpisodeType, EpisodeConfig, PhaseRules } from './types';
import { IMPORTANT_DATES } from '@/lib/constants/league';

// ============ League Calendar Constants ============

export const LEAGUE_CALENDAR = {
  REGULAR_SEASON_START: 1,
  REGULAR_SEASON_END: 14,
  TRADE_DEADLINE_WEEK: 12,
  PLAYOFFS_START: 15,
  PLAYOFFS_END: 17,
  CHAMPIONSHIP_WEEK: 17,
  TOTAL_WEEKS: 17,
} as const;

// ============ Episode Timing ============

/**
 * Episode timing windows - when each special episode should be generated
 * All dates are relative to key events in the league calendar
 */
export interface EpisodeWindow {
  type: EpisodeType;
  name: string;
  description: string;
  /** Function to check if we're in this episode's window */
  isActive: (now: Date, season: number) => boolean;
  /** Suggested generation date */
  suggestedDate?: (season: number) => Date;
}

/**
 * Get the episode windows for a given season
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getEpisodeWindows(_season: number): EpisodeWindow[] {
  // Calculate dates based on IMPORTANT_DATES
  const draftDate = IMPORTANT_DATES.NEXT_DRAFT;
  const week1Start = IMPORTANT_DATES.NFL_WEEK_1_START;
  
  // Pre-draft: 1 week before draft
  const preDraftStart = new Date(draftDate);
  preDraftStart.setDate(preDraftStart.getDate() - 7);
  
  // Post-draft: 1 day after draft to 1 week after
  const postDraftStart = new Date(draftDate);
  postDraftStart.setDate(postDraftStart.getDate() + 1);
  const postDraftEnd = new Date(draftDate);
  postDraftEnd.setDate(postDraftEnd.getDate() + 7);
  
  // Preseason: 1 week before Week 1
  const preseasonStart = new Date(week1Start);
  preseasonStart.setDate(preseasonStart.getDate() - 7);
  
  return [
    {
      type: 'pre_draft',
      name: 'Pre-Draft Preview',
      description: 'Rookie draft preview - 1 week before the draft',
      isActive: (now) => now >= preDraftStart && now < draftDate,
      suggestedDate: () => preDraftStart,
    },
    {
      type: 'post_draft',
      name: 'Post-Draft Grades',
      description: 'Draft grades and analysis - 1 week after the draft',
      isActive: (now) => now >= postDraftStart && now < postDraftEnd,
      suggestedDate: () => postDraftStart,
    },
    {
      type: 'preseason',
      name: 'Preseason Preview',
      description: 'Season preview - 1 week before Week 1',
      isActive: (now) => now >= preseasonStart && now < week1Start,
      suggestedDate: () => preseasonStart,
    },
    {
      type: 'offseason',
      name: 'Offseason Update',
      description: 'General offseason news and updates',
      isActive: (now) => {
        // Offseason is after championship and before preseason
        const championshipEnd = new Date(week1Start);
        championshipEnd.setFullYear(championshipEnd.getFullYear() - 1);
        championshipEnd.setMonth(11); // December
        championshipEnd.setDate(25); // Approx end of fantasy season
        return now > championshipEnd && now < preDraftStart;
      },
      suggestedDate: () => new Date(), // Anytime during offseason
    },
  ];
}

/**
 * Suggests the appropriate episode type based on current date
 */
export function suggestEpisodeType(now: Date = new Date(), season: number): EpisodeType | null {
  const windows = getEpisodeWindows(season);
  
  for (const window of windows) {
    if (window.isActive(now, season)) {
      return window.type;
    }
  }
  
  return null; // No special episode suggested - use regular weekly
}

/**
 * Get upcoming special episodes with their suggested dates
 */
export function getUpcomingEpisodes(season: number): Array<{ type: EpisodeType; name: string; suggestedDate: Date }> {
  const windows = getEpisodeWindows(season);
  const now = new Date();
  
  return windows
    .filter(w => w.suggestedDate && w.suggestedDate(season) > now)
    .map(w => ({
      type: w.type,
      name: w.name,
      suggestedDate: w.suggestedDate!(season),
    }))
    .sort((a, b) => a.suggestedDate.getTime() - b.suggestedDate.getTime());
}

// ============ Episode Detection ============

/**
 * Determines the episode type based on week and season context
 */
export function detectEpisodeType(
  week: number,
  seasonType: 'pre' | 'regular' | 'post' | 'off',
  options?: {
    isTradeDeadlineWeek?: boolean;
    isPlayoffTeam?: boolean;
    forceType?: EpisodeType;
  }
): EpisodeType {
  // Allow forcing a specific type
  if (options?.forceType) return options.forceType;

  // Offseason
  if (seasonType === 'off') {
    return 'offseason';
  }

  // Preseason (before Week 1 games)
  if (seasonType === 'pre' || week === 0) {
    return 'preseason';
  }

  // Trade deadline special (Week 12 or when deadline passes)
  if (options?.isTradeDeadlineWeek || week === LEAGUE_CALENDAR.TRADE_DEADLINE_WEEK) {
    return 'trade_deadline';
  }

  // Week before playoffs
  if (week === LEAGUE_CALENDAR.PLAYOFFS_START - 1) {
    return 'playoffs_preview';
  }

  // Championship week
  if (week === LEAGUE_CALENDAR.CHAMPIONSHIP_WEEK) {
    return 'championship';
  }

  // Playoff rounds
  if (week >= LEAGUE_CALENDAR.PLAYOFFS_START && week <= LEAGUE_CALENDAR.PLAYOFFS_END) {
    return 'playoffs_round';
  }

  // Post-championship (season finale)
  if (seasonType === 'post' || week > LEAGUE_CALENDAR.CHAMPIONSHIP_WEEK) {
    return 'season_finale';
  }

  // Default: regular weekly episode
  return 'regular';
}

/**
 * Get episode configuration with titles and special sections
 */
export function getEpisodeConfig(
  type: EpisodeType,
  week: number,
  season: number
): EpisodeConfig {
  const configs: Record<EpisodeType, Omit<EpisodeConfig, 'type'>> = {
    // ============ REGULAR SEASON ============
    regular: {
      title: `Week ${week} Recap`,
      subtitle: `${season} Season`,
      specialSections: [],
      excludeSections: [],
      tone: 'serious',
      // Standard weekly recap: Intro, Callbacks, MatchupRecaps, Waivers, Trades, Spotlight, Forecast, FinalWord
    },

    // ============ DRAFT EPISODES ============
    pre_draft: {
      title: 'Draft Preview',
      subtitle: `${season} Rookie Draft`,
      specialSections: ['MockDraft', 'Trades'],
      excludeSections: ['MatchupRecaps', 'Forecast', 'Callbacks', 'WaiversAndFA', 'SpotlightTeam', 'Blurt'],
      tone: 'hype',
      // Structure: Intro → Offseason Trades → Mock Draft (Rds 1-2, pick-by-pick) → FinalWord
    },
    post_draft: {
      title: 'Draft Grades',
      subtitle: `${season} Rookie Draft Recap`,
      specialSections: ['DraftGrades', 'DraftWinners', 'DraftLosers'],
      excludeSections: ['MatchupRecaps', 'Forecast', 'Callbacks', 'WaiversAndFA', 'SpotlightTeam'],
      tone: 'serious',
      // Content: Grade each team's draft, best picks, worst picks, steals, reaches
      // Trades section stays - draft day trades are relevant
    },

    // ============ PRESEASON ============
    preseason: {
      title: 'Season Preview',
      subtitle: `${season} Season Kickoff`,
      specialSections: ['PowerRankings', 'SeasonPreview', 'Week1Preview'],
      excludeSections: ['MatchupRecaps', 'Callbacks', 'WaiversAndFA', 'SpotlightTeam'],
      tone: 'hype',
      // Content: Power rankings, contenders/sleepers/busts, bold predictions, Week 1 matchup preview
      // Forecast NOT excluded - we want Week 1 predictions
      // Trades section stays - offseason trades are relevant context
    },

    // ============ TRADE DEADLINE ============
    trade_deadline: {
      title: 'Trade Deadline Special',
      subtitle: `Week ${week} - The Dust Settles`,
      specialSections: ['TradeDeadline', 'PlayoffPicture', 'BuyersSellers'],
      excludeSections: ['WaiversAndFA'], // Focus on trades, not waivers
      tone: 'serious',
      // Content: All deadline trades, winners/losers, playoff picture impact
      // Matchups, Forecast, Spotlight all stay - it's still a game week
    },

    // ============ PLAYOFFS ============
    playoffs_preview: {
      title: 'Playoff Preview',
      subtitle: `Week ${week} - The Road to Glory`,
      specialSections: ['PlayoffBracket', 'PlayoffPowerRankings', 'DarkHorses'],
      excludeSections: ['WaiversAndFA'], // Playoffs focus, not waiver wire
      tone: 'hype',
      // Content: Playoff bracket, team breakdowns, predictions for each matchup
      // This is the week BEFORE playoffs start
    },
    playoffs_round: {
      title: week === LEAGUE_CALENDAR.PLAYOFFS_START 
        ? 'Wild Card Round' 
        : week === LEAGUE_CALENDAR.PLAYOFFS_START + 1 
          ? 'Semifinals' 
          : 'Championship Week',
      subtitle: `Week ${week} Playoffs`,
      specialSections: ['PlayoffBracket', 'EliminationWatch'],
      excludeSections: ['WaiversAndFA'], // No waivers during playoffs
      tone: 'serious',
      // Content: Playoff matchup recaps, bracket update, next round preview
      // Forecast stays for next round predictions (unless championship)
    },

    // ============ CHAMPIONSHIP & FINALE ============
    championship: {
      title: 'Championship Edition',
      subtitle: `${season} Season Finale`,
      specialSections: ['ChampionshipRecap', 'SeasonAwards', 'FinalStandings'],
      excludeSections: ['Forecast', 'WaiversAndFA', 'Callbacks'],
      tone: 'celebratory',
      // Content: Champion crowned, final score, MVP, season awards, dynasty implications
    },
    season_finale: {
      title: 'Season Wrap-Up',
      subtitle: `${season} Season in Review`,
      specialSections: ['SeasonAwards', 'FinalStandings', 'OffseasonOutlook'],
      excludeSections: ['Forecast', 'WaiversAndFA', 'Callbacks', 'MatchupRecaps'],
      tone: 'nostalgic',
      // Content: Full season recap, awards, looking ahead to next year
      // Use this AFTER championship for a separate wrap-up episode
    },

    // ============ OFFSEASON ============
    offseason: {
      title: 'Offseason Update',
      subtitle: `${season} Offseason`,
      specialSections: ['OffseasonMoves', 'RosterChanges'],
      excludeSections: ['MatchupRecaps', 'Forecast', 'Callbacks', 'SpotlightTeam'],
      tone: 'serious',
      // Content: Trades, FA signings, roster moves, league news
      // Generic offseason episode for news between major events
    },
  };

  return {
    type,
    ...configs[type],
  };
}

// ============ Season Transition Logic ============

/**
 * Determines the current season based on date and NFL state
 */
export function getCurrentSeason(nflState: { season: string; season_type: string }): number {
  return parseInt(nflState.season, 10);
}

/**
 * Gets the league ID for a given season
 * Uses the centralized LEAGUE_IDS from constants
 * 
 * To add a new season:
 * 1. When Sleeper creates the new league, get the league ID from the URL
 * 2. Update LEAGUE_IDS in src/lib/constants/league.ts:
 *    - Set CURRENT to the new league ID
 *    - Move the old CURRENT to PREVIOUS with its year as key
 * 3. Update IMPORTANT_DATES for the new season
 * 4. Update CHAMPIONS with the new year placeholder
 */
export function getLeagueIdForSeason(season: number): string | null {
  // Import dynamically to avoid circular dependencies
  // The actual IDs are in src/lib/constants/league.ts
  const LEAGUE_IDS: Record<number, string> = {
    2023: '991521604930772992',    // Inaugural season
    2024: '1116504942988107776',   // Second season
    2025: '1205237529570193408',   // Third season (current)
    // 2026: 'TBD', // Will be added when league is created on Sleeper
  };

  return LEAGUE_IDS[season] || null;
}

/**
 * Checks if we need to transition to a new season
 * Returns the new season number if transition is needed, null otherwise
 */
export function checkSeasonTransition(
  currentDbSeason: number,
  nflSeason: number,
  nflSeasonType: string
): { needsTransition: boolean; newSeason?: number; reason?: string } {
  // If NFL is in a new season and we haven't transitioned yet
  if (nflSeason > currentDbSeason) {
    return {
      needsTransition: true,
      newSeason: nflSeason,
      reason: `NFL season ${nflSeason} started, database is on ${currentDbSeason}`,
    };
  }

  // If we're in preseason of a new year
  if (nflSeasonType === 'pre' && nflSeason > currentDbSeason) {
    return {
      needsTransition: true,
      newSeason: nflSeason,
      reason: `Preseason ${nflSeason} detected`,
    };
  }

  return { needsTransition: false };
}

/**
 * Initializes bot memory for a new season
 * Carries over some context from previous season
 */
export function initializeSeasonMemory(
  previousSeasonMemory: unknown | null,
  newSeason: number
): {
  entertainer: { season: number; isNew: true; carryOver?: string };
  analyst: { season: number; isNew: true; carryOver?: string };
} {
  // For now, start fresh each season
  // In the future, we could carry over narratives like "defending champion" etc.
  
  let carryOver: string | undefined;
  
  if (previousSeasonMemory) {
    // Could extract things like:
    // - Who was champion
    // - Notable rivalries
    // - Bot prediction records
    carryOver = 'Previous season context available';
  }

  return {
    entertainer: { season: newSeason, isNew: true, carryOver },
    analyst: { season: newSeason, isNew: true, carryOver },
  };
}

// ============ Week Validation ============

/**
 * Validates and clamps week number for a given season context
 */
export function validateWeek(
  week: number,
  seasonType: 'pre' | 'regular' | 'post' | 'off'
): { valid: boolean; clampedWeek: number; message?: string } {
  if (seasonType === 'pre' || seasonType === 'off') {
    return {
      valid: week === 0,
      clampedWeek: 0,
      message: 'Offseason/preseason - using week 0',
    };
  }

  if (week < 1) {
    return {
      valid: false,
      clampedWeek: 1,
      message: `Week ${week} is invalid, using week 1`,
    };
  }

  if (week > LEAGUE_CALENDAR.TOTAL_WEEKS) {
    return {
      valid: false,
      clampedWeek: LEAGUE_CALENDAR.TOTAL_WEEKS,
      message: `Week ${week} exceeds season, using week ${LEAGUE_CALENDAR.TOTAL_WEEKS}`,
    };
  }

  return { valid: true, clampedWeek: week };
}

// ============ Episode Title Helpers ============

/**
 * Generates a dynamic episode title based on context
 */
export function generateEpisodeTitle(
  type: EpisodeType,
  week: number,
  context?: {
    champion?: string;
    topStory?: string;
    isRivalryWeek?: boolean;
  }
): string {
  switch (type) {
    case 'preseason':
      return 'The Calm Before the Storm';
    case 'trade_deadline':
      return 'Deadline Day: Who Blinked?';
    case 'playoffs_preview':
      return 'The Road to Glory Begins';
    case 'playoffs_round':
      if (week === LEAGUE_CALENDAR.PLAYOFFS_START) return 'Wild Card Weekend';
      if (week === LEAGUE_CALENDAR.PLAYOFFS_START + 1) return 'Semifinal Showdowns';
      return 'Championship Sunday';
    case 'championship':
      return context?.champion 
        ? `${context.champion} Claims the Crown` 
        : 'A Champion is Crowned';
    case 'season_finale':
      return 'That\'s a Wrap';
    case 'offseason':
      return 'Offseason Moves';
    default:
      if (context?.topStory) return context.topStory;
      if (context?.isRivalryWeek) return 'Rivalry Week';
      return `Week ${week}: The Grind Continues`;
  }
}

// ============ Phase 2: Phase Behavior Rules ============

/**
 * Per-phase behavioral directives.
 * Expands the existing episode style system from "how" into "what and why."
 * Does NOT replace EPISODE_STYLE_MODIFIERS or episode section configs.
 */
const PHASE_RULES: Record<EpisodeType, PhaseRules> = {
  regular: {
    phase: 'regular',
    name: 'Regular Season',
    priorities: ['matchup results', 'standings implications', 'fraud-watch on overrated teams'],
    avoidances: ['premature playoff clinch talk before Week 10', 'overly long takes on low-stakes games'],
    preferredStances: ['Town Crier', 'Prosecutor', 'Defense Attorney'],
    historicalDepth: 4,
    ruleAwareness: 3,
    speculationLevel: 6,
    comedyCeiling: 8,
    highlightSections: ['MatchupRecaps', 'Forecast', 'SpotlightTeam'],
  },
  preseason: {
    phase: 'preseason',
    name: 'Preseason Preview',
    priorities: ['roster construction grades', 'draft capital valuations', 'sleeper identification'],
    avoidances: ['definitive statements about teams with no in-season data', 'overconfident win projections'],
    preferredStances: ['Hype Man', 'Sicko Scout', 'Accountant'],
    historicalDepth: 6,
    ruleAwareness: 6,
    speculationLevel: 9,
    comedyCeiling: 7,
    highlightSections: ['PowerRankings', 'SeasonPreview'],
  },
  pre_draft: {
    phase: 'pre_draft',
    name: 'Draft Preview',
    priorities: ['prospect rankings', 'team roster holes', 'pick slot value'],
    avoidances: ['making definitive rookie projections without NFL data', 'dwelling on past seasons'],
    preferredStances: ['Sicko Scout', 'Accountant', 'Hype Man'],
    historicalDepth: 3,
    ruleAwareness: 8,
    speculationLevel: 9,
    comedyCeiling: 6,
    highlightSections: ['MockDraft'],
  },
  post_draft: {
    phase: 'post_draft',
    name: 'Draft Grades',
    priorities: ['draft pick grades', 'value assessment', 'dynasty window shifts'],
    avoidances: ['premature bust/star labels on rookies who haven\'t played yet'],
    preferredStances: ['Accountant', 'Historian', 'Prosecutor'],
    historicalDepth: 5,
    ruleAwareness: 7,
    speculationLevel: 7,
    comedyCeiling: 6,
    highlightSections: ['DraftGrades'],
  },
  trade_deadline: {
    phase: 'trade_deadline',
    name: 'Trade Deadline',
    priorities: ['deadline trades', 'playoff picture impact', 'buyers vs sellers'],
    avoidances: ['waiver wire minutiae during deadline week — trades are the story'],
    preferredStances: ['Accountant', 'Prosecutor', 'Town Crier'],
    historicalDepth: 4,
    ruleAwareness: 5,
    speculationLevel: 7,
    comedyCeiling: 7,
    highlightSections: ['Trades', 'SpotlightTeam'],
  },
  playoffs_preview: {
    phase: 'playoffs_preview',
    name: 'Playoff Preview',
    priorities: ['playoff seeding', 'first-round matchups', 'bracket analysis'],
    avoidances: ['dismissing any playoff team as unworthy — they earned it'],
    preferredStances: ['Historian', 'Prosecutor', 'Town Crier'],
    historicalDepth: 7,
    ruleAwareness: 5,
    speculationLevel: 8,
    comedyCeiling: 6,
    highlightSections: ['Forecast', 'SpotlightTeam'],
  },
  playoffs_round: {
    phase: 'playoffs_round',
    name: 'Playoffs',
    priorities: ['elimination stakes', 'who-advances analysis', 'season legacy building'],
    avoidances: ['casual dismissiveness — this is do-or-die', 'premature dynasty crowning'],
    preferredStances: ['Historian', 'Prosecutor', 'Rivalry Arsonist'],
    historicalDepth: 8,
    ruleAwareness: 4,
    speculationLevel: 6,
    comedyCeiling: 5,
    highlightSections: ['MatchupRecaps', 'Forecast'],
  },
  championship: {
    phase: 'championship',
    name: 'Championship',
    priorities: ['champion coronation', 'season legacy', 'who fell short and why'],
    avoidances: ['trivializing the moment', 'off-topic takes that dilute the championship story'],
    preferredStances: ['Historian', 'Hype Man', 'Undertaker'],
    historicalDepth: 10,
    ruleAwareness: 3,
    speculationLevel: 4,
    comedyCeiling: 4,
    highlightSections: ['MatchupRecaps', 'FinalWord'],
  },
  season_finale: {
    phase: 'season_finale',
    name: 'Season Wrap-Up',
    priorities: ['season awards', 'franchise arcs', 'offseason outlook'],
    avoidances: ['relitigating losses — forward-looking now'],
    preferredStances: ['Historian', 'Accountant', 'Undertaker'],
    historicalDepth: 9,
    ruleAwareness: 3,
    speculationLevel: 7,
    comedyCeiling: 6,
    highlightSections: ['FinalWord'],
  },
  offseason: {
    phase: 'offseason',
    name: 'Offseason',
    priorities: ['rebuilds and retooling', 'trade philosophy', 'dynasty arcs'],
    avoidances: ['pretending games matter when none are being played', 'overconfident win projections'],
    preferredStances: ['Historian', 'Sicko Scout', 'Accountant'],
    historicalDepth: 8,
    ruleAwareness: 4,
    speculationLevel: 8,
    comedyCeiling: 7,
    highlightSections: ['Trades'],
  },
};

/**
 * Returns the phase behavior rules for a given episode type.
 * Falls back to 'regular' for unknown types.
 */
export function getPhaseRules(episodeType: string): PhaseRules {
  return PHASE_RULES[episodeType as EpisodeType] ?? PHASE_RULES.regular;
}

/**
 * Build a compact phase-rules context block for prompt injection.
 * Returns 3-5 lines; goes at the end of the Phase 1/2 addendum block.
 */
export function buildPhaseRulesContext(rules: PhaseRules): string {
  const lines: string[] = [
    `PHASE: ${rules.name}.`,
    `Priority this week: ${rules.priorities.slice(0, 2).join('; ')}.`,
    `Avoid: ${rules.avoidances[0]}.`,
  ];

  if (rules.comedyCeiling <= 4) {
    lines.push(`Comedy ceiling: restrained — this phase calls for gravitas.`);
  } else if (rules.comedyCeiling >= 8) {
    lines.push(`Comedy ceiling: high — lean into entertainment value.`);
  }

  if (rules.historicalDepth >= 8) {
    lines.push(`Historical depth: high — callbacks and precedent are valuable this phase.`);
  }

  return `\n${lines.join('\n')}`;
}
