/**
 * Enhanced Context Builder
 * 
 * Aggregates ALL available data sources to provide rich context for newsletter bots.
 * This is the comprehensive context system that powers bot awareness.
 * 
 * Integrates:
 * 1. Real Bot Memory (predictions, hot takes, accuracy tracking)
 * 2. H2H Data (head-to-head history between teams)
 * 3. Trade History (recent trades, buyers vs sellers)
 * 4. Weekly High Scores / Records
 * 5. Playoff Implications (magic numbers, elimination scenarios)
 * 6. Bot-to-Bot Interaction (disagreements, who was right)
 * 7. Player-Level Context (breakouts, injuries)
 * 8. Previous Newsletter Callbacks (grade past predictions)
 */

import type { 
  BotName, 
  EnhancedBotMemory, 
  PredictionRecord, 
  HotTake, 
  Narrative,
} from './types';

// ============ Types ============

export interface H2HMatchupHistory {
  team1: string;
  team2: string;
  meetings: number;
  team1Wins: number;
  team2Wins: number;
  ties: number;
  currentStreak: { team: string; count: number } | null;
  lastMeeting?: { year: string; week: number; winner: string; score: string };
  playoffMeetings: number;
  championshipMeetings: number;
}

export interface TradeContext {
  recentTrades: Array<{
    date: string;
    week: number;
    teams: string[];
    headline: string;
    assets: Record<string, { gets: string[]; gives: string[] }>;
  }>;
  buyerTeams: string[];  // Teams acquiring proven talent
  sellerTeams: string[]; // Teams selling for picks
  mostActiveTrader: string | null;
  biggestTrade: { teams: string[]; headline: string } | null;
}

export interface LeagueRecords {
  highestWeeklyScore: { team: string; points: number; week: number; season: number } | null;
  lowestWinningScore: { team: string; points: number; week: number; season: number } | null;
  biggestBlowout: { winner: string; loser: string; margin: number; week: number; season: number } | null;
  closestGame: { winner: string; loser: string; margin: number; week: number; season: number } | null;
  longestWinStreak: { team: string; streak: number; season: number } | null;
  currentWeekNotable: string[]; // "3rd highest score ever", "new record", etc.
}

export interface PlayoffImplications {
  week: number;
  playoffSpots: number;
  teamsInPlayoffPosition: string[];
  teamsOnBubble: string[];
  teamsEliminated: string[];
  clinchScenarios: Array<{ team: string; scenario: string }>;
  eliminationScenarios: Array<{ team: string; scenario: string }>;
  magicNumbers: Record<string, number>; // team -> wins needed to clinch
}

export interface BotDisagreement {
  week: number;
  topic: string;
  entertainerPosition: string;
  analystPosition: string;
  resolved: boolean;
  winner?: 'entertainer' | 'analyst' | 'push';
  resolution?: string;
}

export interface PlayerBreakout {
  playerName: string;
  position: string;
  team: string; // Fantasy team
  nflTeam: string;
  thisWeekPoints: number;
  seasonAverage: number;
  percentAboveAverage: number;
  note: string;
}

export interface PreviousPrediction {
  week: number;
  bot: BotName;
  prediction: string;
  subject: string;
  result: 'correct' | 'wrong' | 'pending';
  actualOutcome?: string;
}

export interface EnhancedContextData {
  // Core
  week: number;
  season: number;
  
  // 1. Bot Memory
  entertainerMemory: EnhancedBotMemory | null;
  analystMemory: EnhancedBotMemory | null;
  
  // 2. H2H History
  h2hForThisWeek: H2HMatchupHistory[];
  notableH2H: string[]; // "Team A has never beaten Team B", etc.
  
  // 3. Trade Context
  tradeContext: TradeContext;
  
  // 4. Records
  leagueRecords: LeagueRecords;
  
  // 5. Playoff Implications
  playoffImplications: PlayoffImplications | null;
  
  // 6. Bot Disagreements
  activeDisagreements: BotDisagreement[];
  recentResolutions: BotDisagreement[];
  predictionRecords: {
    entertainer: { correct: number; wrong: number; rate: number };
    analyst: { correct: number; wrong: number; rate: number };
  };
  
  // 7. Player Context
  breakoutPerformances: PlayerBreakout[];
  injuryImpacts: Array<{ player: string; team: string; impact: string }>;
  
  // 8. Previous Predictions to Grade
  predictionsToGrade: PreviousPrediction[];
  hotTakesToRevisit: HotTake[];
}

