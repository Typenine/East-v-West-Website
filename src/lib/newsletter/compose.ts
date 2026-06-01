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
  TradeAnalysis,
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
  MockDraftSection,
  MockDraftPick,
} from './types';
import type { LeagueDraftData } from './sleeper-ingest';
import { isEnhancedMemory } from './types';
import { generateSection } from './llm/groq';
import { buildStaticLeagueContext, LEAGUE_IDENTITY } from './league-knowledge';
import { getEpisodeConfig } from './episodes';
import {
  generateAllLLMFeatures,
  type LLMFeaturesInput,
  type LLMFeaturesOutput,
} from './llm-features';
import { getPartnerDynamicsContext, recordBotInteraction, getPersonalityContext, evolvePersonality, updateEmotionalState, updatePlayerRelationship, detectObsessions, fadeObsessions, getObsessionContext, decayEmotionalState, getPlayerRelationshipContext, recordWhoWasRight, registerEmergingPhrase, addInsideJoke, updateBotFeud, getNarrativesContext, buildDedupeContext } from './memory';
import { recordHotTake, gradeHotTake } from './enhanced-context';
import { makeBlurt } from './personality';
import { guardText, checkOutput } from './guardrails';
import { judgeSection, judgeMatchup, buildJudgmentContext } from './judgment';
import { selectAndBuildStance } from './stance';
import { getPhaseRules, buildPhaseRulesContext } from './episodes';
import { buildMatchupCardContext, buildTeamCardContext, computeRivalryScore } from './team-narratives';
import { heatFromMatchup } from './narrative-heat';
import { buildEnrichedMemoryContext } from './memory';

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

// ============ Phase 1 helpers ============

/**
 * Build the Phase 1 addendum for any section context string.
 * Combines dedupe + judgment + stance into one compact block.
 * Returns an empty string when all features produce no output (first week, etc.)
 *
 * @param mem          The bot's memory (entertainer or analyst)
 * @param sectionType  e.g. 'Intro', 'Recap_0', 'Trade_0'
 * @param episodeType  e.g. 'regular', 'playoffs_round'
 * @param week         Current NFL week
 * @param season       Current season year
 * @param opts         Optional per-section signals for judgment/stance
 */
