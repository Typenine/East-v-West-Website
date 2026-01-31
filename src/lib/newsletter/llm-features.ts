/**
 * LLM-Powered Features Module
 * Additional LLM integrations for richer newsletter content:
 * - Bot Debates (when they disagree)
 * - Hot Takes with tracking
 * - Weekly Awards
 * - What-If Scenarios
 * - Dynasty Analysis
 * - Rivalry Detection
 * - Playoff Odds Commentary
 * - Narrative Callbacks
 */

import type {
  BotDebate,
  WeeklyHotTake,
  WeeklyAwards,
  WhatIfScenario,
  DynastyAnalysis,
  RivalryMatchup,
  PlayoffOddsSection,
  NarrativeCallback,
  MatchupPair,
  ForecastPick,
  TradeItem,
} from './types';
import { generateSection } from './llm/groq';

// ============ 1. Bot Debates ============

/**
 * Generate debates when bots disagree on picks
 */
export async function generateBotDebates(
  picks: ForecastPick[],
  context: string
): Promise<BotDebate[]> {
  const disagreements = picks.filter(p => p.bot1_pick !== p.bot2_pick);
  
  if (disagreements.length === 0) return [];

  const debates: BotDebate[] = [];

  // Generate debates for up to 2 disagreements to save API calls
  const toDebate = disagreements.slice(0, 2);

  for (const pick of toDebate) {
    const debateContext = `MATCHUP: ${pick.team1} vs ${pick.team2}
Entertainer picks: ${pick.bot1_pick} (${pick.confidence_bot1} confidence)
Analyst picks: ${pick.bot2_pick} (${pick.confidence_bot2} confidence)

${context}

Generate a mini-debate where each columnist defends their pick.`;

    const [entArgument, anaArgument] = await Promise.all([
      generateSection({
        persona: 'entertainer',
        sectionType: 'Debate Argument',
        context: debateContext,
        constraints: `Defend your pick of ${pick.bot1_pick}. Be passionate and dismissive of the other pick. 2-3 sentences. Attack the other position!`,
        maxTokens: 100,
      }),
      generateSection({
        persona: 'analyst',
        sectionType: 'Debate Argument',
        context: debateContext,
        constraints: `Defend your pick of ${pick.bot2_pick}. Use data and logic. Explain why the other pick is flawed. 2-3 sentences.`,
        maxTokens: 100,
      }),
    ]);

    debates.push({
      topic: `${pick.team1} vs ${pick.team2}`,
      team1: pick.team1,
      team2: pick.team2,
      entertainer_position: pick.bot1_pick,
      entertainer_argument: entArgument.trim(),
      analyst_position: pick.bot2_pick,
      analyst_argument: anaArgument.trim(),
    });
  }

  return debates;
}

// ============ 2. Hot Takes ============

/**
 * Generate weekly hot takes from both bots
 */
export async function generateHotTakes(
  week: number,
  context: string,
  standings?: Array<{ name: string; wins: number; losses: number }>
): Promise<WeeklyHotTake[]> {
  const standingsContext = standings 
    ? '\n\nCurrent Standings:\n' + standings.map(s => `${s.name}: ${s.wins}-${s.losses}`).join('\n')
    : '';

  const [entTake, anaTake] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Hot Take',
      context: `Week ${week} Hot Take Time!\n${context}${standingsContext}\n\nGive a BOLD, controversial take about a team or player. Something that will age well or terribly.`,
      constraints: 'One spicy hot take. Be bold! Format: "[SUBJECT]: [HOT TAKE]" - make it memorable and trackable.',
      maxTokens: 80,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Hot Take',
      context: `Week ${week} Hot Take Time!\n${context}${standingsContext}\n\nGive a contrarian analytical take. Something the data suggests that goes against popular opinion.`,
      constraints: 'One data-driven contrarian take. Format: "[SUBJECT]: [HOT TAKE]" - make it specific and verifiable.',
      maxTokens: 80,
    }),
  ]);

  // Parse the takes
  const parseTake = (text: string, bot: 'entertainer' | 'analyst'): WeeklyHotTake => {
    const match = text.match(/^([^:]+):\s*(.+)$/);
    const subject = match ? match[1].trim() : 'The League';
    const take = match ? match[2].trim() : text.trim();
    
    // Determine boldness based on language
    const boldness: 'mild' | 'spicy' | 'nuclear' = 
      /will win|championship|worst|best|bust|breakout|fraud|elite/i.test(take) ? 'nuclear' :
      /should|might|could|trending/i.test(take) ? 'mild' : 'spicy';

    return { week, bot, take, subject, boldness };
  };

  return [
    parseTake(entTake, 'entertainer'),
    parseTake(anaTake, 'analyst'),
  ];
}