// ============ Memory Helpers ============

export function createEnhancedMemory(bot: BotName, season: number): EnhancedBotMemory {
  return {
    bot,
    season,
    updated_at: new Date().toISOString(),
    lastGeneratedWeek: 0,
    summaryMood: 'Focused',
    narratives: [],
    teams: {},
    predictions: [],
    predictionStats: {
      correct: 0,
      wrong: 0,
      winRate: 0,
      hotStreak: 0,
      bestStreak: 0,
      worstStreak: 0,
    },
    hotTakes: [],
    milestones: [],
  };
}

export function recordPrediction(
  memory: EnhancedBotMemory,
  prediction: Omit<PredictionRecord, 'result' | 'actualWinner' | 'margin'>
): void {
  memory.predictions.push({
    ...prediction,
    result: undefined,
  });
}

export function gradePrediction(
  memory: EnhancedBotMemory,
  week: number,
  matchupId: string | number,
  actualWinner: string,
  margin: number
): void {
  const pred = memory.predictions.find(
    p => p.week === week && p.matchupId === matchupId && !p.result
  );
  if (!pred) return;
  
  pred.actualWinner = actualWinner;
  pred.margin = margin;
  pred.result = pred.pick === actualWinner ? 'correct' : 'wrong';
  
  // Update stats
  const stats = memory.predictionStats;
  if (pred.result === 'correct') {
    stats.correct++;
    stats.hotStreak = stats.hotStreak >= 0 ? stats.hotStreak + 1 : 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.hotStreak);
  } else {
    stats.wrong++;
    stats.hotStreak = stats.hotStreak <= 0 ? stats.hotStreak - 1 : -1;
    stats.worstStreak = Math.min(stats.worstStreak, stats.hotStreak);
  }
  stats.winRate = stats.correct / (stats.correct + stats.wrong);
}

export function recordHotTake(
  memory: EnhancedBotMemory,
  take: Omit<HotTake, 'agedWell' | 'followUp'>
): void {
  memory.hotTakes.push({
    ...take,
    agedWell: undefined,
    followUp: undefined,
  });
}

export function gradeHotTake(
  memory: EnhancedBotMemory,
  week: number,
  agedWell: boolean,
  followUp: string
): void {
  const take = memory.hotTakes.find(t => t.week === week && t.agedWell === undefined);
  if (take) {
    take.agedWell = agedWell;
    take.followUp = followUp;
  }
}

export function addNarrative(
  memory: EnhancedBotMemory,
  narrative: Omit<Narrative, 'id' | 'resolved' | 'resolution'>
): void {
  memory.narratives.push({
    ...narrative,
    id: `${narrative.type}-${narrative.teams.join('-')}-${narrative.startedWeek}`,
    resolved: false,
  });
}

export function resolveNarrative(
  memory: EnhancedBotMemory,
  narrativeId: string,
  resolution: string
): void {
  const narrative = memory.narratives.find(n => n.id === narrativeId);
  if (narrative) {
    narrative.resolved = true;
    narrative.resolution = resolution;
  }
}

// ============ H2H Context Builder ============