function buildPhase1Addendum(
  mem: BotMemory,
  sectionType: string,
  episodeType: string,
  week: number,
  season: number,
  opts: {
    teamNames?: string[];
    matchupMargin?: number;
    isBlowout?: boolean;
    isNailbiter?: boolean;
    eventRelevanceScore?: number;
    isPlayoffs?: boolean;
    isChampionship?: boolean;
    isTradeDeadline?: boolean;
    isRivalryMatchup?: boolean;
    primaryTeamName?: string; // used for stance recording
  } = {},
): string {
  const parts: string[] = [];

  // 1. Dedupe block — prevents repeating last week's angles/phrases
  const dedupeBlock = buildDedupeContext(mem);
  if (dedupeBlock) parts.push(dedupeBlock);

  // 2. Event judgment — heuristic assessment of this section's stakes/type
  const judgment = judgeSection({
    sectionType,
    episodeType,
    week,
    season,
    teamNames: opts.teamNames,
    matchupMargin: opts.matchupMargin,
    isBlowout: opts.isBlowout,
    isNailbiter: opts.isNailbiter,
    eventRelevanceScore: opts.eventRelevanceScore,
    isPlayoffs: opts.isPlayoffs ?? (episodeType === 'playoffs_round' || episodeType === 'championship'),
    isChampionship: opts.isChampionship ?? (episodeType === 'championship'),
    isTradeDeadline: opts.isTradeDeadline ?? (episodeType === 'trade_deadline'),
    isRivalryMatchup: opts.isRivalryMatchup,
    teamMemory: opts.primaryTeamName ? mem.teams[opts.primaryTeamName] : undefined,
  });
  parts.push(buildJudgmentContext(judgment));

  // 3. Stance selection — explicit framing directive for this section
  const priorStance = opts.primaryTeamName
    ? mem.recentOutputLog?.recentStances?.[opts.primaryTeamName]
    : undefined;
  const { context: stanceCtx } = selectAndBuildStance(
    {
      sectionType,
      episodeType,
      bot: mem.bot,
      judgment,
      week,
      personality: mem.personality ? {
        riskTolerance: mem.personality.riskTolerance,
        dramaAppreciation: mem.personality.dramaAppreciation,
        grudgeLevel: mem.personality.grudgeLevel,
        analyticalTrust: mem.personality.analyticalTrust,
        underdogAffinity: mem.personality.underdogAffinity,
        contrarianism: mem.personality.contrarianism,
      } : undefined,
      priorStance,
    },
    mem,
    opts.primaryTeamName,
  );
  parts.push(stanceCtx);

  // 4. Phase behavior rules — compact behavioral directive for this episode type
  const phaseRules = getPhaseRules(episodeType);
  const phaseCtx = buildPhaseRulesContext(phaseRules);
  if (phaseCtx) parts.push(phaseCtx);

  // 5. Enriched memory surfacing — heat-gated additional memory fields
  const enrichedMem = buildEnrichedMemoryContext(mem, judgment.narrativeHeat, sectionType);
  if (enrichedMem) parts.push(enrichedMem);

  return parts.join('');
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

/**
 * Returns any unresolved hot takes about the given teams, formatted as callback prompts.
 * Injected into matchup context so the LLM can reference prior predictions naturally.
 */
function buildHotTakeContext(mem: BotMemory, currentWeek: number, teamNames: string[]): string {
  const enhanced = mem as unknown as Record<string, unknown>;
  if (!('hotTakes' in enhanced) || !Array.isArray(enhanced.hotTakes)) return '';

  type StoredHotTake = { week: number; take: string; subject?: string; boldness?: string; agedWell?: boolean };
  const hotTakes = enhanced.hotTakes as StoredHotTake[];

  const relevant = hotTakes.filter(ht =>
    ht.agedWell === undefined &&
    ht.week < currentWeek &&
    teamNames.some(name =>
      (ht.subject || '').toLowerCase().includes(name.toLowerCase()) ||
      ht.take.toLowerCase().includes(name.toLowerCase())
    )
  ).slice(0, 2);

  if (relevant.length === 0) return '';

  const lines = relevant.map(ht => `- Week ${ht.week} (${ht.boldness || 'take'}): "${ht.take}"`);
  return `\nOUTSTANDING HOT TAKES ABOUT THESE TEAMS — revisit naturally if the result confirms or kills them:\n${lines.join('\n')}`;
}

/**
 * Returns both bots' season prediction records side-by-side so they can reference
 * who's winning the prediction battle this season.
 */
function buildPredictionComparison(selfMem: BotMemory, otherMem: BotMemory): string {
  type Stats = { correct: number; wrong: number; winRate: number };
  const selfE = selfMem as unknown as Record<string, unknown>;
  const otherE = otherMem as unknown as Record<string, unknown>;

  const self  = ('predictionStats' in selfE  ? selfE.predictionStats  : null) as Stats | null;
  const other = ('predictionStats' in otherE ? otherE.predictionStats : null) as Stats | null;

  if (!self || (self.correct + self.wrong) === 0) return '';

  const selfName  = selfMem.bot  === 'entertainer' ? 'Mason' : 'Westy';
  const otherName = otherMem.bot === 'entertainer' ? 'Mason' : 'Westy';
  const selfRecord  = `${self.correct}-${self.wrong}`;
  const otherRecord = other ? `${other.correct}-${other.wrong}` : '?';

  const otherRate = other ? other.correct / Math.max(1, other.correct + other.wrong) : 0;
  const edge = self.winRate > otherRate
    ? `${selfName} leads the prediction battle.`
    : self.winRate < otherRate
      ? `${otherName} leads the prediction battle.`
      : 'Even on predictions so far.';

  return `\nSEASON PREDICTION RECORD — ${selfName}: ${selfRecord} | ${otherName}: ${otherRecord}. ${edge}`;
}

/**
 * Returns a specific "fresh on your mind" line based on the most emotionally
 * significant thing that happened last week, so carry-over feels concrete not abstract.
 */
function buildLastWeekNarrative(mem: BotMemory, currentWeek: number): string {
  if (currentWeek <= 1) return '';
  const lastWeek = currentWeek - 1;

  let topEvent: { team: string; event: string; weight: number } | null = null;

  for (const [teamName, teamData] of Object.entries(mem.teams)) {
    const enhanced = teamData as unknown as Record<string, unknown>;
    if (!('notableEvents' in enhanced) || !Array.isArray(enhanced.notableEvents)) continue;
    const events = enhanced.notableEvents as Array<{ week: number; event: string }>;
    const ev = events.find(e => e.week === lastWeek);
    if (!ev) continue;
    const weight = Math.abs(teamData.trust ?? 0) + Math.abs(teamData.frustration ?? 0);
    if (!topEvent || weight > topEvent.weight) {
      topEvent = { team: teamName, event: ev.event, weight };
    }
  }

  if (!topEvent) return '';
  return `\nFRESH ON YOUR MIND FROM LAST WEEK: ${topEvent.team} — ${topEvent.event}. Let this color how you talk about them if they come up.`;
}

/**
 * Auto-grades unresolved hot takes based on this week's results.
 * Heuristic: if the take/subject names a team and that team won, grades as aged well.
 * Called at the end of composeNewsletter after all pairs are finalized.
 */
function autoGradeHotTakes(mem: BotMemory, pairs: DerivedData['matchup_pairs']): void {
  const enhanced = mem as unknown as Record<string, unknown>;
  if (!('hotTakes' in enhanced) || !Array.isArray(enhanced.hotTakes)) return;

  type StoredHotTake = { week: number; take: string; subject?: string; agedWell?: boolean; followUp?: string };
  const hotTakes = enhanced.hotTakes as StoredHotTake[];
  const winners = pairs.map(p => p.winner.name.toLowerCase());
  const losers  = pairs.map(p => p.loser.name.toLowerCase());

  for (const ht of hotTakes) {
    if (ht.agedWell !== undefined) continue;
    const subject  = (ht.subject  || '').toLowerCase();
    const takeText = ht.take.toLowerCase();

    const namedWinner = winners.find(w => subject.includes(w) || takeText.includes(w));
    const namedLoser  = losers.find(l  => subject.includes(l)  || takeText.includes(l));

    if (namedWinner && !namedLoser) {
      ht.agedWell = true;
      ht.followUp = `${ht.subject || 'They'} came through — aged well.`;
    } else if (namedLoser && !namedWinner) {
      ht.agedWell = false;
      ht.followUp = `${ht.subject || 'They'} let me down — owning this L.`;
    }
  }
}

/**
 * Returns personality context for a bot, falling back to seed opinions derived from
 * all-time historical records when no in-season memory has been established yet.
 * Prevents early-week content from being generic and personality-free.
 */
function effectivePersonalityCtx(
  mem: BotMemory,
  enhancedContext: string,
  persona: 'entertainer' | 'analyst',
): string {
  const real = isEnhancedMemory(mem) ? getPersonalityContext(mem) : '';
  if (real) return real;

  // No established personality yet — seed from all-time records
  const rankingsMatch = enhancedContext.match(/--- ALL-TIME TEAM RANKINGS[^-]*---\n([\s\S]*?)(?=\n---|\n\n===|$)/);
  if (!rankingsMatch) return '';

  const teams: Array<{ name: string; wins: number; losses: number; pct: number; champion: boolean }> = [];
  for (const line of rankingsMatch[1].split('\n')) {
    const m = line.match(/^\d+\.\s+([^:]+):\s+(\d+)-(\d+)\s+\(([^)%]+)/);
    if (m) {
      teams.push({
        name: m[1].trim(),
        wins: parseInt(m[2], 10),
        losses: parseInt(m[3], 10),
        pct: parseFloat(m[4]),
        champion: line.includes('Champion'),
      });
    }
  }
  if (teams.length === 0) return '';

  const sorted = [...teams].sort((a, b) => b.pct - a.pct);
  const elite = sorted.slice(0, Math.min(3, Math.floor(sorted.length / 2)));
  const weak  = sorted.slice(-Math.min(3, Math.floor(sorted.length / 2)));
  const lines: string[] = [];

  if (persona === 'entertainer') {
    lines.push(`YOUR INITIAL READS (no in-season track record yet — going off league history):`);
    for (const t of elite) {
      lines.push(`- ${t.name}: ${t.wins}-${t.losses} all-time${t.champion ? ', a former champion' : ''} — pedigree demands respect. Hard to bet against them.`);
    }
    for (const t of weak) {
      lines.push(`- ${t.name}: ${t.wins}-${t.losses} all-time — you're skeptical until they prove otherwise.`);
    }
    lines.push(`Let this history color your tone — vindication or surprise should show.`);
  } else {
    lines.push(`YOUR BASELINE ANALYSIS (no in-season data yet — working from historical record):`);
    for (const t of elite) {
      lines.push(`- ${t.name}: ${t.pct.toFixed(1)}% all-time win rate${t.champion ? ', championship pedigree' : ''} — statistically a buy-in until proven otherwise.`);
    }
    for (const t of weak) {
      lines.push(`- ${t.name}: ${t.pct.toFixed(1)}% win rate — below average historically; burden of proof is on them.`);
    }
    lines.push(`Reference these baselines when analyzing results — are historical patterns holding or breaking?`);
  }

  return `\nYOUR CURRENT STATE:\n${lines.join('\n')}`;
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
  season: number = new Date().getFullYear(),
  isFirstEpisodeEver = false,
): Promise<IntroSection> {
  const leagueKnowledge = buildStaticLeagueContext();
  
  // Handle special episode types with custom context
  if (episodeType === 'preseason') {
    return buildPreseasonIntro(leagueKnowledge, season, memEntertainer, memAnalyst, enhancedContext);
  }
  if (episodeType === 'pre_draft') {
    return buildPreDraftIntro(leagueKnowledge, season, memEntertainer, memAnalyst, enhancedContext, isFirstEpisodeEver);
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

  const isPlayoffs = episodeType === 'playoffs_round' || episodeType === 'championship';
  const entPhase1 = buildPhase1Addendum(memEntertainer, 'Intro', episodeType, week, season, {
    isPlayoffs, isChampionship: episodeType === 'championship',
  });
  const anaPhase1 = buildPhase1Addendum(memAnalyst, 'Intro', episodeType, week, season, {
    isPlayoffs, isChampionship: episodeType === 'championship',
  });

  const rawBot1 = await generateSection({
    persona: 'entertainer',
    sectionType: 'Intro',
    context: context + entPhase1,
    constraints: 'Write 3-4 rich paragraphs. Set the tone with big personality — reference the week\'s top storylines, drop a bold take or two, and make the reader feel the energy. Be colorful and opinionated.',
    maxTokens: 600,
    episodeType,
  });
  const bot1_text = guardText(rawBot1, { sectionType: 'Intro', logPrefix: '[compose:Intro:entertainer]' });

  const rawBot2 = await generateSection({
    persona: 'analyst',
    sectionType: 'Intro',
    context: context.replace(memEntertainer.summaryMood || 'Neutral', memAnalyst.summaryMood || 'Neutral') + anaPhase1,
    constraints: 'Write 3-4 substantial paragraphs. Provide analytical depth — reference specific stats, trends, and the week\'s biggest storylines. Give your honest assessment with data to back it up.',
    maxTokens: 500,
    episodeType,
  });
  const bot2_text = guardText(rawBot2, { sectionType: 'Intro', logPrefix: '[compose:Intro:analyst]' });

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
  enhancedContext: string,
  isFirstEpisodeEver = false,
): Promise<IntroSection> {
  const debutBlock = isFirstEpisodeEver
    ? `IMPORTANT: THIS IS YOUR FIRST EVER EPISODE appearing to the East v. West league.
Mason Reed and Westy are brand new to this league — the members have never heard from you before.
Introduce yourselves, welcome the league, and set the stage for your draft preview newsletter.
Make a strong first impression that shows who you are as a personality.`
    : `You and your co-host are well-established voices for the East v. West league. The members know you both.
Reference your history with this league where relevant — prior seasons, memorable moments, past takes that aged well or poorly.`;

  const entertainerConstraint = isFirstEpisodeEver
    ? `Write 3-4 paragraphs. First, introduce yourself (Mason Reed) to the East v. West league — your first episode ever. Welcome the league, make it feel electric. Then pivot: build draft hype, name the prospects you're most fired up about, call out which teams you think are set up to steal this draft. Drop a bold take. End with something that leaves them wanting more.`
    : `Write 3-4 paragraphs opening the draft preview. No intro needed — dive straight in. Build draft hype, name the prospects you're most fired up about, call out which teams are set up to steal this draft. Reference what you've seen from these teams in prior seasons. Drop a bold take.`;

  const analystConstraint = isFirstEpisodeEver
    ? `Write 3-4 paragraphs. First, introduce yourself (Westy) to the East v. West league — your first episode ever. Welcome the league and frame what you bring: data-driven analysis, accountability, receipts. Then pivot to the draft: lay out the analytical framework (draft capital, positional scarcity, team fit), highlight which teams have the most leverage, and set expectations for your mock draft picks. Measured but sharp.`
    : `Write 3-4 paragraphs opening the draft preview analytically. No intro needed — you're a known quantity to this league. Lay out the analytical framework (draft capital, positional scarcity, team fit), highlight which teams have the most leverage, and set expectations for your mock picks. Reference prior seasons' draft results where relevant.`;

  const context = `${leagueKnowledge}

---

EPISODE TYPE: PRE-DRAFT PREVIEW - ${season} ROOKIE DRAFT

${debutBlock}

After the intro, preview the upcoming rookie draft:
- Draft capital landscape (who picks when, any notable traded picks)
- Top prospects you're most excited about
- Key team needs and which teams are positioned well

${enhancedContext}`;

  const [bot1_text, bot2_text] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Pre-Draft Preview Intro',
      context,
      constraints: entertainerConstraint,
      maxTokens: 1500,
      episodeType: 'pre_draft',
      validate: (text) => text.length >= 300,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Pre-Draft Preview Intro',
      context,
      constraints: analystConstraint,
      maxTokens: 1400,
      episodeType: 'pre_draft',
      validate: (text) => text.length >= 300,
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

  // JSON format — more reliable than regex parsing
  const JSON_RANKINGS_FORMAT = `Return ONLY a valid JSON array (no markdown fences, no other text) of exactly 12 objects:
[{"rank":1,"team":"TeamName","blurb":"2-3 sentence take"},...]
Rank 1 = best team. Use exact team names from the context. No extra keys.`;

  // Generate entertainer's rankings
  const entertainerRankings = await generateSection({
    persona: 'entertainer',
    sectionType: 'Weekly Power Rankings',
    context: `${context}\n\nYOUR TEAM OPINIONS:\n${entertainerTeamOpinions.length > 0 ? entertainerTeamOpinions.join('\n') : 'No strong opinions yet.'}`,
    constraints: `Rank all 12 teams based on narrative, momentum, and gut feel.\n${JSON_RANKINGS_FORMAT}`,
    maxTokens: 1200,
  });

  // Generate analyst's rankings
  const analystRankings = await generateSection({
    persona: 'analyst',
    sectionType: 'Weekly Power Rankings',
    context: `${context}\n\nYOUR TEAM OPINIONS:\n${analystTeamOpinions.length > 0 ? analystTeamOpinions.join('\n') : 'Building data on all teams.'}`,
    constraints: `Rank all 12 teams based on points-per-game, roster construction, and efficiency.\n${JSON_RANKINGS_FORMAT}`,
    maxTokens: 1200,
  });

  // Parse rankings — JSON-first with regex fallback
  const parseRankings = (response: string): Array<{ rank: number; team: string; blurb: string }> => {
    try {
      const clean = response.trim().replace(/^```json?\n?|\n?```$/g, '');
      const parsed = JSON.parse(clean) as Array<{ rank?: number; team?: string; blurb?: string }>;
      if (Array.isArray(parsed) && parsed.length >= 10) {
        return parsed.map((r, i) => ({ rank: Number(r.rank ?? i + 1), team: String(r.team ?? `Team ${i + 1}`), blurb: String(r.blurb ?? '') }));
      }
    } catch { /* fall through to regex */ }
    const lines = response.split('\n').filter(l => l.trim() && /^\d+\./.test(l.trim()));
    return lines.slice(0, 12).map((line, idx) => {
      const match = line.match(/^\d+\.\s*([^-–:]+)[-–:]\s*(.+)/);
      const team = match ? match[1].trim() : `Team ${idx + 1}`;
      const blurb = match ? match[2].trim() : 'Solid team.';
      return { rank: idx + 1, team, blurb };
    });
  };

  const entRankings = parseRankings(entertainerRankings);
  const anaRankings = parseRankings(analystRankings);

  // Load previous week's rankings for real trend arrows
  const prevRankings: Record<string, number> = memEntertainer.previousPowerRankings ?? {};

  // Merge rankings - use entertainer's order but include both blurbs
  const rankings: PowerRankingsSection['rankings'] = entRankings.map((ent) => {
    const anaMatch = anaRankings.find(a => a.team.toLowerCase() === ent.team.toLowerCase());

    // Real trend: compare to last week's stored rank (positive delta = moved up)
    const prevRank = prevRankings[ent.team];
    const rankDelta = prevRank !== undefined ? prevRank - ent.rank : 0;
    const trend: 'up' | 'down' | 'steady' =
      prevRank === undefined || Math.abs(rankDelta) <= 1
        ? 'steady'
        : rankDelta > 0 ? 'up' : 'down';

    return {
      rank: ent.rank,
      team: ent.team,
      record: '',
      pointsFor: 0,
      trend,
      trendAmount: prevRank !== undefined ? Math.abs(rankDelta) : 0,
      bot1_blurb: ent.blurb,
      bot2_blurb: anaMatch?.blurb || 'No strong take.',
    };
  });

  // Persist current rankings so next week has real trend data
  memEntertainer.previousPowerRankings = Object.fromEntries(
    entRankings.map(r => [r.team, r.rank])
  );

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

async function buildWaiverItems(
  events: DerivedData['events_scored'],
  opts?: { memEntertainer?: BotMemory; memAnalyst?: BotMemory; season?: number },
): Promise<WaiverItem[]> {
  // Only show waiver moves with significant FAAB spend ($3+) — free adds aren't newsworthy
  const waiverEvents = events.filter(e =>
    (e.type === 'waiver' || e.type === 'fa_add') && (e.faab_spent ?? 0) >= 3
  );

  if (waiverEvents.length === 0) return [];

  // Build context for all waivers at once to save API calls
  const waiverContext = waiverEvents.map(e => {
    const faabStr = e.faab_spent != null ? ` ($${e.faab_spent} FAAB)` : '';
    return `- ${e.team} added ${e.player || 'unknown player'}${faabStr} (relevance: ${e.relevance_score}/100)`;
  }).join('\n');

  // Numbered list format so we can split by "N." delimiter after the fact
  const numberedContext = waiverEvents.map((e, i) => {
    const faabStr = e.faab_spent != null ? ` ($${e.faab_spent} FAAB)` : '';
    return `${i + 1}. ${e.team} added ${e.player || 'unknown player'}${faabStr}`;
  }).join('\n');

  const waiverConstraint = (style: string) =>
    `React to each numbered waiver move with 2-3 sentences. ${style}. ` +
    `Start each response with the move number, e.g. "1. [your take]". One paragraph per move. ` +
    `${waiverEvents.length} moves total.`;

  const waiverCtxEnt = `Waiver wire moves this week:\n${numberedContext}${opts?.memEntertainer ? buildDedupeContext(opts.memEntertainer, opts?.season) : ''}`;
  const waiverCtxAna = `Waiver wire moves this week:\n${numberedContext}${opts?.memAnalyst ? buildDedupeContext(opts.memAnalyst, opts?.season) : ''}`;

  const [rawEntWaivers, rawAnaWaivers] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Waivers',
      context: waiverCtxEnt,
      constraints: waiverConstraint('Be spicy about great pickups, skeptical about questionable ones — personality-driven takes'),
      maxTokens: 600,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Waivers',
      context: waiverCtxAna,
      constraints: waiverConstraint('Cover role, usage projection, upside, and roster construction impact — analytical takes'),
      maxTokens: 600,
    }),
  ]);

  const entertainerResponse = guardText(rawEntWaivers, { sectionType: 'Waivers', logPrefix: '[compose:Waivers:entertainer]' });
  const analystResponse     = guardText(rawAnaWaivers, { sectionType: 'Waivers', logPrefix: '[compose:Waivers:analyst]' });

  // Split on numbered entries "1. ", "2. ", etc.
  const splitByNumber = (text: string): string[] => {
    const parts = text.split(/\n?(?=\d+\.)/g).filter(p => p.trim());
    return parts.map(p => p.replace(/^\d+\.\s*/, '').trim());
  };

  const entParts = splitByNumber(entertainerResponse);
  const anaParts = splitByNumber(analystResponse);

  return waiverEvents.map((e, i) => ({
    event_id: e.event_id,
    coverage_level: e.coverage_level,
    reasons: e.reasons || [],
    team: e.team,
    player: e.player,
    faab_spent: e.faab_spent,
    bot1: entParts[i] || `${e.team} makes a move with ${e.player || 'a player'}.`,
    bot2: anaParts[i] || `${e.team} adds ${e.player || 'a player'}. Monitor usage.`,
  }));
}

