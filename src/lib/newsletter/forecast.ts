/**
 * Forecast Module
 * Generates predictions for upcoming matchups from both bot perspectives
 */

import type { UpcomingPair, MatchupPair, BotMemory, ForecastData, ForecastPick } from './types';

// ============ Forecast Generation ============

interface ForecastInput {
  upcoming_pairs: UpcomingPair[];
  last_pairs: MatchupPair[];
  memEntertainer: BotMemory;
  memAnalyst: BotMemory;
  nextWeek: number;
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

export function makeForecast(input: ForecastInput): ForecastResult {
  const { upcoming_pairs, last_pairs, memEntertainer, memAnalyst, nextWeek } = input;

  // Build a quick lookup of last week's performance
  const lastWeekScores = new Map<string, number>();
  for (const p of last_pairs) {
    lastWeekScores.set(p.winner.name, p.winner.points);
    lastWeekScores.set(p.loser.name, p.loser.points);
  }

  const picks: ForecastPick[] = [];
  const pendingPicks: PendingPicks['picks'] = [];

  let bot1_matchup_of_the_week = '';
  let bot2_matchup_of_the_week = '';
  let maxExcitement = 0;
  let maxAnalysis = 0;

  for (const pair of upcoming_pairs) {
    const [team1, team2] = pair.teams;

    // Get memory data for predictions
    const t1TrustEnt = memEntertainer.teams[team1]?.trust || 0;
    const t2TrustEnt = memEntertainer.teams[team2]?.trust || 0;
    const t1TrustAna = memAnalyst.teams[team1]?.trust || 0;
    const t2TrustAna = memAnalyst.teams[team2]?.trust || 0;

    // Get last week scores
    const t1LastScore = lastWeekScores.get(team1) || 100;
    const t2LastScore = lastWeekScores.get(team2) || 100;

    // Entertainer picks based on trust + excitement factor
    const entScore1 = t1TrustEnt + (t1LastScore > 120 ? 5 : 0);
    const entScore2 = t2TrustEnt + (t2LastScore > 120 ? 5 : 0);
    const bot1_pick = entScore1 >= entScore2 ? team1 : team2;
    const confidence_bot1 = Math.abs(entScore1 - entScore2) > 10 ? 'high' : Math.abs(entScore1 - entScore2) > 5 ? 'medium' : 'low';

    // Analyst picks based on trust + consistency
    const anaScore1 = t1TrustAna + (t1LastScore / 10);
    const anaScore2 = t2TrustAna + (t2LastScore / 10);
    const bot2_pick = anaScore1 >= anaScore2 ? team1 : team2;
    const confidence_bot2 = Math.abs(anaScore1 - anaScore2) > 15 ? 'high' : Math.abs(anaScore1 - anaScore2) > 8 ? 'medium' : 'low';

    // Check for upsets (picking against recent performance)
    const upset_bot1 = (bot1_pick === team1 && t2LastScore > t1LastScore + 20) ||
                       (bot1_pick === team2 && t1LastScore > t2LastScore + 20);
    const upset_bot2 = (bot2_pick === team1 && t2LastScore > t1LastScore + 20) ||
                       (bot2_pick === team2 && t1LastScore > t2LastScore + 20);

    // Generate notes
    const note_bot1 = upset_bot1 ? 'Going against the grain here.' : 
                      confidence_bot1 === 'high' ? 'Lock it in.' : '';
    const note_bot2 = upset_bot2 ? 'Variance play.' :
                      confidence_bot2 === 'high' ? 'Process favors this outcome.' : '';

    picks.push({
      matchup_id: pair.matchup_id,
      team1,
      team2,
      bot1_pick,
      bot2_pick,
      confidence_bot1,
      confidence_bot2,
      note_bot1: note_bot1 || undefined,
      note_bot2: note_bot2 || undefined,
      upset_bot1,
      upset_bot2,
    });

    pendingPicks.push({
      matchup_id: pair.matchup_id,
      entertainer_pick: bot1_pick,
      analyst_pick: bot2_pick,
    });

    // Track matchup of the week
    const excitement = Math.abs(t1TrustEnt - t2TrustEnt) + (t1LastScore + t2LastScore) / 20;
    if (excitement > maxExcitement) {
      maxExcitement = excitement;
      bot1_matchup_of_the_week = `${team1} vs ${team2}`;
    }

    const analysisScore = Math.min(Math.abs(t1TrustAna - t2TrustAna), 5) + (t1LastScore + t2LastScore) / 25;
    if (analysisScore > maxAnalysis) {
      maxAnalysis = analysisScore;
      bot2_matchup_of_the_week = `${team1} vs ${team2}`;
    }
  }

  // Calculate agreement summary
  const agree_count = picks.filter(p => p.bot1_pick === p.bot2_pick).length;
  const disagreements = picks
    .filter(p => p.bot1_pick !== p.bot2_pick)
    .map(p => `${p.team1} vs ${p.team2}`);

  const forecast: ForecastData = {
    picks,
    bot1_matchup_of_the_week,
    bot2_matchup_of_the_week,
    bot1_bold_player: 'TBD', // Would need player data
    bot2_bold_player: 'TBD',
    summary: {
      agree_count,
      total: picks.length,
      disagreements,
    },
  };

  return {
    forecast,
    pending: { week: nextWeek, picks: pendingPicks },
  };
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
