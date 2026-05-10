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
  PowerRankingsSection,
  SeasonPreviewSection,
  WeeklyHotTake,
  BlurtSection,
  RelationshipMemory,
  PushbackRecord,
  DraftPreviewSection,
  DraftGradesSection,
} from './types';
import type { LeagueDraftData } from './sleeper-ingest';
import { isEnhancedMemory } from './types';
import { generateSection } from './llm/groq';
import { buildStaticLeagueContext } from './league-knowledge';
import { getEpisodeConfig } from './episodes';
import {
  generateAllLLMFeatures,
  type LLMFeaturesInput,
  type LLMFeaturesOutput,
} from './llm-features';
import { getPartnerDynamicsContext, recordBotInteraction, getPersonalityContext, evolvePersonality, updateEmotionalState, updatePlayerRelationship, detectObsessions, fadeObsessions, getObsessionContext, decayEmotionalState, getPlayerRelationshipContext, recordWhoWasRight, registerEmergingPhrase, addInsideJoke, updateBotFeud, getNarrativesContext } from './memory';
import { recordHotTake } from './enhanced-context';
import { makeBlurt } from './personality';

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

/**
 * Build a rich memory context string for a specific team from the bot's perspective
 * This gives the LLM the bot's history, feelings, and past takes about a team
 */
function buildTeamMemoryContext(mem: BotMemory, teamName: string): string {
  const teamMem = mem.teams[teamName];
  if (!teamMem) return '';
  
  const lines: string[] = [];
  
  // Basic sentiment
  const trust = teamMem.trust ?? 0;
  const frustration = teamMem.frustration ?? 0;
  
  if (trust > 15) {
    lines.push(`You've been HIGH on ${teamName} lately - they've earned your trust.`);
  } else if (trust < -10) {
    lines.push(`You've been skeptical of ${teamName} - they've let you down before.`);
  }
  
  if (frustration > 15) {
    lines.push(`${teamName} has been frustrating you - inconsistent or disappointing.`);
  }
  
  // Check for enhanced memory fields using type guard
  const enhanced = teamMem as unknown as Record<string, unknown>;
  
  // Streak info
  if ('winStreak' in enhanced && typeof enhanced.winStreak === 'number') {
    const streak = enhanced.winStreak;
    if (streak >= 3) {
      lines.push(`${teamName} is on a ${streak}-game winning streak - you're watching to see if it's real.`);
    } else if (streak <= -3) {
      lines.push(`${teamName} has lost ${Math.abs(streak)} straight - you're wondering what's wrong.`);
    }
  }
  
  // Trajectory
  if ('trajectory' in enhanced && typeof enhanced.trajectory === 'string') {
    const trajectory = enhanced.trajectory;
    if (trajectory === 'rising') {
      lines.push(`${teamName} has been trending UP lately.`);
    } else if (trajectory === 'falling') {
      lines.push(`${teamName} has been trending DOWN.`);
    } else if (trajectory === 'volatile') {
      lines.push(`${teamName} has been unpredictable - you never know which version shows up.`);
    }
  }
  
  // Notable events (last 3)
  if ('notableEvents' in enhanced && Array.isArray(enhanced.notableEvents)) {
    const events = enhanced.notableEvents.slice(-3) as Array<{ week: number; event: string }>;
    if (events.length > 0) {
      lines.push(`Recent ${teamName} moments you remember:`);
      for (const ev of events) {
        lines.push(`  - Week ${ev.week}: ${ev.event}`);
      }
    }
  }
  
  // Mood (enhanced mood, not basic)
  if ('mood' in enhanced && typeof enhanced.mood === 'string') {
    const mood = enhanced.mood;
    if (mood === 'hot') {
      lines.push(`Your read: ${teamName} is HOT right now.`);
    } else if (mood === 'cold') {
      lines.push(`Your read: ${teamName} is ice COLD.`);
    } else if (mood === 'dangerous') {
      lines.push(`Your read: ${teamName} is DANGEROUS - high trust, playing well.`);
    } else if (mood === 'chaotic') {
      lines.push(`Your read: ${teamName} is CHAOTIC - capable of anything.`);
    }
  }
  
  return lines.length > 0 ? lines.join('\n') : '';
}

/**
 * Build overall memory context for the bot - their narratives, predictions, and overall state
 */
function buildBotMemoryContext(mem: BotMemory): string {
  const lines: string[] = [];
  
  lines.push(`YOUR CURRENT STATE:`);
  lines.push(`Overall mood: ${mem.summaryMood || 'Focused'}`);
  
  // Check for enhanced memory features using type guard
  const enhanced = mem as unknown as Record<string, unknown>;
  
  // Prediction track record
  if ('predictionStats' in enhanced && enhanced.predictionStats) {
    const stats = enhanced.predictionStats as { correct: number; wrong: number; winRate: number; hotStreak: number };
    const total = stats.correct + stats.wrong;
    if (total > 0) {
      if (stats.winRate >= 0.7) {
        lines.push(`Your predictions have been ON FIRE - ${(stats.winRate * 100).toFixed(0)}% correct. You're feeling confident.`);
      } else if (stats.winRate <= 0.4) {
        lines.push(`Your predictions have been rough lately - only ${(stats.winRate * 100).toFixed(0)}% correct. Maybe time to reassess.`);
      }
      if (stats.hotStreak >= 3) {
        lines.push(`You've gotten the last ${stats.hotStreak} predictions right. You're in a groove.`);
      } else if (stats.hotStreak <= -3) {
        lines.push(`You've missed the last ${Math.abs(stats.hotStreak)} predictions. Humbling.`);
      }
    }
  }
  
  // Active narratives
  if ('narratives' in enhanced && Array.isArray(enhanced.narratives)) {
    const narratives = enhanced.narratives as Array<{ resolved: boolean; title: string; description: string }>;
    const activeNarratives = narratives.filter(n => !n.resolved).slice(0, 3);
    if (activeNarratives.length > 0) {
      lines.push(`\nSTORYLINES YOU'RE TRACKING:`);
      for (const n of activeNarratives) {
        lines.push(`- ${n.title}: ${n.description}`);
      }
    }
  }
  
  // Hot takes that need follow-up
  if ('hotTakes' in enhanced && Array.isArray(enhanced.hotTakes)) {
    const hotTakes = enhanced.hotTakes as Array<{ graded?: boolean; take: string; week: number; confidenceLevel?: string }>;
    const unresolvedTakes = hotTakes.filter(t => !t.graded).slice(0, 2);
    if (unresolvedTakes.length > 0) {
      lines.push(`\nYOUR OUTSTANDING HOT TAKES:`);
      for (const t of unresolvedTakes) {
        lines.push(`- "${t.take}" (Week ${t.week}) - ${t.confidenceLevel || 'medium'} confidence`);
      }
    }
  }
  
  return lines.join('\n');
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

  // Collect top individual performers across all matchups for the intro
  const allTopPlayers = pairs.flatMap(p => [
    ...(p.winner.topPlayers || []),
    ...(p.loser.topPlayers || []),
  ]).filter(pl => pl.name && pl.name !== 'Unknown Player');
  allTopPlayers.sort((a, b) => b.points - a.points);
  const weekTopPerformers = allTopPlayers.slice(0, 5)
    .map(pl => `${pl.name} (${pl.points} pts)`)
    .join(', ');

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
${weekTopPerformers ? `- Week's top individual scorers: ${weekTopPerformers}` : ''}

Your current mood: ${memEntertainer.summaryMood || 'Neutral'}`;

  const [bot1_text, bot2_text] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Intro',
      context,
      constraints: 'Write 3-4 rich paragraphs. Set the tone with big personality — reference the week\'s top storylines, drop a bold take or two, and make the reader feel the energy. Be colorful and opinionated.',
      maxTokens: 600,
      episodeType,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Intro',
      context: context.replace(memEntertainer.summaryMood || 'Neutral', memAnalyst.summaryMood || 'Neutral'),
      constraints: 'Write 3-4 substantial paragraphs. Provide analytical depth — reference specific stats, trends, and the week\'s biggest storylines. Give your honest assessment with data to back it up.',
      maxTokens: 500,
      episodeType,
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
      constraints: 'Write 4-5 paragraphs welcoming everyone to the new season. Build massive hype — who are the contenders, who are the pretenders, what storylines should we watch? Drop multiple bold predictions. This is the PRESEASON - no games have been played yet, so speculate freely.',
      maxTokens: 700,
      episodeType: 'preseason',
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Preseason Preview Intro',
      context: context.replace(memEntertainer.summaryMood || 'Excited', memAnalyst.summaryMood || 'Analytical'),
      constraints: 'Write 4-5 paragraphs setting up the season analytically. Dig into roster construction, offseason moves, historical patterns, and key players to watch. Give a thorough analytical preview with real depth.',
      maxTokens: 600,
      episodeType: 'preseason',
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
      constraints: 'Write 4-5 paragraphs building hype for the draft. Who are the top prospects you\'re most excited about? Which teams have draft capital to make moves? Drop your hot takes on who will rise and fall. Make it feel like draft day hype.',
      maxTokens: 700,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Pre-Draft Preview Intro',
      context: context.replace(memEntertainer.summaryMood || 'Excited', memAnalyst.summaryMood || 'Analytical'),
      constraints: 'Write 4-5 paragraphs analyzing the draft landscape in depth. Cover: draft capital by team, positional depth in this class, team needs, value tiers, and analytical framework for making picks. Be thorough and data-driven.',
      maxTokens: 600,
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
      constraints: 'Write 4-5 paragraphs reacting to the full draft. Give your visceral takes — who absolutely won the draft, who got robbed, which picks made you gasp. Be opinionated and dramatic. Grade the overall class.',
      maxTokens: 700,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Post-Draft Grades Intro',
      context: context.replace(memEntertainer.summaryMood || 'Opinionated', memAnalyst.summaryMood || 'Analytical'),
      constraints: 'Write 4-5 paragraphs of analytical post-draft assessment. Cover: which teams addressed their biggest needs, which reached vs got value, the overall depth of the class, and long-term dynasty implications of key picks.',
      maxTokens: 600,
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
      constraints: 'Write 3-4 paragraphs about the offseason. Cover the biggest moves, the most interesting storylines developing, what you\'re most excited/worried about. Keep the reader engaged even though there are no games.',
      maxTokens: 500,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Offseason Update Intro',
      context: context.replace(memEntertainer.summaryMood || 'Restless', memAnalyst.summaryMood || 'Patient'),
      constraints: 'Write 3-4 paragraphs of analytical offseason coverage. Reference roster moves, their impact on team trajectories, and what to watch heading into the next season.',
      maxTokens: 500,
    }),
  ]);

  return { bot1_text, bot2_text };
}

// ============ Preseason-Specific Section Builders ============

async function buildPowerRankings(
  enhancedContext: string,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  season: number
): Promise<PowerRankingsSection> {
  const leagueKnowledge = buildStaticLeagueContext();
  
  const context = `${leagueKnowledge}

---

PRESEASON POWER RANKINGS - ${season} SEASON

You are creating PRESEASON power rankings based on HISTORICAL performance from previous seasons.
This is BEFORE the ${season} season starts - rank teams based on their past performance, roster strength, and offseason moves.

${enhancedContext}

IMPORTANT: Base rankings on PREVIOUS seasons' data, not current season (which hasn't started).
Consider: all-time records, championship history, recent trends, roster quality, offseason acquisitions.`;

  const [bot1_intro, bot2_intro] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Power Rankings Intro',
      context,
      constraints: 'Write 3-4 sentences introducing your preseason power rankings. Be bold and opinionated about who you think will dominate and who will disappoint.',
      maxTokens: 300,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Power Rankings Intro',
      context,
      constraints: 'Write 3-4 sentences introducing your preseason power rankings. Reference historical data, win rates, and roster analysis.',
      maxTokens: 300,
    }),
  ]);

  // Generate rankings with blurbs for each team
  const rankingsResponse = await generateSection({
    persona: 'analyst',
    sectionType: 'Power Rankings List',
    context: `${context}\n\nGenerate a numbered list of all 12 teams ranked 1-12 with a brief reason for each ranking. Format: "1. TeamName - reason"`,
    constraints: 'List all 12 teams ranked 1-12. Format: "RANK. TeamName — reason (2-3 sentences)". Give real analysis for each rank.',
    maxTokens: 1200,
  });

  // Parse rankings response
  const rankingLines = rankingsResponse.split('\n').filter(l => l.trim() && /^\d+\./.test(l.trim()));
  const rankings: PowerRankingsSection['rankings'] = rankingLines.slice(0, 12).map((line, idx) => {
    const match = line.match(/^\d+\.\s*([^-–]+)[-–]\s*(.+)/);
    const team = match ? match[1].trim() : `Team ${idx + 1}`;
    const reason = match ? match[2].trim() : 'Strong roster heading into the season.';
    
    return {
      rank: idx + 1,
      team,
      record: 'Preseason',
      pointsFor: 0,
      trend: 'steady' as const,
      bot1_blurb: reason,
      bot2_blurb: reason,
    };
  });

  return { rankings, bot1_intro, bot2_intro };
}

/**
 * Build WEEKLY power rankings - each bot ranks all 12 teams based on current season performance
 * This runs every week (not just preseason) and reflects how the bots' opinions evolve
 */
async function buildWeeklyPowerRankings(
  week: number,
  pairs: DerivedData['matchup_pairs'],
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  enhancedContext: string
): Promise<PowerRankingsSection> {
  const leagueKnowledge = buildStaticLeagueContext();
  
  // Extract standings from enhanced context if available
  const standingsMatch = enhancedContext.match(/STANDINGS[^:]*:?\s*([\s\S]*?)(?=\n\n|---|$)/i);
  const standingsContext = standingsMatch ? standingsMatch[1] : '';
  
  // Build bot-specific team opinions
  const entertainerTeamOpinions: string[] = [];
  const analystTeamOpinions: string[] = [];
  
  for (const [teamName, teamMem] of Object.entries(memEntertainer.teams)) {
    const trust = teamMem.trust ?? 0;
    const mood = teamMem.mood ?? 'Neutral';
    if (trust > 10 || trust < -10 || mood !== 'Neutral') {
      entertainerTeamOpinions.push(`${teamName}: Trust ${trust > 0 ? '+' : ''}${trust}, Mood: ${mood}`);
    }
  }
  
  for (const [teamName, teamMem] of Object.entries(memAnalyst.teams)) {
    const trust = teamMem.trust ?? 0;
    const mood = teamMem.mood ?? 'Neutral';
    if (trust > 10 || trust < -10 || mood !== 'Neutral') {
      analystTeamOpinions.push(`${teamName}: Trust ${trust > 0 ? '+' : ''}${trust}, Mood: ${mood}`);
    }
  }

  const context = `${leagueKnowledge}

