/**
 * Newsletter Generator
 * High-level function that orchestrates the entire newsletter generation process
 */

import type { Newsletter, BotMemory, ForecastData } from './types';
import { buildDerived } from './derive';
import { createFreshMemory, ensureTeams, updateMemoryAfterWeek } from './memory';
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
}

export interface GenerateNewsletterInput {
  leagueName: string;
  leagueId: string;
  season: number;
  week: number;
  episodeType?: string; // Episode type for special newsletters (pre_draft, post_draft, preseason, etc.)
  users: SleeperUser[];
  rosters: SleeperRoster[];
  matchups: SleeperMatchup[];
  nextMatchups?: SleeperMatchup[];
  transactions: SleeperTransaction[];
  // Optional: existing memory state (load from DB)
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

  // 1. Build derived data from raw Sleeper data
  const derived = buildDerived({
    users,
    rosters,
    matchups,
    nextMatchups,
    transactions,
  });

  // 2. Get team names for memory initialization
  const teamNames = derived.matchup_pairs.flatMap(p => [p.winner.name, p.loser.name]);
  const uniqueTeamNames = Array.from(new Set(teamNames));

  // 3. Initialize or load memory
  const memEntertainer = existingMemoryEntertainer || createFreshMemory('entertainer');
  const memAnalyst = existingMemoryAnalyst || createFreshMemory('analyst');

  // Ensure all teams exist in memory
  ensureTeams(memEntertainer, uniqueTeamNames);
  ensureTeams(memAnalyst, uniqueTeamNames);

  // 4. Update memory based on this week's results
  updateMemoryAfterWeek(memEntertainer, derived);
  updateMemoryAfterWeek(memAnalyst, derived);

  // 5. Initialize or load forecast records
  let records: ForecastRecords = existingRecords || {
    entertainer: { w: 0, l: 0 },
    analyst: { w: 0, l: 0 },
  };

  // 6. Grade pending picks from last week if available
  if (pendingPicks && pendingPicks.week === week) {
    records = gradePendingPicks(pendingPicks, derived.matchup_pairs, records);
  }

  // 7. Generate forecast for next week
  const nextWeek = week + 1;
  const { forecast, pending: newPending } = makeForecast({
    upcoming_pairs: derived.upcoming_pairs,
    last_pairs: derived.matchup_pairs,
    memEntertainer,
    memAnalyst,
    nextWeek,
  });

  // Add records to forecast
  const forecastWithRecords: ForecastData = {
    ...forecast,
    records,
  };

  // 8. Compose the newsletter
  const newsletter = await composeNewsletter({
    leagueName,
    week,
    season,
    episodeType, // Pass episode type for special newsletters
    derived,
    memEntertainer,
    memAnalyst,
    forecast: forecastWithRecords,
    lastCallbacks: null, // TODO: Load from previous week
    enhancedContext: input.enhancedContext,
  });

  // 9. Render to HTML
  const html = renderHtml(newsletter);

  return {
    newsletter,
    html,
    memoryEntertainer: memEntertainer,
    memoryAnalyst: memAnalyst,
    records,
    pendingPicks: newPending,
  };
}

// ============ Utility: Generate from API data ============

/**
 * Simplified generator that fetches data from Sleeper API
 * This would be called from an API route
 */
export async function generateNewsletterFromSleeper(
  leagueId: string,
  week: number,
  existingState?: {
    memoryEntertainer?: BotMemory | null;
    memoryAnalyst?: BotMemory | null;
    records?: ForecastRecords | null;
    pendingPicks?: GenerateNewsletterInput['pendingPicks'];
  }
): Promise<GenerateNewsletterResult> {
  // This function would be implemented to fetch from Sleeper API
  // For now, it's a placeholder that shows the expected interface
  throw new Error(
    'generateNewsletterFromSleeper requires Sleeper API integration. ' +
    'Use generateNewsletter() with pre-fetched data instead.'
  );
}
