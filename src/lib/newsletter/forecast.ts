/**
 * Forecast Module
 * Generates LLM-powered predictions for upcoming matchups from both bot perspectives
 * Uses comprehensive league data for intelligent forecasting
 */

import type { UpcomingPair, MatchupPair, BotMemory, ForecastData, ForecastPick } from './types';
import { isEnhancedMemory } from './types';
import { generateSection } from './llm/groq';
import { recordPrediction } from './enhanced-context';

// ============ Forecast Generation ============

interface ForecastInput {
  upcoming_pairs: UpcomingPair[];
  last_pairs: MatchupPair[];
  memEntertainer: BotMemory;
  memAnalyst: BotMemory;
  nextWeek: number;
  // Enhanced context for smarter predictions
  enhancedContext?: string;
  standings?: Array<{ name: string; wins: number; losses: number; pointsFor: number }>;
  h2hData?: Record<string, Record<string, { wins: number; losses: number }>>;
  // Player data for bold player predictions
  topPlayers?: Array<{ playerId: string; playerName: string; team: string; position: string; points: number }>;
  // Injury data for context
  injuries?: Array<{ playerId: string; playerName: string; team: string; status: string }>;
}

interface ForecastResult {
  forecast: ForecastData;
  pending: PendingPicks;
}

interface PendingPicks {
  week: number;
  picks: Array<{
    matchup_id: string | number;
    entertainer_pick: string;
    analyst_pick: string;
  }>;
}

/**
 * Legacy synchronous forecast - uses simple heuristics
 * Kept for fallback if LLM fails
 */
export function makeForecastSync(input: ForecastInput): ForecastResult {
  const { upcoming_pairs, last_pairs, memEntertainer, memAnalyst, nextWeek } = input;

  const lastWeekScores = new Map<string, number>();
  for (const p of last_pairs) {
    lastWeekScores.set(p.winner.name, p.winner.points);
    lastWeekScores.set(p.loser.name, p.loser.points);
  }

  const picks: ForecastPick[] = [];
  const pendingPicks: PendingPicks['picks'] = [];

  let bot1_matchup_of_the_week = '';
  let bot2_matchup_of_the_week = '';

  for (const pair of upcoming_pairs) {
    const [team1, team2] = pair.teams;
    const t1TrustEnt = memEntertainer.teams[team1]?.trust || 0;
    const t2TrustEnt = memEntertainer.teams[team2]?.trust || 0;
    const t1TrustAna = memAnalyst.teams[team1]?.trust || 0;
    const t2TrustAna = memAnalyst.teams[team2]?.trust || 0;
    const t1LastScore = lastWeekScores.get(team1) || 100;
    const t2LastScore = lastWeekScores.get(team2) || 100;

    const entScore1 = t1TrustEnt + (t1LastScore > 120 ? 5 : 0);
    const entScore2 = t2TrustEnt + (t2LastScore > 120 ? 5 : 0);
    const bot1_pick = entScore1 >= entScore2 ? team1 : team2;
    let confidence_bot1: 'high' | 'medium' | 'low' = Math.abs(entScore1 - entScore2) > 10 ? 'high' : Math.abs(entScore1 - entScore2) > 5 ? 'medium' : 'low';

    const anaScore1 = t1TrustAna + (t1LastScore / 10);
    const anaScore2 = t2TrustAna + (t2LastScore / 10);
    const bot2_pick = anaScore1 >= anaScore2 ? team1 : team2;
    let confidence_bot2: 'high' | 'medium' | 'low' = Math.abs(anaScore1 - anaScore2) > 15 ? 'high' : Math.abs(anaScore1 - anaScore2) > 8 ? 'medium' : 'low';

    // Calibrate confidence conservatively using historical accuracy
    confidence_bot1 = calibrateConfidence(confidence_bot1, memEntertainer.predictionStats);
    confidence_bot2 = calibrateConfidence(confidence_bot2, memAnalyst.predictionStats);

    const upset_bot1 = (bot1_pick === team1 && t2LastScore > t1LastScore + 20) ||
                       (bot1_pick === team2 && t1LastScore > t2LastScore + 20);
    const upset_bot2 = (bot2_pick === team1 && t2LastScore > t1LastScore + 20) ||
                       (bot2_pick === team2 && t1LastScore > t2LastScore + 20);

    const pick: ForecastPick = {
      matchup_id: pair.matchup_id,
      team1,
      team2,
      bot1_pick,
      bot2_pick,
      confidence_bot1,
      confidence_bot2,
      note_bot1: upset_bot1 ? 'Going against the grain here.' : confidence_bot1 === 'high' ? 'Lock it in.' : undefined,
      note_bot2: upset_bot2 ? 'Variance play.' : confidence_bot2 === 'high' ? 'Process favors this outcome.' : undefined,
      upset_bot1,
      upset_bot2,
    };

    // Record predictions into memory (enhanced only)
    if (isEnhancedMemory(memEntertainer)) {
      recordPrediction(memEntertainer, {
        week: nextWeek,
        matchupId: pair.matchup_id,
        team1,
        team2,
        pick: bot1_pick,
        confidence: confidence_bot1,
        reasoning: pick.note_bot1,
      });
    }
    if (isEnhancedMemory(memAnalyst)) {
      recordPrediction(memAnalyst, {
        week: nextWeek,
        matchupId: pair.matchup_id,
        team1,
        team2,
        pick: bot2_pick,
        confidence: confidence_bot2,
        reasoning: pick.note_bot2,
      });
    }

    picks.push(pick);

    pendingPicks.push({ matchup_id: pair.matchup_id, entertainer_pick: bot1_pick, analyst_pick: bot2_pick });

    if (!bot1_matchup_of_the_week) bot1_matchup_of_the_week = `${team1} vs ${team2}`;
    if (!bot2_matchup_of_the_week) bot2_matchup_of_the_week = `${team1} vs ${team2}`;
  }

  const agree_count = picks.filter(p => p.bot1_pick === p.bot2_pick).length;
  const disagreements = picks.filter(p => p.bot1_pick !== p.bot2_pick).map(p => `${p.team1} vs ${p.team2}`);

  return {
    forecast: {
      picks,
      bot1_matchup_of_the_week,
      bot2_matchup_of_the_week,
      bot1_bold_player: 'TBD',
      bot2_bold_player: 'TBD',
      summary: { agree_count, total: picks.length, disagreements },
    },
    pending: { week: nextWeek, picks: pendingPicks },
  };
}