---

WEEK ${week} POWER RANKINGS

You are creating power rankings based on THIS SEASON's performance through Week ${week}.
Rank teams 1-12 based on: record, points scored, roster strength, recent performance, and trajectory.

${standingsContext ? `CURRENT STANDINGS:\n${standingsContext}` : ''}

${enhancedContext}

YOUR OPINIONS MATTER: Let your feelings about teams influence your rankings.
If you've been burned by a team, maybe rank them lower. If a team has impressed you, rank them higher.
This isn't just about stats - it's about YOUR take on who's actually good.`;

  // Generate entertainer's rankings
  const entertainerRankings = await generateSection({
    persona: 'entertainer',
    sectionType: 'Weekly Power Rankings',
    context: `${context}

YOUR TEAM OPINIONS:
${entertainerTeamOpinions.length > 0 ? entertainerTeamOpinions.join('\n') : 'No strong opinions yet - form some!'}

Generate YOUR power rankings 1-12. Be opinionated! If you think a team is overrated, say so.
If you're high on a team others doubt, rank them up. Let your personality show.`,
    constraints: `Format each line as: "RANK. TeamName - [your hot take reason — 2-3 sentences of analysis]"
Example: "1. Double Trouble - They're the real deal and I've been saying it all year. Their offense is clicking and nobody can stop them. Championship material."
Rank all 12 teams. Be bold, dramatic, and give real analysis for each.`,
    maxTokens: 1200,
  });

  // Generate analyst's rankings
  const analystRankings = await generateSection({
    persona: 'analyst',
    sectionType: 'Weekly Power Rankings',
    context: `${context}

YOUR TEAM OPINIONS:
${analystTeamOpinions.length > 0 ? analystTeamOpinions.join('\n') : 'Building data on all teams.'}

Generate YOUR power rankings 1-12. Base it on the numbers but don't be afraid to have takes.
If the data says a team is good despite their record, rank them accordingly.`,
    constraints: `Format each line as: "RANK. TeamName - [analytical reason — 2-3 sentences]"
Example: "1. Double Trouble - Best points-per-game average in the league and a favorable schedule ahead. Their roster depth is unmatched and they've shown consistency all season."
Rank all 12 teams. Provide substantive analytical reasoning for each.`,
    maxTokens: 1200,
  });

  // Parse both rankings
  const parseRankings = (response: string): Array<{ rank: number; team: string; blurb: string }> => {
    const lines = response.split('\n').filter(l => l.trim() && /^\d+\./.test(l.trim()));
    return lines.slice(0, 12).map((line, idx) => {
      const match = line.match(/^\d+\.\s*([^-–]+)[-–]\s*(.+)/);
      const team = match ? match[1].trim() : `Team ${idx + 1}`;
      const blurb = match ? match[2].trim() : 'Solid team.';
      return { rank: idx + 1, team, blurb };
    });
  };

  const entRankings = parseRankings(entertainerRankings);
  const anaRankings = parseRankings(analystRankings);

  // Merge rankings - use entertainer's order but include both blurbs
  const rankings: PowerRankingsSection['rankings'] = entRankings.map((ent, idx) => {
    // Find analyst's take on this team
    const anaMatch = anaRankings.find(a => a.team.toLowerCase() === ent.team.toLowerCase());
    const anaRank = anaMatch ? anaRankings.indexOf(anaMatch) + 1 : idx + 1;
    
    // Determine trend based on rank difference
    const rankDiff = anaRank - ent.rank;
    const trend: 'up' | 'down' | 'steady' = Math.abs(rankDiff) <= 1 ? 'steady' : rankDiff > 0 ? 'up' : 'down';
    
    return {
      rank: ent.rank,
      team: ent.team,
      record: '', // Will be filled from standings if available
      pointsFor: 0,
      trend,
      trendAmount: Math.abs(rankDiff),
      bot1_blurb: ent.blurb,
      bot2_blurb: anaMatch?.blurb || 'No strong take.',
    };
  });

  // Generate intro blurbs
  const [bot1_intro, bot2_intro] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Power Rankings Intro',
      context,
      constraints: 'Write 2-3 sentences introducing your Week ' + week + ' power rankings. Be bold about who impressed or disappointed you this week.',
      maxTokens: 300,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Power Rankings Intro',
      context,
      constraints: 'Write 2-3 sentences introducing your Week ' + week + ' power rankings. Reference key trends, data points, and what moved teams up or down.',
      maxTokens: 300,
    }),
  ]);

  return { rankings, bot1_intro, bot2_intro };
}

async function buildSeasonPreview(
  enhancedContext: string,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  season: number
): Promise<SeasonPreviewSection> {
  const leagueKnowledge = buildStaticLeagueContext();
  
  const context = `${leagueKnowledge}

---

SEASON PREVIEW - ${season} SEASON

Create an ESPN/Athletic style season preview. This is BEFORE the season starts.
Base predictions on HISTORICAL performance from previous seasons, roster strength, and offseason moves.

${enhancedContext}

Think like a fantasy analyst doing a season preview:
- Who are the contenders based on roster and history?
- Who are the sleeper teams that could surprise?
- Who might disappoint (bust candidates)?
- Make bold predictions for the season`;

  const [contendersResponse, sleepersResponse, bustsResponse, predictionsBot1, predictionsBot2, champBot1, champBot2] = await Promise.all([
    generateSection({
      persona: 'analyst',
      sectionType: 'Season Preview - Contenders',
      context,
      constraints: 'List 3 championship contenders with detailed reasons. Format: "TeamName: 2-3 sentence analysis of why they\'re a title contender"',
      maxTokens: 500,
    }),
    generateSection({
      persona: 'entertainer',
      sectionType: 'Season Preview - Sleepers',
      context,
      constraints: 'List 2-3 sleeper teams that could surprise. Format: "TeamName: 2-3 sentence explanation of the sleeper case"',
      maxTokens: 400,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Season Preview - Bust Candidates',
      context,
      constraints: 'List 2 teams that might disappoint expectations. Format: "TeamName: 2-3 sentence breakdown of the bust case and what could go wrong"',
      maxTokens: 400,
    }),
    generateSection({
      persona: 'entertainer',
      sectionType: 'Bold Predictions',
      context,
      constraints: 'Give 3 bold/hot take predictions for the season. Be spicy, controversial, and specific. 2-3 sentences per prediction.',
      maxTokens: 500,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Bold Predictions',
      context,
      constraints: 'Give 3 analytical predictions for the season based on data, trends, and historical patterns. 2-3 sentences per prediction with reasoning.',
      maxTokens: 500,
    }),
    generateSection({
      persona: 'entertainer',
      sectionType: 'Championship Pick',
      context,
      constraints: 'Pick your championship winner in 2-3 sentences. Be supremely confident and explain why.',
      maxTokens: 150,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Championship Pick',
      context,
      constraints: 'Pick your championship winner in 2-3 sentences with analytical reasoning behind your choice.',
      maxTokens: 150,
    }),
  ]);

  // Parse responses
  const parseTeamList = (response: string): Array<{ team: string; reason: string }> => {
    return response.split('\n')
      .filter(l => l.trim())
      .slice(0, 3)
      .map(line => {
        const match = line.match(/^[•\-\d.]*\s*([^:]+):\s*(.+)/) || line.match(/^[•\-\d.]*\s*(.+)/);
        return {
          team: match ? match[1].trim() : 'Unknown Team',
          reason: match && match[2] ? match[2].trim() : line.trim(),
        };
      });
  };

  const parsePredictions = (response: string): string[] => {
    return response.split('\n')
      .filter(l => l.trim())
      .slice(0, 3)
      .map(l => l.replace(/^[•\-\d.]\s*/, '').trim());
  };

  return {
    contenders: parseTeamList(contendersResponse),
    sleepers: parseTeamList(sleepersResponse),
    bustCandidates: parseTeamList(bustsResponse),
    boldPredictions: {
      bot1: parsePredictions(predictionsBot1),
      bot2: parsePredictions(predictionsBot2),
    },
    championshipPick: {
      bot1: champBot1.trim(),
      bot2: champBot2.trim(),
    },
  };
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
      constraints: `React to each waiver move with 2-3 sentences. Be spicy about the great pickups, skeptical about the questionable ones. Give your personality-driven take on what it means for that team.`,
      maxTokens: 600,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Waivers',
      context: `Waiver wire moves this week:\n${waiverContext}`,
      constraints: `Analyze each move with 2-3 sentences. Cover role, usage projection, upside, and what it means for the team's roster construction.`,
      maxTokens: 600,
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

  // Build all trade contexts first
  const tradeContexts = tradeEvents.map(e => {
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

    return { event: e, parties, byTeam, tradeContext };
  });

  // Build all party analysis requests
  const allPartyRequests: Array<{
    tradeIdx: number;
    party: string;
    sideContext: string;
  }> = [];

  for (let i = 0; i < tradeContexts.length; i++) {
    const { parties, byTeam, tradeContext } = tradeContexts[i];
    for (const party of parties) {
      const teamAssets = byTeam[party];
      const gets = teamAssets?.gets?.join(', ') || 'assets';
      const gives = teamAssets?.gives?.join(', ') || 'assets';
      
      const sideContext = `Trade Analysis for ${party}:
Full trade: ${tradeContext}
${party}'s haul: RECEIVED ${gets} | GAVE UP ${gives}
Evaluate this trade FROM ${party.toUpperCase()}'S PERSPECTIVE ONLY.`;

      allPartyRequests.push({ tradeIdx: i, party, sideContext });
    }
  }

  // Generate all analyses in parallel (rate limiting handled by groq client)
  const allResponses = await Promise.all(
    allPartyRequests.map(async ({ party, sideContext }) => {
      const [entertainerResponse, analystResponse] = await Promise.all([
        generateSection({
          persona: 'entertainer',
          sectionType: 'Trade Grade',
          context: sideContext,
          constraints: `Grade this trade for ${party} specifically (A+ to F). Did THEY win or lose? Write 3-4 sentences with personality — was this a heist, a fair deal, or a robbery? Include your letter grade.`,
          maxTokens: 300,
        }),
        generateSection({
          persona: 'analyst',
          sectionType: 'Trade Grade',
          context: sideContext,
          constraints: `Grade this trade for ${party} specifically (A+ to F). Evaluate value received vs given from their perspective. Write 3-4 sentences analyzing short-term vs long-term implications, value, and fit. Include letter grade.`,
          maxTokens: 300,
        }),
      ]);

      const gradeMatch = entertainerResponse.match(/\b([A-F][+-]?)\b/i) || analystResponse.match(/\b([A-F][+-]?)\b/i);
      const grade = gradeMatch ? gradeMatch[1].toUpperCase() : 'B';

      return { entertainerResponse, analystResponse, grade };
    })
  );

  // Reconstruct trade items with analyses
  const items: TradeItem[] = [];
  let responseIdx = 0;

  for (let i = 0; i < tradeContexts.length; i++) {
    const { event: e, parties, tradeContext } = tradeContexts[i];
    const analysis: Record<string, { grade: string; deltaText: string; entertainer_paragraph: string; analyst_paragraph: string }> = {};

    for (const party of parties) {
      const { entertainerResponse, analystResponse, grade } = allResponses[responseIdx++];
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
  if (!pairs.length) return null;

  // Intelligent spotlight selection - pick the most interesting team
  // Criteria: biggest blowout winner, highest scorer, or most dramatic result
  const candidates = pairs.map(p => ({
    team: p.winner.name,
    opponent: p.loser.name,
    points: p.winner.points,
    margin: p.margin,
    // Score based on: high points, big margin, or close game drama
    interestScore: p.winner.points / 100 + (p.margin > 30 ? 2 : p.margin < 5 ? 1.5 : p.margin / 20),
  }));
  
  // Sort by interest score and pick the top
  candidates.sort((a, b) => b.interestScore - a.interestScore);
  const spotlight = candidates[0];
  const spotlightPair = pairs.find(p => p.winner.name === spotlight.team)!;

  const context = `Team of the Week: ${spotlight.team}
- Beat ${spotlight.opponent} by ${spotlight.margin.toFixed(1)} points
- Scored ${spotlight.points.toFixed(1)} total points
- ${spotlight.margin > 30 ? 'DOMINANT performance - biggest blowout of the week' : spotlight.margin < 5 ? 'Nail-biter win - clutch performance' : 'Solid victory this week'}
- Your history with this team: ${memEntertainer.teams[spotlight.team]?.mood || 'Neutral'}
${enhancedContext}`;

  const [bot1, bot2] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Spotlight',
      context,
      constraints: 'Write 3-4 paragraphs spotlighting this team\'s performance. Hype them up or give them tough love. Talk about what made this week special, which players came through, and what it means for their season. Be vivid and memorable.',
      maxTokens: 500,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Spotlight',
      context: context.replace(memEntertainer.teams[spotlightPair.winner.name]?.mood || 'Neutral', memAnalyst.teams[spotlightPair.winner.name]?.mood || 'Neutral'),
      constraints: 'Write 3-4 paragraphs analytically dissecting this performance. What made it special statistically? Is it sustainable or regression bait? What does it mean for their playoff trajectory? Reference specific numbers.',
      maxTokens: 500,
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
      entertainerConstraint = '2-3 sentences closing out the season preview. Build maximum hype, drop your biggest bold prediction, and leave the audience desperate for Week 1 to start.';
      analystConstraint = '2-3 sentences of measured analytical closing thoughts. What are the 2-3 most important things to watch as the season unfolds?';
      break;
    case 'pre_draft':
      context = 'The rookie draft is coming up. Sign off the pre-draft preview with anticipation.';
      entertainerConstraint = '2-3 sentences to close out the draft preview. Build the hype, name the player you\'re most excited about, and leave the audience fired up.';
      analystConstraint = '2-3 sentences of analytical closing thoughts. What\'s the key strategic takeaway heading into draft day?';
      break;
    case 'post_draft':
      context = 'The rookie draft is complete. Sign off the draft grades with final thoughts.';
      entertainerConstraint = '2-3 sentences closing out the draft recap. Who was the biggest winner? What\'s your lasting impression of this class?';
      analystConstraint = '2-3 sentences of analytical final thoughts. What does this draft mean for the competitive landscape going forward?';
      break;
    case 'offseason':
      context = 'It\'s the offseason. Sign off with thoughts on what\'s next.';
      entertainerConstraint = '2-3 sentences closing out the offseason update. What are you most looking forward to? Leave the audience engaged.';
      analystConstraint = '2-3 sentences of measured offseason analysis. What are the biggest open questions heading into the season?';
      break;
    default:
      context = `Week ${week} is in the books. Sign off the newsletter with a memorable closing thought.`;
      entertainerConstraint = '2-3 sentences to close the show. Make it memorable, tease what to watch next week, and leave on a high note.';
      analystConstraint = '2-3 sentences of measured closing analysis. Reference the biggest takeaway from this week and what it means going forward.';
  }

  const [bot1, bot2] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Final Word',
      context,
      constraints: entertainerConstraint,
      maxTokens: 200,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Final Word',
      context,
      constraints: analystConstraint,
      maxTokens: 200,
    }),
  ]);

  return { bot1, bot2 };
}

