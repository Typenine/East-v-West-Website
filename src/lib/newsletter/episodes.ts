/**
 * Episode Configuration and Season Management
 * Handles special episode types and season-to-season transitions
 */

import type { EpisodeType, EpisodeConfig } from './types';

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
    regular: {
      title: `Week ${week} Recap`,
      subtitle: `${season} Season`,
      specialSections: [],
      excludeSections: [],
      tone: 'serious',
    },
    pre_draft: {
      title: 'Draft Preview',
      subtitle: `${season} Rookie Draft`,
      specialSections: ['DraftPreview'],
      excludeSections: ['MatchupRecaps', 'Forecast', 'Callbacks', 'WaiversAndFA'],
      tone: 'hype',
    },
    post_draft: {
      title: 'Draft Grades',
      subtitle: `${season} Rookie Draft Recap`,
      specialSections: ['DraftGrades'],
      excludeSections: ['MatchupRecaps', 'Forecast', 'Callbacks', 'WaiversAndFA'],
      tone: 'serious',
    },
    preseason: {
      title: 'Season Preview',
      subtitle: `${season} Season Kickoff`,
      specialSections: ['SeasonPreview', 'PowerRankings'],
      excludeSections: ['MatchupRecaps', 'Callbacks', 'WaiversAndFA', 'Trades'],
      tone: 'hype',
    },
    trade_deadline: {
      title: 'Trade Deadline Special',
      subtitle: `Week ${week} - The Dust Settles`,
      specialSections: ['TradeDeadline', 'PlayoffPicture'],
      excludeSections: [],
      tone: 'serious',
    },
    playoffs_preview: {
      title: 'Playoff Preview',
      subtitle: `Week ${week} - The Road to Glory`,
      specialSections: ['PlayoffPicture', 'PowerRankings'],
      excludeSections: [],
      tone: 'hype',
    },
    playoffs_round: {
      title: week === LEAGUE_CALENDAR.PLAYOFFS_START 
        ? 'Wild Card Round' 
        : week === LEAGUE_CALENDAR.PLAYOFFS_START + 1 
          ? 'Semifinals' 
          : 'Championship Week',
      subtitle: `Week ${week} Playoffs`,
      specialSections: ['PlayoffPicture'],
      excludeSections: ['Forecast'], // No forecasting during playoffs (bracket is set)
      tone: 'serious',
    },
    championship: {
      title: 'Championship Edition',
      subtitle: `${season} Season Finale`,
      specialSections: ['ChampionshipRecap', 'SeasonAwards'],
      excludeSections: ['Forecast'],
      tone: 'celebratory',
    },
    season_finale: {
      title: 'Season Wrap-Up',
      subtitle: `${season} Season in Review`,
      specialSections: ['SeasonAwards', 'ChampionshipRecap'],
      excludeSections: ['Forecast', 'WaiversAndFA'],
      tone: 'nostalgic',
    },
    offseason: {
      title: 'Offseason Update',
      subtitle: `${season} Offseason`,
      specialSections: [],
      excludeSections: ['MatchupRecaps', 'Forecast', 'Callbacks'],
      tone: 'serious',
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
