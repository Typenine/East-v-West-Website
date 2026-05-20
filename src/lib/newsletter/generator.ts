/**
 * Newsletter Generator
 * High-level function that orchestrates the entire newsletter generation process
 */

import type { Newsletter, BotMemory, ForecastData, CallbacksSection, WeeklyHotTake, RelationshipMemory } from './types';
import type { LeagueDraftData } from './sleeper-ingest';
import { buildDerived } from './derive';
import { createEnhancedMemory, ensureEnhancedTeams, updateEnhancedMemoryAfterWeek, upgradeToEnhancedMemory, addInsideJoke } from './memory';
import { isEnhancedMemory } from './types';
import { makeForecast, gradePendingPicks, type ForecastRecords } from './forecast';
import { recordPrediction, gradePrediction, gradeHotTake } from './enhanced-context';
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
  // Optional: callbacks section built from previous newsletter's forecast picks
  lastCallbacks?: import('./types').CallbacksSection | null;
  // Optional: raw previous newsletter for hot takes + spotlight extraction
  previousNewsletter?: { newsletter: { sections: Array<{ type: string; data: unknown }> } } | null;
  // Optional: cross-bot relationship memory for debate tracking and theme inference
  existingRelationshipMemory?: RelationshipMemory | null;
  // Optional: draft data for draft-episode newsletters
  draftData?: LeagueDraftData | null;
  // Optional: standings-based draft slot order for pre_draft mock drafts
  preDraftSlots?: Array<{ slot: number; team: string }>;
  /** Called when each section completes — used for real-time progress tracking */
  onSectionComplete?: (sectionName: string) => void;
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
  const lastCallbacks = input.lastCallbacks ?? null;

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

  // Build roster_id → team name map for resolving draft data
  const rosterIdToTeamName = new Map<number, string>();
  for (const roster of rosters) {
    const user = users.find(u => u.user_id === roster.owner_id);
    const teamName = user?.metadata?.team_name || user?.display_name || user?.username || `Roster ${roster.roster_id}`;
    rosterIdToTeamName.set(roster.roster_id, teamName);
  }

  // Resolve draft data: replace "RosterId:N" placeholders with actual team names
  let resolvedDraftData = input.draftData ?? null;
  if (resolvedDraftData) {
    const resolvedOrder = resolvedDraftData.draftOrder.map(entry => {
      const match = entry.match(/^RosterId:(\d+)$/);
      if (match) {
        const rosterId = parseInt(match[1], 10);
        return rosterIdToTeamName.get(rosterId) || entry;
      }
      return entry;
    });
    const resolvedPicks = resolvedDraftData.picks.map(pick => {
      const teamName = rosterIdToTeamName.get(pick.roster_id) || pick.teamName || `Roster ${pick.roster_id}`;
      return { ...pick, teamName };
    });
    resolvedDraftData = { ...resolvedDraftData, draftOrder: resolvedOrder, picks: resolvedPicks };
  }

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

    // Update per-bot prediction stats (predictionStats.correct/wrong/hotStreak)
    for (const pick of pendingPicks.picks) {
      const result = derived.matchup_pairs.find(
        mp => String(mp.matchup_id) === String(pick.matchup_id)
      );
      if (!result) continue;
      const margin = Math.round(result.winner.points - result.loser.points);
      gradePrediction(memEntertainer, pendingPicks.week, pick.matchup_id, result.winner.name, margin);
      gradePrediction(memAnalyst, pendingPicks.week, pick.matchup_id, result.winner.name, margin);

      // Inside joke: both bots agreed on the same pick and were right (rare — worth noting)
      if (
        pick.entertainer_pick && pick.analyst_pick &&
        pick.entertainer_pick === pick.analyst_pick &&
        pick.entertainer_pick === result.winner.name
      ) {
        const joke = `We both called ${result.winner.name} and nailed it (Wk${week})`;
        addInsideJoke(memEntertainer, week, joke);
        addInsideJoke(memAnalyst, week, joke);
      }
    }

    // Grade any ungraded hot takes whose subject appeared in this week's matchups
    for (const mem of [memEntertainer, memAnalyst]) {
      if (!mem.hotTakes) continue;
      for (const ht of mem.hotTakes) {
        if (ht.agedWell !== undefined) continue; // already graded
        const subjectLower = ht.subject.toLowerCase();
        const subjectWon = derived.matchup_pairs.some(mp =>
          mp.winner.name.toLowerCase().includes(subjectLower) ||
          subjectLower.includes(mp.winner.name.toLowerCase())
        );
        const subjectPlayed = derived.matchup_pairs.some(mp =>
          mp.winner.name.toLowerCase().includes(subjectLower) ||
          mp.loser.name.toLowerCase().includes(subjectLower) ||
          subjectLower.includes(mp.winner.name.toLowerCase()) ||
          subjectLower.includes(mp.loser.name.toLowerCase())
        );
        if (subjectPlayed) {
          gradeHotTake(
            mem, ht.week,
            subjectWon,
            subjectWon ? "Called it — that take aged beautifully." : "Tough look. I'll own this one."
          );
        }
      }
    }
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

  // Store next week's picks in bot memory so they can be graded next run
  for (const pick of forecast.picks) {
    recordPrediction(memEntertainer, {
      week: nextWeek,
      matchupId: pick.matchup_id,
      team1: pick.team1,
      team2: pick.team2,
      pick: pick.bot1_pick,
      confidence: pick.confidence_bot1,
    });
    recordPrediction(memAnalyst, {
      week: nextWeek,
      matchupId: pick.matchup_id,
      team1: pick.team1,
      team2: pick.team2,
      pick: pick.bot2_pick,
      confidence: pick.confidence_bot2,
    });
  }

  // Prune predictions: drop graded entries older than 3 weeks, hard-cap at 30
  const pruneBeforeWeek = nextWeek - 3;
  for (const mem of [memEntertainer, memAnalyst]) {
    if (mem.predictions && mem.predictions.length > 30) {
      mem.predictions = mem.predictions.filter(p => !p.result || p.week > pruneBeforeWeek);
      if (mem.predictions.length > 30) mem.predictions = mem.predictions.slice(-30);
    }
    // Prune hotTakes: keep last 20 (oldest graded takes fall off first)
    if (mem.hotTakes && mem.hotTakes.length > 20) {
      mem.hotTakes = mem.hotTakes.slice(-20);
    }
  }

  // Update RelationshipMemory counters now that grading is complete
  const relationshipMem = input.existingRelationshipMemory ?? null;
  if (relationshipMem) {
    // Sync season prediction records to the graded W/L counts
    relationshipMem.prediction_records.entertainer = records.entertainer;
    relationshipMem.prediction_records.analyst = records.analyst;
    // Lead = entertainer net wins minus analyst net wins
    const entNet = records.entertainer.w - records.entertainer.l;
    const anaNet = records.analyst.w - records.analyst.l;
    relationshipMem.dynamic.entertainer_lead_in_predictions = entNet - anaNet;
    // Count agreements in this week's pending picks (both bots picked the same team)
    if (pendingPicks) {
      const agreements = pendingPicks.picks.filter(
        p => p.entertainer_pick && p.analyst_pick && p.entertainer_pick === p.analyst_pick
      ).length;
      relationshipMem.dynamic.agreements_this_season += agreements;
    }
  }

  // Add records to forecast
  const forecastWithRecords: ForecastData = {
    ...forecast,
    records,
  };

  // 8a. Grade lastCallbacks predictions against this week's actual results
  let gradedCallbacks: CallbacksSection | null = input.lastCallbacks ?? null;
  if (gradedCallbacks && derived.matchup_pairs.length > 0) {
    const gradedPicks = gradedCallbacks.forecast_picks.map(pick => {
      const result = derived.matchup_pairs.find(mp =>
        (mp.winner.name === pick.team1 || mp.winner.name === pick.team2 ||
         mp.loser.name === pick.team1 || mp.loser.name === pick.team2)
      );
      if (!result) return pick;
      return {
        ...pick,
        entertainer_correct: pick.entertainer_pick ? pick.entertainer_pick === result.winner.name : undefined,
        analyst_correct: pick.analyst_pick ? pick.analyst_pick === result.winner.name : undefined,
      };
    });
    gradedCallbacks = { ...gradedCallbacks, forecast_picks: gradedPicks };
    const entW = gradedPicks.filter(p => p.entertainer_correct === true).length;
    const anaW = gradedPicks.filter(p => p.analyst_correct === true).length;
    console.log(`[Generator] Graded callbacks: Entertainer ${entW}/${gradedPicks.length}, Analyst ${anaW}/${gradedPicks.length}`);
  }

  // 8b. Extract previousHotTakes and spotlight_team from lastCallbacks newsletter for compose
  // These come from the RAW (pre-grading) input, since they're from the *previous* newsletter
  const rawPreviousNewsletter = input.previousNewsletter ?? undefined;
  let previousHotTakes: WeeklyHotTake[] = [];
  let prevSpotlightTeam = '';
  if (rawPreviousNewsletter?.newsletter?.sections) {
    const hotTakesSection = rawPreviousNewsletter.newsletter.sections.find(s => s.type === 'HotTakes');
    if (hotTakesSection) {
      previousHotTakes = (hotTakesSection.data as WeeklyHotTake[]).filter(ht => ht.bot && ht.take);
    }
    const spotlightSection = rawPreviousNewsletter.newsletter.sections.find(s => s.type === 'SpotlightTeam');
    if (spotlightSection) {
      prevSpotlightTeam = (spotlightSection.data as { teamName?: string })?.teamName || '';
    }
  }
  if (gradedCallbacks && prevSpotlightTeam) {
    gradedCallbacks = { ...gradedCallbacks, spotlight_team: prevSpotlightTeam };
  }

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
      lastCallbacks: gradedCallbacks,
      enhancedContext: input.enhancedContext,
      h2hData: input.enhancedContext?.h2hData,
      previousPredictions: formattedPreviousPredictions,
      previousHotTakes: previousHotTakes.length > 0 ? previousHotTakes : undefined,
      relationshipMemory: relationshipMem,
      draftData: resolvedDraftData,
      preDraftSlots: input.preDraftSlots,
      onSectionComplete: input.onSectionComplete,
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