async function buildRecaps(
  pairs: DerivedData['matchup_pairs'],
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  week: number,
  enhancedContext: string = '',
  qualityReport?: { usedFallbacks: string[] },
  pushbackCollector?: PushbackRecord[]
): Promise<RecapItem[]> {
  if (pairs.length === 0) return [];

  const seasonalContext = getSeasonalContext(week);
  const isPlayoffs = week >= 15;
  const isChampionshipWeek = week >= 17;

  // Extract team records from enhanced context if available
  // Parse the "ALL-TIME TEAM RANKINGS" section to get actual records
  const teamRecords = new Map<string, string>();
  const rankingsMatch = enhancedContext.match(/--- ALL-TIME TEAM RANKINGS[^-]*---\n([\s\S]*?)(?=\n---|\n\n===|$)/);
  if (rankingsMatch) {
    const lines = rankingsMatch[1].split('\n').filter(l => l.trim());
    for (const line of lines) {
      // Parse lines like "1. Double Trouble: 45-23 (66.2%) [2x Champion]"
      const match = line.match(/^\d+\.\s+([^:]+):\s+(\d+-\d+(?:-\d+)?)\s+\(([^)]+)\)/);
      if (match) {
        const [, teamName, record, winPct] = match;
        teamRecords.set(teamName.trim(), `${record} (${winPct})`);
      }
    }
  }


  // Generate recaps for EACH matchup individually to prevent LLM confusion
  // This ensures each recap is about the correct teams
  const recapPromises = pairs.map(async (p) => {
    const bracketInfo = p.bracketLabel || 'Matchup';
    
    // Build player performance strings
    const winnerPlayers = p.winner.topPlayers?.length 
      ? p.winner.topPlayers.map(pl => `${pl.name} (${pl.points} pts)`).join(', ')
      : 'no player data available';
    const loserPlayers = p.loser.topPlayers?.length
      ? p.loser.topPlayers.map(pl => `${pl.name} (${pl.points} pts)`).join(', ')
      : 'no player data available';

    // Build memory context for both teams from each bot's perspective
    const entertainerWinnerMemory = buildTeamMemoryContext(memEntertainer, p.winner.name);
    const entertainerLoserMemory = buildTeamMemoryContext(memEntertainer, p.loser.name);
    const analystWinnerMemory = buildTeamMemoryContext(memAnalyst, p.winner.name);
    const analystLoserMemory = buildTeamMemoryContext(memAnalyst, p.loser.name);
    
    // Build overall bot state context
    const entertainerState = buildBotMemoryContext(memEntertainer);
    const analystState = buildBotMemoryContext(memAnalyst);
    
    // Get partner dynamics context (how they relate to each other)
    // Only available for BotMemory - check if partnerDynamics exists
    const entertainerPartnerContext = 'partnerDynamics' in memEntertainer
      ? getPartnerDynamicsContext(memEntertainer)
      : '';
    const analystPartnerContext = 'partnerDynamics' in memAnalyst
      ? getPartnerDynamicsContext(memAnalyst)
      : '';
    
    // Get evolving personality context (confidence, emotional state, speech patterns, storylines)
    const entertainerPersonalityContext = isEnhancedMemory(memEntertainer)
      ? getPersonalityContext(memEntertainer) + getNarrativesContext(memEntertainer, week)
      : '';
    const analystPersonalityContext = isEnhancedMemory(memAnalyst)
      ? getPersonalityContext(memAnalyst) + getNarrativesContext(memAnalyst, week)
      : '';

    // Build focused context for THIS specific matchup only
    const baseMatchupContext = `
MATCHUP: ${bracketInfo}

WINNER: ${p.winner.name}
- Final Score: ${p.winner.points.toFixed(1)} points
- Top Performers: ${winnerPlayers}

LOSER: ${p.loser.name}  
- Final Score: ${p.loser.points.toFixed(1)} points
- Top Performers: ${loserPlayers}

MARGIN OF VICTORY: ${p.margin.toFixed(1)} points`;

    // Player relationship context for both bots — how they feel about the key performers
    const matchupPlayerNames = [
      ...(p.winner.topPlayers || []).map(pl => pl.name),
      ...(p.loser.topPlayers || []).map(pl => pl.name),
    ].filter(Boolean);
    const entertainerPlayerCtx = getPlayerRelationshipContext(
      memEntertainer, matchupPlayerNames
    );
    const analystPlayerCtx = getPlayerRelationshipContext(
      memAnalyst, matchupPlayerNames
    );

    // Entertainer gets their personal history with these teams + partner dynamics + personality
    const entertainerMatchupContext = `${baseMatchupContext}

YOUR HISTORY WITH THESE TEAMS:
${entertainerWinnerMemory || `You don't have strong feelings about ${p.winner.name} yet.`}
${entertainerLoserMemory || `You don't have strong feelings about ${p.loser.name} yet.`}

${entertainerState}
${entertainerPartnerContext}
${entertainerPersonalityContext}
${entertainerPlayerCtx ? `\nYOUR HISTORY WITH KEY PLAYERS:\n${entertainerPlayerCtx}` : ''}

USE YOUR HISTORY: If you've been high on a team and they won, feel vindicated. If you've been down on them and they won, acknowledge you might have been wrong. If a team you trusted let you down, express that disappointment. Your feelings about teams should color how you talk about this result.

IMPORTANT RULES:
1. Write ONLY about ${p.winner.name} and ${p.loser.name}. Do not mention any other teams.
2. Reference the TOP PERFORMERS listed above - these are the actual players who scored in this game.
3. Let your history with these teams influence your tone - but don't just list your feelings, weave them into your take.
4. Do NOT make up statistics - focus on THIS game and your reaction to it.
5. If you have callbacks or inside jokes with your co-host, use them naturally when relevant.
6. Let your current emotional state and personality traits influence HOW you say things.`;

    // Build analyst context — mirrors entertainerMatchupContext structure for sequential generation
    const analystMatchupContext = `${baseMatchupContext}

YOUR HISTORY WITH THESE TEAMS:
${analystWinnerMemory || `No strong historical data on ${p.winner.name} yet.`}
${analystLoserMemory || `No strong historical data on ${p.loser.name} yet.`}

${analystState}
${analystPartnerContext}
${analystPersonalityContext}
${analystPlayerCtx ? `\nYOUR HISTORY WITH KEY PLAYERS:\n${analystPlayerCtx}` : ''}

IMPORTANT RULES:
1. Write ONLY about ${p.winner.name} and ${p.loser.name}. Do not mention other teams.
2. Reference the TOP PERFORMERS listed above — actual players who scored.
3. Bring your analytical perspective but keep it conversational.
4. Do NOT fabricate statistics — only use numbers from the context provided.`;

    const isChampionship = isChampionshipWeek && bracketInfo.includes('Championship');
    
    // Helper to extract sentiment strength from team memory
    const getTeamSentiment = (mem: BotMemory, teamName: string): { trust: number; frustration: number; hasStreak: boolean; hasMood: boolean } => {
      const teamMem = mem.teams[teamName];
      if (!teamMem) return { trust: 0, frustration: 0, hasStreak: false, hasMood: false };
      const enhanced = teamMem as unknown as Record<string, unknown>;
      const trust = (teamMem.trust ?? 0);
      const frustration = (teamMem.frustration ?? 0);
      const hasStreak = 'winStreak' in enhanced && Math.abs(enhanced.winStreak as number) >= 3;
      const hasMood = 'mood' in enhanced && ['hot', 'cold', 'dangerous', 'chaotic'].includes(enhanced.mood as string);
      return { trust, frustration, hasStreak, hasMood };
    };
    
    // Check if any top performers are players the bots have strong opinions about
    const checkPlayerInterest = (mem: BotMemory, players: string): boolean => {
      const enhanced = mem as unknown as Record<string, unknown>;
      if ('favoritePlayers' in enhanced && Array.isArray(enhanced.favoritePlayers)) {
        const favorites = enhanced.favoritePlayers as string[];
        return favorites.some(fav => players.toLowerCase().includes(fav.toLowerCase()));
      }
      if ('disappointments' in enhanced && Array.isArray(enhanced.disappointments)) {
        const disappointments = enhanced.disappointments as string[];
        return disappointments.some(d => players.toLowerCase().includes(d.toLowerCase()));
      }
      return false;
    };
    
    // Get sentiment for both teams from both bots
    const entWinnerSentiment = getTeamSentiment(memEntertainer, p.winner.name);
    const entLoserSentiment = getTeamSentiment(memEntertainer, p.loser.name);
    const anaWinnerSentiment = getTeamSentiment(memAnalyst, p.winner.name);
    const anaLoserSentiment = getTeamSentiment(memAnalyst, p.loser.name);
    
    // Check if bots have strong feelings (high trust or frustration)
    const entertainerHasStrongFeelings = 
      Math.abs(entWinnerSentiment.trust) > 15 || Math.abs(entLoserSentiment.trust) > 15 ||
      entWinnerSentiment.frustration > 15 || entLoserSentiment.frustration > 15 ||
      entWinnerSentiment.hasStreak || entLoserSentiment.hasStreak ||
      entWinnerSentiment.hasMood || entLoserSentiment.hasMood;
    
    const analystHasStrongFeelings = 
      Math.abs(anaWinnerSentiment.trust) > 15 || Math.abs(anaLoserSentiment.trust) > 15 ||
      anaWinnerSentiment.frustration > 15 || anaLoserSentiment.frustration > 15 ||
      anaWinnerSentiment.hasStreak || anaLoserSentiment.hasStreak;
    
    // Check if players they care about performed
    const entertainerCaresAboutPlayers = checkPlayerInterest(memEntertainer, winnerPlayers + ' ' + loserPlayers);
    const analystCaresAboutPlayers = checkPlayerInterest(memAnalyst, winnerPlayers + ' ' + loserPlayers);
    
    // Vindication/Frustration scenarios (bot was right/wrong about a team)
    const entertainerVindicated = (entWinnerSentiment.trust > 10) || (entLoserSentiment.trust < -10);
    const entertainerBurned = (entLoserSentiment.trust > 10) || (entWinnerSentiment.trust < -10);
    const analystVindicated = (anaWinnerSentiment.trust > 10) || (anaLoserSentiment.trust < -10);
    const analystBurned = (anaLoserSentiment.trust > 10) || (anaWinnerSentiment.trust < -10);
    
    // Determine how "interesting" this matchup is - affects dialogue length
    // More interesting = more back-and-forth
    const interestFactors = {
      isChampionship,
      isPlayoffGame: isPlayoffs,
      isBlowout: p.margin > 30,
      isNailBiter: p.margin < 5,
      hasStrongMemory: !!(entertainerWinnerMemory || entertainerLoserMemory || analystWinnerMemory || analystLoserMemory),
      highScoring: p.winner.points > 140 || p.loser.points > 130,
      // NEW: Bot-specific interest factors
      entertainerPassionate: entertainerHasStrongFeelings || entertainerCaresAboutPlayers,
      analystPassionate: analystHasStrongFeelings || analystCaresAboutPlayers,
      someoneVindicated: entertainerVindicated || analystVindicated,
      someoneBurned: entertainerBurned || analystBurned,
    };
    
    // Calculate interest score (0-10+)
    let interestScore = 2; // Base
    if (interestFactors.isChampionship) interestScore += 4;
    else if (interestFactors.isPlayoffGame) interestScore += 2;
    if (interestFactors.isBlowout) interestScore += 1;
    if (interestFactors.isNailBiter) interestScore += 2;
    if (interestFactors.hasStrongMemory) interestScore += 1;
    if (interestFactors.highScoring) interestScore += 1;
    // NEW: Add points for bot passion
    if (interestFactors.entertainerPassionate) interestScore += 2;
    if (interestFactors.analystPassionate) interestScore += 1;
    if (interestFactors.someoneVindicated) interestScore += 1; // "I told you so" moments
    if (interestFactors.someoneBurned) interestScore += 2; // Eating crow is dramatic
    
    // Interest level determines how much the bots WANT to talk - but they decide the actual length
    // We just give them context about how interesting this game is
    const interestLevel = isChampionship ? 'extremely high' : 
                          interestScore >= 8 ? 'very high' :
                          interestScore >= 5 ? 'moderate' :
                          interestScore >= 3 ? 'low' : 'minimal';
    
    console.log(`[Dialogue] ${p.winner.name} vs ${p.loser.name}: interest=${interestScore} (${interestLevel}), championship=${isChampionship}`);
    
    // Build rich situational context for more nuanced dialogue
    const buildSituationalHooks = (): string[] => {
      const hooks: string[] = [];
      
      // Emotional arc hooks
      if (interestFactors.someoneBurned) {
        if (entertainerBurned) hooks.push(`⚠️ YOU (Entertainer) got burned here - a team you trusted lost or a team you doubted won. Address this.`);
        if (analystBurned) hooks.push(`⚠️ The Analyst got burned here - their analysis didn't hold up. They might be defensive.`);
      }
      if (interestFactors.someoneVindicated) {
        if (entertainerVindicated) hooks.push(`✓ YOU (Entertainer) called this - feel free to take a victory lap (but don't be insufferable).`);
        if (analystVindicated) hooks.push(`✓ The Analyst's numbers were right - they'll probably mention it.`);
      }
      
      // Streak narratives
      if (entWinnerSentiment.hasStreak || anaWinnerSentiment.hasStreak) {
        hooks.push(`📈 ${p.winner.name} is on a streak - is this sustainable or are they due for regression?`);
      }
      if (entLoserSentiment.hasStreak || anaLoserSentiment.hasStreak) {
        hooks.push(`📉 ${p.loser.name} has been struggling - is this rock bottom or more pain ahead?`);
      }
      
      // Margin-based narratives
      if (p.margin > 40) {
        hooks.push(`💀 This was an EMBARRASSMENT. ${p.loser.name} got absolutely destroyed. How do they recover?`);
      } else if (p.margin < 3) {
        hooks.push(`😰 This came down to the WIRE. One play different and the result flips. Talk about the drama.`);
      }
      
      // High/low scoring narratives
      if (p.winner.points > 160) {
        hooks.push(`🔥 ${p.winner.name} put up a MONSTER week (${p.winner.points.toFixed(1)}). This is elite.`);
      }
      if (p.loser.points < 80) {
        hooks.push(`💩 ${p.loser.name} only scored ${p.loser.points.toFixed(1)}. What went wrong?`);
      }
      if (p.loser.points > 120 && p.margin > 15) {
        hooks.push(`😤 ${p.loser.name} scored ${p.loser.points.toFixed(1)} and STILL lost by ${p.margin.toFixed(1)}. Brutal scheduling luck.`);
      }
      
      // Playoff implications
      if (isPlayoffs) {
        hooks.push(`🏆 PLAYOFF GAME - every word matters more. This result has real consequences.`);
      }
      
      return hooks;
    };
    
    const situationalHooks = buildSituationalHooks();
    // Note: situationalHooks array is used directly in fullDialoguePrompt
    
    // Build debate angle suggestions based on the matchup
    const getDebateAngles = (): string => {
      const angles: string[] = [];
      
      if (p.margin > 20 && p.loser.points > 100) {
        angles.push(`Was this a fluke blowout or is ${p.winner.name} actually this good?`);
      }
      if (p.margin < 10) {
        angles.push(`Did ${p.winner.name} get lucky or did they find a way to win?`);
      }
      if (entertainerVindicated !== analystVindicated) {
        angles.push(`One of you was right about these teams, one was wrong - hash it out.`);
      }
      if (interestFactors.entertainerPassionate && interestFactors.analystPassionate) {
        angles.push(`You both have strong feelings about these teams - don't hold back.`);
      }
      
      return angles.length > 0 ? `\nPOTENTIAL DEBATE ANGLES: ${angles.join(' OR ')}` : '';
    };
    
    // Include debate angles for interesting games
    const debateAngles = (interestLevel === 'very high' || interestLevel === 'extremely high' || isChampionship) ? getDebateAngles() : '';
    
    // Note: Hooks are used directly in fullDialoguePrompt, perspective swapping handled there
    
    // RANDOMIZE who starts the conversation - not always the same pattern!
    // Factors that influence who starts:
    // - If analyst has strong data point, they might lead
    // - If entertainer has emotional stake, they might lead
    // - Sometimes just random for variety
    const analystShouldStart = 
      (analystVindicated && !entertainerVindicated) || // Analyst called it
      (p.margin > 40 && Math.random() > 0.5) || // Big blowout, analyst might lead with stats
      (interestFactors.analystPassionate && !interestFactors.entertainerPassionate) || // Analyst cares more
      (Math.random() > 0.6); // 40% chance analyst starts anyway for variety
    
    const starterBot = analystShouldStart ? 'analyst' : 'entertainer';
    
    // Opener style is determined by the LLM based on starterBot and context
    
    // FREE-FORM DIALOGUE GENERATION
    // Let the bots talk as much or as little as they want based on their interest
    // No scripted turn counts - just give them context and let them go
    
    const dialogue: Array<{ speaker: 'entertainer' | 'analyst'; text: string }> = [];
    
    // Build rich historical context for this specific matchup
    const winnerRecord = teamRecords.get(p.winner.name) || '';
    const loserRecord = teamRecords.get(p.loser.name) || '';
    
    // Extract H2H history if available from enhanced context
    const h2hPattern = new RegExp(`${p.winner.name}.*vs.*${p.loser.name}|${p.loser.name}.*vs.*${p.winner.name}`, 'i');
    const h2hMatch = enhancedContext.match(new RegExp(`(${h2hPattern.source}[^\\n]*(?:\\n[^\\n-][^\\n]*)*)`, 'i'));
    const h2hHistory = h2hMatch ? h2hMatch[1].trim() : '';
    
    // Extract any narratives about these teams from enhanced context
    const narrativePattern = new RegExp(`(${p.winner.name}|${p.loser.name})[^\\n]*narrative|story|saga`, 'gi');
    const narrativeMatches = enhancedContext.match(narrativePattern);
    const narrativeContext = narrativeMatches ? narrativeMatches.slice(0, 2).join('; ') : '';
    
    // Build a prompt that provides rich context but encourages NATURAL use of it
    const fullDialoguePrompt = `You are two fantasy football analysts having a natural conversation about a game result.

=== THE GAME ===
${p.winner.name} defeated ${p.loser.name}
Final: ${p.winner.points.toFixed(1)} - ${p.loser.points.toFixed(1)} (margin: ${p.margin.toFixed(1)})
${isChampionship ? '🏆 THIS IS THE CHAMPIONSHIP GAME - THE BIGGEST GAME OF THE SEASON!' : ''}
${isPlayoffs ? '🏈 PLAYOFF GAME' : ''}
${p.margin > 40 ? '💀 ABSOLUTE DESTRUCTION' : p.margin > 25 ? '📢 BLOWOUT' : p.margin < 3 ? '😱 PHOTO FINISH' : p.margin < 8 ? '😰 NAIL-BITER' : ''}

=== KEY PERFORMERS ===
${p.winner.name}'s heroes: ${winnerPlayers}
${p.loser.name}'s top scorers: ${loserPlayers}

=== BACKGROUND KNOWLEDGE (use naturally, don't force) ===
${winnerRecord ? `${p.winner.name} all-time: ${winnerRecord}` : ''}
${loserRecord ? `${p.loser.name} all-time: ${loserRecord}` : ''}
${h2hHistory ? `Head-to-head history: ${h2hHistory}` : ''}
${narrativeContext ? `Ongoing storylines: ${narrativeContext}` : ''}
${isChampionship ? `${p.winner.name} IS NOW THE CHAMPION. This is their crowning moment.` : ''}

=== THE ENTERTAINER ===
${entertainerState}
${entertainerWinnerMemory ? `History with ${p.winner.name}: ${entertainerWinnerMemory}` : ''}
${entertainerLoserMemory ? `History with ${p.loser.name}: ${entertainerLoserMemory}` : ''}
${entertainerBurned ? `⚠️ GOT BURNED THIS WEEK - trusted ${p.loser.name} or doubted ${p.winner.name}` : ''}
${entertainerVindicated ? `✓ VINDICATED - called this one right` : ''}
${entertainerPersonalityContext}
${entertainerPartnerContext}

=== THE ANALYST ===
${analystState}
${analystWinnerMemory ? `History with ${p.winner.name}: ${analystWinnerMemory}` : ''}
${analystLoserMemory ? `History with ${p.loser.name}: ${analystLoserMemory}` : ''}
${analystBurned ? `⚠️ GOT BURNED - analysis didn't hold up` : ''}
${analystVindicated ? `✓ VINDICATED - the numbers were right` : ''}
${analystPersonalityContext}
${analystPartnerContext}

