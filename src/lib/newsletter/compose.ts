/**
 * Compose Module
 * Assembles all newsletter sections into a complete newsletter object
 * Uses Groq LLM for natural language generation
 * 
 * Context is built from three tiers:
 * - Tier 1: Static league knowledge (champions, rules, team profiles)
 * - Tier 2: Dynamic bot memory (narratives, predictions, hot takes)
 * - Tier 3: Live context (standings, matchups, H2H history)
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
  EpisodeType,
} from './types';
import { generateSection } from './llm/groq';
import { buildStaticLeagueContext } from './league-knowledge';
import { getEpisodeConfig } from './episodes';

// Helper to get episode config with type safety
function getEpisodeConfigForType(episodeType: string, week: number, season: number) {
  const validTypes: EpisodeType[] = [
    'regular', 'pre_draft', 'post_draft', 'preseason', 'trade_deadline',
    'playoffs_preview', 'playoffs_round', 'championship', 'season_finale', 'offseason'
  ];
  const type = validTypes.includes(episodeType as EpisodeType) 
    ? (episodeType as EpisodeType) 
    : 'regular';
  return getEpisodeConfig(type, week, season);
}

// ============ Helper Functions ============

function countBy<T>(arr: T[], pred: (x: T) => boolean): number {
  return arr.reduce((n, x) => n + (pred(x) ? 1 : 0), 0);
}

function getSeasonalContext(week: number, championshipMatchup?: { team1: string; team2: string }): string {
  // Fantasy playoffs typically start Week 15, championship Week 17
  const TRADE_DEADLINE_WEEK = 12;
  const PLAYOFFS_START_WEEK = 15;
  const SEMIFINAL_WEEK = 16;
  const CHAMPIONSHIP_WEEK = 17;

  if (week >= CHAMPIONSHIP_WEEK) {
    const matchupText = championshipMatchup 
      ? `The championship is between ${championshipMatchup.team1} and ${championshipMatchup.team2} - ONLY these two teams are competing for the title.`
      : 'Two teams have made it to the final.';
    return `🏆 CHAMPIONSHIP WEEK! This is the FINAL - exactly TWO teams are playing for the title. ${matchupText} Everyone else is playing consolation games that don't matter for the championship. Focus your coverage on the championship matchup. The winner takes home the trophy.`;
  } else if (week >= SEMIFINAL_WEEK) {
    return `🔥 PLAYOFF SEMIFINALS! Only 4 teams remain in contention. Two matchups will determine who plays in next week's championship. Win or go home. Every point matters.`;
  } else if (week >= PLAYOFFS_START_WEEK) {
    return `🏈 PLAYOFFS HAVE BEGUN! The regular season is over. This is single elimination - lose and your season ends. 6 teams entered, only 1 will be champion.`;
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
  enhancedContext: string = '',
  episodeType: string = 'regular',
  season: number = new Date().getFullYear()
): Promise<IntroSection> {
  const leagueKnowledge = buildStaticLeagueContext();
  
  // Handle special episode types with custom context
  if (episodeType === 'preseason') {
    return buildPreseasonIntro(leagueKnowledge, season, memEntertainer, memAnalyst, enhancedContext);
  }
  if (episodeType === 'pre_draft') {
    return buildPreDraftIntro(leagueKnowledge, season, memEntertainer, memAnalyst, enhancedContext);
  }
  if (episodeType === 'post_draft') {
    return buildPostDraftIntro(leagueKnowledge, season, memEntertainer, memAnalyst, enhancedContext);
  }
  if (episodeType === 'offseason') {
    return buildOffseasonIntro(leagueKnowledge, season, memEntertainer, memAnalyst, enhancedContext);
  }

  // Regular weekly episode
  const numGames = pairs.length;
  const blowouts = countBy(pairs, p => p.margin >= 30);
  const nailbiters = countBy(pairs, p => p.margin <= 5);
  const biggest = pairs[0] || null;
  const closest = pairs.reduce((a, b) => (!a || b.margin < a.margin ? b : a), null as typeof pairs[0] | null);
  const trades = events.filter(e => e.type === 'trade').length;
  const waivers = events.filter(e => e.type === 'waiver' || e.type === 'fa_add').length;
  
  // For championship week, identify the championship matchup (matchup_id 1 is typically the championship)
  const CHAMPIONSHIP_WEEK = 17;
  let championshipMatchup: { team1: string; team2: string } | undefined;
  if (week >= CHAMPIONSHIP_WEEK && pairs.length > 0) {
    // Find the championship matchup - usually matchup_id 1
    const champPair = pairs.find(p => p.matchup_id === 1) || pairs[0];
    if (champPair) {
      championshipMatchup = { team1: champPair.winner.name, team2: champPair.loser.name };
    }
  }
  
  const seasonalContext = getSeasonalContext(week, championshipMatchup);

  const context = `${leagueKnowledge}

---

SEASONAL CONTEXT: ${seasonalContext}
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

// ============ Special Episode Intro Builders ============

async function buildPreseasonIntro(
  leagueKnowledge: string,
  season: number,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  enhancedContext: string
): Promise<IntroSection> {
  const context = `${leagueKnowledge}

---

EPISODE TYPE: PRESEASON PREVIEW - ${season} SEASON

This is the PRESEASON PREVIEW newsletter. The ${season} NFL season is about to begin. 
This is NOT a weekly recap - there are no matchups to discuss yet.
Your job is to preview the upcoming fantasy football season for the East v. West league.

Think like ESPN or The Athletic doing a season preview:
- Which teams are contenders? Which are rebuilding?
- What storylines should we watch this season?
- Who has the best roster? Who made the best offseason moves?
- Bold predictions for the season ahead

${enhancedContext}

Your mood heading into the new season: ${memEntertainer.summaryMood || 'Excited'}`;

  const [bot1_text, bot2_text] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Preseason Preview Intro',
      context,
      constraints: 'Write 3-4 sentences welcoming everyone to the new season. Build hype! Make a bold prediction or two. This is the PRESEASON - no games have been played yet.',
      maxTokens: 250,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Preseason Preview Intro',
      context: context.replace(memEntertainer.summaryMood || 'Excited', memAnalyst.summaryMood || 'Analytical'),
      constraints: 'Write 2-3 sentences setting up the season analytically. Reference roster construction, offseason moves, or key players to watch. This is the PRESEASON - no games have been played yet.',
      maxTokens: 200,
    }),
  ]);

  return { bot1_text, bot2_text };
}

async function buildPreDraftIntro(
  leagueKnowledge: string,
  season: number,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  enhancedContext: string
): Promise<IntroSection> {
  const context = `${leagueKnowledge}

---

EPISODE TYPE: PRE-DRAFT PREVIEW - ${season} ROOKIE DRAFT

This is the PRE-DRAFT newsletter. The rookie draft is coming up soon.
This is NOT a weekly recap - there are no matchups to discuss.
Your job is to preview the upcoming rookie draft.

Think like a draft analyst:
- Who are the top prospects?
- Which teams have the most draft capital?
- What positions are deep in this class?
- Who needs to make moves?

${enhancedContext}

Your mood heading into the draft: ${memEntertainer.summaryMood || 'Excited'}`;

  const [bot1_text, bot2_text] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Pre-Draft Preview Intro',
      context,
      constraints: 'Write 3-4 sentences building hype for the draft. Who should we be watching? Any hot takes on prospects?',
      maxTokens: 250,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Pre-Draft Preview Intro',
      context: context.replace(memEntertainer.summaryMood || 'Excited', memAnalyst.summaryMood || 'Analytical'),
      constraints: 'Write 2-3 sentences analyzing the draft landscape. Reference draft capital, team needs, or prospect tiers.',
      maxTokens: 200,
    }),
  ]);

  return { bot1_text, bot2_text };
}

async function buildPostDraftIntro(
  leagueKnowledge: string,
  season: number,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  enhancedContext: string
): Promise<IntroSection> {
  const context = `${leagueKnowledge}

---

EPISODE TYPE: POST-DRAFT GRADES - ${season} ROOKIE DRAFT

This is the POST-DRAFT newsletter. The rookie draft just happened.
This is NOT a weekly recap - there are no matchups to discuss.
Your job is to grade the draft and analyze each team's haul.

Think like a draft analyst giving grades:
- Who had the best draft?
- Who reached? Who got steals?
- Which teams addressed their needs?
- Any surprising picks?

${enhancedContext}

Your mood after the draft: ${memEntertainer.summaryMood || 'Opinionated'}`;

  const [bot1_text, bot2_text] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Post-Draft Grades Intro',
      context,
      constraints: 'Write 3-4 sentences reacting to the draft. Who won? Who lost? Any shocking picks?',
      maxTokens: 250,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Post-Draft Grades Intro',
      context: context.replace(memEntertainer.summaryMood || 'Opinionated', memAnalyst.summaryMood || 'Analytical'),
      constraints: 'Write 2-3 sentences with initial draft analysis. Reference value, fit, or process.',
      maxTokens: 200,
    }),
  ]);

  return { bot1_text, bot2_text };
}

async function buildOffseasonIntro(
  leagueKnowledge: string,
  season: number,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  enhancedContext: string
): Promise<IntroSection> {
  const context = `${leagueKnowledge}

---

EPISODE TYPE: OFFSEASON UPDATE - ${season}

This is an OFFSEASON newsletter. The season has ended.
This is NOT a weekly recap - there are no matchups to discuss.
Your job is to cover offseason news, trades, and updates.

${enhancedContext}

Your mood during the offseason: ${memEntertainer.summaryMood || 'Restless'}`;

  const [bot1_text, bot2_text] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Offseason Update Intro',
      context,
      constraints: 'Write 2-3 sentences about the offseason. Any moves happening? What should we be watching?',
      maxTokens: 200,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Offseason Update Intro',
      context: context.replace(memEntertainer.summaryMood || 'Restless', memAnalyst.summaryMood || 'Patient'),
      constraints: 'Write 2-3 sentences with offseason analysis. Reference roster moves or upcoming events.',
      maxTokens: 200,
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
    // Build detailed trade context showing what each side got
    const byTeam = e.details?.by_team || {};
    const parties = e.parties || Object.keys(byTeam);
    
    let tradeBreakdown = '';
    for (const team of parties) {
      const teamAssets = byTeam[team];
      if (teamAssets) {
        const gets = teamAssets.gets?.join(', ') || 'unknown';
        const gives = teamAssets.gives?.join(', ') || 'unknown';
        tradeBreakdown += `\n${team}: GETS ${gets} | GIVES ${gives}`;
      }
    }

    const tradeContext = e.details?.headline
      ? `${parties.join(' traded with ')}: ${e.details.headline}${tradeBreakdown}`
      : `Trade between ${parties.join(' and ')}${tradeBreakdown}`;

    // Generate analysis for EACH SIDE separately
    const analysis: Record<string, { grade: string; deltaText: string; entertainer_paragraph: string; analyst_paragraph: string }> = {};
    
    for (const party of parties) {
      const teamAssets = byTeam[party];
      const gets = teamAssets?.gets?.join(', ') || 'assets';
      const gives = teamAssets?.gives?.join(', ') || 'assets';
      
      const sideContext = `Trade Analysis for ${party}:
Full trade: ${tradeContext}
${party}'s haul: RECEIVED ${gets} | GAVE UP ${gives}
Evaluate this trade FROM ${party.toUpperCase()}'S PERSPECTIVE ONLY.`;

      const [entertainerResponse, analystResponse] = await Promise.all([
        generateSection({
          persona: 'entertainer',
          sectionType: 'Trade Grade',
          context: sideContext,
          constraints: `Grade this trade for ${party} specifically (A+ to F). Did THEY win or lose? 2 sentences max. Include your letter grade.`,
          maxTokens: 100,
        }),
        generateSection({
          persona: 'analyst',
          sectionType: 'Trade Grade',
          context: sideContext,
          constraints: `Grade this trade for ${party} specifically (A+ to F). Evaluate value received vs given from their perspective. 2 sentences. Include letter grade.`,
          maxTokens: 100,
        }),
      ]);

      // Extract grade from response (look for letter grade pattern)
      const gradeMatch = entertainerResponse.match(/\b([A-F][+-]?)\b/i) || analystResponse.match(/\b([A-F][+-]?)\b/i);
      const grade = gradeMatch ? gradeMatch[1].toUpperCase() : 'B';

      analysis[party] = {
        grade,
        deltaText: `${party}'s side`,
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

async function buildFinalWord(week: number, episodeType: string = 'regular'): Promise<FinalWordSection> {
  // Build context based on episode type
  let context: string;
  let entertainerConstraint: string;
  let analystConstraint: string;

  switch (episodeType) {
    case 'preseason':
      context = 'The season is about to begin. Sign off the preseason preview with excitement for what\'s to come.';
      entertainerConstraint = 'One punchy sentence about the upcoming season. Build hype! Make a bold prediction.';
      analystConstraint = 'One measured closing thought about the season ahead. Reference what to watch.';
      break;
    case 'pre_draft':
      context = 'The rookie draft is coming up. Sign off the pre-draft preview with anticipation.';
      entertainerConstraint = 'One punchy sentence about the upcoming draft. Who should we be watching?';
      analystConstraint = 'One measured closing thought about draft strategy or prospects.';
      break;
    case 'post_draft':
      context = 'The rookie draft is complete. Sign off the draft grades with final thoughts.';
      entertainerConstraint = 'One punchy sentence about the draft results. Any winners or losers to call out?';
      analystConstraint = 'One measured closing thought about the draft class or team improvements.';
      break;
    case 'offseason':
      context = 'It\'s the offseason. Sign off with thoughts on what\'s next.';
      entertainerConstraint = 'One punchy sentence about the offseason. What should we be watching?';
      analystConstraint = 'One measured closing thought about offseason moves or upcoming events.';
      break;
    default:
      context = `Week ${week} is in the books. Sign off the newsletter with a memorable closing thought.`;
      entertainerConstraint = 'One punchy sentence to close the show. Make it memorable. Tease next week.';
      analystConstraint = 'One measured closing thought. Keep it brief and professional.';
  }

  const [bot1, bot2] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Final Word',
      context,
      constraints: entertainerConstraint,
      maxTokens: 60,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Final Word',
      context,
      constraints: analystConstraint,
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
}

interface EnhancedContext {
  standings?: TeamStanding[];
  topScorers?: Array<{ team: string; player: string; points: number }>;
  previousPredictions?: { entertainer: string[]; analyst: string[] };
  byeTeams?: string[]; // NFL teams on bye
  // NEW: Full enhanced context string with all 8 improvements (H2H, trades, records, playoffs, etc.)
  enhancedContextString?: string;
}

function buildStandingsContext(standings: TeamStanding[] | undefined): string {
  if (!standings || standings.length === 0) return '';
  
  const sorted = [...standings].sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();
  
  // No divisions in this league - all 10 teams compete in one pool
  let context = `\nSTANDINGS CONTEXT:`;
  context += `\n- Top 3: ${top3.map(t => `${t.name} (${t.wins}-${t.losses})`).join(', ')}`;
  context += `\n- Bottom 3: ${bottom3.map(t => `${t.name} (${t.wins}-${t.losses})`).join(', ')}`;
  
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

// No divisions in this league - this function is kept for backward compatibility but returns empty
function buildDivisionRivalryContext(_pairs: DerivedData['matchup_pairs'], _standings: TeamStanding[] | undefined): string {
  // No divisions in this league - all 10 teams compete in one pool
  return '';
}

// ============ Main Compose Function ============

export interface ComposeNewsletterInput {
  leagueName: string;
  week: number;
  season: number;
  episodeType?: string; // Episode type for special newsletters
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
    episodeType = 'regular',
    derived,
    memEntertainer,
    memAnalyst,
    forecast,
    lastCallbacks,
    enhancedContext,
  } = input;

  // Get episode configuration for section filtering
  const episodeConfig = getEpisodeConfigForType(episodeType, week, season);
  const excludeSections = new Set(episodeConfig.excludeSections || []);
  const isSpecialEpisode = episodeType !== 'regular';

  const pairs = derived.matchup_pairs || [];
  const events = derived.events_scored || [];

  // Build enhanced context string for LLM
  const standingsCtx = buildStandingsContext(enhancedContext?.standings);
  const topScorersCtx = buildTopScorersContext(enhancedContext?.topScorers);
  const predictionsCtx = buildPreviousPredictionsContext(enhancedContext?.previousPredictions);
  const byeCtx = buildByeWeekContext(enhancedContext?.byeTeams);
  const rivalryCtx = buildDivisionRivalryContext(pairs, enhancedContext?.standings);
  
  // Use the new comprehensive enhanced context string if available (all 8 improvements)
  // Otherwise fall back to the legacy context builders
  const fullEnhancedContext = enhancedContext?.enhancedContextString 
    ? enhancedContext.enhancedContextString 
    : `${standingsCtx}${topScorersCtx}${predictionsCtx}${byeCtx}${rivalryCtx}`;

  console.log(`[Compose] Starting LLM-powered newsletter generation for Week ${week}...`);
  if (enhancedContext?.enhancedContextString) {
    console.log(`[Compose] Using FULL enhanced context (H2H, trades, records, playoffs, etc.)`);
  } else if (fullEnhancedContext) {
    console.log(`[Compose] Using legacy enhanced context: standings=${!!enhancedContext?.standings}, topScorers=${!!enhancedContext?.topScorers}, predictions=${!!enhancedContext?.previousPredictions}, byes=${!!enhancedContext?.byeTeams}`);
  }

  // Build all sections using LLM (run in parallel where possible)
  // Pass episode type and season to buildIntro for special episode handling
  const [intro, waiverItems, tradeItems, spotlight, finalWord, recaps] = await Promise.all([
    buildIntro(week, pairs, events, memEntertainer, memAnalyst, fullEnhancedContext, episodeType, season),
    excludeSections.has('WaiversAndFA') ? Promise.resolve([]) : buildWaiverItems(events),
    excludeSections.has('Trades') ? Promise.resolve([]) : buildTradeItems(events),
    excludeSections.has('SpotlightTeam') ? Promise.resolve(null) : buildSpotlight(pairs, memEntertainer, memAnalyst, fullEnhancedContext),
    buildFinalWord(week, episodeType),
    excludeSections.has('MatchupRecaps') ? Promise.resolve([]) : buildRecaps(pairs, memEntertainer, memAnalyst, week, fullEnhancedContext),
  ]);

  console.log(`[Compose] All sections generated via LLM`);
  console.log(`[Compose] Episode type: ${episodeType}, excluding sections: ${Array.from(excludeSections).join(', ') || 'none'}`);

  // Assemble sections array, respecting episode-specific exclusions
  const sections: NewsletterSection[] = [
    { type: 'Intro', data: intro },
  ];

  if (lastCallbacks && !excludeSections.has('Callbacks')) {
    sections.push({ type: 'Callbacks', data: lastCallbacks });
  }

  if (!excludeSections.has('MatchupRecaps') && recaps.length > 0) {
    sections.push({ type: 'MatchupRecaps', data: recaps });
  }

  if (waiverItems.length > 0 && !excludeSections.has('WaiversAndFA')) {
    sections.push({ type: 'WaiversAndFA', data: waiverItems });
  }

  if (tradeItems.length > 0 && !excludeSections.has('Trades')) {
    sections.push({ type: 'Trades', data: tradeItems });
  }

  if (spotlight && !excludeSections.has('SpotlightTeam')) {
    sections.push({ type: 'SpotlightTeam', data: spotlight });
  }

  if (forecast && !excludeSections.has('Forecast')) {
    sections.push({ type: 'Forecast', data: forecast });
  }

  sections.push({ type: 'FinalWord', data: finalWord });

  // Build episode title based on type
  const episodeTitle = isSpecialEpisode ? episodeConfig.title : undefined;
  const episodeSubtitle = isSpecialEpisode ? episodeConfig.subtitle : undefined;

  return {
    meta: {
      leagueName,
      week: isSpecialEpisode && ['pre_draft', 'post_draft', 'preseason', 'offseason'].includes(episodeType) ? 0 : week,
      date: new Date().toLocaleDateString(),
      season,
      episodeType: episodeType as import('./types').EpisodeType,
      episodeTitle,
      episodeSubtitle,
    },
    sections,
    _forCallbacks: { tradeItems, spotlight },
  };
}