// ============ 3. Weekly Awards ============

/**
 * Generate weekly awards (MVP, Bust, etc.)
 */
export async function generateWeeklyAwards(
  pairs: MatchupPair[],
  context: string
): Promise<WeeklyAwards> {
  if (pairs.length === 0) {
    return {
      mvp: { team: 'TBD', entertainer_take: 'No games played', analyst_take: 'No data available' },
      bust: { team: 'TBD', entertainer_take: 'No games played', analyst_take: 'No data available' },
    };
  }

  // Find candidates
  const highestScorer = [...pairs].sort((a, b) => b.winner.points - a.winner.points)[0];
  const lowestScorer = [...pairs].sort((a, b) => a.loser.points - b.loser.points)[0];
  const biggestBlowout = [...pairs].sort((a, b) => b.margin - a.margin)[0];
  const closestGame = [...pairs].sort((a, b) => a.margin - b.margin)[0];

  const awardsContext = `WEEKLY AWARDS CANDIDATES:
MVP Candidate: ${highestScorer.winner.name} scored ${highestScorer.winner.points.toFixed(1)} points
Bust Candidate: ${lowestScorer.loser.name} scored ${lowestScorer.loser.points.toFixed(1)} points
Biggest Blowout: ${biggestBlowout.winner.name} beat ${biggestBlowout.loser.name} by ${biggestBlowout.margin.toFixed(1)}
Closest Game: ${closestGame.winner.name} beat ${closestGame.loser.name} by ${closestGame.margin.toFixed(1)}

${context}`;

  const [mvpEnt, mvpAna, bustEnt, bustAna, blowoutComment, nailbiterComment] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'MVP Award',
      context: awardsContext,
      constraints: `Crown ${highestScorer.winner.name} as MVP. One hype sentence. Be dramatic!`,
      maxTokens: 60,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'MVP Award',
      context: awardsContext,
      constraints: `Analyze why ${highestScorer.winner.name} deserves MVP. One analytical sentence.`,
      maxTokens: 60,
    }),
    generateSection({
      persona: 'entertainer',
      sectionType: 'Bust Award',
      context: awardsContext,
      constraints: `Roast ${lowestScorer.loser.name} for their terrible performance. One savage sentence.`,
      maxTokens: 60,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Bust Award',
      context: awardsContext,
      constraints: `Explain what went wrong for ${lowestScorer.loser.name}. One analytical sentence.`,
      maxTokens: 60,
    }),
    generateSection({
      persona: 'entertainer',
      sectionType: 'Blowout Commentary',
      context: `${biggestBlowout.winner.name} destroyed ${biggestBlowout.loser.name} by ${biggestBlowout.margin.toFixed(1)} points`,
      constraints: 'One dramatic sentence about this beatdown.',
      maxTokens: 50,
    }),
    closestGame.margin <= 10 ? generateSection({
      persona: 'analyst',
      sectionType: 'Nail-biter Commentary',
      context: `${closestGame.winner.name} barely beat ${closestGame.loser.name} by ${closestGame.margin.toFixed(1)} points`,
      constraints: 'One sentence about this close game and what decided it.',
      maxTokens: 50,
    }) : Promise.resolve(''),
  ]);

  return {
    mvp: {
      team: highestScorer.winner.name,
      points: highestScorer.winner.points,
      entertainer_take: mvpEnt.trim(),
      analyst_take: mvpAna.trim(),
    },
    bust: {
      team: lowestScorer.loser.name,
      points: lowestScorer.loser.points,
      entertainer_take: bustEnt.trim(),
      analyst_take: bustAna.trim(),
    },
    biggest_blowout: {
      winner: biggestBlowout.winner.name,
      loser: biggestBlowout.loser.name,
      margin: biggestBlowout.margin,
      commentary: blowoutComment.trim(),
    },
    nail_biter: closestGame.margin <= 10 ? {
      winner: closestGame.winner.name,
      loser: closestGame.loser.name,
      margin: closestGame.margin,
      commentary: nailbiterComment.trim(),
    } : undefined,
  };
}