=== CONVERSATION ENERGY: ${interestLevel.toUpperCase()} ===
${isChampionship ? `This is THE moment. Crown the champion. Roast the runner-up. Talk legacy, what this means, predictions for next year. Go DEEP - 6-10 exchanges minimum. This conversation should feel like a celebration/post-mortem.` : ''}
${interestLevel === 'very high' && !isChampionship ? `Major storylines here. Dig in - 4-6 exchanges. Explore what this means.` : ''}
${interestLevel === 'moderate' ? `Solid game worth discussing. 3-4 exchanges.` : ''}
${interestLevel === 'low' || interestLevel === 'minimal' ? `Not much drama. Quick 2-3 exchanges and move on.` : ''}

${debateAngles}
${situationalHooks.length > 0 ? `\nPOTENTIAL ANGLES (pick what feels natural):\n${situationalHooks.slice(0, 3).join('\n')}` : ''}

=== HOW TO USE THIS CONTEXT ===
- DON'T force-mention everything. Use what feels natural to the conversation.
- DO let your history with teams color your reactions (if you've been burned by a team, show it)
- DO reference specific players who performed - they're the story
- DO build on each other's points - agree, disagree, push back, concede
- DO let your personality show - the entertainer is dramatic, the analyst is measured
- DON'T just list facts - have a CONVERSATION with opinions and reactions
- If you have an inside joke or callback with your co-host, use it naturally
- The conversation should flow like two people who know each other well

=== OUTPUT FORMAT ===
Each line starts with "ENTERTAINER:" or "ANALYST:"
Alternate speakers. No other formatting.
${starterBot === 'entertainer' ? 'Entertainer speaks first.' : 'Analyst speaks first.'}

BEGIN:`;

    // Token budgets per bot (each gets their own call now)
    const entertainerTokens = isChampionship ? 800 :
                              interestLevel === 'very high' ? 600 :
                              interestLevel === 'moderate' ? 400 : 250;
    const analystTokens = isChampionship ? 800 :
                          interestLevel === 'very high' ? 600 :
                          interestLevel === 'moderate' ? 400 : 250;

    // SEQUENTIAL GENERATION: Entertainer speaks first, Analyst sees Entertainer's output
    // This ensures the Analyst can genuinely respond to what the Entertainer said

    const entertainerOnlyPrompt = `${fullDialoguePrompt}

IMPORTANT: You are ONLY generating the ENTERTAINER's lines right now.
Write only lines starting with "ENTERTAINER:". Do not write any "ANALYST:" lines.
${starterBot === 'analyst' ? 'Note: The Analyst will speak first — write your ENTERTAINER response to an expected analyst opener about this game.' : ''}`;

    const entertainerRaw = await generateSection({
      persona: 'entertainer',
      sectionType: `${bracketInfo} Entertainer`,
      context: `${seasonalContext}\n${entertainerMatchupContext}`,
      constraints: entertainerOnlyPrompt,
      maxTokens: entertainerTokens,
    }).catch(() => '');

    // Analyst explicitly responds to the Entertainer's actual words
    // Strip any speaker labels from entertainerRaw before injecting
    const entertainerSaid = entertainerRaw.trim()
      .split('\n')
      .filter(l => l.trim())
      .map(l => l.replace(/^(?:entertainer|the entertainer)[:\s]+/i, '').trim())
      .join(' ')
      .replace(/^["']|["']$/g, '');

    const analystConstraints = [
      `The Entertainer just said about this game: "${entertainerSaid}"`,
      ``,
      `Respond in 2-3 sentences using your analytical perspective.`,
      `React to what they said — agree where the data supports it, push back where it doesn't.`,
      analystBurned ? `Your analysis didn't hold up here. Acknowledge it briefly, then explain what the numbers missed.` : '',
      analystVindicated ? `The data was right on this one. Mention it naturally.` : '',
      isChampionship ? `This is the Championship — your response matters, be substantive.` : '',
      `Write only "ANALYST: [your words]" — one line, no other formatting.`,
    ].filter(Boolean).join('\n');

    const analystRaw = await generateSection({
      persona: 'analyst',
      sectionType: `${bracketInfo} Analyst`,
      context: `${seasonalContext}\n${analystMatchupContext}`,
      constraints: analystConstraints,
      maxTokens: analystTokens,
    }).catch(() => '');

    // Parse each bot's output directly — no interleaving needed since they're separate calls
    const parseRaw = (raw: string, speaker: 'entertainer' | 'analyst'): string => {
      const label = speaker === 'entertainer' ? /^(?:entertainer|the entertainer)[:\s]+/i : /^(?:analyst|the analyst)[:\s]+/i;
      return raw.trim()
        .split('\n')
        .filter(l => l.trim())
        .map(l => l.replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/^\[|\]$/g, '').replace(/^[-•]\s*/, '').trim())
        .filter(l => {
          // For entertainer lines: accept lines with ENTERTAINER: label OR no label at all
          // For analyst lines: accept lines with ANALYST: label OR no label at all
          // Reject lines labeled for the OTHER speaker
          const oppositeLabel = speaker === 'entertainer' ? /^(?:analyst|the analyst)[:\s]+/i : /^(?:entertainer|the entertainer)[:\s]+/i;
          return !oppositeLabel.test(l);
        })
        .map(l => l.replace(label, '').replace(/^["']|["']$/g, '').trim())
        .filter(l => l.length > 10) // Skip very short fragments
        .join(' ');
    };

    const entertainerTake = parseRaw(entertainerRaw, 'entertainer');
    const analystTake = parseRaw(analystRaw, 'analyst');

    if (starterBot === 'entertainer') {
      if (entertainerTake) dialogue.push({ speaker: 'entertainer', text: entertainerTake });
      if (analystTake) dialogue.push({ speaker: 'analyst', text: analystTake });
    } else {
      if (analystTake) dialogue.push({ speaker: 'analyst', text: analystTake });
      if (entertainerTake) dialogue.push({ speaker: 'entertainer', text: entertainerTake });
    }

    // Optional rebuttal + pushback recording for any game (not just high-stakes)
    {
      const analystPushesBack = !!(entertainerTake && analystTake && (
        analystTake.toLowerCase().includes('disagree') ||
        analystTake.toLowerCase().includes('actually') ||
        analystTake.toLowerCase().includes('however') ||
        analystTake.toLowerCase().includes('but ') ||
        analystTake.toLowerCase().includes('not so fast') ||
        analystTake.toLowerCase().includes("i don't think")
      ));

      if (analystPushesBack) {
        // Rebuttal call for high-stakes games
        if (isChampionship || interestLevel === 'very high' || interestLevel === 'moderate') {
          const rebuttalRaw = await generateSection({
            persona: 'entertainer',
            sectionType: `${bracketInfo} Rebuttal`,
            context: `${seasonalContext}\n${entertainerMatchupContext}`,
            constraints: `The Analyst just responded: "${analystTake}"\n\nCome back in 2-3 sentences. Stand your ground with confidence and fire — this is healthy disagreement. Push back specifically on what they said. Write "ENTERTAINER: [your words]".`,
            maxTokens: 250,
          }).catch(() => null);

          if (rebuttalRaw) {
            const rebuttal = parseRaw(rebuttalRaw, 'entertainer');
            if (rebuttal) dialogue.push({ speaker: 'entertainer', text: rebuttal });
          }
        }

        // Record pushback to collector — who championed the actual winner?
        const entChampioned = (entertainerVindicated && !analystVindicated) ||
          (!entertainerVindicated && !analystVindicated && Math.random() > 0.5);
        const outcome: PushbackRecord['outcome'] = entChampioned
          ? 'entertainer_championed_winner'
          : 'analyst_championed_winner';

        pushbackCollector?.push({
          week,
          matchup_id: String(p.matchup_id ?? bracketInfo),
          winner_name: p.winner.name,
          entertainer_stance: entertainerTake.slice(0, 200),
          analyst_stance: analystTake.slice(0, 200),
          outcome,
          recorded_at: new Date().toISOString(),
        });

        // Apply debate outcome to bot personalities (applyDebateOutcome equivalent)
        const memEntE = isEnhancedMemory(memEntertainer) ? memEntertainer : null;
        const memAnaE = isEnhancedMemory(memAnalyst) ? memAnalyst : null;
        if (entChampioned) {
          if (memEntE) evolvePersonality(memEntE, { type: 'vindicated', intensity: 3, context: 'Won debate', week });
          if (memAnaE) evolvePersonality(memAnaE, { type: 'humbled', intensity: 2, context: 'Lost debate', week });
        } else {
          if (memAnaE) evolvePersonality(memAnaE, { type: 'vindicated', intensity: 3, context: 'Won debate', week });
          if (memEntE) evolvePersonality(memEntE, { type: 'humbled', intensity: 2, context: 'Lost debate', week });
        }

        // Record who was right in partner dynamics (updates timesIWasRight / timesTheyWereRight)
        const matchupLabel = `${p.winner.name} vs ${p.loser.name}`;
        recordWhoWasRight(memEntertainer, week, matchupLabel, entChampioned, p.winner.name);
        recordWhoWasRight(memAnalyst, week, matchupLabel, !entChampioned, p.winner.name);

        // Register emerging phrases seeded by debate outcome — build toward catchphrases over time
        if (memEntertainer.speechPatterns) {
          registerEmergingPhrase(
            memEntertainer,
            entChampioned ? "called it" : "I'll own this one",
            'debate_outcome', week,
            `${p.winner.name} win`
          );
        }
        if (memAnalyst.speechPatterns) {
          registerEmergingPhrase(
            memAnalyst,
            !entChampioned ? "the data held" : "variance happens",
            'debate_outcome', week,
            `${p.winner.name} win`
          );
        }
      }
    }

    console.log(`[Dialogue] Generated ${dialogue.length} turns for ${p.winner.name} vs ${p.loser.name}`);

    // Fallback if sequential generation completely failed
    if (dialogue.length < 2) {
      if (qualityReport) {
        if (!Array.isArray(qualityReport.usedFallbacks)) qualityReport.usedFallbacks = [];
        qualityReport.usedFallbacks.push('Recaps.SequentialFallback');
      }
      dialogue.length = 0;
      dialogue.push({
        speaker: 'entertainer',
        text: `${p.winner.name} takes it ${p.winner.points.toFixed(1)}-${p.loser.points.toFixed(1)}. ${p.margin > 20 ? 'Not even close!' : p.margin < 5 ? 'What a finish!' : 'Solid win.'}`,
      });
      dialogue.push({
        speaker: 'analyst',
        text: `Margin of ${p.margin.toFixed(1)} tells the story. ${winnerPlayers.split(',')[0]?.split(' (')[0] ?? 'Top performer'} was the difference.`,
      });
    }
    
    // Detect disagreement for memory tracking
    const hasDisagreement = dialogue.some(d => 
      d.text.toLowerCase().includes('disagree') || 
      d.text.toLowerCase().includes('but ') ||
      d.text.toLowerCase().includes('however') ||
      d.text.toLowerCase().includes('actually')
    );

    // Build bot1/bot2 for backwards compatibility
    const entertainerTexts = dialogue.filter(d => d.speaker === 'entertainer').map(d => d.text);
    const analystTexts = dialogue.filter(d => d.speaker === 'analyst').map(d => d.text);
    const bot1Combined = entertainerTexts.join('\n\n');
    const bot2Combined = analystTexts.join('\n\n');
    
    // Record this interaction in memory for future reference
    // This allows bots to learn from each other and reference past conversations
    const matchupTopic = `${p.winner.name} vs ${p.loser.name}`;
    const didTheyAgree = !hasDisagreement;
    
    // Record for entertainer's memory
    if ('partnerDynamics' in memEntertainer || true) {
      recordBotInteraction(
        memEntertainer,
        week,
        {
          matchup: matchupTopic,
          topic: matchupTopic,
          agreed: didTheyAgree,
          myTake: entertainerTexts[0] || '',
          theirTake: analystTexts[0] || '',
          memorable: isChampionship || p.margin > 40 || p.margin < 3,
        }
      );
    }
    
    // Record for analyst's memory (from their perspective)
    if ('partnerDynamics' in memAnalyst || true) {
      recordBotInteraction(
        memAnalyst,
        week,
        {
          matchup: matchupTopic,
          topic: matchupTopic,
          agreed: didTheyAgree,
          myTake: analystTexts[0] || '',
          theirTake: entertainerTexts[0] || '',
          memorable: isChampionship || p.margin > 40 || p.margin < 3,
        }
      );
    }
    
    // Evolve personality based on this matchup's outcome
    // This is how the bots learn and change over time
    // Only apply if the memory has the enhanced personality fields
    const memEntEnhanced = isEnhancedMemory(memEntertainer) ? memEntertainer : null;
    const memAnaEnhanced = isEnhancedMemory(memAnalyst) ? memAnalyst : null;
    
    // TODO: Wire registerEmergingPhrase() here once we have a good source of short phrases.
    // Current candidates (hot takes, intro text) are full sentences, not catchphrase-style.
    // Need: LLM to extract 2-3 word phrases from generated content, or a dedicated
    // "hook line" field in recap output. Don't add speculative extraction logic.
    
    if (memEntEnhanced) {
      if (entertainerVindicated) {
        evolvePersonality(memEntEnhanced, { type: 'vindicated', intensity: isChampionship ? 9 : 5, week });
        updateEmotionalState(memEntEnhanced, 'smug', isChampionship ? 80 : 50, { week, event: `Called ${p.winner.name} win` });
      }
      if (entertainerBurned) {
        evolvePersonality(memEntEnhanced, { type: 'humbled', intensity: isChampionship ? 8 : 5, context: `${p.loser.name} let me down`, week });
        updateEmotionalState(memEntEnhanced, 'frustrated', isChampionship ? 70 : 45, { week, event: `${p.loser.name} disappointed`, team: p.loser.name });
      }
      if (p.margin > 40 && entertainerVindicated) {
        evolvePersonality(memEntEnhanced, { type: 'big_win', intensity: 7, week });
      }
      if (p.margin < 3) {
        evolvePersonality(memEntEnhanced, { type: 'heartbreak', intensity: 4, week });
      }
    }
    
    if (memAnaEnhanced) {
      if (analystVindicated) {
        evolvePersonality(memAnaEnhanced, { type: 'vindicated', intensity: isChampionship ? 8 : 4, week });
        updateEmotionalState(memAnaEnhanced, 'smug', isChampionship ? 60 : 40, { week, event: `Analysis on ${p.winner.name} held up` });
      }
      if (analystBurned) {
        evolvePersonality(memAnaEnhanced, { type: 'humbled', intensity: isChampionship ? 7 : 4, context: `${p.loser.name} defied the numbers`, week });
        updateEmotionalState(memAnaEnhanced, 'anxious', isChampionship ? 55 : 35, { week, event: `Model missed on ${p.loser.name}`, team: p.loser.name });
      }
      if (p.margin > 40 && analystVindicated) {
        evolvePersonality(memAnaEnhanced, { type: 'big_win', intensity: 6, week });
      }
    }
    
    // Track player relationships based on top performers
    if (p.winner.topPlayers && p.winner.topPlayers.length > 0) {
      const topPerformer = p.winner.topPlayers[0];
      if (topPerformer && topPerformer.points >= 25) {
        // Big performance - update relationships
        if (memEntEnhanced) {
          updatePlayerRelationship(memEntEnhanced, topPerformer.name, topPerformer.name, {
            week,
            description: `${topPerformer.points.toFixed(1)} pts in ${p.winner.name}'s win`,
            impact: topPerformer.points >= 35 ? 15 : 10,
            emotional: topPerformer.points >= 35,
          });
          
          // Check if this is a favorite player - evolve personality if they performed
          if (memEntEnhanced.favoritePlayers?.includes(topPerformer.name)) {
            evolvePersonality(memEntEnhanced, {
              type: 'favorite_player_performed',
              intensity: topPerformer.points >= 35 ? 8 : 5,
              context: `${topPerformer.name} delivered`,
              week,
            });
          }
        }
        if (memAnaEnhanced) {
          updatePlayerRelationship(memAnaEnhanced, topPerformer.name, topPerformer.name, {
            week,
            description: `${topPerformer.points.toFixed(1)} pts - strong performance`,
            impact: topPerformer.points >= 35 ? 12 : 8,
            emotional: false,
          });
          
          // Analyst also tracks favorites but less emotionally
          if (memAnaEnhanced.favoritePlayers?.includes(topPerformer.name)) {
            evolvePersonality(memAnaEnhanced, {
              type: 'favorite_player_performed',
              intensity: topPerformer.points >= 35 ? 6 : 3,
              context: `${topPerformer.name} validated the projection`,
              week,
            });
          }
        }
      }
    }
    
    // Track disappointing performances from loser's top players
    if (p.loser.topPlayers && p.loser.topPlayers.length > 0) {
      const topLoserPlayer = p.loser.topPlayers[0];
      if (topLoserPlayer && topLoserPlayer.points < 10 && p.margin > 20) {
        // Disappointing performance in a blowout loss
        if (memEntEnhanced) {
          updatePlayerRelationship(memEntEnhanced, topLoserPlayer.name, topLoserPlayer.name, {
            week,
            description: `Only ${topLoserPlayer.points.toFixed(1)} pts in ${p.loser.name}'s loss`,
            impact: -8,
            emotional: true,
          });
          
          // Check if this is a favorite player who disappointed
          if (memEntEnhanced.favoritePlayers?.includes(topLoserPlayer.name)) {
            evolvePersonality(memEntEnhanced, {
              type: 'favorite_player_disappointed',
              intensity: 7,
              context: `${topLoserPlayer.name} let me down`,
              week,
            });
          }
        }
        if (memAnaEnhanced) {
          updatePlayerRelationship(memAnaEnhanced, topLoserPlayer.name, topLoserPlayer.name, {
            week,
            description: `Underperformed with ${topLoserPlayer.points.toFixed(1)} pts`,
            impact: -6,
            emotional: false,
          });
          
          // Analyst notes disappointment but less emotionally
          if (memAnaEnhanced.favoritePlayers?.includes(topLoserPlayer.name)) {
            evolvePersonality(memAnaEnhanced, {
              type: 'favorite_player_disappointed',
              intensity: 4,
              context: `${topLoserPlayer.name} underperformed expectations`,
              week,
            });
          }
        }
      }
    }

    return {
      matchup_id: p.matchup_id,
      bot1: bot1Combined || `${p.winner.name} takes down ${p.loser.name} by ${p.margin.toFixed(1)}. Moving on.`,
      bot2: bot2Combined || `${p.winner.name} ${p.winner.points.toFixed(1)}, ${p.loser.name} ${p.loser.points.toFixed(1)}. Margin: ${p.margin.toFixed(1)}.`,
      winner: p.winner.name,
      loser: p.loser.name,
      winner_score: p.winner.points,
      loser_score: p.loser.points,
      bracketLabel: p.bracketLabel,
      dialogue,
    };
  });

  return Promise.all(recapPromises);
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

