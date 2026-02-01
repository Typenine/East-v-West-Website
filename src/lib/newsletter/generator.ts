/**
 * Newsletter Generator
 * High-level function that orchestrates the entire newsletter generation process
 */

import type { Newsletter, BotMemory, ForecastData } from './types';
import { buildDerived } from './derive';
import { createEnhancedMemory, ensureEnhancedTeams, updateEnhancedMemoryAfterWeek, upgradeToEnhancedMemory } from './memory';
import { isEnhancedMemory } from './types';
import { makeForecast, gradePendingPicks, type ForecastRecords } from './forecast';
import { composeNewsletter } from './compose';
import { renderHtml } from './template';

// ============ Types ============

interface SleeperUser {
  user_id: string;
  display_name?: string;
  username?: string;
  metadata?: { team_name?: string };
}

interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  players?: string[];
}

interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points?: number;
}

interface SleeperTransaction {
  transaction_id?: string;
  type: 'trade' | 'waiver' | 'free_agent';
  leg?: number;
  roster_ids?: number[];
  roster_id?: number;
  adds?: Record<string, number>;
  drops?: Record<string, number>;
  draft_picks?: unknown[];
  waiver_bid?: number;
}

// Enhanced context for richer LLM generation
interface TeamStanding {
  name: string;
  wins: number;
  losses: number;
  pointsFor: number;
}

interface EnhancedContext {
  standings?: TeamStanding[];
  topScorers?: Array<{ team: string; player: string; points: number }>;
  previousPredictions?: { entertainer: string[]; analyst: string[] };
  byeTeams?: string[]; // NFL teams on bye
  // NEW: Full enhanced context string with all 8 improvements
  enhancedContextString?: string;
  // For LLM features
  h2hData?: Record<string, Record<string, { wins: number; losses: number }>>;
  topPlayers?: Array<{ playerId: string; playerName: string; team: string; position: string; points: number }>;
  injuries?: Array<{ playerId: string; playerName: string; team: string; status: string }>;
}

export interface GenerateNewsletterInput {
  leagueName: string;
  leagueId: string;
  season: number;
  week: number;
  episodeType?: string; // Episode type for special newsletters (pre_draft, post_draft, preseason, etc.)
  playoffStartWeek?: number; // Week playoffs start (default 15) for bracket labeling
  users: SleeperUser[];
  rosters: SleeperRoster[];
  matchups: SleeperMatchup[];
  nextMatchups?: SleeperMatchup[];
  transactions: SleeperTransaction[];
  // Optional: existing memory state (load from DB)
  // Accepts BotMemory for personality evolution
  existingMemoryEntertainer?: BotMemory | null;
  existingMemoryAnalyst?: BotMemory | null;
  // Optional: existing forecast records
  existingRecords?: ForecastRecords | null;
  // Optional: pending picks from last week to grade
  pendingPicks?: {
    week: number;
    picks: Array<{
      matchup_id: string | number;
      entertainer_pick: string;
      analyst_pick: string;
    }>;
  } | null;
  // Optional: enhanced context for richer LLM generation
  enhancedContext?: EnhancedContext;
  // Optional: previous predictions for narrative callbacks
  previousPredictions?: Array<{
    matchupId: string | number;
    team1: string;
    team2: string;
    entertainerPick: string;
    analystPick: string;
  }>;
}

export interface GenerateNewsletterResult {
  newsletter: Newsletter;
  html: string;
  // Updated state to persist
  memoryEntertainer: BotMemory;
  memoryAnalyst: BotMemory;
  records: ForecastRecords;
  pendingPicks: {
    week: number;
    picks: Array<{
      matchup_id: string | number;
      entertainer_pick: string;
      analyst_pick: string;
    }>;
  };
  // True if compose failed but memory was still updated
  composeFailed?: boolean;
  // True if any section fell back to a degraded path (safeSection fallback)
  fallbackUsed?: boolean;
  // Names of sections that used fallbacks
  fallbackSections?: string[];
}

// ============ Main Generator ============

