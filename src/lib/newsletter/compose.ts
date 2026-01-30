/**
 * Compose Module
 * Assembles all newsletter sections into a complete newsletter object
 * Uses Groq LLM for natural language generation
 */

import type {
  Newsletter,
  NewsletterSection,
  DerivedData,
  BotMemory,
  ForecastData,
  IntroSection,
  WaiverItem,
  TradeItem,
  SpotlightSection,
  FinalWordSection,
  CallbacksSection,
  RecapItem,
} from './types';
import { generateSection } from './llm/groq';

// ============ Helper Functions ============

function countBy<T>(arr: T[], pred: (x: T) => boolean): number {
  return arr.reduce((n, x) => n + (pred(x) ? 1 : 0), 0);
}

function getSeasonalContext(week: number): string {
  // Fantasy playoffs typically start Week 15, championship Week 17
  const TRADE_DEADLINE_WEEK = 12;
  const PLAYOFFS_START_WEEK = 15;
  const SEMIFINAL_WEEK = 16;
  const CHAMPIONSHIP_WEEK = 17;

  if (week >= CHAMPIONSHIP_WEEK) {
    return `🏆 CHAMPIONSHIP WEEK! This is it - the final showdown. One team will be crowned champion. Maximum stakes, maximum drama.`;
  } else if (week >= SEMIFINAL_WEEK) {
    return `🔥 PLAYOFF SEMIFINALS! Only 4 teams remain. Win or go home. Every point matters.`;
  } else if (week >= PLAYOFFS_START_WEEK) {
    return `🏈 PLAYOFFS HAVE BEGUN! The regular season is over. This is single elimination - lose and your season ends.`;
  } else if (week === PLAYOFFS_START_WEEK - 1) {
    return `⚡ FINAL WEEK OF REGULAR SEASON! Playoff spots are on the line. Some teams are fighting for their lives, others are locked in.`;
  } else if (week === PLAYOFFS_START_WEEK - 2) {
    return `📊 Two weeks until playoffs. Seeding battles are heating up. Every win matters for playoff positioning.`;
  } else if (week === TRADE_DEADLINE_WEEK) {
    return `🚨 TRADE DEADLINE WEEK! Last chance to make moves. Contenders are loading up, rebuilders are selling.`;
  } else if (week === TRADE_DEADLINE_WEEK - 1) {
    return `⏰ One week until trade deadline. The trade market is heating up. Make your moves or hold your ground.`;
  } else if (week <= 3) {
    return `📅 Early season - Week ${week}. Sample sizes are small. Don't overreact... but also, maybe overreact a little.`;
  } else if (week <= 6) {
    return `📈 We're getting into the meat of the season. Trends are starting to emerge. Contenders and pretenders are separating.`;
  } else if (week <= 10) {
    return `🎯 Midseason grind. Playoff pictures are forming. Time to make your push or start planning for next year.`;
  } else {
    return `📊 Late regular season - Week ${week}. Playoff races are tightening. Every matchup has implications.`;
  }
}

// ============ LLM-Powered Section Builders ============

async function buildIntro(
  week: number,
  pairs: DerivedData['matchup_pairs'],
  events: DerivedData['events_scored'],
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  enhancedContext: string = ''
): Promise<IntroSection> {
  const numGames = pairs.length;
  const blowouts = countBy(pairs, p => p.margin >= 30);
  const nailbiters = countBy(pairs, p => p.margin <= 5);
  const biggest = pairs[0] || null;
  const closest = pairs.reduce((a, b) => (!a || b.margin < a.margin ? b : a), null as typeof pairs[0] | null);
  const trades = events.filter(e => e.type === 'trade').length;
  const waivers = events.filter(e => e.type === 'waiver' || e.type === 'fa_add').length;
  const seasonalContext = getSeasonalContext(week);

  const context = `SEASONAL CONTEXT: ${seasonalContext}
${enhancedContext}

Week ${week} Summary:
- ${numGames} matchups played
- ${blowouts} blowouts (30+ point margins)
- ${nailbiters} nail-biters (5 or fewer points)
- Biggest win: ${biggest ? `${biggest.winner.name} beat ${biggest.loser.name} by ${biggest.margin.toFixed(1)}` : 'N/A'}
- Closest game: ${closest ? `${closest.winner.name} edged ${closest.loser.name} by ${closest.margin.toFixed(1)}` : 'N/A'}
- ${trades} trades this week
- ${waivers} waiver/FA moves

Your current mood: ${memEntertainer.summaryMood || 'Neutral'}`;

  const [bot1_text, bot2_text] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Intro',
      context,
      constraints: 'Write 2-4 sentences. Set the tone for the newsletter. Be energetic and opinionated.',
      maxTokens: 200,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Intro',
      context: context.replace(memEntertainer.summaryMood || 'Neutral', memAnalyst.summaryMood || 'Neutral'),
      constraints: 'Write 2-3 sentences. Provide a measured overview. Reference key stats.',
      maxTokens: 150,
    }),
  ]);

  return { bot1_text, bot2_text };
}