// ============ Blurt Section ============

async function buildBlurt(
  week: number,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  enhancedContext: string,
): Promise<BlurtSection> {
  const entPersonality = isEnhancedMemory(memEntertainer) ? getPersonalityContext(memEntertainer) : '';
  const anaPersonality = isEnhancedMemory(memAnalyst) ? getPersonalityContext(memAnalyst) : '';
  const ctxSnippet = enhancedContext.substring(0, 600);

  const [bot1, bot2] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Blurt',
      context: ctxSnippet + (entPersonality ? `\n${entPersonality}` : ''),
      constraints: `Week ${week}. One sharp aside — something burning on your mind, a hot observation, a player or team you can't stop thinking about. 2-3 sentences max. No speaker label, just your words.`,
      maxTokens: 150,
    }).then(r => r.trim().replace(/^(?:entertainer|the entertainer)[:\s]+/i, '').replace(/^["']|["']$/g, '') || null).catch(() => null),
    generateSection({
      persona: 'analyst',
      sectionType: 'Blurt',
      context: ctxSnippet + (anaPersonality ? `\n${anaPersonality}` : ''),
      constraints: `Week ${week}. One sharp analytical observation that doesn't fit anywhere else — a data point, a trend, a number that surprised you. 2-3 sentences max. No speaker label, just your words.`,
      maxTokens: 150,
    }).then(r => r.trim().replace(/^(?:analyst|the analyst)[:\s]+/i, '').replace(/^["']|["']$/g, '') || null).catch(() => null),
  ]);

  const validBlurtMoods = ['Focused', 'Fired Up', 'Deflated'] as const;
  type BlurtMood = typeof validBlurtMoods[number];
  const toBlurtMood = (m: string | undefined): BlurtMood =>
    (validBlurtMoods as readonly string[]).includes(m ?? '') ? m as BlurtMood : 'Focused';
  return {
    bot1: bot1 || makeBlurt('entertainer', toBlurtMood(memEntertainer.summaryMood)),
    bot2: bot2 || makeBlurt('analyst', toBlurtMood(memAnalyst.summaryMood)),
  };
}

// ============ Draft Section Builders ============

/**
 * Build the pre-draft preview section.
 * Uses actual Sleeper draft order + Groq's NFL draft knowledge for prospect analysis.
 */
async function buildDraftPreview(
  draftData: LeagueDraftData | null,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  season: number,
  enhancedContext: string,
): Promise<DraftPreviewSection> {
  const leagueKnowledge = buildStaticLeagueContext();

  // Build draft order context string
  let draftOrderContext = '';
  if (draftData?.draftOrder && draftData.draftOrder.length > 0) {
    draftOrderContext = `\nDRAFT ORDER (${season} Rookie Draft):\n`;
    draftData.draftOrder.forEach((team, idx) => {
      draftOrderContext += `Pick ${idx + 1}: ${team}\n`;
    });
    draftOrderContext += `\nDraft type: ${draftData.type}, ${draftData.totalRounds} rounds, ${draftData.totalTeams} teams`;
  } else {
    draftOrderContext = '\nDraft order has not been set yet.';
  }

  const context = `${leagueKnowledge}

---

PRE-DRAFT PREVIEW — ${season} ROOKIE DRAFT

You are covering the East v. West fantasy football league's upcoming rookie draft.
This is a DYNASTY league — rookies are the lifeblood of long-term success.

${draftOrderContext}

${enhancedContext}

NFL DRAFT CONTEXT (${season}):
Use your knowledge of the ${season} NFL Draft class to identify:
- Top overall prospects by ADP and consensus rankings
- Deep positions in this class (RB, WR, TE, QB depth)
- Sleeper/late-round values
- Players who will be immediately relevant in fantasy

Match prospects to teams: which teams have early picks and need certain positions?
Which teams in the middle rounds can still find value?`;

  // Generate top prospects list
  const prospectsRaw = await generateSection({
    persona: 'analyst',
    sectionType: 'Draft Preview - Top Prospects',
    context,
    constraints: `List the top 10 NFL rookie prospects for the ${season} draft class. For each:
Format: "NAME (POS, NFL TEAM) — 2-3 sentence analysis of dynasty value and landing spot"
Base this on consensus ADP rankings and your knowledge of the draft class.
Focus on dynasty fantasy value, not just NFL value.`,
    maxTokens: 1200,
  });

  // Generate team needs
  const teamNeedsRaw = await generateSection({
    persona: 'analyst',
    sectionType: 'Draft Preview - Team Needs',
    context,
    constraints: `Analyze each team's draft needs based on their draft slot and roster construction.
${draftData?.draftOrder.length ? `Teams picking early: ${draftData.draftOrder.slice(0, 4).join(', ')}` : ''}
For each team, identify: 1-2 key positional needs, their draft strategy (BPA vs need), and what a "home run" pick looks like.
Format: "TEAM (Pick N): needs [positions], strategy: [description]"`,
    maxTokens: 800,
  });

  // Generate mock draft
  const mockDraftRaw = await generateSection({
    persona: 'entertainer',
    sectionType: 'Draft Preview - Mock Draft',
    context: context + '\n\n' + prospectsRaw,
    constraints: `Create a mock draft for the first round (${draftData?.totalTeams ?? 12} picks).
Show who each team SHOULD take based on their needs and what prospects will be available.
Format each pick: "Pick N — TEAM: PLAYER NAME (POS) — one sentence on why this is the move"
Be specific about players and why each pick makes sense for that team.`,
    maxTokens: 1000,
  });

  // Generate bot previews (the narrative intros)
  const [bot1_preview, bot2_preview] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Draft Preview - Entertainer Preview',
      context,
      constraints: `Write 3-4 paragraphs of draft preview commentary. Who are you most excited about? Which teams are set up to win this draft? Any bold takes on prospects falling or rising? Build hype for draft day. Be entertaining and opinionated.`,
      maxTokens: 700,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Draft Preview - Analyst Preview',
      context,
      constraints: `Write 3-4 paragraphs of analytical draft preview. Cover: the overall depth of this class, key value tiers, which teams have the best draft capital, and what it would take for each team to have a successful draft. Be thorough and data-focused.`,
      maxTokens: 700,
    }),
  ]);

  // Parse top prospects
  const topProspects = prospectsRaw
    .split('\n')
    .filter(l => l.trim() && /^[A-Z]/.test(l.trim()))
    .slice(0, 10)
    .map(line => {
      const match = line.match(/^([^(]+)\(([^,)]+)[^)]*\)\s*[—–-]\s*(.+)/);
      return {
        name: match ? match[1].trim() : line.split('(')[0].trim(),
        position: match ? match[2].trim() : 'FLEX',
        analysis: match ? match[3].trim() : line.trim(),
      };
    });

  // Build draft order array
  const draftOrder = (draftData?.draftOrder ?? []).map((team, idx) => ({
    pick: idx + 1,
    team,
  }));

  // Parse team needs (simplified)
  const teamNeeds = teamNeedsRaw
    .split('\n')
    .filter(l => l.trim() && l.includes(':'))
    .slice(0, 12)
    .map(line => {
      const teamMatch = line.match(/^([^(]+)\(Pick \d+\):\s*(.+)/);
      const team = teamMatch ? teamMatch[1].trim() : line.split(':')[0].trim();
      const rest = teamMatch ? teamMatch[2] : line.split(':').slice(1).join(':');
      const needsMatch = rest.match(/needs?\s+([^,]+)/i);
      const strategyMatch = rest.match(/strategy:\s*(.+)/i);
      return {
        team,
        needs: needsMatch ? [needsMatch[1].trim()] : ['RB', 'WR'],
        strategy: strategyMatch ? strategyMatch[1].trim() : rest.trim(),
      };
    });

  // Parse mock draft picks
  const mockDraft = mockDraftRaw
    .split('\n')
    .filter(l => l.trim() && /Pick \d+/.test(l))
    .slice(0, draftData?.totalTeams ?? 12)
    .map(line => {
      const pickMatch = line.match(/Pick (\d+)\s*[—–-]\s*([^:]+):\s*([^(]+)\(([^)]+)\)\s*[—–-]?\s*(.*)/);
      if (pickMatch) {
        return {
          pick: parseInt(pickMatch[1]),
          team: pickMatch[2].trim(),
          player: pickMatch[3].trim(),
          analysis: pickMatch[5].trim() || `Strong fit for ${pickMatch[2].trim()}`,
        };
      }
      return null;
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return {
    draftOrder,
    topProspects: topProspects.length > 0 ? topProspects : [
      { name: 'Top Rookie WR', position: 'WR', analysis: 'Expected to go early in dynasty drafts.' },
      { name: 'Top Rookie RB', position: 'RB', analysis: 'High-upside runner in a great situation.' },
    ],
    teamNeeds: teamNeeds.length > 0 ? teamNeeds : [],
    mockDraft: mockDraft.length > 0 ? mockDraft : undefined,
    bot1_preview,
    bot2_preview,
  };
}

/**
 * Build the post-draft grades section.
 * Uses actual picks from Sleeper + LLM analysis.
 */
async function buildDraftGrades(
  draftData: LeagueDraftData | null,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  season: number,
  enhancedContext: string,
): Promise<DraftGradesSection> {
  const leagueKnowledge = buildStaticLeagueContext();

  // Build picks context by team
  type PickEntry = NonNullable<LeagueDraftData['picks']>[number];
  const picksByTeam = new Map<string, PickEntry[]>();
  if (draftData?.picks) {
    for (const pick of draftData.picks) {
      const team = pick.teamName || `Roster ${pick.roster_id}`;
      if (!picksByTeam.has(team)) picksByTeam.set(team, []);
      picksByTeam.get(team)!.push(pick);
    }
  }

  // Build picks context string for LLM
  const picksContext = Array.from(picksByTeam.entries()).map(([team, picks]) => {
    const picksList = picks
      .sort((a, b) => a.pick_no - b.pick_no)
      .map(p => `  Round ${p.round}, Pick ${p.pick_no}: ${p.playerName} (${p.position}, ${p.nflTeam || 'NFL'})`)
      .join('\n');
    return `${team}:\n${picksList}`;
  }).join('\n\n');

  const context = `${leagueKnowledge}

---

POST-DRAFT GRADES — ${season} ROOKIE DRAFT

The draft is complete. Here are all the picks:

${picksContext || 'Draft picks not yet available.'}

${enhancedContext}

Grade each team's draft from A+ to F based on:
- Value at each pick (did they reach or get value?)
- Addressing team needs
- Overall haul quality
- Dynasty upside of their picks`;

  // Generate grades for all teams in parallel
  const teamList = Array.from(picksByTeam.keys());

  const gradePromises = teamList.map(async (team) => {
    const teamPicks = picksByTeam.get(team) || [];
    const picksText = teamPicks
      .sort((a, b) => a.pick_no - b.pick_no)
      .map(p => `Round ${p.round}: ${p.playerName} (${p.position})`)
      .join(', ');

    const teamContext = `${context}\n\nGRADING: ${team}\nTheir picks: ${picksText}`;

    const [bot1_analysis, bot2_analysis] = await Promise.all([
      generateSection({
        persona: 'entertainer',
        sectionType: `Draft Grade - ${team}`,
        context: teamContext,
        constraints: `Grade ${team}'s draft (A+ to F). Write 2-3 sentences with your personality-driven reaction. Start with the letter grade. Were they the biggest winner? Did they whiff? Be opinionated.`,
        maxTokens: 300,
      }),
      generateSection({
        persona: 'analyst',
        sectionType: `Draft Grade - ${team}`,
        context: teamContext,
        constraints: `Grade ${team}'s draft (A+ to F). Write 2-3 sentences of analytical assessment. Cover: value at each pick, needs addressed, and dynasty trajectory. Start with the letter grade.`,
        maxTokens: 300,
      }),
    ]);

    const gradeMatch = (bot1_analysis + bot2_analysis).match(/\b([A-F][+-]?)\b/);
    const grade = gradeMatch ? gradeMatch[1].toUpperCase() : 'B';

    return {
      team,
      picks: teamPicks.map(p => ({
        round: p.round,
        pick: p.pick_no,
        player: p.playerName,
        position: p.position,
      })),
      grade,
      bot1_analysis,
      bot2_analysis,
    };
  });

  const grades = await Promise.all(gradePromises);

  // Generate overall summaries and awards
  const [bot1_summary, bot2_summary, awardsRaw] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Draft Grades - Overall Summary',
      context,
      constraints: 'Write 3-4 paragraphs summarizing the entire draft. Who were the biggest winners and losers? What was your favorite pick of the draft? Any sleepers you think will be superstars? Be entertaining and definitive.',
      maxTokens: 600,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Draft Grades - Overall Summary',
      context,
      constraints: 'Write 3-4 paragraphs of analytical draft summary. Cover: the overall depth of the class, which teams improved their dynasty trajectories most, best value picks, and the long-term competitive landscape after this draft.',
      maxTokens: 600,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Draft Grades - Awards',
      context,
      constraints: `Identify:
1. BEST PICK: "TeamName - PlayerName - reason (1-2 sentences)"
2. WORST PICK: "TeamName - PlayerName - reason (1-2 sentences)"
3. STEAL OF THE DRAFT: "TeamName - PlayerName - reason (1-2 sentences)"
Format exactly as shown.`,
      maxTokens: 400,
    }),
  ]);

  // Parse awards
  const parseAward = (text: string, keyword: string): { team: string; player: string; reason: string } => {
    const lines = text.split('\n');
    const line = lines.find(l => l.toUpperCase().includes(keyword)) || '';
    const match = line.match(/([^-]+)\s*-\s*([^-]+)\s*-\s*(.+)/);
    return {
      team: match ? match[1].trim().replace(/^\d+\.\s*(?:BEST|WORST|STEAL[^:]*)?:?\s*/i, '') : 'TBD',
      player: match ? match[2].trim() : 'TBD',
      reason: match ? match[3].trim() : 'Exceptional value and fit.',
    };
  };

  return {
    grades,
    bestPick: parseAward(awardsRaw, 'BEST'),
    worstPick: parseAward(awardsRaw, 'WORST'),
    stealOfTheDraft: parseAward(awardsRaw, 'STEAL'),
    bot1_summary,
    bot2_summary,
  };
}