// ============ 4. What-If Scenarios ============

/**
 * Generate what-if scenarios for close games
 */
export async function generateWhatIfScenarios(
  pairs: MatchupPair[],
  context: string
): Promise<WhatIfScenario[]> {
  // Only generate for games decided by 10 or fewer points
  const closeGames = pairs.filter(p => p.margin <= 10);
  
  if (closeGames.length === 0) return [];

  const scenarios: WhatIfScenario[] = [];

  // Generate for up to 2 close games
  for (const game of closeGames.slice(0, 2)) {
    const scenarioResponse = await generateSection({
      persona: 'analyst',
      sectionType: 'What-If Scenario',
      context: `CLOSE GAME: ${game.winner.name} (${game.winner.points.toFixed(1)}) beat ${game.loser.name} (${game.loser.points.toFixed(1)}) by just ${game.margin.toFixed(1)} points.

${context}

Create a realistic "what-if" scenario about a lineup decision that could have changed the outcome.`,
      constraints: 'Format: "If [TEAM] had [DECISION], [OUTCOME]" - be specific about a player or decision. One sentence.',
      maxTokens: 80,
    });

    // Parse the response
    const match = scenarioResponse.match(/if\s+(.+?),\s*(.+)/i);
    
    scenarios.push({
      matchup_id: game.matchup_id,
      winner: game.winner.name,
      loser: game.loser.name,
      margin: game.margin,
      scenario: match ? `If ${match[1]}` : scenarioResponse.split(',')[0] || scenarioResponse,
      outcome_change: match ? match[2].trim() : 'the outcome could have been different',
    });
  }

  return scenarios;
}

// ============ 5. Dynasty Analysis ============

/**
 * Generate dynasty-focused analysis for trades
 */
export async function generateDynastyAnalysis(
  trades: TradeItem[],
  context: string
): Promise<DynastyAnalysis[]> {
  if (trades.length === 0) return [];

  const analyses: DynastyAnalysis[] = [];

  for (const trade of trades.slice(0, 2)) {
    const teams = Object.keys(trade.teams || {});
    if (teams.length < 2) continue;

    const tradeDetails = teams.map(team => {
      const assets = trade.teams?.[team];
      return `${team}: Gets ${assets?.gets?.join(', ') || 'unknown'} | Gives ${assets?.gives?.join(', ') || 'unknown'}`;
    }).join('\n');

    const [entDynasty, anaDynasty] = await Promise.all([
      generateSection({
        persona: 'entertainer',
        sectionType: 'Dynasty Analysis',
        context: `TRADE FOR DYNASTY ANALYSIS:\n${tradeDetails}\n\n${context}`,
        constraints: 'Who wins this trade long-term (3+ years)? Consider age, potential, and draft capital. 2 sentences. Name the winner!',
        maxTokens: 100,
      }),
      generateSection({
        persona: 'analyst',
        sectionType: 'Dynasty Analysis',
        context: `TRADE FOR DYNASTY ANALYSIS:\n${tradeDetails}\n\n${context}`,
        constraints: 'Analyze dynasty value: short-term winner vs long-term winner. Consider age curves and asset depreciation. 2 sentences.',
        maxTokens: 100,
      }),
    ]);

    // Try to extract winners from responses
    const shortTermMatch = anaDynasty.match(/short[- ]term[^:]*:\s*(\w+)/i) || anaDynasty.match(/(\w+)\s+wins?\s+(now|short)/i);
    const longTermMatch = anaDynasty.match(/long[- ]term[^:]*:\s*(\w+)/i) || entDynasty.match(/(\w+)\s+wins?\s+(long|future)/i);

    analyses.push({
      trade_id: trade.event_id,
      teams,
      short_term_winner: shortTermMatch ? shortTermMatch[1] : teams[0],
      long_term_winner: longTermMatch ? longTermMatch[1] : teams[1],
      entertainer_dynasty_take: entDynasty.trim(),
      analyst_dynasty_take: anaDynasty.trim(),
      key_assets: [], // Would need player data to populate
    });
  }

  return analyses;
}