/**
 * LLM-powered forecast generation
 * Uses comprehensive league data for intelligent predictions
 */
export async function makeForecast(input: ForecastInput): Promise<ForecastResult> {
  const { upcoming_pairs, last_pairs, nextWeek, enhancedContext, standings, h2hData, topPlayers, injuries } = input;

  if (upcoming_pairs.length === 0) {
    return { forecast: { picks: [], bot1_matchup_of_the_week: '', bot2_matchup_of_the_week: '', bot1_bold_player: '', bot2_bold_player: '', summary: { agree_count: 0, total: 0, disagreements: [] } }, pending: { week: nextWeek, picks: [] } };
  }

  // Build last week scores lookup
  const lastWeekScores = new Map<string, number>();
  for (const p of last_pairs) {
    lastWeekScores.set(p.winner.name, p.winner.points);
    lastWeekScores.set(p.loser.name, p.loser.points);
  }

  // Build comprehensive matchup context for LLM
  const matchupContexts = upcoming_pairs.map(pair => {
    const [team1, team2] = pair.teams;
    const t1Score = lastWeekScores.get(team1);
    const t2Score = lastWeekScores.get(team2);
    const t1Standing = standings?.find(s => s.name === team1);
    const t2Standing = standings?.find(s => s.name === team2);
    const h2h = h2hData?.[team1]?.[team2];
    
    let context = `${team1} vs ${team2}`;
    if (t1Standing && t2Standing) {
      context += `\n  ${team1}: ${t1Standing.wins}-${t1Standing.losses} (${t1Standing.pointsFor.toFixed(1)} PF)`;
      context += `\n  ${team2}: ${t2Standing.wins}-${t2Standing.losses} (${t2Standing.pointsFor.toFixed(1)} PF)`;
    }
    if (t1Score !== undefined) context += `\n  Last week: ${team1} scored ${t1Score.toFixed(1)}`;
    if (t2Score !== undefined) context += `\n  Last week: ${team2} scored ${t2Score.toFixed(1)}`;
    if (h2h) context += `\n  H2H: ${team1} is ${h2h.wins}-${h2h.losses} all-time vs ${team2}`;
    
    return context;
  }).join('\n\n');

  // Build injury context if available
  let injuryContext = '';
  if (injuries && injuries.length > 0) {
    const relevantInjuries = injuries.filter(inj => 
      inj.status === 'Out' || inj.status === 'Doubtful' || inj.status === 'IR'
    ).slice(0, 10);
    if (relevantInjuries.length > 0) {
      injuryContext = '\n\nKEY INJURIES TO CONSIDER:\n' + relevantInjuries.map(inj => 
        `- ${inj.playerName} (${inj.team}): ${inj.status}`
      ).join('\n');
    }
  }

  // Build top players context for bold predictions
  let topPlayersContext = '';
  if (topPlayers && topPlayers.length > 0) {
    topPlayersContext = '\n\nTOP PERFORMERS LAST WEEK:\n' + topPlayers.slice(0, 8).map(p => 
      `- ${p.playerName} (${p.position}, ${p.team}): ${p.points.toFixed(1)} pts`
    ).join('\n');
  }

  const fullContext = `WEEK ${nextWeek} MATCHUPS TO PREDICT:\n\n${matchupContexts}${injuryContext}${topPlayersContext}\n\n${enhancedContext || ''}`;

  try {
    // Generate predictions from both bots in parallel
    const [entertainerResponse, analystResponse, boldPlayerEnt, boldPlayerAna] = await Promise.all([
      generateSection({
        persona: 'entertainer',
        sectionType: 'Matchup Predictions',
        context: fullContext,
        constraints: `For each matchup, pick a winner and give confidence (high/medium/low). Format EXACTLY as:
1. [TEAM1 vs TEAM2]: Pick: [WINNER] | Confidence: [high/medium/low] | Reason: [brief reason]
Be bold! Trust your gut. Pick upsets when you feel it. Consider injuries!`,
        maxTokens: 400,
        validate: (txt) => /Pick:\s*/i.test(txt) && /Confidence:\s*/i.test(txt),
      }),
      generateSection({
        persona: 'analyst',
        sectionType: 'Matchup Predictions',
        context: fullContext,
        constraints: `For each matchup, pick a winner and give confidence (high/medium/low). Format EXACTLY as:
1. [TEAM1 vs TEAM2]: Pick: [WINNER] | Confidence: [high/medium/low] | Reason: [brief reason]
Use data and trends. Consider sample size, regression, and injury impact.`,
        maxTokens: 400,
        validate: (txt) => /Pick:\s*/i.test(txt) && /Confidence:\s*/i.test(txt),
      }),
      // Bold player predictions
      topPlayers && topPlayers.length > 0 ? generateSection({
        persona: 'entertainer',
        sectionType: 'Bold Player Prediction',
        context: `${topPlayersContext}\n\nPick ONE player who will have a HUGE week. Be bold!`,
        constraints: 'Name ONE player and why they will explode this week. One sentence. Format: "[PLAYER NAME] - [reason]"',
        maxTokens: 60,
      }) : Promise.resolve(''),
      topPlayers && topPlayers.length > 0 ? generateSection({
        persona: 'analyst',
        sectionType: 'Bold Player Prediction',
        context: `${topPlayersContext}\n\nPick ONE player with favorable matchup/usage who should outperform.`,
        constraints: 'Name ONE player with analytical reasoning. One sentence. Format: "[PLAYER NAME] - [reason]"',
        maxTokens: 60,
      }) : Promise.resolve(''),
    ]);

    // Parse LLM responses into structured picks
    const basePicks = parseLLMPredictions(upcoming_pairs, entertainerResponse, analystResponse);

    // Calibrate confidence and record predictions into memory (enhanced only)
    const picks = basePicks.map(p => {
      const c1 = calibrateConfidence(p.confidence_bot1, input.memEntertainer.predictionStats);
      const c2 = calibrateConfidence(p.confidence_bot2, input.memAnalyst.predictionStats);

      if (isEnhancedMemory(input.memEntertainer)) {
        recordPrediction(input.memEntertainer, {
          week: nextWeek,
          matchupId: p.matchup_id,
          team1: p.team1,
          team2: p.team2,
          pick: p.bot1_pick,
          confidence: c1,
          reasoning: p.note_bot1,
        });
      }
      if (isEnhancedMemory(input.memAnalyst)) {
        recordPrediction(input.memAnalyst, {
          week: nextWeek,
          matchupId: p.matchup_id,
          team1: p.team1,
          team2: p.team2,
          pick: p.bot2_pick,
          confidence: c2,
          reasoning: p.note_bot2,
        });
      }

      return { ...p, confidence_bot1: c1, confidence_bot2: c2 };
    });

    const pendingPicks = picks.map(p => ({ matchup_id: p.matchup_id, entertainer_pick: p.bot1_pick, analyst_pick: p.bot2_pick }));

    // Find matchup of the week (where bots disagree or have high confidence)
    const disagreements = picks.filter(p => p.bot1_pick !== p.bot2_pick);
    const bot1_matchup_of_the_week = disagreements[0] ? `${disagreements[0].team1} vs ${disagreements[0].team2}` : (picks[0] ? `${picks[0].team1} vs ${picks[0].team2}` : '');
    const highConfidence = picks.filter(p => p.confidence_bot2 === 'high');
    const bot2_matchup_of_the_week = highConfidence[0] ? `${highConfidence[0].team1} vs ${highConfidence[0].team2}` : bot1_matchup_of_the_week;

    const agree_count = picks.filter(p => p.bot1_pick === p.bot2_pick).length;

    return {
      forecast: {
        picks,
        bot1_matchup_of_the_week,
        bot2_matchup_of_the_week,
        bot1_bold_player: boldPlayerEnt.trim(),
        bot2_bold_player: boldPlayerAna.trim(),
        summary: { agree_count, total: picks.length, disagreements: disagreements.map(p => `${p.team1} vs ${p.team2}`) },
      },
      pending: { week: nextWeek, picks: pendingPicks },
    };
  } catch (error) {
    console.error('[Forecast] LLM generation failed, falling back to heuristics:', error);
    return makeForecastSync(input);
  }
}