export async function generateNewsletter(
  input: GenerateNewsletterInput
): Promise<GenerateNewsletterResult> {
  const {
    leagueName,
    season,
    week,
    episodeType = 'regular',
    users,
    rosters,
    matchups,
    nextMatchups,
    transactions,
    existingMemoryEntertainer,
    existingMemoryAnalyst,
    existingRecords,
    pendingPicks,
  } = input;

  // Get playoff start week (default 15)
  const playoffStartWeek = input.playoffStartWeek || 15;
  
  // 1. Build derived data from raw Sleeper data
  // Pass bracket context for playoff labeling during playoff weeks
  const derived = buildDerived({
    users,
    rosters,
    matchups,
    nextMatchups,
    transactions,
    bracketContext: week >= playoffStartWeek ? {
      week,
      playoffStartWeek,
      bracketGames: [], // Bracket games are derived from matchup_id mapping
    } : undefined,
  });

  // 2. Get team names for memory initialization
  // For preseason/special episodes, get team names from users since there are no matchups
  let teamNames: string[];
  if (derived.matchup_pairs.length > 0) {
    teamNames = derived.matchup_pairs.flatMap(p => [p.winner.name, p.loser.name]);
  } else {
    // Fallback to user data for preseason episodes
    teamNames = users.map(u => u.metadata?.team_name || u.display_name || u.username || `User ${u.user_id}`);
  }
  const uniqueTeamNames = Array.from(new Set(teamNames));

  // 3. Initialize or load memory - always use enhanced memory
  // If existing memory lacks enhanced fields, upgrade it in-place
  let memEntertainer: BotMemory;
  if (existingMemoryEntertainer) {
    memEntertainer = isEnhancedMemory(existingMemoryEntertainer)
      ? existingMemoryEntertainer
      : upgradeToEnhancedMemory(existingMemoryEntertainer, season);
  } else {
    memEntertainer = createEnhancedMemory('entertainer', season);
  }

  let memAnalyst: BotMemory;
  if (existingMemoryAnalyst) {
    memAnalyst = isEnhancedMemory(existingMemoryAnalyst)
      ? existingMemoryAnalyst
      : upgradeToEnhancedMemory(existingMemoryAnalyst, season);
  } else {
    memAnalyst = createEnhancedMemory('analyst', season);
  }

  // Ensure all teams exist in memory (with enhanced fields)
  ensureEnhancedTeams(memEntertainer, uniqueTeamNames);
  ensureEnhancedTeams(memAnalyst, uniqueTeamNames);

  // 4. Update memory based on this week's results (enhanced update with streaks, trajectories)
  updateEnhancedMemoryAfterWeek(memEntertainer, derived, week);
  updateEnhancedMemoryAfterWeek(memAnalyst, derived, week);

  // 5. Initialize or load forecast records
  let records: ForecastRecords = existingRecords || {
    entertainer: { w: 0, l: 0 },
    analyst: { w: 0, l: 0 },
  };

  // 6. Grade pending picks from last week if available
  if (pendingPicks && pendingPicks.week === week) {
    records = gradePendingPicks(pendingPicks, derived.matchup_pairs, records);
  }

  // 7. Generate forecast for next week (now LLM-powered)
  const nextWeek = week + 1;
  const { forecast, pending: newPending } = await makeForecast({
    upcoming_pairs: derived.upcoming_pairs,
    last_pairs: derived.matchup_pairs,
    memEntertainer,
    memAnalyst,
    nextWeek,
    enhancedContext: input.enhancedContext?.enhancedContextString,
    standings: input.enhancedContext?.standings,
    h2hData: input.enhancedContext?.h2hData,
    topPlayers: input.enhancedContext?.topPlayers,
    injuries: input.enhancedContext?.injuries,
  });

  // Add records to forecast
  const forecastWithRecords: ForecastData = {
    ...forecast,
    records,
  };

  // 8. Compose the newsletter (with error recovery)
  // Convert previous predictions to the format expected by compose
  const formattedPreviousPredictions = input.previousPredictions?.map(p => ({
    week: week - 1,
    pick: `${p.entertainerPick} / ${p.analystPick}`,
    actual: '', // Will be filled in by grading logic
    correct: false, // Will be determined by grading logic
  }));

  let newsletter: Newsletter;
  let html: string;
  let composeFailed = false;
  const qualityReport: { usedFallbacks: string[] } = { usedFallbacks: [] };

  try {
    newsletter = await composeNewsletter({
      leagueName,
      week,
      season,
      episodeType, // Pass episode type for special newsletters
      derived,
      memEntertainer,
      memAnalyst,
      forecast: forecastWithRecords,
      lastCallbacks: null, // Callbacks are built from previousPredictions in compose
      enhancedContext: input.enhancedContext,
      h2hData: input.enhancedContext?.h2hData,
      previousPredictions: formattedPreviousPredictions,
    }, qualityReport);

    // 9. Render to HTML
    html = renderHtml(newsletter);
  } catch (composeError) {
    // Compose failed - create minimal fallback newsletter but still return updated memory
    console.error('[Generator] Newsletter composition failed, creating fallback:', composeError);
    composeFailed = true;
    
    newsletter = {
      meta: {
        leagueName,
        week,
        date: new Date().toLocaleDateString(),
        season,
      },
      sections: [
        {
          type: 'Intro',
          data: {
            bot1_text: 'Newsletter generation encountered an error. Please try again.',
            bot2_text: 'Technical difficulties. Memory and forecasts have been saved.',
          },
        },
      ],
    };
    html = `<html><body><h1>Newsletter Generation Error</h1><p>Week ${week} newsletter failed to generate. Memory has been preserved.</p></body></html>`;
  }

  return {
    newsletter,
    html,
    memoryEntertainer: memEntertainer,
    memoryAnalyst: memAnalyst,
    records,
    pendingPicks: newPending,
    composeFailed, // Signal to caller that compose had issues
    fallbackUsed: qualityReport.usedFallbacks.length > 0,
    fallbackSections: qualityReport.usedFallbacks,
  };
}

// ============ Utility: Generate from API data ============

/**
 * Simplified generator that fetches data from Sleeper API
 * This would be called from an API route
 */
/**
 * @deprecated Use generateNewsletter() with pre-fetched data from the API route.
 * This function is not implemented - all Sleeper API integration happens in the API route.
 */
export async function generateNewsletterFromSleeper(
  _leagueId: string,
  _week: number,
  _existingState?: {
    memoryEntertainer?: BotMemory | null;
    memoryAnalyst?: BotMemory | null;
    records?: ForecastRecords | null;
    pendingPicks?: GenerateNewsletterInput['pendingPicks'];
  }
): Promise<GenerateNewsletterResult> {
  // Sleeper API integration is handled in src/app/api/newsletter/route.ts
  // This function exists for interface compatibility only
  throw new Error(
    'generateNewsletterFromSleeper is deprecated. ' +
    'Use the /api/newsletter route which handles Sleeper API integration.'
  );
}