async function buildWaiverItems(events: DerivedData['events_scored']): Promise<WaiverItem[]> {
  const waiverEvents = events.filter(e => e.type === 'waiver' || (e.type === 'fa_add' && e.relevance_score >= 40));
  
  if (waiverEvents.length === 0) return [];

  // Build context for all waivers at once to save API calls
  const waiverContext = waiverEvents.map(e => 
    `- ${e.team} added ${e.player || 'unknown player'} (relevance: ${e.relevance_score}/100)`
  ).join('\n');

  const [entertainerResponse, analystResponse] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Waivers',
      context: `Waiver wire moves this week:\n${waiverContext}`,
      constraints: `Give a brief hot take on each move. One sentence per move. Be spicy about the good pickups and skeptical about the bad ones.`,
      maxTokens: 300,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Waivers',
      context: `Waiver wire moves this week:\n${waiverContext}`,
      constraints: `Analyze each move briefly. One sentence per move. Focus on role, usage, and upside.`,
      maxTokens: 300,
    }),
  ]);

  // Parse responses and match to events
  const entLines = entertainerResponse.split('\n').filter(l => l.trim());
  const anaLines = analystResponse.split('\n').filter(l => l.trim());

  return waiverEvents.map((e, i) => ({
    event_id: e.event_id,
    coverage_level: e.coverage_level,
    reasons: e.reasons || [],
    bot1: entLines[i] || `${e.team} makes a move with ${e.player || 'a player'}.`,
    bot2: anaLines[i] || `${e.team} adds ${e.player || 'a player'}. Monitor usage.`,
  }));
}

async function buildTradeItems(events: DerivedData['events_scored']): Promise<TradeItem[]> {
  const tradeEvents = events.filter(e => e.type === 'trade');
  
  if (tradeEvents.length === 0) return [];

  const items: TradeItem[] = [];

  for (const e of tradeEvents) {
    const tradeContext = e.details?.headline
      ? `${e.parties?.join(' traded with ')}: ${e.details.headline}`
      : `Trade between ${e.parties?.join(' and ') || 'teams'}`;

    const [entertainerResponse, analystResponse] = await Promise.all([
      generateSection({
        persona: 'entertainer',
        sectionType: 'Trade Analysis',
        context: `Trade: ${tradeContext}\nParties: ${e.parties?.join(', ')}\nRelevance score: ${e.relevance_score}/100`,
        constraints: 'Give your hot take on this trade. Who won? Who got fleeced? 2-3 sentences max. Be bold.',
        maxTokens: 150,
      }),
      generateSection({
        persona: 'analyst',
        sectionType: 'Trade Analysis',
        context: `Trade: ${tradeContext}\nParties: ${e.parties?.join(', ')}\nRelevance score: ${e.relevance_score}/100`,
        constraints: 'Analyze this trade objectively. Consider value, roster fit, and timeline. 2-3 sentences.',
        maxTokens: 150,
      }),
    ]);

    const analysis: Record<string, { grade: string; deltaText: string; entertainer_paragraph: string; analyst_paragraph: string }> = {};
    
    for (const party of e.parties || []) {
      const grade = e.relevance_score >= 70 ? 'B+' : e.relevance_score >= 50 ? 'B' : 'C+';
      analysis[party] = {
        grade,
        deltaText: 'see analysis',
        entertainer_paragraph: entertainerResponse,
        analyst_paragraph: analystResponse,
      };
    }

    items.push({
      event_id: e.event_id,
      coverage_level: e.coverage_level,
      reasons: e.reasons || [],
      context: tradeContext,
      teams: e.details?.by_team || null,
      analysis,
    });
  }

  return items;
}