export function buildH2HContext(
  h2hData: Record<string, Record<string, { 
    meetings: number; 
    wins: { total: number; playoffs: number }; 
    losses: { total: number }; 
    lastMeeting?: { year: string; week: number } 
  }>>,
  thisWeekMatchups: Array<{ team1: string; team2: string }>
): { h2hForThisWeek: H2HMatchupHistory[]; notableH2H: string[] } {
  const h2hForThisWeek: H2HMatchupHistory[] = [];
  const notableH2H: string[] = [];
  
  for (const matchup of thisWeekMatchups) {
    const { team1, team2 } = matchup;
    const t1Data = h2hData[team1]?.[team2];
    const t2Data = h2hData[team2]?.[team1];
    
    if (!t1Data && !t2Data) {
      h2hForThisWeek.push({
        team1,
        team2,
        meetings: 0,
        team1Wins: 0,
        team2Wins: 0,
        ties: 0,
        currentStreak: null,
        playoffMeetings: 0,
        championshipMeetings: 0,
      });
      notableH2H.push(`${team1} and ${team2} have never played each other!`);
      continue;
    }
    
    const meetings = t1Data?.meetings || 0;
    const team1Wins = t1Data?.wins?.total || 0;
    const team2Wins = t2Data?.wins?.total || 0;
    const playoffMeetings = (t1Data?.wins?.playoffs || 0) + (t2Data?.wins?.playoffs || 0);
    
    const history: H2HMatchupHistory = {
      team1,
      team2,
      meetings,
      team1Wins,
      team2Wins,
      ties: meetings - team1Wins - team2Wins,
      currentStreak: null, // Would need more data to calculate
      playoffMeetings,
      championshipMeetings: 0, // Would need championship data
    };
    
    if (t1Data?.lastMeeting) {
      history.lastMeeting = {
        ...t1Data.lastMeeting,
        winner: team1Wins > team2Wins ? team1 : team2,
        score: 'N/A',
      };
    }
    
    h2hForThisWeek.push(history);
    
    // Generate notable H2H facts
    if (team1Wins === 0 && meetings > 0) {
      notableH2H.push(`🔥 ${team1} has NEVER beaten ${team2} in ${meetings} meetings!`);
    } else if (team2Wins === 0 && meetings > 0) {
      notableH2H.push(`🔥 ${team2} has NEVER beaten ${team1} in ${meetings} meetings!`);
    } else if (Math.abs(team1Wins - team2Wins) >= 3) {
      const dominant = team1Wins > team2Wins ? team1 : team2;
      const dominated = team1Wins > team2Wins ? team2 : team1;
      const record = team1Wins > team2Wins ? `${team1Wins}-${team2Wins}` : `${team2Wins}-${team1Wins}`;
      notableH2H.push(`${dominant} owns ${dominated} with a ${record} all-time record`);
    }
    
    if (playoffMeetings > 0) {
      notableH2H.push(`${team1} and ${team2} have met ${playoffMeetings} times in the playoffs`);
    }
  }
  
  return { h2hForThisWeek, notableH2H };
}

// ============ Trade Context Builder ============