// ============ 6. Rivalry Detection ============

// Known rivalries in the league (can be expanded)
const KNOWN_RIVALRIES: Array<{ teams: [string, string]; name: string }> = [
  // Add known rivalries here based on league history
  // Example: { teams: ['Team A', 'Team B'], name: 'The Battle of X' }
];

/**
 * Detect and generate rivalry matchup coverage
 */
export async function detectRivalries(
  upcomingPairs: Array<{ teams: string[] }>,
  h2hData: Record<string, Record<string, { wins: number; losses: number }>> | undefined,
  context: string
): Promise<RivalryMatchup[]> {
  const rivalries: RivalryMatchup[] = [];

  for (const pair of upcomingPairs) {
    const [team1, team2] = pair.teams;
    
    // Check if this is a known rivalry
    const knownRivalry = KNOWN_RIVALRIES.find(
      r => (r.teams[0] === team1 && r.teams[1] === team2) ||
           (r.teams[0] === team2 && r.teams[1] === team1)
    );

    // Check H2H history for intense matchups
    const h2h = h2hData?.[team1]?.[team2];
    const isIntenseRivalry = h2h && (h2h.wins >= 3 || h2h.losses >= 3);

    if (knownRivalry || isIntenseRivalry) {
      const h2hRecord = h2h || { wins: 0, losses: 0 };
      
      const [entHype, anaBreakdown] = await Promise.all([
        generateSection({
          persona: 'entertainer',
          sectionType: 'Rivalry Hype',
          context: `RIVALRY MATCHUP: ${team1} vs ${team2}
All-time record: ${team1} leads ${h2hRecord.wins}-${h2hRecord.losses}
${knownRivalry ? `Known as: ${knownRivalry.name}` : 'These teams have history!'}

${context}`,
          constraints: 'Hype up this rivalry matchup! What makes it special? 2 sentences of pure drama.',
          maxTokens: 80,
        }),
        generateSection({
          persona: 'analyst',
          sectionType: 'Rivalry Breakdown',
          context: `RIVALRY MATCHUP: ${team1} vs ${team2}
All-time record: ${team1} leads ${h2hRecord.wins}-${h2hRecord.losses}

${context}`,
          constraints: 'Break down the historical matchup. What patterns emerge? 2 sentences.',
          maxTokens: 80,
        }),
      ]);

      rivalries.push({
        team1,
        team2,
        rivalry_name: knownRivalry?.name,
        all_time_record: { team1_wins: h2hRecord.wins, team2_wins: h2hRecord.losses },
        recent_meetings: `${team1} is ${h2hRecord.wins}-${h2hRecord.losses} all-time`,
        stakes: 'Bragging rights on the line',
        entertainer_hype: entHype.trim(),
        analyst_breakdown: anaBreakdown.trim(),
      });
    }
  }

  return rivalries;
}

// ============ 7. Playoff Odds Commentary ============

/**
 * Generate playoff odds commentary
 */