/**
 * Parse LLM prediction responses into structured ForecastPick objects
 */
function parseLLMPredictions(
  pairs: UpcomingPair[],
  entertainerResponse: string,
  analystResponse: string
): ForecastPick[] {
  const picks: ForecastPick[] = [];

  for (const pair of pairs) {
    const [team1, team2] = pair.teams;
    
    // Find entertainer's pick for this matchup
    const entPick = extractPick(entertainerResponse, team1, team2);
    // Find analyst's pick for this matchup
    const anaPick = extractPick(analystResponse, team1, team2);

    picks.push({
      matchup_id: pair.matchup_id,
      team1,
      team2,
      bot1_pick: entPick.winner,
      bot2_pick: anaPick.winner,
      confidence_bot1: entPick.confidence,
      confidence_bot2: anaPick.confidence,
      note_bot1: entPick.reason || undefined,
      note_bot2: anaPick.reason || undefined,
      upset_bot1: false, // Could calculate based on standings
      upset_bot2: false,
    });
  }

  return picks;
}

/**
 * Extract a pick from LLM response text
 */
function extractPick(
  response: string,
  team1: string,
  team2: string
): { winner: string; confidence: 'high' | 'medium' | 'low'; reason: string } {
  // Default to team1 if parsing fails
  let winner = team1;
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  let reason = '';

  // Look for lines mentioning either team
  const lines = response.split('\n');
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes(team1.toLowerCase()) || lowerLine.includes(team2.toLowerCase())) {
      // Check which team is picked
      const pickMatch = line.match(/pick:\s*([^|]+)/i);
      if (pickMatch) {
        const pickText = pickMatch[1].trim().toLowerCase();
        if (pickText.includes(team2.toLowerCase())) winner = team2;
        else if (pickText.includes(team1.toLowerCase())) winner = team1;
      }
      
      // Extract confidence
      const confMatch = line.match(/confidence:\s*(high|medium|low)/i);
      if (confMatch) {
        confidence = confMatch[1].toLowerCase() as 'high' | 'medium' | 'low';
      }
      
      // Extract reason
      const reasonMatch = line.match(/reason:\s*(.+?)$/i);
      if (reasonMatch) {
        reason = reasonMatch[1].trim();
      }
      
      break; // Found the line for this matchup
    }
  }

  return { winner, confidence, reason };
}