async function buildSpotlight(pairs: DerivedData['matchup_pairs'], memEntertainer: BotMemory, memAnalyst: BotMemory, enhancedContext: string = ''): Promise<SpotlightSection | null> {
  const spotlightPair = pairs[0] || null;
  if (!spotlightPair) return null;

  const context = `Team of the Week: ${spotlightPair.winner.name}
- Beat ${spotlightPair.loser.name} by ${spotlightPair.margin.toFixed(1)} points
- Scored ${spotlightPair.winner.points.toFixed(1)} total points
- This was the biggest margin of victory this week
- Your history with this team: ${memEntertainer.teams[spotlightPair.winner.name]?.mood || 'Neutral'}
${enhancedContext}`;

  const [bot1, bot2] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Spotlight',
      context,
      constraints: 'Hype up or roast this team based on their performance. 2-3 sentences. Be memorable.',
      maxTokens: 150,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Spotlight',
      context: context.replace(memEntertainer.teams[spotlightPair.winner.name]?.mood || 'Neutral', memAnalyst.teams[spotlightPair.winner.name]?.mood || 'Neutral'),
      constraints: 'Analyze what made this performance notable. Is it sustainable? 2-3 sentences.',
      maxTokens: 150,
    }),
  ]);

  return { team: spotlightPair.winner.name, bot1, bot2 };
}

async function buildFinalWord(week: number): Promise<FinalWordSection> {
  const context = `Week ${week} is in the books. Sign off the newsletter with a memorable closing thought.`;

  const [bot1, bot2] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Final Word',
      context,
      constraints: 'One punchy sentence to close the show. Make it memorable. Tease next week.',
      maxTokens: 60,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Final Word',
      context,
      constraints: 'One measured closing thought. Keep it brief and professional.',
      maxTokens: 60,
    }),
  ]);

  return { bot1, bot2 };
}

async function buildRecaps(
  pairs: DerivedData['matchup_pairs'],
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  week: number,
  enhancedContext: string = ''
): Promise<RecapItem[]> {
  if (pairs.length === 0) return [];

  const seasonalContext = getSeasonalContext(week);

  // Build context for all matchups
  const matchupContext = pairs.map((p, i) => 
    `${i + 1}. ${p.winner.name} (${p.winner.points.toFixed(1)}) beat ${p.loser.name} (${p.loser.points.toFixed(1)}) by ${p.margin.toFixed(1)} points`
  ).join('\n');

  const [entertainerResponse, analystResponse] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Matchup Recaps',
      context: `SEASONAL CONTEXT: ${seasonalContext}${enhancedContext}\n\nThis week's matchup results:\n${matchupContext}\n\nYour mood toward teams: ${JSON.stringify(Object.fromEntries(Object.entries(memEntertainer.teams || {}).map(([k, v]) => [k, v.mood])))}`,
      constraints: `Write a brief, punchy recap for EACH matchup. One paragraph per matchup, numbered to match. Be dramatic about blowouts, sarcastic about close losses. Reference the seasonal stakes, standings, and division rivalry when relevant!`,
      maxTokens: 600,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Matchup Recaps',
      context: `SEASONAL CONTEXT: ${seasonalContext}${enhancedContext}\n\nThis week's matchup results:\n${matchupContext}\n\nYour assessment of teams: ${JSON.stringify(Object.fromEntries(Object.entries(memAnalyst.teams || {}).map(([k, v]) => [k, v.mood])))}`,
      constraints: `Write a brief analytical recap for EACH matchup. One paragraph per matchup, numbered to match. Consider playoff implications, standings context, and seasonal timing.`,
      maxTokens: 600,
    }),
  ]);

  // Parse responses - split by numbered lines
  const entParagraphs = entertainerResponse.split(/\d+\.\s+/).filter(p => p.trim());
  const anaParagraphs = analystResponse.split(/\d+\.\s+/).filter(p => p.trim());

  return pairs.map((p, i) => ({
    matchup_id: p.matchup_id,
    bot1: entParagraphs[i]?.trim() || `${p.winner.name} takes down ${p.loser.name} by ${p.margin.toFixed(1)}. Moving on.`,
    bot2: anaParagraphs[i]?.trim() || `${p.winner.name} ${p.winner.points.toFixed(1)}, ${p.loser.name} ${p.loser.points.toFixed(1)}. Margin: ${p.margin.toFixed(1)}.`,
  }));
}