export async function generatePlayoffOddsCommentary(
  week: number,
  standings: Array<{ name: string; wins: number; losses: number; pointsFor: number }>,
  playoffSpots: number = 6,
  context: string
): Promise<PlayoffOddsSection> {
  if (standings.length === 0) {
    return {
      week,
      clinched: [],
      eliminated: [],
      bubble_teams: [],
      entertainer_commentary: 'No standings data available',
      analyst_commentary: 'Unable to calculate playoff odds',
    };
  }

  // Sort by wins, then points for
  const sorted = [...standings].sort((a, b) => 
    b.wins !== a.wins ? b.wins - a.wins : b.pointsFor - a.pointsFor
  );

  const totalWeeks = 14; // Regular season weeks
  const remainingWeeks = Math.max(0, totalWeeks - week);

  // Determine clinched/eliminated/bubble
  const clinched: string[] = [];
  const eliminated: string[] = [];
  const bubbleTeams: Array<{ team: string; wins: number; losses: number; scenario: string }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const team = sorted[i];
    const maxPossibleWins = team.wins + remainingWeeks;
    const minPossibleWins = team.wins;

    // Check if clinched (can't be caught by team at playoff cutoff)
    const cutoffTeam = sorted[playoffSpots - 1];
    if (cutoffTeam && minPossibleWins > cutoffTeam.wins + remainingWeeks) {
      clinched.push(team.name);
    }
    // Check if eliminated (can't catch team at playoff cutoff)
    else if (cutoffTeam && maxPossibleWins < cutoffTeam.wins) {
      eliminated.push(team.name);
    }
    // Bubble team (in the hunt)
    else if (i >= playoffSpots - 2 && i <= playoffSpots + 1) {
      const gamesBack = cutoffTeam ? cutoffTeam.wins - team.wins : 0;
      bubbleTeams.push({
        team: team.name,
        wins: team.wins,
        losses: team.losses,
        scenario: gamesBack > 0 
          ? `${gamesBack} game${gamesBack > 1 ? 's' : ''} back - needs help`
          : gamesBack < 0 
            ? `${Math.abs(gamesBack)} game${Math.abs(gamesBack) > 1 ? 's' : ''} up on the cut line`
            : 'Right on the bubble',
      });
    }
  }

  const playoffContext = `PLAYOFF PICTURE - Week ${week}
Clinched: ${clinched.length > 0 ? clinched.join(', ') : 'None yet'}
Eliminated: ${eliminated.length > 0 ? eliminated.join(', ') : 'None yet'}
Bubble Teams: ${bubbleTeams.map(t => `${t.team} (${t.wins}-${t.losses})`).join(', ')}
Remaining Weeks: ${remainingWeeks}

${context}`;

  const [entCommentary, anaCommentary] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Playoff Odds',
      context: playoffContext,
      constraints: 'Comment on the playoff race! Who should be nervous? Who is safe? 2-3 dramatic sentences.',
      maxTokens: 100,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Playoff Odds',
      context: playoffContext,
      constraints: 'Analyze the playoff scenarios. What do bubble teams need to do? 2-3 analytical sentences.',
      maxTokens: 100,
    }),
  ]);

  return {
    week,
    clinched,
    eliminated,
    bubble_teams: bubbleTeams,
    entertainer_commentary: entCommentary.trim(),
    analyst_commentary: anaCommentary.trim(),
  };
}

// ============ 8. Narrative Callbacks ============

/**
 * Generate callbacks to previous predictions and hot takes
 */
