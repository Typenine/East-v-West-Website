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
} from './types';
import { generateSection } from './llm/groq';
import { buildStaticLeagueContext } from './league-knowledge';
import { getEpisodeConfig } from './episodes';
import {
  generateAllLLMFeatures,
  type LLMFeaturesInput,
  type LLMFeaturesOutput,
} from './llm-features';
import { getPartnerDynamicsContext, recordBotInteraction, getPersonalityContext, evolvePersonality, updateEmotionalState } from './memory';

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
      episodeType,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Intro',
      context: context.replace(memEntertainer.summaryMood || 'Neutral', memAnalyst.summaryMood || 'Neutral'),
      constraints: 'Write 2-3 sentences. Provide a measured overview. Reference key stats.',
      maxTokens: 150,
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
      constraints: 'Write 3-4 sentences welcoming everyone to the new season. Build hype! Make a bold prediction or two. This is the PRESEASON - no games have been played yet.',
      maxTokens: 250,
      episodeType: 'preseason',
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Preseason Preview Intro',
      context: context.replace(memEntertainer.summaryMood || 'Excited', memAnalyst.summaryMood || 'Analytical'),
      constraints: 'Write 2-3 sentences setting up the season analytically. Reference roster construction, offseason moves, or key players to watch. This is the PRESEASON - no games have been played yet.',
      maxTokens: 200,
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
      constraints: 'Write 2-3 sentences introducing your preseason power rankings. Be bold and opinionated about who you think will dominate.',
      maxTokens: 150,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Power Rankings Intro',
      context,
      constraints: 'Write 2-3 sentences introducing your preseason power rankings. Reference historical data and roster analysis.',
      maxTokens: 150,
    }),
  ]);

  // Generate rankings with blurbs for each team
  const rankingsResponse = await generateSection({
    persona: 'analyst',
    sectionType: 'Power Rankings List',
    context: `${context}\n\nGenerate a numbered list of all 12 teams ranked 1-12 with a brief reason for each ranking. Format: "1. TeamName - reason"`,
    constraints: 'List all 12 teams ranked 1-12. One line per team with brief reasoning. Base on historical performance and roster strength.',
    maxTokens: 500,
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
      constraints: 'List 3 championship contenders with brief reasons. Format: "TeamName: reason"',
      maxTokens: 200,
    }),
    generateSection({
      persona: 'entertainer',
      sectionType: 'Season Preview - Sleepers',
      context,
      constraints: 'List 2-3 sleeper teams that could surprise. Format: "TeamName: reason"',
      maxTokens: 150,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Season Preview - Bust Candidates',
      context,
      constraints: 'List 2 teams that might disappoint expectations. Format: "TeamName: reason"',
      maxTokens: 150,
    }),
    generateSection({
      persona: 'entertainer',
      sectionType: 'Bold Predictions',
      context,
      constraints: 'Give 3 bold/hot take predictions for the season. Be spicy and controversial.',
      maxTokens: 200,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Bold Predictions',
      context,
      constraints: 'Give 3 analytical predictions for the season based on data and trends.',
      maxTokens: 200,
    }),
    generateSection({
      persona: 'entertainer',
      sectionType: 'Championship Pick',
      context,
      constraints: 'Pick your championship winner in one sentence. Be confident!',
      maxTokens: 50,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Championship Pick',
      context,
      constraints: 'Pick your championship winner in one sentence with brief reasoning.',
      maxTokens: 50,
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
    // Only available for EnhancedBotMemory - check if partnerDynamics exists
    const entertainerPartnerContext = 'partnerDynamics' in memEntertainer 
      ? getPartnerDynamicsContext(memEntertainer as unknown as import('./types').EnhancedBotMemory)
      : '';
    const analystPartnerContext = 'partnerDynamics' in memAnalyst
      ? getPartnerDynamicsContext(memAnalyst as unknown as import('./types').EnhancedBotMemory)
      : '';
    
    // Get evolving personality context (confidence, emotional state, speech patterns)
    const entertainerPersonalityContext = 'personality' in memEntertainer
      ? getPersonalityContext(memEntertainer as unknown as import('./types').EnhancedBotMemory)
      : '';
    const analystPersonalityContext = 'personality' in memAnalyst
      ? getPersonalityContext(memAnalyst as unknown as import('./types').EnhancedBotMemory)
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

    // Entertainer gets their personal history with these teams + partner dynamics + personality
    const entertainerMatchupContext = `${baseMatchupContext}

YOUR HISTORY WITH THESE TEAMS:
${entertainerWinnerMemory || `You don't have strong feelings about ${p.winner.name} yet.`}
${entertainerLoserMemory || `You don't have strong feelings about ${p.loser.name} yet.`}

${entertainerState}
${entertainerPartnerContext}
${entertainerPersonalityContext}

USE YOUR HISTORY: If you've been high on a team and they won, feel vindicated. If you've been down on them and they won, acknowledge you might have been wrong. If a team you trusted let you down, express that disappointment. Your feelings about teams should color how you talk about this result.

IMPORTANT RULES:
1. Write ONLY about ${p.winner.name} and ${p.loser.name}. Do not mention any other teams.
2. Reference the TOP PERFORMERS listed above - these are the actual players who scored in this game.
3. Let your history with these teams influence your tone - but don't just list your feelings, weave them into your take.
4. Do NOT make up statistics - focus on THIS game and your reaction to it.
5. If you have callbacks or inside jokes with your co-host, use them naturally when relevant.
6. Let your current emotional state and personality traits influence HOW you say things.`;

    // Analyst gets their personal history with these teams + partner dynamics + personality
    const analystMatchupContext = `${baseMatchupContext}

YOUR HISTORY WITH THESE TEAMS:
${analystWinnerMemory || `You don't have strong feelings about ${p.winner.name} yet.`}
${analystLoserMemory || `You don't have strong feelings about ${p.loser.name} yet.`}

${analystState}
${analystPartnerContext}
${analystPersonalityContext}

USE YOUR HISTORY: If you predicted this outcome, note it briefly. If this result surprises you based on your analysis, acknowledge it. If a team you've been tracking is confirming or defying your expectations, that's worth mentioning. Your analytical history should inform your perspective.

IMPORTANT RULES:
1. Write ONLY about ${p.winner.name} and ${p.loser.name}. Do not mention any other teams.
2. Reference the TOP PERFORMERS listed above - these are the actual players who scored in this game.
3. Let your analytical history inform your take - but analyze the game, don't just recite your past positions.
4. Do NOT make up statistics - focus on THIS game and what it means.
5. If you have callbacks or inside jokes with your co-host, use them naturally when relevant.
6. Let your current emotional state and personality traits influence HOW you say things.`;

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
    
    // Dialogue length: 2 turns (boring), 3 turns (normal), 4+ turns (heated/interesting)
    // Min 2, max 5
    const dialogueTurns = Math.min(5, Math.max(2, Math.floor(interestScore / 2)));
    
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
    const hooksContext = situationalHooks.length > 0 
      ? `\n\nNARRATIVE HOOKS (use these naturally, don't force all of them):\n${situationalHooks.join('\n')}`
      : '';
    
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
    
    const debateAngles = dialogueTurns > 2 ? getDebateAngles() : '';
    
    // Build analyst-specific hooks (swap perspective)
    const analystHooksContext = situationalHooks.length > 0 
      ? `\n\nNARRATIVE HOOKS (use naturally):\n${situationalHooks.map(h => 
          h.replace('YOU (Entertainer)', 'The Entertainer').replace('✓ The Analyst', '✓ YOU (Analyst)').replace('⚠️ The Analyst', '⚠️ YOU (Analyst)')
        ).join('\n')}`
      : '';
    
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
    const responderBot = analystShouldStart ? 'entertainer' : 'analyst';
    
    // Get the right context for whoever is starting
    const starterContext = starterBot === 'entertainer' ? entertainerMatchupContext : analystMatchupContext;
    const starterHooks = starterBot === 'entertainer' ? hooksContext : analystHooksContext;
    const starterBurned = starterBot === 'entertainer' ? entertainerBurned : analystBurned;
    const starterVindicated = starterBot === 'entertainer' ? entertainerVindicated : analystVindicated;
    
    const responderContext = responderBot === 'entertainer' ? entertainerMatchupContext : analystMatchupContext;
    const responderHooks = responderBot === 'entertainer' ? hooksContext : analystHooksContext;
    const responderBurned = responderBot === 'entertainer' ? entertainerBurned : analystBurned;
    const responderVindicated = responderBot === 'entertainer' ? entertainerVindicated : analystVindicated;
    
    // Different opener styles based on who's starting and context
    const openerStyles = starterBot === 'entertainer' 
      ? [
          'hot take', 'emotional reaction', 'bold claim', 'callback to previous prediction',
          'dramatic opener', 'rhetorical question', 'celebration or frustration'
        ]
      : [
          'stat-driven observation', 'analytical breakdown', 'trend identification',
          'measured assessment', 'data point highlight', 'process-focused take'
        ];
    const openerStyle = openerStyles[Math.floor(Math.random() * openerStyles.length)];
    
    // Generate dialogue with FULL CONVERSATIONAL CONTEXT - each turn sees previous responses
    // This preserves nuance, personality, and real back-and-forth
    // Rate limiting is handled by the LLM client (3 second delays between calls)
    const dialogue: Array<{ speaker: 'entertainer' | 'analyst'; text: string }> = [];
    let conversationHistory = '';
    
    // Turn 1: Starter opens (could be either bot)
    const opener = await generateSection({
      persona: starterBot,
      sectionType: `${bracketInfo} Opening Take`,
      context: `${seasonalContext}\n${starterContext}${starterHooks}${debateAngles}`,
      constraints: `Open the discussion about ${p.winner.name} beating ${p.loser.name} ${p.winner.points.toFixed(1)}-${p.loser.points.toFixed(1)}. 
Style: ${openerStyle}
Reference specific players who performed: ${winnerPlayers}. 
${p.margin > 25 ? 'This was a BLOWOUT - react accordingly.' : p.margin < 5 ? 'This was a NAIL-BITER - the drama!' : 'Solid win.'}
${starterBurned ? 'You got this one wrong - acknowledge it with personality, don\'t ignore it.' : ''}
${starterVindicated ? 'You called this - you can mention it but don\'t be smug.' : ''}
Give your take in 2-3 sentences. Be specific about what happened.${dialogueTurns > 2 ? ` Set up something the ${responderBot === 'entertainer' ? 'Entertainer' : 'Analyst'} might push back on.` : ''}`,
      maxTokens: isChampionship ? 150 : 100,
    });
    dialogue.push({ speaker: starterBot, text: opener.trim() });
    conversationHistory = `${starterBot.toUpperCase()}: "${opener.trim()}"`;

    // Turn 2: Responder responds - SEES what starter said
    const response = await generateSection({
      persona: responderBot,
      sectionType: `${bracketInfo} Response`,
      context: `${seasonalContext}\n${responderContext}${responderHooks}

CONVERSATION SO FAR:
${conversationHistory}

Now respond to what the ${starterBot === 'entertainer' ? 'Entertainer' : 'Analyst'} just said.`,
      constraints: `Respond to their take about ${p.winner.name} vs ${p.loser.name}. 
You can agree, disagree, or add nuance. Reference the actual numbers: ${p.winner.points.toFixed(1)}-${p.loser.points.toFixed(1)}, margin of ${p.margin.toFixed(1)}.
Mention specific players if relevant: Winner had ${winnerPlayers}. Loser had ${loserPlayers}.
${responderBurned ? 'Your analysis was wrong here - own it briefly, then pivot to what you learned.' : ''}
${responderVindicated ? 'Your numbers held up - you can note it but stay analytical, not gloating.' : ''}
2-3 sentences.${dialogueTurns > 2 ? ' If you disagree, make it clear - this could spark more discussion.' : ' Wrap up your thoughts on this game.'}`,
      maxTokens: isChampionship ? 150 : 100,
    });
    dialogue.push({ speaker: responderBot, text: response.trim() });
    conversationHistory += `\n${responderBot.toUpperCase()}: "${response.trim()}"`;

    // Detect if there's actual disagreement to make follow-ups more organic
    const hasDisagreement = 
      response.toLowerCase().includes('disagree') || 
      response.toLowerCase().includes('but ') ||
      response.toLowerCase().includes('however') ||
      response.toLowerCase().includes('actually') ||
      response.toLowerCase().includes('not sure') ||
      response.toLowerCase().includes('i don\'t') ||
      response.toLowerCase().includes('pump the brakes');

    // Turn 3+: Continue alternating, but randomize who gets extra turns
    // The conversation should feel organic, not formulaic
    if (dialogueTurns >= 3) {
      // Randomly decide if starter or responder gets the next turn
      // This creates variety - sometimes one bot dominates, sometimes it's even
      const turn3Bot = Math.random() > 0.5 ? starterBot : responderBot;
      const turn3Context = turn3Bot === 'entertainer' ? entertainerMatchupContext : analystMatchupContext;
      const otherBot = turn3Bot === 'entertainer' ? 'Analyst' : 'Entertainer';
      
      const turn3Reaction = await generateSection({
        persona: turn3Bot,
        sectionType: `${bracketInfo} Reaction`,
        context: `${seasonalContext}\n${turn3Context}

CONVERSATION SO FAR:
${conversationHistory}

React to what was just said.`,
        constraints: `React to the ${otherBot}'s take. ${hasDisagreement 
          ? 'There\'s some disagreement here - defend your position, concede a point, or find middle ground.' 
          : 'You seem to be aligned - build on it, add a prediction, or bring up something new about these teams.'} 
1-2 sentences. Be yourself.${dialogueTurns > 3 ? ' Keep the conversation going.' : ''}`,
        maxTokens: 80,
      });
      dialogue.push({ speaker: turn3Bot, text: turn3Reaction.trim() });
      conversationHistory += `\n${turn3Bot.toUpperCase()}: "${turn3Reaction.trim()}"`;
    }

    // Turn 4: Could be either bot - randomize again
    if (dialogueTurns >= 4) {
      // Whoever didn't go last should probably go now, but not always
      const lastSpeaker = dialogue[dialogue.length - 1].speaker;
      const turn4Bot = Math.random() > 0.3 
        ? (lastSpeaker === 'entertainer' ? 'analyst' : 'entertainer')
        : lastSpeaker; // 30% chance same person continues (they're on a roll)
      const turn4Context = turn4Bot === 'entertainer' ? entertainerMatchupContext : analystMatchupContext;
      
      const turn4Angle = hasDisagreement 
        ? `The debate is heating up. Either double down, find common ground, or pivot to a new angle.`
        : `Add a forward-looking thought - what does this mean for ${p.winner.name} going forward? Predictions?`;
      
      const turn4Response = await generateSection({
        persona: turn4Bot,
        sectionType: `${bracketInfo} Follow-up`,
        context: `${seasonalContext}\n${turn4Context}

CONVERSATION SO FAR:
${conversationHistory}

Add one more thought.`,
        constraints: `${turn4Angle} 1-2 sentences. Make it count.`,
        maxTokens: 70,
      });
      dialogue.push({ speaker: turn4Bot, text: turn4Response.trim() });
      conversationHistory += `\n${turn4Bot.toUpperCase()}: "${turn4Response.trim()}"`;
    }

    // Turn 5: Final word - could be either bot
    if (dialogueTurns >= 5) {
      // Final word goes to whoever has more stake or randomly
      const turn5Bot = (entertainerVindicated || entertainerBurned) ? 'entertainer' 
        : (analystVindicated || analystBurned) ? 'analyst'
        : Math.random() > 0.5 ? 'entertainer' : 'analyst';
      const turn5Context = turn5Bot === 'entertainer' ? entertainerMatchupContext : analystMatchupContext;
      
      const finalWordAngle = isChampionship 
        ? `This is the CHAMPIONSHIP. Make your final word legendary.`
        : hasDisagreement
        ? `You've been going back and forth. End it with conviction.`
        : `Wrap this up with energy. A prediction, a warning, something memorable.`;
      
      const finalWord = await generateSection({
        persona: turn5Bot,
        sectionType: `${bracketInfo} Final Word`,
        context: `${seasonalContext}\n${turn5Context}

CONVERSATION SO FAR:
${conversationHistory}

Wrap it up.`,
        constraints: `${finalWordAngle} 1 sentence max. Make it quotable.`,
        maxTokens: 50,
      });
      dialogue.push({ speaker: turn5Bot, text: finalWord.trim() });
    }

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
        memEntertainer as unknown as import('./types').EnhancedBotMemory,
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
        memAnalyst as unknown as import('./types').EnhancedBotMemory,
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
    const memEntEnhanced = memEntertainer as unknown as import('./types').EnhancedBotMemory;
    const memAnaEnhanced = memAnalyst as unknown as import('./types').EnhancedBotMemory;
    
    if (entertainerVindicated) {
      evolvePersonality(memEntEnhanced, { type: 'vindicated', intensity: isChampionship ? 9 : 5, week });
      updateEmotionalState(memEntEnhanced, 'smug', isChampionship ? 80 : 50, { week, event: `Called ${p.winner.name} win` });
    }
    if (entertainerBurned) {
      evolvePersonality(memEntEnhanced, { type: 'humbled', intensity: isChampionship ? 8 : 5, context: `${p.loser.name} let me down`, week });
      updateEmotionalState(memEntEnhanced, 'frustrated', isChampionship ? 70 : 45, { week, event: `${p.loser.name} disappointed`, team: p.loser.name });
    }
    if (analystVindicated) {
      evolvePersonality(memAnaEnhanced, { type: 'vindicated', intensity: isChampionship ? 8 : 4, week });
      updateEmotionalState(memAnaEnhanced, 'smug', isChampionship ? 60 : 40, { week, event: `Analysis on ${p.winner.name} held up` });
    }
    if (analystBurned) {
      evolvePersonality(memAnaEnhanced, { type: 'humbled', intensity: isChampionship ? 7 : 4, context: `${p.loser.name} defied the numbers`, week });
      updateEmotionalState(memAnaEnhanced, 'anxious', isChampionship ? 55 : 35, { week, event: `Model missed on ${p.loser.name}`, team: p.loser.name });
    }
    
    // Big margin games affect optimism
    if (p.margin > 40) {
      // Blowout - whoever backed the winner feels great
      if (entertainerVindicated) evolvePersonality(memEntEnhanced, { type: 'big_win', intensity: 7, week });
      if (analystVindicated) evolvePersonality(memAnaEnhanced, { type: 'big_win', intensity: 6, week });
    }
    if (p.margin < 3) {
      // Nail-biter - emotional volatility increases
      evolvePersonality(memEntEnhanced, { type: 'heartbreak', intensity: 4, week });
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
    h2hData,
    previousPredictions,
    previousHotTakes,
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

  console.log(`[Compose] Core sections generated via LLM`);

  // Generate all new LLM-powered features (debates, hot takes, awards, etc.)
  let llmFeatures: LLMFeaturesOutput | null = null;
  if (episodeType === 'regular' && pairs.length > 0) {
    console.log(`[Compose] Generating LLM-powered features (debates, hot takes, awards, etc.)...`);
    try {
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
      };
      llmFeatures = await generateAllLLMFeatures(llmInput);
      console.log(`[Compose] LLM features generated: ${llmFeatures.debates.length} debates, ${llmFeatures.hotTakes.length} hot takes, ${llmFeatures.whatIfs.length} what-ifs`);
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

  // Build special episode sections for preseason
  if (episodeType === 'preseason') {
    console.log(`[Compose] Building preseason-specific sections...`);
    const [powerRankings, seasonPreview] = await Promise.all([
      buildPowerRankings(fullEnhancedContext, memEntertainer, memAnalyst, season),
      buildSeasonPreview(fullEnhancedContext, memEntertainer, memAnalyst, season),
    ]);
    sections.push({ type: 'PowerRankings', data: powerRankings });
    sections.push({ type: 'SeasonPreview', data: seasonPreview });
    console.log(`[Compose] Preseason sections built successfully`);
  }

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