// ============ Enhanced Context Helpers ============

interface TeamStanding {
  name: string;
  wins: number;
  losses: number;
  pointsFor: number;
  division?: 'East' | 'West';
}

interface EnhancedContext {
  standings?: TeamStanding[];
  topScorers?: Array<{ team: string; player: string; points: number }>;
  previousPredictions?: { entertainer: string[]; analyst: string[] };
  byeTeams?: string[]; // NFL teams on bye
}

function buildStandingsContext(standings: TeamStanding[] | undefined): string {
  if (!standings || standings.length === 0) return '';
  
  const sorted = [...standings].sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();
  
  const eastTeams = standings.filter(t => t.division === 'East');
  const westTeams = standings.filter(t => t.division === 'West');
  const eastWins = eastTeams.reduce((sum, t) => sum + t.wins, 0);
  const westWins = westTeams.reduce((sum, t) => sum + t.wins, 0);
  
  let context = `\nSTANDINGS CONTEXT:`;
  context += `\n- Top 3: ${top3.map(t => `${t.name} (${t.wins}-${t.losses})`).join(', ')}`;
  context += `\n- Bottom 3: ${bottom3.map(t => `${t.name} (${t.wins}-${t.losses})`).join(', ')}`;
  
  if (eastTeams.length > 0 && westTeams.length > 0) {
    context += `\n- DIVISION RIVALRY: East (${eastWins} wins) vs West (${westWins} wins) - ${eastWins > westWins ? 'East leads!' : westWins > eastWins ? 'West leads!' : 'Tied!'}`;
  }
  
  return context;
}

function buildTopScorersContext(topScorers: EnhancedContext['topScorers']): string {
  if (!topScorers || topScorers.length === 0) return '';
  
  const top5 = topScorers.slice(0, 5);
  let context = `\nTOP PERFORMERS THIS WEEK:`;
  top5.forEach((p, i) => {
    context += `\n${i + 1}. ${p.player} (${p.team}) - ${p.points.toFixed(1)} pts`;
  });
  
  return context;
}

function buildPreviousPredictionsContext(predictions: EnhancedContext['previousPredictions']): string {
  if (!predictions) return '';
  
  let context = '';
  if (predictions.entertainer.length > 0) {
    context += `\nYOUR PREVIOUS PREDICTIONS (Entertainer): ${predictions.entertainer.slice(0, 3).join('; ')}`;
  }
  if (predictions.analyst.length > 0) {
    context += `\nYOUR PREVIOUS PREDICTIONS (Analyst): ${predictions.analyst.slice(0, 3).join('; ')}`;
  }
  
  return context;
}

function buildByeWeekContext(byeTeams: string[] | undefined): string {
  if (!byeTeams || byeTeams.length === 0) return '';
  return `\nNFL BYE WEEKS: ${byeTeams.join(', ')} players were unavailable this week. Factor this into your analysis of affected fantasy teams.`;
}