async function buildTradeItems(events: DerivedData['events_scored'], memEntertainer: BotMemory, memAnalyst: BotMemory, enhancedContext = ''): Promise<TradeItem[]> {
  const tradeEvents = events.filter(e => e.type === 'trade');
  
  if (tradeEvents.length === 0) return [];

  // Build all trade contexts first
  const tradeContexts = tradeEvents.map(e => {
    const byTeam = e.details?.by_team || {};
    const parties = e.parties || Object.keys(byTeam);

    const isMultiTeamTrade = parties.length >= 3;
    let tradeBreakdown = '';
    for (const team of parties) {
      const teamAssets = byTeam[team];
      if (teamAssets) {
        const gets = teamAssets.gets?.join(', ') || 'nothing';
        const givesArr = teamAssets.gives || [];
        const gives = givesArr.length > 0 ? givesArr.join(', ') : 'nothing';
        tradeBreakdown += `\n${team}: RECEIVED ${gets} | SENT ${gives}`;
      }
    }
    if (isMultiTeamTrade) {
      tradeBreakdown += '\nIMPORTANT: Asset routing above is authoritative. Only grade each team on what appears in their SENT column.';
    }

    // Display headline (clean, for the template card header)
    const tradeDisplayHeadline = e.details?.headline || `Trade between ${parties.join(' and ')}`;

    // Full LLM context (includes data breakdown — only used for generation, not displayed)
    const tradeContext = e.details?.headline
      ? `${parties.join(' traded with ')}: ${e.details.headline}${tradeBreakdown}`
      : `Trade between ${parties.join(' and ')}${tradeBreakdown}`;

    return { event: e, parties, byTeam, tradeContext, tradeDisplayHeadline };
  });

  // Personality context for both bots
  const entPersonality = effectivePersonalityCtx(memEntertainer, enhancedContext, 'entertainer');
  const anaPersonality = effectivePersonalityCtx(memAnalyst, enhancedContext, 'analyst');

  // Phase 1: dedupe — prevent repeating last week's trade angles
  const tradeDedupeEnt = buildDedupeContext(memEntertainer);
  const tradeDedupeAna = buildDedupeContext(memAnalyst);

  const teamTrustLine = (mem: BotMemory, team: string): string => {
    const t = mem.teams[team];
    if (!t) return '';
    const parts: string[] = [];
    if (t.trust !== 0) parts.push(`trust ${t.trust > 0 ? '+' : ''}${t.trust}`);
    if (t.mood && t.mood !== 'Neutral') parts.push(`mood: ${t.mood}`);
    if (t.frustration && t.frustration > 10) parts.push(`frustration: ${t.frustration}`);
    return parts.length ? `Your history with ${team}: ${parts.join(', ')}.` : '';
  };

  // Generate one Mason Reed intro per trade (sets the stage once, not repeated per team)
  const tradeIntros = await Promise.all(
    tradeContexts.map(({ tradeContext, parties }) =>
      generateSection({
        persona: 'entertainer',
        sectionType: 'Trade Intro',
        context: tradeContext + (entPersonality ? `\n${entPersonality}` : ''),
        constraints: `Write 1-2 punchy sentences introducing this ${parties.length > 2 ? `${parties.length}-team` : ''} trade. Set the scene and the storyline — who made the power move, what's the narrative. Do NOT grade anyone or analyze specific team outcomes yet; that's coming in the per-team sections below.`,
        maxTokens: 120,
      }).then(raw => guardText(raw, { sectionType: 'Trade Intro', logPrefix: '[compose:TradeIntro:entertainer]' }))
    )
  );

  // Build all party analysis requests
  const allPartyRequests: Array<{
    tradeIdx: number;
    party: string;
    sideContext: string;
    isMultiTeam: boolean;
    allParties: string[];
  }> = [];

  for (let i = 0; i < tradeContexts.length; i++) {
    const { parties, byTeam, tradeContext } = tradeContexts[i];
    const isMultiTeam = parties.length >= 3;

    // For 3+ team trades, show every team's complete exchange with explicit routing
    const fullExchangeBlock = isMultiTeam
      ? `\nAUTHORITATIVE ${parties.length}-TEAM ASSET ROUTING:\n` +
        parties.map(p => {
          const a = byTeam[p];
          const givesArr = a?.gives || [];
          const givesStr = givesArr.length > 0 ? givesArr.join(', ') : 'nothing';
          return `  ${p}: RECEIVED ${a?.gets?.join(', ') || 'nothing'} | SENT ${givesStr}`;
        }).join('\n') +
        '\nThe routing above is verified from Sleeper transaction data. Only penalize a team for assets listed in their SENT column.'
      : '';

    for (const party of parties) {
      const teamAssets = byTeam[party];
      const gets = teamAssets?.gets?.join(', ') || 'nothing confirmed';
      const givesArr = teamAssets?.gives || [];
      const gives = givesArr.length > 0 ? givesArr.join(', ') : 'nothing confirmed';

      const entTrustLine = teamTrustLine(memEntertainer, party);
      const anaTrustLine = teamTrustLine(memAnalyst, party);

      // Phase 2: team card for this trade party
      const partyCard = buildTeamCardContext(party, {
        recentStance: memEntertainer.recentOutputLog?.recentStances?.[party],
        dataConfidenceFilter: 'medium',
      });

      const sideContext = `Trade Analysis for ${party}:
Full trade: ${tradeContext}
${party}'s outcome: RECEIVED ${gets} | SENT ${gives}${fullExchangeBlock}
Evaluate this trade FROM ${party.toUpperCase()}'S PERSPECTIVE ONLY. Only judge ${party} on what they SENT — not on assets sent by other teams.
${entTrustLine ? `[Mason Reed's history: ${entTrustLine}]` : ''}
${anaTrustLine ? `[Westy's history: ${anaTrustLine}]` : ''}${partyCard}`;

      allPartyRequests.push({ tradeIdx: i, party, sideContext, isMultiTeam, allParties: parties });
    }
  }

  // Generate all analyses in parallel (rate limiting handled by groq client)
  const allResponses = await Promise.all(
    allPartyRequests.map(async ({ party, sideContext, isMultiTeam, allParties }) => {
      const otherTeams = allParties.filter(p => p !== party).join(' and ');

      // The trade intro is already written by Mason Reed above — both bots skip re-introduction
      // and dive directly into their grade and analysis for this specific team.
      const entertainerConstraints = isMultiTeam
        ? `Grade this ${allParties.length}-team trade for ${party} specifically (A+ to F). ` +
          `Skip any trade introduction — jump straight into your take on ${party}'s outcome. ` +
          `Where does ${party} land vs ${otherTeams}: winner, break-even, or loser? ` +
          `Only judge ${party} on what they SENT (listed in their SENT column above) — do NOT blame them for assets sent by other teams. ` +
          `4-5 sentences with personality: did they orchestrate this, get fleeced, or thread the needle? End with your letter grade.`
        : `Grade this trade for ${party} specifically (A+ to F). Skip any trade setup — go straight to your verdict. Did THEY win or lose? 4-5 sentences with personality — was this a heist, a fair deal, or a robbery? Let your history with this team color your take. End with your letter grade.`;

      const analystConstraints = isMultiTeam
        ? `Grade this ${allParties.length}-team trade for ${party} specifically (A+ to F). ` +
          `Skip any trade introduction — go straight into your analysis of ${party}'s outcome. ` +
          `Evaluate what ${party} SENT (see their SENT column) vs what they RECEIVED; is the net haul a win, break-even, or loss? ` +
          `Do NOT penalize ${party} for assets sent by other teams in this deal. ` +
          `4-5 sentences on short vs long-term implications, asset value, and roster fit. End with your letter grade.`
        : `Grade this trade for ${party} specifically (A+ to F). Skip any trade setup — go straight into your analysis. Evaluate value received vs given from ${party}'s perspective. 4-5 sentences on short vs long-term implications, value, and fit. Factor in your prior read on this team if relevant. End with your letter grade.`;

      const tradeSection = isMultiTeam ? `${allParties.length}-Team Trade Grade` : 'Trade Grade';
      const perTeamTokens = isMultiTeam ? 500 : 420;
      const [rawEntTrade, rawAnaTrade] = await Promise.all([
        generateSection({
          persona: 'entertainer',
          sectionType: tradeSection,
          context: sideContext + (entPersonality ? `\n${entPersonality}` : '') + tradeDedupeEnt,
          constraints: entertainerConstraints,
          maxTokens: perTeamTokens,
        }),
        generateSection({
          persona: 'analyst',
          sectionType: tradeSection,
          context: sideContext + (anaPersonality ? `\n${anaPersonality}` : '') + tradeDedupeAna,
          constraints: analystConstraints,
          maxTokens: perTeamTokens,
        }),
      ]);
      const entertainerResponse = guardText(rawEntTrade, { sectionType: 'Trade Grade', logPrefix: `[compose:TradeGrade:${party}:entertainer]` });
      const analystResponse     = guardText(rawAnaTrade, { sectionType: 'Trade Grade', logPrefix: `[compose:TradeGrade:${party}:analyst]` });

      const extractGrade = (text: string): string => {
        // Explicit label patterns — most reliable
        const explicit = text.match(/\bgrade[:\s]+([A-F][+-]?)\b/i)
          || text.match(/\bgiv(?:e|ing)\s+(?:this\s+)?(?:a\s+)?([A-F][+-]?)\b/i)
          || text.match(/\b([A-F][+-]?)\s*[-–]\s*(?:grade|trade|deal)\b/i)
          || text.match(/\btrade[:\s]+([A-F][+-]?)\b/i)
          || text.match(/\bscore[:\s]+([A-F][+-]?)\b/i)
          || text.match(/\b([A-F][+-]?)\s*(?:grade|rating)\b/i);
        if (explicit) return explicit[1].toUpperCase();
        // Grade on its own line (e.g. "A+" as a standalone line)
        for (const line of text.split('\n')) {
          const solo = line.trim().match(/^([A-F][+-]?)\.?$/);
          if (solo) return solo[1].toUpperCase();
        }
        // Grade at the end of the text after punctuation (e.g. "solid pickup. B+")
        const endMatch = text.trim().match(/[.!]\s*([A-F][+-]?)\.?\s*$/);
        if (endMatch) return endMatch[1].toUpperCase();
        return 'B';
      };
      const entertainer_grade = extractGrade(entertainerResponse);
      const analyst_grade = extractGrade(analystResponse);
      const grade = entertainer_grade;

      return { entertainerResponse, analystResponse, grade, entertainer_grade, analyst_grade };
    })
  );

  // Reconstruct trade items with analyses
  const items: TradeItem[] = [];
  let responseIdx = 0;

  for (let i = 0; i < tradeContexts.length; i++) {
    const { event: e, parties, tradeDisplayHeadline } = tradeContexts[i];
    const analysis: Record<string, { grade: string; entertainer_grade?: string; analyst_grade?: string; deltaText: string; entertainer_paragraph: string; analyst_paragraph: string }> = {};

    for (const party of parties) {
      const { entertainerResponse, analystResponse, grade, entertainer_grade, analyst_grade } = allResponses[responseIdx++];
      analysis[party] = {
        grade,
        entertainer_grade,
        analyst_grade,
        deltaText: `${party}'s side`,
        entertainer_paragraph: entertainerResponse,
        analyst_paragraph: analystResponse,
      };
    }

    items.push({
      event_id: e.event_id,
      coverage_level: e.coverage_level,
      reasons: e.reasons || [],
      context: tradeDisplayHeadline,
      teams: e.details?.by_team || null,
      analysis,
      intro: tradeIntros[i],
    });
  }

  return items;
}