// ============ Confidence Calibration ============

function calibrateConfidence(
  base: 'high' | 'medium' | 'low',
  stats: BotMemory['predictionStats'] | undefined
): 'high' | 'medium' | 'low' {
  const toScore = (c: 'high' | 'medium' | 'low') => (c === 'high' ? 2 : c === 'medium' ? 1 : 0);
  const toLabel = (s: number) => (s >= 2 ? 'high' : s === 1 ? 'medium' : 'low') as 'high' | 'medium' | 'low';
  let score = toScore(base);
  if (!stats) return base;
  const winRate = typeof stats.winRate === 'number' ? stats.winRate : 0;
  const hotStreak = typeof stats.hotStreak === 'number' ? stats.hotStreak : 0;
  if (winRate > 0.65 || hotStreak >= 3) score += 1;
  else if (winRate < 0.45 || hotStreak <= -3) score -= 1;
  if (score < 0) score = 0;
  if (score > 2) score = 2;
  return toLabel(score);
}

// ============ Grading Previous Predictions ============

export interface ForecastRecords {
  entertainer: { w: number; l: number };
  analyst: { w: number; l: number };
}

export function gradePendingPicks(
  pending: PendingPicks | null,
  matchup_pairs: MatchupPair[],
  records: ForecastRecords
): ForecastRecords {
  if (!pending || !Array.isArray(pending.picks)) return records;

  const winnersById = new Map<string, string>();
  for (const p of matchup_pairs || []) {
    winnersById.set(String(p.matchup_id), p.winner.name);
  }

  for (const pick of pending.picks) {
    const actual = winnersById.get(String(pick.matchup_id));
    if (!actual) continue;

    if (pick.entertainer_pick) {
      if (pick.entertainer_pick === actual) {
        records.entertainer.w++;
      } else {
        records.entertainer.l++;
      }
    }

    if (pick.analyst_pick) {
      if (pick.analyst_pick === actual) {
        records.analyst.w++;
      } else {
        records.analyst.l++;
      }
    }
  }

  return records;
}