function buildDivisionRivalryContext(pairs: DerivedData['matchup_pairs'], standings: TeamStanding[] | undefined): string {
  if (!standings) return '';
  
  const divisionMatchups = pairs.filter(p => {
    const winnerDiv = standings.find(s => s.name === p.winner.name)?.division;
    const loserDiv = standings.find(s => s.name === p.loser.name)?.division;
    return winnerDiv && loserDiv && winnerDiv !== loserDiv;
  });
  
  if (divisionMatchups.length === 0) return '';
  
  const eastWins = divisionMatchups.filter(p => {
    return standings.find(s => s.name === p.winner.name)?.division === 'East';
  }).length;
  const westWins = divisionMatchups.length - eastWins;
  
  return `\nDIVISION BATTLES: ${divisionMatchups.length} East vs West matchups this week. East won ${eastWins}, West won ${westWins}. ${eastWins > westWins ? 'East dominates!' : westWins > eastWins ? 'West strikes back!' : 'Split decision!'}`;
}

// ============ Main Compose Function ============

export interface ComposeNewsletterInput {
  leagueName: string;
  week: number;
  season: number;
  derived: DerivedData;
  memEntertainer: BotMemory;
  memAnalyst: BotMemory;
  forecast: ForecastData | null;
  lastCallbacks?: CallbacksSection | null;
  // Enhanced context (optional)
  enhancedContext?: EnhancedContext;
}

export async function composeNewsletter(input: ComposeNewsletterInput): Promise<Newsletter> {
  const {
    leagueName,
    week,
    season,
    derived,
    memEntertainer,
    memAnalyst,
    forecast,
    lastCallbacks,
    enhancedContext,
  } = input;

  const pairs = derived.matchup_pairs || [];
  const events = derived.events_scored || [];

  // Build enhanced context string for LLM
  const standingsCtx = buildStandingsContext(enhancedContext?.standings);
  const topScorersCtx = buildTopScorersContext(enhancedContext?.topScorers);
  const predictionsCtx = buildPreviousPredictionsContext(enhancedContext?.previousPredictions);
  const byeCtx = buildByeWeekContext(enhancedContext?.byeTeams);
  const rivalryCtx = buildDivisionRivalryContext(pairs, enhancedContext?.standings);
  
  const fullEnhancedContext = `${standingsCtx}${topScorersCtx}${predictionsCtx}${byeCtx}${rivalryCtx}`;

  console.log(`[Compose] Starting LLM-powered newsletter generation for Week ${week}...`);
  if (fullEnhancedContext) {
    console.log(`[Compose] Enhanced context available: standings=${!!enhancedContext?.standings}, topScorers=${!!enhancedContext?.topScorers}, predictions=${!!enhancedContext?.previousPredictions}, byes=${!!enhancedContext?.byeTeams}`);
  }

  // Build all sections using LLM (run in parallel where possible)
  const [intro, waiverItems, tradeItems, spotlight, finalWord, recaps] = await Promise.all([
    buildIntro(week, pairs, events, memEntertainer, memAnalyst, fullEnhancedContext),
    buildWaiverItems(events),
    buildTradeItems(events),
    buildSpotlight(pairs, memEntertainer, memAnalyst, fullEnhancedContext),
    buildFinalWord(week),
    buildRecaps(pairs, memEntertainer, memAnalyst, week, fullEnhancedContext),
  ]);

  console.log(`[Compose] All sections generated via LLM`);

  // Assemble sections array
  const sections: NewsletterSection[] = [
    { type: 'Intro', data: intro },
  ];

  if (lastCallbacks) {
    sections.push({ type: 'Callbacks', data: lastCallbacks });
  }

  sections.push({ type: 'MatchupRecaps', data: recaps });

  if (waiverItems.length > 0) {
    sections.push({ type: 'WaiversAndFA', data: waiverItems });
  }

  if (tradeItems.length > 0) {
    sections.push({ type: 'Trades', data: tradeItems });
  }

  if (spotlight) {
    sections.push({ type: 'SpotlightTeam', data: spotlight });
  }

  if (forecast) {
    sections.push({ type: 'Forecast', data: forecast });
  }

  sections.push({ type: 'FinalWord', data: finalWord });

  return {
    meta: {
      leagueName,
      week,
      date: new Date().toLocaleDateString(),
      season,
    },
    sections,
    _forCallbacks: { tradeItems, spotlight },
  };
}