async function buildSpotlight(pairs: DerivedData['matchup_pairs'], memEntertainer: BotMemory, memAnalyst: BotMemory, enhancedContext: string = '', week = 0): Promise<SpotlightSection | null> {
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

  const entPersonality = effectivePersonalityCtx(memEntertainer, enhancedContext, 'entertainer')
    + buildPredictionComparison(memEntertainer, memAnalyst)
    + buildLastWeekNarrative(memEntertainer, week);
  const anaPersonality = effectivePersonalityCtx(memAnalyst, enhancedContext, 'analyst')
    + buildPredictionComparison(memAnalyst, memEntertainer)
    + buildLastWeekNarrative(memAnalyst, week);

  // Phase 1: dedupe + judgment for spotlight section
  const spotlightDedupeEnt = buildDedupeContext(memEntertainer);
  const spotlightDedupeAna = buildDedupeContext(memAnalyst);
  const spotlightJudgment = judgeSection({
    sectionType: 'Spotlight',
    episodeType: 'regular',
    week,
    season: new Date().getFullYear(),
    teamNames: [spotlight.team, spotlight.opponent],
    isBlowout: spotlight.margin > 30,
    teamMemory: memEntertainer.teams[spotlight.team],
  });
  const spotlightJudgmentCtx = buildJudgmentContext(spotlightJudgment);

  // Phase 2: team card + phase rules + enriched memory
  const spotlightTeamCard = buildTeamCardContext(spotlight.team, {
    recentStance: memEntertainer.recentOutputLog?.recentStances?.[spotlight.team],
  });
  const spotlightPhaseCtx = buildPhaseRulesContext(getPhaseRules('regular'));
  const spotlightEnrichedEnt = buildEnrichedMemoryContext(memEntertainer, spotlightJudgment.narrativeHeat, 'Spotlight');
  const spotlightEnrichedAna = buildEnrichedMemoryContext(memAnalyst,     spotlightJudgment.narrativeHeat, 'Spotlight');

  const [rawBot1Spot, rawBot2Spot] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Spotlight',
      context: context + (entPersonality ? `\n${entPersonality}` : '') + spotlightDedupeEnt + spotlightJudgmentCtx + spotlightTeamCard + spotlightPhaseCtx + spotlightEnrichedEnt,
      constraints: 'Write 3-4 paragraphs spotlighting this team\'s performance. Hype them up or give them tough love. Talk about what made this week special, which players came through, and what it means for their season. Be vivid and memorable. Let your current emotional state and personality color the writing.',
      maxTokens: 500,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Spotlight',
      context: context.replace(memEntertainer.teams[spotlightPair.winner.name]?.mood || 'Neutral', memAnalyst.teams[spotlightPair.winner.name]?.mood || 'Neutral') + (anaPersonality ? `\n${anaPersonality}` : '') + spotlightDedupeAna + spotlightJudgmentCtx + spotlightTeamCard + spotlightPhaseCtx + spotlightEnrichedAna,
      constraints: 'Write 3-4 paragraphs analytically dissecting this performance. What made it special statistically? Is it sustainable or regression bait? What does it mean for their playoff trajectory? Reference specific numbers. Let your analytical personality and current state come through.',
      maxTokens: 500,
    }),
  ]);
  const bot1 = guardText(rawBot1Spot, { sectionType: 'Spotlight', logPrefix: '[compose:Spotlight:entertainer]' });
  const bot2 = guardText(rawBot2Spot, { sectionType: 'Spotlight', logPrefix: '[compose:Spotlight:analyst]' });

  return { team: spotlightPair.winner.name, bot1, bot2 };
}