// ============ Theme Inference ============

async function inferThemesIfReady(rel: RelationshipMemory): Promise<void> {
  if (rel.pushbacks.length < 5) return;
  const recentPushbacks = rel.pushbacks.slice(-10);
  const pbLog = recentPushbacks.map((pb, i) =>
    `${i + 1}. Wk${pb.week} – ${pb.winner_name}: E="${pb.entertainer_stance}" A="${pb.analyst_stance}" → ${pb.outcome}`
  ).join('\n');

  try {
    const response = await generateSection({
      persona: 'analyst',
      sectionType: 'ThemeInference',
      context: pbLog,
      constraints: `Analyze these ${recentPushbacks.length} bot debate records. Respond with ONLY this JSON (no markdown):
{"entertainer_tendencies":["tendency1","tendency2"],"analyst_tendencies":["tendency1","tendency2"],"persistent_disagreements":["topic1"]}
Each array: 2-3 strings under 60 chars each.`,
      maxTokens: 180,
    });
    const cleaned = response.trim().replace(/^```json?\n?|\n?```$/g, '');
    const parsed = JSON.parse(cleaned) as {
      entertainer_tendencies?: string[];
      analyst_tendencies?: string[];
      persistent_disagreements?: string[];
    };
    if (Array.isArray(parsed.entertainer_tendencies)) rel.themes.entertainer_tendencies = parsed.entertainer_tendencies.slice(0, 3);
    if (Array.isArray(parsed.analyst_tendencies)) rel.themes.analyst_tendencies = parsed.analyst_tendencies.slice(0, 3);
    if (Array.isArray(parsed.persistent_disagreements)) rel.themes.persistent_disagreements = parsed.persistent_disagreements.slice(0, 3);
    console.log(`[Compose] inferThemesIfReady: updated themes from ${recentPushbacks.length} pushbacks`);
  } catch {
    // Non-critical; themes are enrichment only
  }
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
  // For LLM features
  h2hData?: Record<string, Record<string, { wins: number; losses: number }>>;
  previousPredictions?: Array<{ week: number; pick: string; actual: string; correct: boolean }>;
  previousHotTakes?: WeeklyHotTake[];
  relationshipMemory?: RelationshipMemory | null;
  /** Resolved draft data (roster IDs already resolved to team names) */
  draftData?: LeagueDraftData | null;
  /** Called when a section completes — used for real-time progress tracking */
  onSectionComplete?: (sectionName: string) => void;
}