export async function generateNarrativeCallbacks(
  week: number,
  previousPredictions: Array<{ week: number; pick: string; actual: string; correct: boolean }>,
  previousHotTakes: WeeklyHotTake[],
  currentResults: MatchupPair[],
  context: string
): Promise<NarrativeCallback[]> {
  const callbacks: NarrativeCallback[] = [];

  // Grade previous predictions
  const wrongPredictions = previousPredictions.filter(p => !p.correct).slice(0, 2);
  const rightPredictions = previousPredictions.filter(p => p.correct).slice(0, 1);

  for (const pred of [...wrongPredictions, ...rightPredictions]) {
    const reaction = await generateSection({
      persona: pred.correct ? 'entertainer' : 'analyst',
      sectionType: 'Prediction Callback',
      context: `Last week I predicted ${pred.pick} would win. ${pred.correct ? 'I was RIGHT!' : `I was WRONG - ${pred.actual} won instead.`}`,
      constraints: pred.correct 
        ? 'Gloat about being right! One sentence of pure vindication.'
        : 'Own the L or make an excuse. One sentence.',
      maxTokens: 50,
    });

    callbacks.push({
      type: 'prediction_grade',
      original_week: pred.week,
      original_statement: `Picked ${pred.pick} to win`,
      current_status: pred.correct ? 'CORRECT' : `WRONG - ${pred.actual} won`,
      bot_reaction: reaction.trim(),
    });
  }

  // Follow up on hot takes if they can be graded
  for (const take of previousHotTakes.filter(t => !t.graded).slice(0, 1)) {
    const followUp = await generateSection({
      persona: take.bot,
      sectionType: 'Hot Take Follow-up',
      context: `My hot take from Week ${take.week}: "${take.take}" about ${take.subject}

Current results this week: ${currentResults.map(r => `${r.winner.name} beat ${r.loser.name}`).join(', ')}

${context}`,
      constraints: 'Is your hot take aging well or poorly? One sentence update.',
      maxTokens: 50,
    });

    callbacks.push({
      type: 'hot_take_followup',
      original_week: take.week,
      original_statement: take.take,
      current_status: 'Checking in...',
      bot_reaction: followUp.trim(),
    });
  }

  return callbacks;
}

// ============ Master Function ============

export interface LLMFeaturesInput {
  week: number;
  pairs: MatchupPair[];
  upcomingPairs: Array<{ teams: string[] }>;
  picks: ForecastPick[];
  trades: TradeItem[];
  standings?: Array<{ name: string; wins: number; losses: number; pointsFor: number }>;
  h2hData?: Record<string, Record<string, { wins: number; losses: number }>>;
  previousPredictions?: Array<{ week: number; pick: string; actual: string; correct: boolean }>;
  previousHotTakes?: WeeklyHotTake[];
  context: string;
}

export interface LLMFeaturesOutput {
  debates: BotDebate[];
  hotTakes: WeeklyHotTake[];
  awards: WeeklyAwards;
  whatIfs: WhatIfScenario[];
  dynastyAnalysis: DynastyAnalysis[];
  rivalries: RivalryMatchup[];
  playoffOdds: PlayoffOddsSection | null;
  callbacks: NarrativeCallback[];
}

/**
 * Generate all LLM-powered features in parallel where possible
 */
export async function generateAllLLMFeatures(input: LLMFeaturesInput): Promise<LLMFeaturesOutput> {
  const {
    week,
    pairs,
    upcomingPairs,
    picks,
    trades,
    standings,
    h2hData,
    previousPredictions,
    previousHotTakes,
    context,
  } = input;

  // Run independent features in parallel
  const [debates, hotTakes, awards, whatIfs, dynastyAnalysis, rivalries, playoffOdds, callbacks] = await Promise.all([
    generateBotDebates(picks, context),
    generateHotTakes(week, context, standings),
    generateWeeklyAwards(pairs, context),
    generateWhatIfScenarios(pairs, context),
    generateDynastyAnalysis(trades, context),
    detectRivalries(upcomingPairs, h2hData, context),
    standings && standings.length > 0 
      ? generatePlayoffOddsCommentary(week, standings, 6, context)
      : Promise.resolve(null),
    generateNarrativeCallbacks(
      week,
      previousPredictions || [],
      previousHotTakes || [],
      pairs,
      context
    ),
  ]);

  return {
    debates,
    hotTakes,
    awards,
    whatIfs,
    dynastyAnalysis,
    rivalries,
    playoffOdds,
    callbacks,
  };
}
