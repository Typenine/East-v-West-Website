/**
 * Narrative Heat Engine — Phase 2
 *
 * A simple, explainable scoring system that decides how narratively important
 * a given event or section is. Heat drives:
 * - How much memory context to surface (cold = minimal, nuclear = full depth)
 * - How aggressively to use rivalry and history callbacks
 * - Whether the bot should lean in or keep it brief
 *
 * Design rules:
 * - Keep it explainable: every point increment has a labeled reason.
 * - Never make sections longer just because heat is high.
 * - Use heat to decide what to INCLUDE, not to add filler.
 * - Freshness penalty prevents the same story from dominating every week.
 */

import type { NarrativeHeat, NarrativeHeatTier } from './types';

// ============ Input ============

export interface NarrativeHeatInput {
  // Matchup signals
  matchupMargin?: number;
  winnerPoints?: number;
  loserPoints?: number;

  // Context signals
  isPlayoffs?: boolean;
  isChampionship?: boolean;
  isTradeDeadline?: boolean;

  // Rivalry signal (0-10 from computeRivalryScore)
  rivalryScore?: number;

  // Event relevance (0-100 from RELEVANCE_CONFIG, for trades/waivers)
  eventRelevanceScore?: number;

  // Playoff/standings implications
  playoffImplication?: 'clinched' | 'eliminated' | 'bubble' | null;

  // Memory signals (from BotMemory)
  teamTrustDelta?: number;    // max abs(trust - frustration) across involved teams
  winStreak?: number;          // abs value of the strongest streak in this matchup
  hasActiveNarrative?: boolean; // any unresolved narrative arc involving these teams

  // Historical signals
  hasH2HHistory?: boolean;           // meaningful multi-season H2H record exists
  hasChampionshipMeeting?: boolean;  // these teams have met in a championship
  nearLeagueRecord?: boolean;        // a score or margin is approaching a league record

  // Freshness (penalizes repeated coverage)
  wasDiscussedLastWeek?: boolean;

  // Bot investment
  botWasBurned?: boolean;    // the bot trusted a team that lost / doubted one that won
  botWasVindicated?: boolean; // the bot's prediction was correct
}

// ============ Scorer ============

/**
 * Compute narrative heat from available signals.
 * Baseline starts at 30 ("something happened worth mentioning") and adjusts up/down.
 */
export function computeNarrativeHeat(input: NarrativeHeatInput): NarrativeHeat {
  let score = 30;
  const factors: string[] = [];

  // ── Matchup quality ──────────────────────────────────────────────────────
  if (input.matchupMargin !== undefined) {
    if (input.matchupMargin >= 40) {
      score += 20; factors.push('blowout (40+)');
    } else if (input.matchupMargin >= 25) {
      score += 10; factors.push('lopsided game');
    } else if (input.matchupMargin <= 3) {
      score += 15; factors.push('nail-biter (3pts)');
    } else if (input.matchupMargin <= 10) {
      score += 7;  factors.push('close game');
    }
  }
  if (input.winnerPoints !== undefined && input.winnerPoints >= 160) {
    score += 12; factors.push('high-scoring winner');
  }
  if (input.loserPoints !== undefined && input.loserPoints < 70) {
    score += 8;  factors.push('low-scoring loser');
  }

  // ── Stakes ───────────────────────────────────────────────────────────────
  if (input.isChampionship) {
    score += 40; factors.push('championship game');
  } else if (input.isPlayoffs) {
    score += 20; factors.push('playoff game');
  }
  if (input.isTradeDeadline) {
    score += 10; factors.push('trade deadline context');
  }

  // ── Rivalry ──────────────────────────────────────────────────────────────
  if (input.rivalryScore !== undefined) {
    if (input.rivalryScore >= 7) {
      score += 18; factors.push('blood feud');
    } else if (input.rivalryScore >= 5) {
      score += 10; factors.push('rivalry matchup');
    } else if (input.rivalryScore >= 3) {
      score += 4;  factors.push('mild rivalry');
    }
  }

  // ── Event relevance (trades/waivers) ─────────────────────────────────────
  if (input.eventRelevanceScore !== undefined) {
    if (input.eventRelevanceScore >= 80) {
      score += 20; factors.push('blockbuster event');
    } else if (input.eventRelevanceScore >= 60) {
      score += 12; factors.push('significant transaction');
    } else if (input.eventRelevanceScore >= 40) {
      score += 5;  factors.push('moderate transaction');
    }
  }

  // ── Playoff/standings implications ───────────────────────────────────────
  if (input.playoffImplication === 'eliminated') {
    score += 18; factors.push('playoff elimination');
  } else if (input.playoffImplication === 'clinched') {
    score += 12; factors.push('playoff clinch');
  } else if (input.playoffImplication === 'bubble') {
    score += 8;  factors.push('playoff bubble');
  }

  // ── Memory signals ───────────────────────────────────────────────────────
  if (input.teamTrustDelta !== undefined) {
    if (input.teamTrustDelta > 30) {
      score += 10; factors.push('strong bot feelings about this team');
    } else if (input.teamTrustDelta > 15) {
      score += 5;  factors.push('moderate bot feelings');
    }
  }
  if (input.winStreak !== undefined) {
    if (input.winStreak >= 5) {
      score += 12; factors.push('long win/loss streak');
    } else if (input.winStreak >= 3) {
      score += 6;  factors.push('active streak');
    }
  }
  if (input.hasActiveNarrative) {
    score += 8;  factors.push('active narrative arc');
  }

  // ── Historical signals ───────────────────────────────────────────────────
  if (input.hasChampionshipMeeting) {
    score += 12; factors.push('championship meeting history');
  } else if (input.hasH2HHistory) {
    score += 5;  factors.push('meaningful H2H history');
  }
  if (input.nearLeagueRecord) {
    score += 15; factors.push('near league record');
  }

  // ── Bot investment ───────────────────────────────────────────────────────
  if (input.botWasBurned) {
    score += 10; factors.push('bot got burned');
  }
  if (input.botWasVindicated) {
    score += 8;  factors.push('bot was vindicated');
  }

  // ── Freshness penalty ────────────────────────────────────────────────────
  if (input.wasDiscussedLastWeek) {
    score -= 15; factors.push('repeated topic (−15)');
  }

  // Clamp
  score = Math.min(100, Math.max(0, score));

  const tier: NarrativeHeatTier =
    score >= 75 ? 'nuclear' :
    score >= 50 ? 'hot'     :
    score >= 25 ? 'warm'    : 'cold';

  return {
    score,
    tier,
    factors,
    shouldLeanIn: score >= 50,
  };
}