async function buildFinalWord(week: number, episodeType: string = 'regular', memEntertainer?: BotMemory, memAnalyst?: BotMemory, enhancedContext = ''): Promise<FinalWordSection> {
  // Build context based on episode type
  let context: string;
  let entertainerConstraint: string;
  let analystConstraint: string;

  switch (episodeType) {
    case 'preseason':
      context = 'The season is about to begin. Sign off the preseason preview with excitement for what\'s to come.';
      entertainerConstraint = '3-4 sentences closing out the season preview. Build maximum hype, drop your biggest bold prediction, tease one team you\'re all-in on, and leave the audience desperate for Week 1 to start.';
      analystConstraint = '3-4 sentences of measured analytical closing thoughts. Cover the 2-3 most important things to watch, flag a team you think is flying under the radar, and end with a data-backed prediction.';
      break;
    case 'pre_draft':
      context = `The rookie draft is coming up. Sign off the pre-draft preview with anticipation.\n\n${enhancedContext.slice(0, 600)}\n\nIMPORTANT: Use ONLY the exact team names listed above from the league context. Do not invent, shorten, or paraphrase team names.`;
      entertainerConstraint = '3-4 sentences to close out the draft preview. Build the hype, name the player you\'re most excited about, call out a team you think is going to steal the draft, and leave the audience fired up.';
      analystConstraint = '3-4 sentences of analytical closing thoughts. Key strategic takeaway heading into draft day, which team has the best draft capital, and a projection on how this draft will change the competitive landscape.';
      break;
    case 'post_draft':
      context = 'The rookie draft is complete. Sign off the draft grades with final thoughts.';
      entertainerConstraint = '3-4 sentences closing out the draft recap. Who was the biggest winner? What\'s your lasting impression of this class? Drop a bold take about which pick will look best in 2 years.';
      analystConstraint = '3-4 sentences of analytical final thoughts. What does this draft mean for the competitive landscape? Which team\'s strategy surprised you? End with a data-driven projection.';
      break;
    case 'offseason':
      context = 'It\'s the offseason. Sign off with thoughts on what\'s next.';
      entertainerConstraint = '3-4 sentences closing out the offseason update. What are you most looking forward to? Call out one team that\'s setting up for a big year. Leave the audience engaged.';
      analystConstraint = '3-4 sentences of measured offseason analysis. The biggest open questions, which roster move made the most analytical sense, and where you see the power shifting.';
      break;
    default:
      context = `Week ${week} is in the books. Sign off the newsletter with a memorable closing thought.`;
      entertainerConstraint = '3-4 sentences to close the show. Make it memorable — reference the week\'s biggest story, drop a take on what it means going forward, tease what to watch next week, and leave on a high note.';
      analystConstraint = '3-4 sentences of measured closing analysis. Reference the biggest statistical takeaway from this week, what it means for the standings, and one thing to watch heading into next week.';
  }

  const entPersonality = memEntertainer ? effectivePersonalityCtx(memEntertainer, enhancedContext, 'entertainer') : '';
  const anaPersonality = memAnalyst ? effectivePersonalityCtx(memAnalyst, enhancedContext, 'analyst') : '';

  // Phase 1: dedupe + judgment + stance for FinalWord
  const currentSeason = new Date().getFullYear();
  const entFinalPhase1 = memEntertainer
    ? buildPhase1Addendum(memEntertainer, 'FinalWord', episodeType, week, currentSeason, {
        isPlayoffs: episodeType === 'playoffs_round' || episodeType === 'championship',
        isChampionship: episodeType === 'championship',
      })
    : '';
  const anaFinalPhase1 = memAnalyst
    ? buildPhase1Addendum(memAnalyst, 'FinalWord', episodeType, week, currentSeason, {
        isPlayoffs: episodeType === 'playoffs_round' || episodeType === 'championship',
        isChampionship: episodeType === 'championship',
      })
    : '';

  const finalWordTokens = ['pre_draft', 'post_draft', 'preseason', 'offseason'].includes(episodeType) ? 600 : 350;
  const finalWordMinLen = ['pre_draft', 'post_draft', 'preseason', 'offseason'].includes(episodeType) ? 200 : 100;

  const rawBot1FW = await generateSection({
    persona: 'entertainer',
    sectionType: 'Final Word',
    context: context + (entPersonality ? `\n${entPersonality}` : '') + entFinalPhase1,
    constraints: entertainerConstraint,
    maxTokens: finalWordTokens,
    validate: (text) => text.length >= finalWordMinLen,
  });
  const bot1 = guardText(rawBot1FW, { sectionType: 'FinalWord', logPrefix: '[compose:FinalWord:entertainer]' });

  const rawBot2FW = await generateSection({
    persona: 'analyst',
    sectionType: 'Final Word',
    context: context + (anaPersonality ? `\n${anaPersonality}` : '') + anaFinalPhase1,
    constraints: analystConstraint,
    maxTokens: finalWordTokens,
    validate: (text) => text.length >= finalWordMinLen,
  });
  const bot2 = guardText(rawBot2FW, { sectionType: 'FinalWord', logPrefix: '[compose:FinalWord:analyst]' });

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

  // Parse current-season standings (wins/losses) for playoff status detection
  // Looks for lines like "Team Name: 8-4" anywhere in enhanced context
  const currentWins = new Map<string, number>();
  const currentLosses = new Map<string, number>();
  for (const line of enhancedContext.split('\n')) {
    const m = line.match(/^([^:]+):\s+(\d+)-(\d+)/);
    if (m) {
      const name = m[1].trim();
      currentWins.set(name, parseInt(m[2], 10));
      currentLosses.set(name, parseInt(m[3], 10));
    }
  }
  const totalTeams = pairs.length * 2;
  const playoffSpots = LEAGUE_IDENTITY.structure.playoffTeams; // 7 — top seed gets a bye
  const remainingWeeks = Math.max(0, 14 - week);

  // Sort all teams by wins to find the playoff cutoff
  const standingsEntries = Array.from(currentWins.entries())
    .map(([name, w]) => ({ name, wins: w, losses: currentLosses.get(name) ?? 0 }))
    .sort((a, b) => b.wins - a.wins);
  const cutoffWins = standingsEntries[playoffSpots - 1]?.wins ?? 0;
  const justMissedWins = standingsEntries[playoffSpots]?.wins ?? 0;

  const getPlayoffStatus = (teamName: string): 'clinched' | 'eliminated' | 'bubble' | null => {
    const w = currentWins.get(teamName);
    if (w === undefined) return null;
    // Clinched: even if all remaining games are losses, still make playoffs
    if (w > cutoffWins + remainingWeeks) return 'clinched';
    // Eliminated: even winning all remaining games can't reach playoff spot
    if (w + remainingWeeks < justMissedWins) return 'eliminated';
    if (Math.abs(w - cutoffWins) <= 1) return 'bubble';
    return null;
  };

  // Total teams for rank label
  const rankLabel = (rank: number | undefined): string => {
    if (!rank) return '';
    const suffix = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;
    return `${suffix}-highest scorer in the league this week (${rank}/${totalTeams})`;
  };

  // Phase 1: pre-compute dedupe blocks (same for all recaps — avoids calling per-pair)
  const recapDedupeEnt = buildDedupeContext(memEntertainer);
  const recapDedupeAna = buildDedupeContext(memAnalyst);

  // Phase 2: pre-compute phase rules context (same for all recaps this week)
  const recapPhaseRules = getPhaseRules(isChampionshipWeek ? 'championship' : isPlayoffs ? 'playoffs_round' : 'regular');
  const recapPhaseCtx = buildPhaseRulesContext(recapPhaseRules);

  // Generate recaps for EACH matchup individually to prevent LLM confusion
  // This ensures each recap is about the correct teams
  const recapPromises = pairs.map(async (p, pairIndex) => {
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

    // Prediction record comparison — gives them something real to needle each other about
    const entPredictionComparison = buildPredictionComparison(memEntertainer, memAnalyst);
    const anaPredictionComparison = buildPredictionComparison(memAnalyst, memEntertainer);

    // Last-week narrative carry-over — concrete event, not abstract mood scores
    const entLastWeek = buildLastWeekNarrative(memEntertainer, week);
    const anaLastWeek = buildLastWeekNarrative(memAnalyst, week);

    // Outstanding hot takes about these specific teams
    const matchupTeamNames = [p.winner.name, p.loser.name];
    const entHotTakeCtx = buildHotTakeContext(memEntertainer, week, matchupTeamNames);
    const anaHotTakeCtx = buildHotTakeContext(memAnalyst, week, matchupTeamNames);

    // Get partner dynamics context (how they relate to each other)
    // Only available for BotMemory - check if partnerDynamics exists
    const entertainerPartnerContext = 'partnerDynamics' in memEntertainer
      ? getPartnerDynamicsContext(memEntertainer)
      : '';
    const analystPartnerContext = 'partnerDynamics' in memAnalyst
      ? getPartnerDynamicsContext(memAnalyst)
      : '';

    // Get evolving personality context (confidence, emotional state, speech patterns, storylines)
    const entertainerPersonalityContext = effectivePersonalityCtx(memEntertainer, enhancedContext, 'entertainer')
      + (isEnhancedMemory(memEntertainer) ? getNarrativesContext(memEntertainer, week) : '');
    const analystPersonalityContext = effectivePersonalityCtx(memAnalyst, enhancedContext, 'analyst')
      + (isEnhancedMemory(memAnalyst) ? getNarrativesContext(memAnalyst, week) : '');

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
${entPredictionComparison}
${entLastWeek}
${entHotTakeCtx}
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
${anaPredictionComparison}
${anaLastWeek}
${anaHotTakeCtx}
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
    
    // Calculate interest score (0-10+). Floor is 5 so every matchup gets at least moderate treatment.
    let interestScore = 5; // Base — ensures at least 'moderate' for every matchup
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
        if (analystBurned) hooks.push(`⚠️ Westy got burned here - their analysis didn't hold up. They might be defensive.`);
      }
      if (interestFactors.someoneVindicated) {
        if (entertainerVindicated) hooks.push(`✓ YOU (Entertainer) called this - feel free to take a victory lap (but don't be insufferable).`);
        if (analystVindicated) hooks.push(`✓ Westy's numbers were right - they'll probably mention it.`);
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

    // Build season callback context from both bots' notableEvents for these teams
    const getNotableEvents = (mem: BotMemory, teamName: string): string => {
      const enhanced = mem.teams[teamName] as unknown as Record<string, unknown>;
      if (!enhanced || !('notableEvents' in enhanced) || !Array.isArray(enhanced.notableEvents)) return '';
      const events = (enhanced.notableEvents as Array<{ week: number; event: string }>).slice(-4);
      return events.map(ev => `Week ${ev.week}: ${ev.event}`).join('; ');
    };
    const winnerCallbacks = [
      getNotableEvents(memEntertainer, p.winner.name),
      getNotableEvents(memAnalyst, p.winner.name),
    ].filter(Boolean).join(' | ');
    const loserCallbacks = [
      getNotableEvents(memEntertainer, p.loser.name),
      getNotableEvents(memAnalyst, p.loser.name),
    ].filter(Boolean).join(' | ');
    const seasonCallbackContext = [
      winnerCallbacks ? `${p.winner.name} season story: ${winnerCallbacks}` : '',
      loserCallbacks ? `${p.loser.name} season story: ${loserCallbacks}` : '',
    ].filter(Boolean).join('\n');
    
    // Build a prompt that provides rich context but encourages NATURAL use of it
    const fullDialoguePrompt = `You are two fantasy football analysts having a natural conversation about a game result.

=== THE GAME ===
${p.winner.name} defeated ${p.loser.name}
Final: ${p.winner.points.toFixed(1)} - ${p.loser.points.toFixed(1)} (margin: ${p.margin.toFixed(1)})
${isChampionship ? '🏆 THIS IS THE CHAMPIONSHIP GAME - THE BIGGEST GAME OF THE SEASON!' : ''}
${isPlayoffs ? '🏈 PLAYOFF GAME' : ''}
${p.margin > 40 ? '💀 ABSOLUTE DESTRUCTION' : p.margin > 25 ? '📢 BLOWOUT' : p.margin < 3 ? '😱 PHOTO FINISH' : p.margin < 8 ? '😰 NAIL-BITER' : ''}

=== LEAGUE-WIDE CONTEXT ===
${rankLabel(p.winner.weekly_rank) ? `${p.winner.name} scored ${p.winner.points.toFixed(1)} — ${rankLabel(p.winner.weekly_rank)}` : ''}
${rankLabel(p.loser.weekly_rank) ? `${p.loser.name} scored ${p.loser.points.toFixed(1)} — ${rankLabel(p.loser.weekly_rank)}` : ''}
${(p.loser.weekly_rank ?? 99) <= 3 ? `⚠️ UNLUCKY LOSS: ${p.loser.name} was a top-3 scorer this week but still lost. Worth acknowledging.` : ''}
${(p.winner.weekly_rank ?? 99) > totalTeams - 2 ? `⚠️ LUCKY WIN: ${p.winner.name} scored near the bottom of the league but still won. Worth calling out.` : ''}
${p.winner.bench_delta && p.winner.bench_delta > 15 ? `${p.winner.name} left ${p.winner.bench_delta.toFixed(1)} pts on the bench vs their optimal lineup.` : ''}
${p.loser.bench_delta && p.loser.bench_delta > 15 ? `${p.loser.name} left ${p.loser.bench_delta.toFixed(1)} pts on the bench — optimal lineup would've scored ${(p.loser.points + p.loser.bench_delta).toFixed(1)}.` : ''}
${!isPlayoffs ? (() => {
  const ws = getPlayoffStatus(p.winner.name);
  const ls = getPlayoffStatus(p.loser.name);
  const lines: string[] = [];
  if (ws === 'clinched') lines.push(`🎉 ${p.winner.name} has CLINCHED a playoff spot with this win.`);
  if (ls === 'eliminated') lines.push(`💀 ${p.loser.name} is ELIMINATED from playoff contention with this loss.`);
  if (ws === 'bubble') lines.push(`${p.winner.name} is right on the playoff bubble — this win matters enormously.`);
  if (ls === 'bubble') lines.push(`${p.loser.name} is on the bubble — this loss is a gut punch for their playoff hopes.`);
  return lines.join('\n');
})() : ''}

=== KEY PERFORMERS ===
${p.winner.name}'s heroes: ${winnerPlayers}
${p.loser.name}'s top scorers: ${loserPlayers}

=== BACKGROUND KNOWLEDGE (use naturally, don't force) ===
${winnerRecord ? `${p.winner.name} all-time: ${winnerRecord}` : ''}
${loserRecord ? `${p.loser.name} all-time: ${loserRecord}` : ''}
${h2hHistory ? `Head-to-head history: ${h2hHistory}` : ''}
${narrativeContext ? `Ongoing storylines: ${narrativeContext}` : ''}
${seasonCallbackContext ? `=== SEASON STORY SO FAR ===\n${seasonCallbackContext}\nIf any of these moments feel relevant, reference them naturally — "remember when...", "this team has been...", "after what happened in week X..." Don't force it if nothing connects.` : ''}
${isChampionship ? `${p.winner.name} IS NOW THE CHAMPION. This is their crowning moment.` : ''}

=== MASON REED (The Entertainer) ===
${entertainerState}
${entertainerWinnerMemory ? `History with ${p.winner.name}: ${entertainerWinnerMemory}` : ''}
${entertainerLoserMemory ? `History with ${p.loser.name}: ${entertainerLoserMemory}` : ''}
${entertainerBurned ? `⚠️ GOT BURNED THIS WEEK - trusted ${p.loser.name} or doubted ${p.winner.name}` : ''}
${entertainerVindicated ? `✓ VINDICATED - called this one right` : ''}
${entertainerPersonalityContext}
${entertainerPartnerContext}

=== TRENT WESTON / WESTY (The Analyst) ===
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
- DO let your personality show - Mason is dramatic, Westy is measured
- DON'T just list facts - have a CONVERSATION with opinions and reactions
- If you have an inside joke or callback with your co-host, use it naturally
- The conversation should flow like two people who know each other well

=== OUTPUT FORMAT ===
Each line starts with "ENTERTAINER:" or "ANALYST:"
Alternate speakers. No other formatting.
${starterBot === 'entertainer' ? 'Mason Reed (Entertainer) speaks first.' : 'Trent Weston (Analyst) speaks first.'}

BEGIN:`;

    // Single-call dialogue: generate complete back-and-forth in one LLM call.
    // This halves API calls vs the old sequential approach while producing richer interleaving.
    const exchangeCount = isChampionship ? '6-8' :
                          interestLevel === 'very high' ? '5-6' :
                          interestLevel === 'moderate' ? '4-5' : '3-4';
    const dialogueTokens = isChampionship ? 900 :
                           interestLevel === 'very high' ? 750 :
                           interestLevel === 'moderate' ? 600 :
                           interestLevel === 'low' ? 500 : 400;

    const dialogueConstraints = `${fullDialoguePrompt}

Generate ${exchangeCount} lines now — both speakers alternating naturally.
Each line: "ENTERTAINER: [Mason's words]" OR "ANALYST: [Westy's words]"
${starterBot === 'entertainer' ? 'Start with ENTERTAINER.' : 'Start with ANALYST.'}
No headers, no other text. Begin immediately:`;

    // Phase 1: judgment + dedupe appended to the starter bot's context
    const recapJudgment = judgeMatchup(
      memEntertainer, p.winner.name, p.loser.name, p.margin,
      week, new Date().getFullYear(),
      isChampionshipWeek ? 'championship' : isPlayoffs ? 'playoffs_round' : 'regular',
      pairIndex,
    );
    const recapJudgmentCtx = buildJudgmentContext(recapJudgment);
    const starterDedupe = starterBot === 'entertainer' ? recapDedupeEnt : recapDedupeAna;

    // Phase 2: team cards for this specific matchup
    const pairRivalryScore = recapJudgment.rivalryScore;
    const teamCards = buildMatchupCardContext(
      p.winner.name, p.loser.name, pairRivalryScore,
      {
        [p.winner.name]: memEntertainer.recentOutputLog?.recentStances?.[p.winner.name],
        [p.loser.name]:  memEntertainer.recentOutputLog?.recentStances?.[p.loser.name],
      },
    );

    // Phase 2: enriched memory surfacing (heat-gated)
    const recapEnrichedEnt = buildEnrichedMemoryContext(memEntertainer, recapJudgment.narrativeHeat, `Recap_${pairIndex}`);
    const recapEnrichedAna = buildEnrichedMemoryContext(memAnalyst,     recapJudgment.narrativeHeat, `Recap_${pairIndex}`);

    const dialogueRaw = await generateSection({
      persona: starterBot === 'entertainer' ? 'entertainer' : 'analyst',
      sectionType: `${bracketInfo} Recap`,
      context: `${seasonalContext}\n${starterBot === 'entertainer' ? entertainerMatchupContext + recapEnrichedEnt : analystMatchupContext + recapEnrichedAna}${starterDedupe}${recapJudgmentCtx}${teamCards}${recapPhaseCtx}`,
      constraints: dialogueConstraints,
      maxTokens: dialogueTokens,
    }).catch(() => '');

    // Guardrails check on the full dialogue before parsing
    const { text: safeDialogueRaw } = dialogueRaw
      ? checkOutput(dialogueRaw, { sectionType: 'Matchup Recap', logPrefix: `[compose:Recap:${p.winner.name}v${p.loser.name}]` })
      : { text: '' };

    // Parse interleaved dialogue from single call
    type DialogueTurn = { speaker: 'entertainer' | 'analyst'; text: string };
    const parseDialogue = (raw: string): DialogueTurn[] => {
      const result: DialogueTurn[] = [];
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        const clean = line.replace(/^\*\*/, '').replace(/\*\*$/, '').replace(/^\[|\]$/g, '').trim();
        const entMatch = clean.match(/^(?:ENTERTAINER|MASON REED|MASON)[:\s]+(.+)/i);
        const anaMatch = clean.match(/^(?:ANALYST|WESTY|TRENT WESTON|THE ANALYST)[:\s]+(.+)/i);
        if (entMatch && entMatch[1].trim().length > 10) result.push({ speaker: 'entertainer', text: entMatch[1].trim().replace(/^["']|["']$/g, '') });
        else if (anaMatch && anaMatch[1].trim().length > 10) result.push({ speaker: 'analyst', text: anaMatch[1].trim().replace(/^["']|["']$/g, '') });
      }
      return result;
    };

    dialogue.push(...parseDialogue(safeDialogueRaw));

    // Derive per-speaker aggregates for downstream pushback recording
    const entertainerTake = dialogue.filter(d => d.speaker === 'entertainer').map(d => d.text).join(' ');
    const analystTake = dialogue.filter(d => d.speaker === 'analyst').map(d => d.text).join(' ');

    // Pushback + personality recording (detect disagreement in the generated dialogue)
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
    if (true) {
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
      winner_top_players: p.winner.topPlayers,
      loser_top_players: p.loser.topPlayers,
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
  pairs: DerivedData['matchup_pairs'],
): Promise<BlurtSection> {
  const entPersonality = effectivePersonalityCtx(memEntertainer, enhancedContext, 'entertainer')
    + buildPredictionComparison(memEntertainer, memAnalyst)
    + buildLastWeekNarrative(memEntertainer, week);
  const anaPersonality = effectivePersonalityCtx(memAnalyst, enhancedContext, 'analyst')
    + buildPredictionComparison(memAnalyst, memEntertainer)
    + buildLastWeekNarrative(memAnalyst, week);

  // Build a structured fact sheet from actual week results
  const weekFacts: string[] = [];
  if (pairs.length > 0) {
    const sorted = [...pairs].sort((a, b) =>
      Math.max(b.winner.points, b.loser.points) - Math.max(a.winner.points, a.loser.points)
    );
    const topGame = sorted[0];
    const topTeam = topGame.winner.points >= topGame.loser.points ? topGame.winner : topGame.loser;
    weekFacts.push(`Top scorer: ${topTeam.name} with ${topTeam.points.toFixed(1)} pts`);

    const biggest = [...pairs].sort((a, b) => b.margin - a.margin)[0];
    weekFacts.push(`Biggest blowout: ${biggest.winner.name} def. ${biggest.loser.name} by ${biggest.margin.toFixed(1)}`);

    const closest = [...pairs].sort((a, b) => a.margin - b.margin)[0];
    if (closest.margin < 10) {
      weekFacts.push(`Nail-biter: ${closest.winner.name} escaped ${closest.loser.name} by only ${closest.margin.toFixed(1)}`);
    }

    const unlucky = [...pairs].sort((a, b) => b.loser.points - a.loser.points)[0];
    if (unlucky.loser.points > 100) {
      weekFacts.push(`Unluckiest loss: ${unlucky.loser.name} dropped ${unlucky.loser.points.toFixed(1)} and still lost`);
    }
  }

  const weekSummary = weekFacts.length
    ? `WEEK ${week} RESULTS:\n${weekFacts.join('\n')}\n\n`
    : '';

  const ctxSnippet = weekSummary + enhancedContext.substring(0, 500);

  const [bot1, bot2] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Blurt',
      context: ctxSnippet + (entPersonality ? `\n${entPersonality}` : ''),
      constraints: `Week ${week}. One sharp aside — something burning on your mind, a hot observation, a player or team you can't stop thinking about. 2-3 sentences max. No speaker label, just your words. CRITICAL: Only use actual team names from the context above. Never invent team names or use vague references like "one team" or "a squad" — say the real name.`,
      maxTokens: 150,
    }).then(r => r.trim().replace(/^(?:entertainer|the entertainer)[:\s]+/i, '').replace(/^["']|["']$/g, '') || null).catch(() => null),
    generateSection({
      persona: 'analyst',
      sectionType: 'Blurt',
      context: ctxSnippet + (anaPersonality ? `\n${anaPersonality}` : ''),
      constraints: `Week ${week}. One sharp analytical observation that doesn't fit anywhere else — a data point, a trend, a number that surprised you. 2-3 sentences max. No speaker label, just your words. CRITICAL: Only use actual team names from the context above. Never invent team names or use vague references — say the real name.`,
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

/**
 * Generates offseason trade analysis for the pre-draft episode.
 * Uses the enhanced context string (which includes trade history) rather than live events.
 */
async function buildPreDraftTrades(
  enhancedContext: string,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  season: number,
): Promise<TradeItem[]> {
  const leagueKnowledge = buildStaticLeagueContext();

  const context = `${leagueKnowledge}

---

PRE-DRAFT TRADE ANALYSIS — ${season} SEASON

Review any trades that have occurred since late ${season - 1} (post-championship offseason through the present).
Focus on moves that affect draft capital, roster construction, and the upcoming rookie draft.
The context below contains the full trade history — identify and analyze the significant deals.

${enhancedContext}

Your job: Analyze the most significant trades from this offseason that are relevant heading into the rookie draft.

CRITICAL: The context above contains a section called "${season} OFFSEASON TRADES" — read it carefully.
If it says "No trades have been made in the ${season} offseason yet" or similar, you MUST report that accurately.
You may ONLY mention trades that are EXPLICITLY listed in the context with specific details (team names, assets, dates).
Do NOT invent, assume, or imply that any trade happened unless it appears in the context above.`;

  const entPersonality = effectivePersonalityCtx(memEntertainer, enhancedContext, 'entertainer');
  const anaPersonality = effectivePersonalityCtx(memAnalyst, enhancedContext, 'analyst');

  const [masonAnalysis, westyAnalysis] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Offseason Trade Analysis',
      context: context + (entPersonality ? `\n${entPersonality}` : ''),
      constraints: `Write 3-4 sentences analyzing the key trades from this offseason. Which moves do you love? Which teams set themselves up well (or poorly)? Any trades that affect the draft order? Be colorful and opinionated. CRITICAL: If the context says no ${season} offseason trades have occurred, do NOT invent trades — instead acknowledge the quiet offseason and pivot to what you expect teams to do before draft day.`,
      maxTokens: 600,
      episodeType: 'pre_draft',
      validate: (text) => text.length >= 150,
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Offseason Trade Analysis',
      context: context + (anaPersonality ? `\n${anaPersonality}` : ''),
      constraints: `Write 3-4 sentences with an analytical take on offseason trades. Evaluate the value exchanged, impact on draft capital, and implications for the upcoming draft. CRITICAL: If the context says no ${season} offseason trades have occurred, do NOT invent trades — instead note the quiet offseason and highlight what teams should be doing heading into draft season.`,
      maxTokens: 600,
      validate: (text) => text.length >= 150,
      episodeType: 'pre_draft',
    }),
  ]);

  // Phase 2: Per-party trade grades — structured block format that LLMs follow reliably
  const partyGradeConstraint = (persona: 'entertainer' | 'analyst') =>
    `Based ONLY on trades explicitly described in the context, grade each team involved separately.
Output EXACTLY this format for each team (use triple-equals delimiters):

===TEAM: [Exact Team Name]===
GRADE: [A+ to F]
[Your 2-3 sentence analysis of this team's side: what they got, what they gave up, and your take]

If no offseason trades are described in the context, output exactly: NO_TRADES
Do NOT invent trades. Only grade teams for trades actually in the context.${persona === 'analyst' ? '\nFocus on analytical value: assets received vs. given, short-term vs. long-term implications, draft capital impact.' : '\nFocus on personality and bold opinion: who won, who got fleeced, who made a power move.'}`;

  const [masonGradeRaw, westyGradeRaw] = await Promise.all([
    generateSection({
      persona: 'entertainer',
      sectionType: 'Offseason Trade Party Grades',
      context: context + (entPersonality ? `\n${entPersonality}` : ''),
      constraints: partyGradeConstraint('entertainer'),
      maxTokens: 700,
      episodeType: 'pre_draft',
    }),
    generateSection({
      persona: 'analyst',
      sectionType: 'Offseason Trade Party Grades',
      context: context + (anaPersonality ? `\n${anaPersonality}` : ''),
      constraints: partyGradeConstraint('analyst'),
      maxTokens: 700,
      episodeType: 'pre_draft',
    }),
  ]);

  // Parse ===TEAM: ...=== blocks from LLM output
  const parseTeamGradeBlocks = (text: string): Array<{ team: string; grade: string; analysis: string }> => {
    if (/NO_TRADES/i.test(text)) return [];
    const results: Array<{ team: string; grade: string; analysis: string }> = [];
    const parts = text.split(/===TEAM:\s*([^=]+?)===/).slice(1);
    for (let i = 0; i < parts.length; i += 2) {
      const team = parts[i]?.trim();
      const content = (parts[i + 1] ?? '').trim();
      if (!team || !content) continue;
      const gradeMatch = content.match(/GRADE:\s*([A-F][+-]?)/i);
      const grade = gradeMatch ? gradeMatch[1].toUpperCase() : 'B';
      const analysis = content.replace(/GRADE:\s*[A-F][+-]?\s*/i, '').trim();
      results.push({ team, grade, analysis });
    }
    return results;
  };

  const masonGrades = parseTeamGradeBlocks(masonGradeRaw);
  const westyGrades = parseTeamGradeBlocks(westyGradeRaw);

  // Build analysis: League Overview + per-party grades
  const analysis: Record<string, TradeAnalysis> = {
    'League Overview': {
      grade: 'B',
      entertainer_grade: '–',
      analyst_grade: '–',
      deltaText: '',
      entertainer_paragraph: masonAnalysis,
      analyst_paragraph: westyAnalysis,
    },
  };

  if (masonGrades.length > 0 || westyGrades.length > 0) {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const teamMap = new Map<string, { canonical: string; mason?: typeof masonGrades[0]; westy?: typeof westyGrades[0] }>();
    for (const mg of masonGrades) {
      teamMap.set(normalize(mg.team), { canonical: mg.team, mason: mg });
    }
    for (const wg of westyGrades) {
      const key = normalize(wg.team);
      const existing = teamMap.get(key);
      if (existing) { existing.westy = wg; }
      else { teamMap.set(key, { canonical: wg.team, westy: wg }); }
    }
    for (const { canonical, mason, westy } of teamMap.values()) {
      analysis[canonical] = {
        grade: mason?.grade ?? westy?.grade ?? 'B',
        entertainer_grade: mason?.grade,
        analyst_grade: westy?.grade,
        deltaText: `${canonical}'s side`,
        entertainer_paragraph: mason?.analysis ?? '',
        analyst_paragraph: westy?.analysis ?? '',
      };
    }
  }

  const item: TradeItem = {
    event_id: `offseason-trades-${season}`,
    coverage_level: 'high',
    reasons: [`${season} offseason trade activity and draft capital implications`],
    context: `${season} Offseason Trade Landscape`,
    teams: null,
    analysis,
  };

  return [item];
}

/**
 * Parse structured pick output from LLM.
 * Expects format: "PICK R.SS | Team Name | Player Name | Position\n[analysis paragraph]"
 */
function parseMockDraftPicks(
  raw: string,
  round: number,
): Array<{ slot: number; team: string; player: string; position: string; analysis: string }> {
  const result: Array<{ slot: number; team: string; player: string; position: string; analysis: string }> = [];
  const lines = raw.split('\n');
  let current: { slot: number; team: string; player: string; position: string } | null = null;
  const analysisLines: string[] = [];

  const flushCurrent = () => {
    if (current && analysisLines.length > 0) {
      result.push({ ...current, analysis: analysisLines.join(' ').trim() });
    }
    analysisLines.length = 0;
  };

  for (const line of lines) {
    // Strip markdown bold markers before matching so **PICK 1.01** | ... works.
    const cleanLine = line.replace(/\*\*/g, '');
    const m = cleanLine.match(/\bPICK\s+\d+\.(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+)/i);
    if (m) {
      flushCurrent();
      // m[4] may include trailing analysis text (e.g. "WR — some note"); take only the first token
      const rawPos = m[4].trim().split(/[\s|—–\-]/)[0].toUpperCase();
      current = {
        slot: parseInt(m[1], 10),
        team: m[2].trim(),
        player: m[3].trim(),
        position: rawPos || m[4].trim(),
      };
    } else if (current && line.trim()) {
      analysisLines.push(line.trim());
    } else if (!line.trim() && analysisLines.length > 0) {
      flushCurrent();
      current = null;
    }
  }
  flushCurrent();

  // Keep only picks matching the correct round count
  return result.filter(p => p.slot >= 1 && p.slot <= 12);
}

/**
 * Build the pick-by-pick mock draft for the pre-draft episode.
 * Generates 4 LLM calls (Mason R1, Westy R1, Mason R2, Westy R2) then interleaves picks.
 */
async function buildMockDraft(
  draftData: LeagueDraftData | null,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory,
  season: number,
  enhancedContext: string,
  preDraftSlots?: Array<{ slot: number; team: string }>,
  preDraftRound2Slots?: Array<{ slot: number; team: string }>,
  isFirstEpisodeEver = false,
): Promise<MockDraftSection> {
  const leagueKnowledge = buildStaticLeagueContext();

  // Prefer standings-based slots (passed from route.ts); fall back to resolved draftData
  let slots: Array<{ slot: number; team: string }>;
  if (preDraftSlots && preDraftSlots.length > 0) {
    slots = preDraftSlots;
  } else {
    const rawTeams = (draftData?.draftOrder ?? []).filter(t => !t.startsWith('Slot ') && !t.startsWith('RosterId:'));
    slots = rawTeams.map((team, idx) => ({ slot: idx + 1, team }));
  }

  const teamCount = slots.length || 12;

  // If no slots were resolved, create generic fallback slots so pickFormat never says "0 picks"
  const effectiveSlots: Array<{ slot: number; team: string }> = slots.length > 0
    ? slots
    : Array.from({ length: teamCount }, (_, i) => ({ slot: i + 1, team: `Team ${i + 1}` }));

  const isSnake = !draftData?.type || draftData.type === 'snake';
  // Prefer DB-stored round 2 order (reflects traded picks and actual configured order)
  const round2Slots: Array<{ slot: number; team: string }> = preDraftRound2Slots && preDraftRound2Slots.length > 0
    ? preDraftRound2Slots
    : (isSnake ? [...effectiveSlots].reverse() : [...effectiveSlots]);

  // Format draft order context for LLM
  const r1Order = effectiveSlots.map(s => `Pick 1.${String(s.slot).padStart(2, '0')} (${s.slot} overall): ${s.team}`).join('\n');
  const r2Order = round2Slots.map((s, i) => `Pick 2.${String(i + 1).padStart(2, '0')} (${teamCount + i + 1} overall): ${s.team}`).join('\n');

  const draftOrderCtx = `ROUND 1 DRAFT ORDER (1st pick = worst prior-season record, ${teamCount}th = champion):
${r1Order}

ROUND 2 DRAFT ORDER (${isSnake ? 'reverse snake — best team picks first' : 'linear — same order as Round 1'}):
${r2Order}`;

  const debutLine = isFirstEpisodeEver
    ? `FIRST EPISODE EVER: This is Mason and Westy's debut newsletter for the East v. West league. They are making their first impression with this draft class.`
    : `Mason and Westy are established analysts for this league — reference prior seasons and your knowledge of these teams.`;

  const baseContext = `${leagueKnowledge}

---

${season} EAST V. WEST ROOKIE DRAFT — MOCK DRAFT

${debutLine}

${draftOrderCtx}

${enhancedContext}

Use your knowledge of the ${season} NFL Draft class: top prospects by ADP, positional depth, dynasty value, scheme fit.
For each pick, consider: this team's record, roster construction, draft capital, needs, and the prospects available at that point.
BE SPECIFIC — use real prospect names. Show you know this league and its teams by name.`;

  const pickFormat = (round: number, orderedSlots: Array<{ slot: number; team: string }>) =>
    `EXACTLY this format for all ${orderedSlots.length} picks (no extra text between picks):

PICK ${round}.01 | ${orderedSlots[0].team} | [Player Name] | [Position]
[4-5 sentence paragraph — reference this specific team's record and needs, explain why this player is the right fit, cover their NFL landing spot and dynasty value, and add your personality take]

PICK ${round}.02 | ${orderedSlots[1].team} | [Player Name] | [Position]
[4-5 sentence paragraph]

(continue through PICK ${round}.${String(orderedSlots.length).padStart(2, '0')})`;

  const r1Constraint = (persona: 'entertainer' | 'analyst') =>
    `You are writing YOUR MOCK DRAFT for ROUND 1 of the ${season} East v. West rookie draft.
You are ${persona === 'entertainer' ? 'Mason Reed — high-energy, bold, personality-first' : 'Westy — analytical, methodical, data-driven'}.
Each pick paragraph MUST reference the specific team by name and why this player fits them.
${pickFormat(1, effectiveSlots)}`;

  // Build R2 constraint after R1 is known, injecting actual R1 picks so the LLM
  // doesn't repeat players or hallucinate what teams drafted in round 1.
  const r2Constraint = (
    persona: 'entertainer' | 'analyst',
    r1Picks: ReturnType<typeof parseMockDraftPicks>,
  ) => {
    const r1Summary = r1Picks.length > 0
      ? `YOUR ROUND 1 PICKS (do NOT repeat these players in Round 2):\n` +
        r1Picks.map(p => `  Pick 1.${String(p.slot).padStart(2, '0')} | ${p.team} | ${p.player} | ${p.position}`).join('\n')
      : 'Round 1 picks unavailable — choose different players for each Round 2 slot.';
    return `Continue your mock draft into ROUND 2.
You are ${persona === 'entertainer' ? 'Mason Reed' : 'Westy'}.

${r1Summary}

For each Round 2 pick, reference what this team took in Round 1 and explain how their Round 2 pick complements it.
Do NOT select any player already chosen in Round 1 above.
${pickFormat(2, round2Slots)}`;
  };

  // Only require 40% of picks — Gemini reliably generates all 12 but formatting
  // variations (bold headers, colons, etc.) mean stricter thresholds cause false failures.
  const minPicksNeeded = Math.max(4, Math.floor(teamCount * 0.4));
  // Strip markdown bold before matching so **PICK 1.01** | ... also counts.
  const pickCountValidator = (text: string) => {
    const stripped = text.replace(/\*\*/g, '');
    return (stripped.match(/\bPICK\s+\d+\.\d+\s*\|/gim) || []).length >= minPicksNeeded;
  };

  // Generate R1 for both bots first, then parse to pass as context to R2
  const masonR1Raw = await generateSection({
    persona: 'entertainer',
    sectionType: 'Mock Draft - Round 1',
    context: baseContext,
    constraints: r1Constraint('entertainer'),
    maxTokens: 3500,
    episodeType: 'pre_draft',
    validate: pickCountValidator,
  });

  const westyR1Raw = await generateSection({
    persona: 'analyst',
    sectionType: 'Mock Draft - Round 1',
    context: baseContext,
    constraints: r1Constraint('analyst'),
    maxTokens: 3500,
    episodeType: 'pre_draft',
    validate: pickCountValidator,
  });

  // Parse R1 first so R2 can reference actual picks
  const masonR1 = parseMockDraftPicks(masonR1Raw, 1);
  const westyR1 = parseMockDraftPicks(westyR1Raw, 1);

  const masonR2Raw = await generateSection({
    persona: 'entertainer',
    sectionType: 'Mock Draft - Round 2',
    context: baseContext,
    constraints: r2Constraint('entertainer', masonR1),
    maxTokens: 3500,
    episodeType: 'pre_draft',
    validate: pickCountValidator,
  });

  const westyR2Raw = await generateSection({
    persona: 'analyst',
    sectionType: 'Mock Draft - Round 2',
    context: baseContext,
    constraints: r2Constraint('analyst', westyR1),
    maxTokens: 3500,
    episodeType: 'pre_draft',
    validate: pickCountValidator,
  });

  const masonR2 = parseMockDraftPicks(masonR2Raw, 2);
  const westyR2 = parseMockDraftPicks(westyR2Raw, 2);

  // Interleave: for each pick slot, pair mason + westy
  const picks: MockDraftPick[] = [];

  const buildPick = (
    round: number,
    slotIdx: number,
    slotTeam: string,
    masonPicks: ReturnType<typeof parseMockDraftPicks>,
    westyPicks: ReturnType<typeof parseMockDraftPicks>,
  ): MockDraftPick => {
    const slot = slotIdx + 1;
    const overall = round === 1 ? slot : teamCount + slotIdx + 1;
    const mp = masonPicks.find(p => p.slot === slot) ?? masonPicks[slotIdx];
    const wp = westyPicks.find(p => p.slot === slot) ?? westyPicks[slotIdx];
    return {
      overall,
      round,
      slot,
      originalTeam: slotTeam,
      ownerTeam: slotTeam,
      mason: {
        player: mp ? `${mp.player}${mp.position ? ` (${mp.position})` : ''}` : 'TBD',
        analysis: mp?.analysis ?? '',
      },
      westy: {
        player: wp ? `${wp.player}${wp.position ? ` (${wp.position})` : ''}` : 'TBD',
        analysis: wp?.analysis ?? '',
      },
    };
  };

  for (let i = 0; i < effectiveSlots.length; i++) {
    picks.push(buildPick(1, i, effectiveSlots[i].team, masonR1, westyR1));
  }
  for (let i = 0; i < round2Slots.length; i++) {
    picks.push(buildPick(2, i, round2Slots[i].team, masonR2, westyR2));
  }

  // Short intro texts extracted from R1 output preamble (first non-PICK line, if any)
  const extractIntro = (raw: string): string => {
    const lines = raw.split('\n');
    const firstPickIdx = lines.findIndex(l => /^PICK\s+\d+\.\d+/i.test(l));
    if (firstPickIdx > 0) {
      return lines.slice(0, firstPickIdx).join(' ').trim().slice(0, 300);
    }
    return '';
  };

  const mason_intro = extractIntro(masonR1Raw) || "Here's how I see this draft going down.";
  const westy_intro = extractIntro(westyR1Raw) || "My projections for each pick, based on the data.";

  return { picks, mason_intro, westy_intro };
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
  /** Standings-based draft slot order for pre_draft mock drafts (slot 1 = worst record, 12 = champion) */
  preDraftSlots?: Array<{ slot: number; team: string }>;
  /** DB-sourced round 2 pick order for pre_draft mock drafts (overrides snake/linear computation) */
  preDraftRound2Slots?: Array<{ slot: number; team: string }>;
  /**
   * When true, Mason and Westy introduce themselves as making their debut with this league.
   * Set to true for the very first pre_draft newsletter ever generated.
   * Set to false (or omit) for all subsequent newsletters so they don't keep claiming it's their debut.
   */
  isFirstEpisodeEver?: boolean;
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
    preDraftSlots,
    preDraftRound2Slots,
    isFirstEpisodeEver = false,
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

  // Phase 1: Generate intro first so its theme can inform the rest of the newsletter
  const intro = await safeSection('Intro', () => buildIntro(week, pairs, events, memEntertainer, memAnalyst, fullEnhancedContext, episodeType, season, isFirstEpisodeEver), fallbackIntro);

  // Extract the week's narrative theme from the intro — skip if intro used a fallback (too generic to be useful)
  const introIsReal = intro.bot1_text.length > 100 && !intro.bot1_text.startsWith(`Week ${week} is in the books`);
  const introThemeSnippet = introIsReal ? (intro.bot1_text || '').split(/[.!?]/).slice(0, 2).join('. ').trim() : '';
  const continuityCtx = introThemeSnippet
    ? `\nWEEK'S NARRATIVE FRAMING: "${introThemeSnippet}..." — reference these themes if relevant; don't contradict them.`
    : '';
  const enhancedContextWithContinuity = fullEnhancedContext + continuityCtx;

  // Phase 2: Generate all remaining sections (queued serially by the LLM cascade)
  const [waiverItems, tradeItems, spotlight, finalWord, recaps, blurt] = await Promise.all([
    excludeSections.has('WaiversAndFA') ? Promise.resolve([]) : safeSection('WaiversAndFA', () => buildWaiverItems(events, { memEntertainer, memAnalyst, season }), []),
    excludeSections.has('Trades') ? Promise.resolve([]) : safeSection('Trades', () => buildTradeItems(events, memEntertainer, memAnalyst, enhancedContextWithContinuity), []),
    excludeSections.has('SpotlightTeam') ? Promise.resolve(null) : safeSection('Spotlight', () => buildSpotlight(pairs, memEntertainer, memAnalyst, enhancedContextWithContinuity, week), null),
    safeSection('FinalWord', () => buildFinalWord(week, episodeType, memEntertainer, memAnalyst, enhancedContextWithContinuity), fallbackFinalWord),
    excludeSections.has('MatchupRecaps') ? Promise.resolve([]) : safeSection('Recaps', () => buildRecaps(pairs, memEntertainer, memAnalyst, week, enhancedContextWithContinuity, qualityReport, pushbackCollector), []),
    excludeSections.has('Blurt') ? Promise.resolve({ bot1: null, bot2: null } as BlurtSection) : safeSection('Blurt', () => buildBlurt(week, memEntertainer, memAnalyst, enhancedContextWithContinuity, pairs), { bot1: null, bot2: null } as BlurtSection),
  ]);

  console.log(`[Compose] Core sections generated via LLM (with error recovery)`);

  // Auto-grade any outstanding hot takes based on this week's results
  autoGradeHotTakes(memEntertainer, pairs);
  autoGradeHotTakes(memAnalyst, pairs);

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
  // Gate with ENABLE_EXTRA_LLM_FEATURES=true to skip ~20 extra LLM calls that push generation past the Vercel timeout.
  // Default is disabled. Set ENABLE_EXTRA_LLM_FEATURES=true in .env.local to re-enable for local deep runs.
  const extraFeaturesEnabled = process.env.ENABLE_EXTRA_LLM_FEATURES === 'true';
  console.log(`[Compose] Extra LLM features: ${extraFeaturesEnabled ? 'ENABLED (debates/hot-takes/awards/what-ifs/etc.)' : 'SKIPPED (set ENABLE_EXTRA_LLM_FEATURES=true to enable)'}`);

  let llmFeatures: LLMFeaturesOutput | null = null;
  if (extraFeaturesEnabled && episodeType === 'regular' && pairs.length > 0) {
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
    console.log(`[Compose] Building pre-draft sections (trades + mock draft)...`);

    // Offseason trade analysis (since February — from context, no live events needed)
    const preDraftTrades = await safeSection(
      'PreDraftTrades',
      () => buildPreDraftTrades(enhancedContextWithContinuity, memEntertainer, memAnalyst, season),
      [] as TradeItem[]
    );
    if (preDraftTrades.length > 0) {
      sections.push({ type: 'Trades', data: preDraftTrades });
    }

    // Pick-by-pick mock draft (Rounds 1-2, both bots, interleaved)
    const mockDraft = await safeSection(
      'MockDraft',
      () => buildMockDraft(draftData ?? null, memEntertainer, memAnalyst, season, enhancedContextWithContinuity, preDraftSlots, preDraftRound2Slots, isFirstEpisodeEver),
      null as MockDraftSection | null
    );
    if (mockDraft) {
      sections.push({ type: 'MockDraft', data: mockDraft });
    }

    console.log(`[Compose] Pre-draft sections built (${preDraftTrades.length} trade items, ${mockDraft?.picks.length ?? 0} mock picks)`);
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

  if (forecast && forecast.picks.length > 0 && !excludeSections.has('Forecast')) {
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

    // Persist hot take grades back to memory so they don't recur next week
    for (const cb of llmFeatures.callbacks) {
      if (cb.type === 'hot_take_followup' && previousHotTakes) {
        const take = previousHotTakes.find(t => t.week === cb.original_week && t.graded);
        if (take) {
          const mem = take.bot === 'entertainer' ? memEntertainer : memAnalyst;
          gradeHotTake(mem, cb.original_week, cb.current_status.startsWith('✓'), cb.bot_reaction);
        }
      }
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