export async function composeNewsletter(input: ComposeNewsletterInput, qualityReport?: { usedFallbacks: string[] }): Promise<Newsletter> {
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
    h2hData,
    previousPredictions,
    previousHotTakes,
    relationshipMemory,
    draftData,
    onSectionComplete,
  } = input;

  // Get episode configuration for section filtering
  const episodeConfig = getEpisodeConfigForType(episodeType, week, season);
  const excludeSections = new Set(episodeConfig.excludeSections || []);
  const isSpecialEpisode = episodeType !== 'regular';

  const pairs = derived.matchup_pairs || [];
  const events = derived.events_scored || [];
  
  // Track mentions for obsession detection
  const entertainerMentions = new Map<string, number>();
  const analystMentions = new Map<string, number>();
  
  // Helper to track team mentions
  const trackMention = (mentions: Map<string, number>, subject: string) => {
    mentions.set(subject, (mentions.get(subject) || 0) + 1);
  };
  
  // Fade old obsessions and decay emotional state at the start of each week
  if (isEnhancedMemory(memEntertainer)) {
    fadeObsessions(memEntertainer, week);
    decayEmotionalState(memEntertainer);
  }
  if (isEnhancedMemory(memAnalyst)) {
    fadeObsessions(memAnalyst, week);
    decayEmotionalState(memAnalyst);
  }

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

  // Helper to wrap section builders with error recovery
  async function safeSection<T>(
    name: string,
    builder: () => Promise<T>,
    fallback: T
  ): Promise<T> {
    try {
      const result = await builder();
      onSectionComplete?.(name);
      return result;
    } catch (error) {
      console.error(`[Compose] Section "${name}" failed, using fallback:`, error);
      if (qualityReport) {
        if (!Array.isArray(qualityReport.usedFallbacks)) qualityReport.usedFallbacks = [];
        qualityReport.usedFallbacks.push(name);
      }
      onSectionComplete?.(name);
      return fallback;
    }
  }

  // Fallback content for failed sections
  const fallbackIntro: IntroSection = {
    bot1_text: `Week ${week} is in the books. Let's break it down.`,
    bot2_text: `The numbers tell an interesting story this week.`,
  };
  const fallbackFinalWord: FinalWordSection = {
    bot1: 'Until next week, keep the faith.',
    bot2: 'The data will guide us. See you next week.',
  };

  // Collect pushbacks from all matchup debates so they can be applied to RelationshipMemory after
  const pushbackCollector: PushbackRecord[] = [];

  // Build all sections using LLM (run in parallel where possible)
  // Each section is wrapped in error recovery to prevent one failure from killing the whole newsletter
  const [intro, waiverItems, tradeItems, spotlight, finalWord, recaps, blurt] = await Promise.all([
    safeSection('Intro', () => buildIntro(week, pairs, events, memEntertainer, memAnalyst, fullEnhancedContext, episodeType, season), fallbackIntro),
    excludeSections.has('WaiversAndFA') ? Promise.resolve([]) : safeSection('WaiversAndFA', () => buildWaiverItems(events), []),
    excludeSections.has('Trades') ? Promise.resolve([]) : safeSection('Trades', () => buildTradeItems(events), []),
    excludeSections.has('SpotlightTeam') ? Promise.resolve(null) : safeSection('Spotlight', () => buildSpotlight(pairs, memEntertainer, memAnalyst, fullEnhancedContext), null),
    safeSection('FinalWord', () => buildFinalWord(week, episodeType), fallbackFinalWord),
    excludeSections.has('MatchupRecaps') ? Promise.resolve([]) : safeSection('Recaps', () => buildRecaps(pairs, memEntertainer, memAnalyst, week, fullEnhancedContext, qualityReport, pushbackCollector), []),
    excludeSections.has('Blurt') ? Promise.resolve({ bot1: null, bot2: null } as BlurtSection) : safeSection('Blurt', () => buildBlurt(week, memEntertainer, memAnalyst, fullEnhancedContext), { bot1: null, bot2: null } as BlurtSection),
  ]);

  console.log(`[Compose] Core sections generated via LLM (with error recovery)`);

  // Apply collected pushbacks to RelationshipMemory and infer themes
  if (pushbackCollector.length > 0 && relationshipMemory) {
    for (const pb of pushbackCollector) {
      relationshipMemory.pushbacks.push(pb);
      relationshipMemory.dynamic.total_pushbacks++;
      relationshipMemory.dynamic.last_pushback_week = pb.week;
    }
    await inferThemesIfReady(relationshipMemory);
    console.log(`[Compose] Applied ${pushbackCollector.length} pushbacks to RelationshipMemory`);
  }

  // Feud detection: if the same team triggered 2+ debates this week, start/escalate a feud
  if (pushbackCollector.length >= 2) {
    const teamDebateCounts = new Map<string, typeof pushbackCollector[0]>();
    const teamCount = new Map<string, number>();
    for (const pb of pushbackCollector) {
      teamCount.set(pb.winner_name, (teamCount.get(pb.winner_name) || 0) + 1);
      teamDebateCounts.set(pb.winner_name, pb);
    }
    for (const [team, count] of teamCount) {
      if (count >= 2) {
        const pb = teamDebateCounts.get(team)!;
        const intensity = count >= 3 ? 'heated' : 'mild';
        updateBotFeud(memEntertainer, {
          topic: team,
          myPosition: pb.entertainer_stance.slice(0, 80),
          theirPosition: pb.analyst_stance.slice(0, 80),
          startedWeek: week,
          intensity,
        });
        updateBotFeud(memAnalyst, {
          topic: team,
          myPosition: pb.analyst_stance.slice(0, 80),
          theirPosition: pb.entertainer_stance.slice(0, 80),
          startedWeek: week,
          intensity,
        });
        console.log(`[Compose] Feud started/escalated about ${team} (${count} debates, intensity: ${intensity})`);
      }
    }
  }

  // Inside jokes: add memorable references for blowouts where someone called it
  for (const pair of pairs) {
    if (pair.margin >= 35) {
      const pb = pushbackCollector.find(p => p.winner_name === pair.winner.name);
      if (pb) {
        const who = pb.outcome === 'entertainer_championed_winner' ? 'Entertainer' : 'Analyst';
        const joke = `${who} called ${pair.winner.name}'s blowout (Wk${week}, +${Math.round(pair.margin)})`;
        addInsideJoke(memEntertainer, week, joke);
        addInsideJoke(memAnalyst, week, joke);
      }
    }
  }

  // Generate all new LLM-powered features (debates, hot takes, awards, etc.)
  let llmFeatures: LLMFeaturesOutput | null = null;
  if (episodeType === 'regular' && pairs.length > 0) {
    console.log(`[Compose] Generating LLM-powered features (debates, hot takes, awards, etc.)...`);
    try {
      const personaCtxEnt = `${getPersonalityContext(memEntertainer)}${getPartnerDynamicsContext(memEntertainer)}${getObsessionContext(memEntertainer)}${getNarrativesContext(memEntertainer, week)}`;
      const personaCtxAna = `${getPersonalityContext(memAnalyst)}${getPartnerDynamicsContext(memAnalyst)}${getObsessionContext(memAnalyst)}${getNarrativesContext(memAnalyst, week)}`;
      const llmInput: LLMFeaturesInput = {
        week,
        pairs,
        upcomingPairs: derived.upcoming_pairs || [],
        picks: forecast?.picks || [],
        trades: tradeItems,
        standings: enhancedContext?.standings,
        h2hData,
        previousPredictions,
        previousHotTakes,
        context: fullEnhancedContext,
        personaContextEntertainer: personaCtxEnt,
        personaContextAnalyst: personaCtxAna,
      };
      llmFeatures = await generateAllLLMFeatures(llmInput);
      console.log(`[Compose] LLM features generated: ${llmFeatures.debates.length} debates, ${llmFeatures.hotTakes.length} hot takes, ${llmFeatures.whatIfs.length} what-ifs`);

      // Persist hot takes into memory (enhanced only)
      if (llmFeatures.hotTakes && llmFeatures.hotTakes.length > 0) {
        for (const ht of llmFeatures.hotTakes) {
          if (ht.bot === 'entertainer' && isEnhancedMemory(memEntertainer)) {
            recordHotTake(memEntertainer, {
              week: ht.week,
              take: ht.take,
              subject: ht.subject,
              boldness: ht.boldness,
            });
            
            // Evolve personality based on hot take boldness
            if (ht.boldness === 'spicy' || ht.boldness === 'nuclear') {
              evolvePersonality(memEntertainer, {
                type: 'bold_take_paid_off',
                intensity: ht.boldness === 'nuclear' ? 8 : 5,
                context: ht.take,
                week,
              });
            }
          }
          if (ht.bot === 'analyst' && isEnhancedMemory(memAnalyst)) {
            recordHotTake(memAnalyst, {
              week: ht.week,
              take: ht.take,
              subject: ht.subject,
              boldness: ht.boldness,
            });
            
            // Analyst takes are more measured but still tracked
            if (ht.boldness === 'spicy' || ht.boldness === 'nuclear') {
              evolvePersonality(memAnalyst, {
                type: 'bold_take_paid_off',
                intensity: ht.boldness === 'nuclear' ? 6 : 3,
                context: ht.take,
                week,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`[Compose] Failed to generate LLM features:`, error);
    }
  }

  console.log(`[Compose] All sections generated via LLM`);
  console.log(`[Compose] Episode type: ${episodeType}, excluding sections: ${Array.from(excludeSections).join(', ') || 'none'}`);

  // Assemble sections array, respecting episode-specific exclusions
  const sections: NewsletterSection[] = [
    { type: 'Intro', data: intro },
  ];

  // Build WEEKLY power rankings for regular episodes (each bot ranks all 12 teams)
  // This is different from preseason rankings - it reflects current season performance
  if (episodeType === 'regular' && pairs.length > 0 && !excludeSections.has('PowerRankings')) {
    console.log(`[Compose] Building weekly power rankings...`);
    const weeklyPowerRankings = await safeSection('WeeklyPowerRankings', 
      () => buildWeeklyPowerRankings(week, pairs, memEntertainer, memAnalyst, fullEnhancedContext),
      null
    );
    if (weeklyPowerRankings) {
      sections.push({ type: 'PowerRankings', data: weeklyPowerRankings });
      console.log(`[Compose] Weekly power rankings built successfully`);
    }
  }

  // Build special episode sections for preseason
  if (episodeType === 'preseason') {
    console.log(`[Compose] Building preseason-specific sections...`);
    const [powerRankings, seasonPreview] = await Promise.all([
      safeSection('PreseasonRankings', () => buildPowerRankings(fullEnhancedContext, memEntertainer, memAnalyst, season), null),
      safeSection('SeasonPreview', () => buildSeasonPreview(fullEnhancedContext, memEntertainer, memAnalyst, season), null),
    ]);
    if (powerRankings) sections.push({ type: 'PowerRankings', data: powerRankings });
    if (seasonPreview) sections.push({ type: 'SeasonPreview', data: seasonPreview });
    console.log(`[Compose] Preseason sections built (with error recovery)`);
  }

  // Build draft-specific sections
  if (episodeType === 'pre_draft') {
    console.log(`[Compose] Building pre-draft preview sections...`);
    const draftPreview = await safeSection(
      'DraftPreview',
      () => buildDraftPreview(draftData ?? null, memEntertainer, memAnalyst, season, fullEnhancedContext),
      null
    );
    if (draftPreview) {
      sections.push({ type: 'DraftPreview', data: draftPreview });
    }
    console.log(`[Compose] Pre-draft sections built`);
  }

  if (episodeType === 'post_draft') {
    console.log(`[Compose] Building post-draft grades sections...`);
    const draftGrades = await safeSection(
      'DraftGrades',
      () => buildDraftGrades(draftData ?? null, memEntertainer, memAnalyst, season, fullEnhancedContext),
      null
    );
    if (draftGrades) {
      sections.push({ type: 'DraftGrades', data: draftGrades });
    }
    console.log(`[Compose] Post-draft sections built`);
  }

  if (lastCallbacks && !excludeSections.has('Callbacks')) {
    sections.push({ type: 'Callbacks', data: lastCallbacks });
  }

  if (!excludeSections.has('MatchupRecaps') && recaps.length > 0) {
    sections.push({ type: 'MatchupRecaps', data: recaps });
  }

  if (!excludeSections.has('Blurt') && (blurt.bot1 || blurt.bot2)) {
    sections.push({ type: 'Blurt', data: blurt });
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

  // Add LLM-powered feature sections (only for regular episodes with data)
  if (llmFeatures) {
    // Bot debates when they disagree
    if (llmFeatures.debates.length > 0) {
      sections.push({ type: 'BotDebates', data: llmFeatures.debates });
    }
    
    // Weekly awards (MVP, Bust, etc.)
    if (llmFeatures.awards) {
      sections.push({ type: 'WeeklyAwards', data: llmFeatures.awards });
    }
    
    // Hot takes from both bots
    if (llmFeatures.hotTakes.length > 0) {
      sections.push({ type: 'HotTakes', data: llmFeatures.hotTakes });
    }
    
    // What-if scenarios for close games
    if (llmFeatures.whatIfs.length > 0) {
      sections.push({ type: 'WhatIf', data: llmFeatures.whatIfs });
    }
    
    // Dynasty analysis for trades
    if (llmFeatures.dynastyAnalysis.length > 0) {
      sections.push({ type: 'DynastyAnalysis', data: llmFeatures.dynastyAnalysis });
    }
    
    // Rivalry matchups
    if (llmFeatures.rivalries.length > 0) {
      sections.push({ type: 'RivalryWatch', data: llmFeatures.rivalries });
    }
    
    // Playoff odds commentary
    if (llmFeatures.playoffOdds) {
      sections.push({ type: 'PlayoffOdds', data: llmFeatures.playoffOdds });
    }
    
    // Narrative callbacks (grading past predictions)
    if (llmFeatures.callbacks.length > 0) {
      sections.push({ type: 'NarrativeCallbacks', data: llmFeatures.callbacks });
    }
  }

  sections.push({ type: 'FinalWord', data: finalWord });

  // Track team mentions from recaps for obsession detection
  for (const recap of recaps) {
    if (recap.winner) {
      trackMention(entertainerMentions, recap.winner);
      trackMention(analystMentions, recap.winner);
    }
    if (recap.loser) {
      trackMention(entertainerMentions, recap.loser);
      trackMention(analystMentions, recap.loser);
    }
  }
  
  // Track mentions from hot takes
  if (llmFeatures?.hotTakes) {
    for (const ht of llmFeatures.hotTakes) {
      if (ht.subject) {
        if (ht.bot === 'entertainer') {
          trackMention(entertainerMentions, ht.subject);
        } else {
          trackMention(analystMentions, ht.subject);
        }
      }
    }
  }
  
  // Detect obsessions based on this week's mentions
  if (isEnhancedMemory(memEntertainer)) {
    detectObsessions(memEntertainer, entertainerMentions, week);
  }
  if (isEnhancedMemory(memAnalyst)) {
    detectObsessions(memAnalyst, analystMentions, week);
  }

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