export function buildTradeContext(
  trades: Array<{
    id: string;
    date: string;
    week?: number;
    teams: Array<{ name: string; assets: { gets: string[]; gives: string[] } }>;
  }>,
  currentWeek: number
): TradeContext {
  const recentTrades = trades
    .filter(t => t.week && t.week >= currentWeek - 3)
    .slice(0, 5)
    .map(t => ({
      date: t.date,
      week: t.week || 0,
      teams: t.teams.map(tm => tm.name),
      headline: `${t.teams.map(tm => tm.name).join(' ↔ ')}`,
      assets: Object.fromEntries(t.teams.map(tm => [tm.name, tm.assets])),
    }));
  
  // Analyze buyer vs seller patterns
  const teamActivity: Record<string, { picks: number; players: number }> = {};
  
  for (const trade of trades.filter(t => t.week && t.week >= currentWeek - 4)) {
    for (const team of trade.teams) {
      if (!teamActivity[team.name]) {
        teamActivity[team.name] = { picks: 0, players: 0 };
      }
      // Count picks received vs players received
      for (const asset of team.assets.gets) {
        if (asset.toLowerCase().includes('pick') || asset.toLowerCase().includes('round')) {
          teamActivity[team.name].picks++;
        } else {
          teamActivity[team.name].players++;
        }
      }
    }
  }
  
  const buyerTeams = Object.entries(teamActivity)
    .filter(([, activity]) => activity.players > activity.picks)
    .map(([name]) => name);
  
  const sellerTeams = Object.entries(teamActivity)
    .filter(([, activity]) => activity.picks > activity.players)
    .map(([name]) => name);
  
  const tradeCounts = trades.reduce((acc, t) => {
    for (const team of t.teams) {
      acc[team.name] = (acc[team.name] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  
  const mostActiveTrader = Object.entries(tradeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  
  return {
    recentTrades,
    buyerTeams,
    sellerTeams,
    mostActiveTrader,
    biggestTrade: recentTrades[0] ? { 
      teams: recentTrades[0].teams, 
      headline: recentTrades[0].headline 
    } : null,
  };
}

// ============ Playoff Implications Calculator ============

export function calculatePlayoffImplications(
  standings: Array<{ team: string; wins: number; losses: number; pointsFor: number }>,
  week: number,
  playoffSpots: number = 6,
  regularSeasonWeeks: number = 14
): PlayoffImplications | null {
  if (week > regularSeasonWeeks) return null; // Already in playoffs
  
  const weeksRemaining = regularSeasonWeeks - week;
  const sorted = [...standings].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointsFor - a.pointsFor;
  });
  
  const teamsInPlayoffPosition = sorted.slice(0, playoffSpots).map(s => s.team);
  const bubbleTeam = sorted[playoffSpots - 1];
  const firstOut = sorted[playoffSpots];
  
  const teamsOnBubble: string[] = [];
  const teamsEliminated: string[] = [];
  const clinchScenarios: Array<{ team: string; scenario: string }> = [];
  const eliminationScenarios: Array<{ team: string; scenario: string }> = [];
  const magicNumbers: Record<string, number> = {};
  
  for (const team of sorted) {
    const maxPossibleWins = team.wins + weeksRemaining;
    const minWinsToMakePossible = bubbleTeam ? bubbleTeam.wins : 0;
    
    // Check if eliminated
    if (maxPossibleWins < minWinsToMakePossible) {
      teamsEliminated.push(team.team);
      continue;
    }
    
    // Check if on bubble (within 2 games of playoff line)
    const gamesBack = (bubbleTeam?.wins || 0) - team.wins;
    if (gamesBack > 0 && gamesBack <= 2) {
      teamsOnBubble.push(team.team);
    }
    
    // Calculate magic number (wins needed to clinch)
    if (firstOut) {
      const magicNumber = (regularSeasonWeeks + 1) - team.wins - (regularSeasonWeeks - firstOut.wins);
      if (magicNumber > 0 && magicNumber <= weeksRemaining) {
        magicNumbers[team.team] = magicNumber;
        if (magicNumber === 1) {
          clinchScenarios.push({ team: team.team, scenario: 'Clinches with a win' });
        } else if (magicNumber <= 2) {
          clinchScenarios.push({ team: team.team, scenario: `Needs ${magicNumber} more wins to clinch` });
        }
      }
    }
    
    // Elimination scenarios for bubble teams
    if (teamsOnBubble.includes(team.team)) {
      eliminationScenarios.push({ 
        team: team.team, 
        scenario: `Must win to stay alive in playoff race` 
      });
    }
  }
  
  return {
    week,
    playoffSpots,
    teamsInPlayoffPosition,
    teamsOnBubble,
    teamsEliminated,
    clinchScenarios,
    eliminationScenarios,
    magicNumbers,
  };
}

// ============ Records Tracker ============

export function checkForRecords(
  thisWeekResults: Array<{ team: string; points: number; opponent: string; opponentPoints: number }>,
  existingRecords: LeagueRecords,
  week: number,
  season: number
): { updatedRecords: LeagueRecords; notableThisWeek: string[] } {
  const notableThisWeek: string[] = [];
  const updatedRecords = { ...existingRecords };
  
  for (const result of thisWeekResults) {
    const { team, points, opponent, opponentPoints } = result;
    const margin = Math.abs(points - opponentPoints);
    const winner = points > opponentPoints ? team : opponent;
    const loser = points > opponentPoints ? opponent : team;
    const winnerPoints = Math.max(points, opponentPoints);
    
    // Check highest weekly score
    if (!updatedRecords.highestWeeklyScore || winnerPoints > updatedRecords.highestWeeklyScore.points) {
      if (updatedRecords.highestWeeklyScore) {
        notableThisWeek.push(`🚨 NEW LEAGUE RECORD! ${winner} scored ${winnerPoints.toFixed(1)} points - the highest single-week score in league history!`);
      }
      updatedRecords.highestWeeklyScore = { team: winner, points: winnerPoints, week, season };
    } else if (winnerPoints > (updatedRecords.highestWeeklyScore.points * 0.95)) {
      notableThisWeek.push(`${winner}'s ${winnerPoints.toFixed(1)} points is the ${getOrdinal(2)} highest score in league history`);
    }
    
    // Check biggest blowout
    if (!updatedRecords.biggestBlowout || margin > updatedRecords.biggestBlowout.margin) {
      if (updatedRecords.biggestBlowout) {
        notableThisWeek.push(`${winner} beat ${loser} by ${margin.toFixed(1)} - the biggest blowout in league history!`);
      }
      updatedRecords.biggestBlowout = { winner, loser, margin, week, season };
    }
    
    // Check closest game
    if (margin > 0 && (!updatedRecords.closestGame || margin < updatedRecords.closestGame.margin)) {
      notableThisWeek.push(`${winner} edged ${loser} by just ${margin.toFixed(1)} points - one of the closest games ever!`);
      updatedRecords.closestGame = { winner, loser, margin, week, season };
    }
    
    // Check lowest winning score
    if (!updatedRecords.lowestWinningScore || winnerPoints < updatedRecords.lowestWinningScore.points) {
      notableThisWeek.push(`${winner} won with just ${winnerPoints.toFixed(1)} points - the lowest winning score in league history`);
      updatedRecords.lowestWinningScore = { team: winner, points: winnerPoints, week, season };
    }
  }
  
  updatedRecords.currentWeekNotable = notableThisWeek;
  return { updatedRecords, notableThisWeek };
}

function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ============ Bot Disagreement Tracker ============

export function trackDisagreement(
  entertainerPick: string,
  analystPick: string,
  topic: string,
  week: number
): BotDisagreement | null {
  if (entertainerPick === analystPick) return null;
  
  return {
    week,
    topic,
    entertainerPosition: entertainerPick,
    analystPosition: analystPick,
    resolved: false,
  };
}

export function resolveDisagreement(
  disagreement: BotDisagreement,
  actualOutcome: string
): BotDisagreement {
  const entertainerRight = disagreement.entertainerPosition.toLowerCase().includes(actualOutcome.toLowerCase());
  const analystRight = disagreement.analystPosition.toLowerCase().includes(actualOutcome.toLowerCase());
  
  return {
    ...disagreement,
    resolved: true,
    winner: entertainerRight && !analystRight ? 'entertainer' 
          : analystRight && !entertainerRight ? 'analyst' 
          : 'push',
    resolution: actualOutcome,
  };
}

// ============ Player Breakout Detection ============

export function detectBreakouts(
  thisWeekStats: Array<{ 
    playerId: string; 
    playerName: string; 
    position: string; 
    fantasyTeam: string; 
    nflTeam: string;
    points: number; 
    seasonAverage: number 
  }>,
  threshold: number = 1.5 // 50% above average
): PlayerBreakout[] {
  return thisWeekStats
    .filter(p => p.seasonAverage > 0 && p.points > p.seasonAverage * threshold)
    .map(p => ({
      playerName: p.playerName,
      position: p.position,
      team: p.fantasyTeam,
      nflTeam: p.nflTeam,
      thisWeekPoints: p.points,
      seasonAverage: p.seasonAverage,
      percentAboveAverage: ((p.points - p.seasonAverage) / p.seasonAverage) * 100,
      note: p.points > p.seasonAverage * 2 
        ? `MONSTER game - doubled their season average!`
        : `Breakout performance - ${((p.points / p.seasonAverage - 1) * 100).toFixed(0)}% above average`,
    }))
    .sort((a, b) => b.percentAboveAverage - a.percentAboveAverage)
    .slice(0, 5);
}

// ============ Main Context Builder ============

export function buildEnhancedContextString(data: EnhancedContextData): string {
  const lines: string[] = [];
  
  // Header
  lines.push(`=== ENHANCED BOT CONTEXT - Week ${data.week}, Season ${data.season} ===`);
  lines.push('');
  
  // 1. Bot Memory Summary
  if (data.entertainerMemory || data.analystMemory) {
    lines.push('--- BOT MEMORY STATUS ---');
    if (data.entertainerMemory) {
      const em = data.entertainerMemory;
      lines.push(`ENTERTAINER: Mood=${em.summaryMood}, Predictions=${em.predictionStats.correct}-${em.predictionStats.wrong} (${(em.predictionStats.winRate * 100).toFixed(0)}%)`);
      if (em.predictionStats.hotStreak > 2) lines.push(`  🔥 On a ${em.predictionStats.hotStreak}-game correct streak!`);
      if (em.predictionStats.hotStreak < -2) lines.push(`  😬 On a ${Math.abs(em.predictionStats.hotStreak)}-game wrong streak`);
    }
    if (data.analystMemory) {
      const am = data.analystMemory;
      lines.push(`ANALYST: Mood=${am.summaryMood}, Predictions=${am.predictionStats.correct}-${am.predictionStats.wrong} (${(am.predictionStats.winRate * 100).toFixed(0)}%)`);
      if (am.predictionStats.hotStreak > 2) lines.push(`  🔥 On a ${am.predictionStats.hotStreak}-game correct streak!`);
      if (am.predictionStats.hotStreak < -2) lines.push(`  😬 On a ${Math.abs(am.predictionStats.hotStreak)}-game wrong streak`);
    }
    lines.push('');
  }
  
  // 2. H2H Context
  if (data.notableH2H.length > 0) {
    lines.push('--- HEAD-TO-HEAD HISTORY ---');
    data.notableH2H.forEach(h => lines.push(h));
    lines.push('');
  }
  
  // 3. Trade Context
  if (data.tradeContext.recentTrades.length > 0) {
    lines.push('--- RECENT TRADE ACTIVITY ---');
    data.tradeContext.recentTrades.slice(0, 3).forEach(t => {
      lines.push(`Week ${t.week}: ${t.headline}`);
    });
    if (data.tradeContext.buyerTeams.length > 0) {
      lines.push(`Buyers (acquiring talent): ${data.tradeContext.buyerTeams.join(', ')}`);
    }
    if (data.tradeContext.sellerTeams.length > 0) {
      lines.push(`Sellers (stockpiling picks): ${data.tradeContext.sellerTeams.join(', ')}`);
    }
    lines.push('');
  }
  
  // 4. Records
  if (data.leagueRecords.currentWeekNotable && data.leagueRecords.currentWeekNotable.length > 0) {
    lines.push('--- NOTABLE RECORDS THIS WEEK ---');
    data.leagueRecords.currentWeekNotable.forEach(r => lines.push(r));
    lines.push('');
  }
  
  // 5. Playoff Implications
  if (data.playoffImplications) {
    const pi = data.playoffImplications;
    lines.push('--- PLAYOFF IMPLICATIONS ---');
    lines.push(`In playoff position: ${pi.teamsInPlayoffPosition.join(', ')}`);
    if (pi.teamsOnBubble.length > 0) {
      lines.push(`On the bubble: ${pi.teamsOnBubble.join(', ')}`);
    }
    if (pi.teamsEliminated.length > 0) {
      lines.push(`Eliminated: ${pi.teamsEliminated.join(', ')}`);
    }
    pi.clinchScenarios.forEach(s => lines.push(`${s.team}: ${s.scenario}`));
    pi.eliminationScenarios.forEach(s => lines.push(`${s.team}: ${s.scenario}`));
    lines.push('');
  }
  
  // 6. Bot Disagreements
  if (data.activeDisagreements.length > 0 || data.recentResolutions.length > 0) {
    lines.push('--- BOT DISAGREEMENTS ---');
    lines.push(`Entertainer record: ${data.predictionRecords.entertainer.correct}-${data.predictionRecords.entertainer.wrong}`);
    lines.push(`Analyst record: ${data.predictionRecords.analyst.correct}-${data.predictionRecords.analyst.wrong}`);
    data.recentResolutions.slice(0, 3).forEach(d => {
      lines.push(`Week ${d.week} "${d.topic}": ${d.winner === 'entertainer' ? 'Entertainer was RIGHT' : d.winner === 'analyst' ? 'Analyst was RIGHT' : 'Push'}`);
    });
    lines.push('');
  }
  
  // 7. Player Breakouts
  if (data.breakoutPerformances.length > 0) {
    lines.push('--- BREAKOUT PERFORMANCES ---');
    data.breakoutPerformances.forEach(p => {
      lines.push(`${p.playerName} (${p.position}, ${p.team}): ${p.thisWeekPoints.toFixed(1)} pts - ${p.note}`);
    });
    lines.push('');
  }
  
  // 8. Previous Predictions to Grade
  if (data.predictionsToGrade.length > 0) {
    lines.push('--- PREDICTIONS TO GRADE FROM LAST WEEK ---');
    data.predictionsToGrade.forEach(p => {
      const emoji = p.result === 'correct' ? '✓' : p.result === 'wrong' ? '✗' : '?';
      lines.push(`[${emoji}] ${p.bot}: "${p.prediction}" → ${p.actualOutcome || 'pending'}`);
    });
    lines.push('');
  }
  
  if (data.hotTakesToRevisit.length > 0) {
    lines.push('--- HOT TAKES TO REVISIT ---');
    data.hotTakesToRevisit.forEach(t => {
      const aged = t.agedWell === true ? '✓ Aged well' : t.agedWell === false ? '✗ Aged poorly' : '? TBD';
      lines.push(`Week ${t.week}: "${t.take}" [${aged}]`);
    });
    lines.push('');
  }
  
  return lines.join('\n');
}

// ============ Serialization ============

export function serializeEnhancedMemory(memory: EnhancedBotMemory): string {
  return JSON.stringify(memory);
}

export function deserializeEnhancedMemory(json: string): EnhancedBotMemory {
  return JSON.parse(json) as EnhancedBotMemory;
}