// ============ Helpers ============

/**
 * Returns how many memory "layers" to include based on heat tier.
 * cold=0, warm=1, hot=2, nuclear=3
 * Used by buildEnrichedMemoryContext to decide depth.
 */
export function memoryDepthFromHeat(heat: NarrativeHeat): 0 | 1 | 2 | 3 {
  if (heat.tier === 'nuclear') return 3;
  if (heat.tier === 'hot')     return 2;
  if (heat.tier === 'warm')    return 1;
  return 0;
}

/**
 * Returns a one-line summary of why this section is (or isn't) interesting.
 * Used in section guidance blocks — not shown to LLM as a raw number.
 */
export function heatSummary(heat: NarrativeHeat): string {
  if (heat.tier === 'nuclear') return `High-stakes section (${heat.factors.slice(0, 3).join(', ')}). Lean in — this deserves real attention.`;
  if (heat.tier === 'hot')     return `Notable section (${heat.factors.slice(0, 2).join(', ')}). Worth a strong take.`;
  if (heat.tier === 'warm')    return `Moderate interest (${heat.factors[0] ?? 'standard game'}). Solid coverage, no need to over-explain.`;
  return `Lower-stakes section. Keep it brief — move to bigger stories.`;
}

/**
 * Quick factory for heat inputs from a matchup pair.
 * Avoids repeating the same boilerplate in compose.ts / compose-step.ts.
 */
export function heatFromMatchup(params: {
  margin: number;
  winnerPoints: number;
  loserPoints: number;
  isPlayoffs: boolean;
  isChampionship: boolean;
  rivalryScore?: number;
  teamTrustDelta?: number;
  winStreak?: number;
  hasActiveNarrative?: boolean;
  hasH2HHistory?: boolean;
  hasChampionshipMeeting?: boolean;
  nearLeagueRecord?: boolean;
  wasDiscussedLastWeek?: boolean;
  botWasBurned?: boolean;
  botWasVindicated?: boolean;
  playoffImplication?: 'clinched' | 'eliminated' | 'bubble' | null;
}): NarrativeHeat {
  return computeNarrativeHeat({
    matchupMargin: params.margin,
    winnerPoints:  params.winnerPoints,
    loserPoints:   params.loserPoints,
    isPlayoffs:    params.isPlayoffs,
    isChampionship: params.isChampionship,
    rivalryScore:  params.rivalryScore,
    teamTrustDelta: params.teamTrustDelta,
    winStreak:     params.winStreak,
    hasActiveNarrative: params.hasActiveNarrative,
    hasH2HHistory: params.hasH2HHistory,
    hasChampionshipMeeting: params.hasChampionshipMeeting,
    nearLeagueRecord: params.nearLeagueRecord,
    wasDiscussedLastWeek: params.wasDiscussedLastWeek,
    botWasBurned:  params.botWasBurned,
    botWasVindicated: params.botWasVindicated,
    playoffImplication: params.playoffImplication,
  });
}
