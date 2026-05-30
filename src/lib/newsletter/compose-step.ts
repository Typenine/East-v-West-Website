/**
 * Compose Step Module
 *
 * Exposes individual section generators so the /api/newsletter/generate-step
 * endpoint can run one section at a time, keeping each Vercel request well under
 * the 300-second function timeout.
 *
 * Each exported function generates exactly ONE newsletter section and returns its
 * typed data. The step endpoint stores that data in the staged newsletter DB record
 * and calls the appropriate function on the next request.
 *
 * Assembly: assembleNewsletterFromSections() re-combines all stored section data
 * into a full Newsletter object, which can then be saved and rendered to HTML.
 */

import type {
  Newsletter,
  NewsletterSection,
  BotMemory,
  IntroSection,
  FinalWordSection,
  RecapItem,
  WaiverItem,
  TradeItem,
  SpotlightSection,
  BlurtSection,
  PowerRankingsSection,
  MockDraftSection,
  MockDraftPick,
  DraftGradesSection,
  SeasonPreviewSection,
  ForecastData,
  EpisodeType,
} from './types';
import type { DerivedData } from './types';
import type { LeagueDraftData } from './sleeper-ingest';
import { generateSection } from './llm/groq';
import { buildStaticLeagueContext, LEAGUE_IDENTITY } from './league-knowledge';
import { getEpisodeConfig } from './episodes';
import { makeForecast, type ForecastRecords } from './forecast';

// ============ Step catalog ============

/**
 * Canonical ordered list of generation steps per episode type.
 * Each step corresponds to exactly one call to generateNewsletterSection().
 *
 * @param draftTeams   For post_draft: ordered list of team names from draft data.
 *                     Length determines the number of DraftGrade_N steps.
 *                     Pass undefined to fall back to teamCount.
 */
/**
 * Returns the subset of generation steps that are REQUIRED for finalization.
 * A failed or missing required step blocks finalization and must be retried.
 * Steps not in this list are optional — failure is recorded but does not block.
 */
export function getRequiredSteps(
  episodeType: string,
  matchupCount: number,
  _tradeCount: number,
  draftTeamsOrCount?: string[] | number,
): string[] {
  const required: string[] = ['Intro', 'FinalWord'];

  if (episodeType === 'preseason') {
    required.push('PowerRankings_Preseason', 'SeasonPreview');
  }

  if (episodeType === 'regular') {
    required.push('PowerRankings', 'Forecast');
    for (let i = 0; i < matchupCount; i++) required.push(`Recap_${i}`);
  }

  if (['trade_deadline', 'playoffs_preview', 'playoffs_round', 'championship', 'season_finale'].includes(episodeType)) {
    for (let i = 0; i < matchupCount; i++) required.push(`Recap_${i}`);
    if (['trade_deadline', 'playoffs_preview', 'playoffs_round'].includes(episodeType)) {
      required.push('Forecast');
    }
  }

  if (episodeType === 'pre_draft') {
    // PreDraftTrades is optional (trades may not exist yet)
    required.push('MockDraft_R1_Mason', 'MockDraft_R1_Westy', 'MockDraft_R2_Mason', 'MockDraft_R2_Westy');
  }

  if (episodeType === 'post_draft') {
    const count = Array.isArray(draftTeamsOrCount)
      ? draftTeamsOrCount.length
      : (typeof draftTeamsOrCount === 'number' ? draftTeamsOrCount : 12);
    for (let i = 0; i < count; i++) required.push(`DraftGrade_${i}`);
    required.push('DraftGrades_Summary');
  }

  return required;
}

export function getGenerationSteps(
  episodeType: string,
  matchupCount: number,
  tradeCount: number,
  draftTeamsOrCount?: string[] | number,
): string[] {
  const steps: string[] = ['Intro'];

  if (episodeType === 'preseason') {
    steps.push('PowerRankings_Preseason', 'SeasonPreview');
  }

  const isRegularOrPlayoff = ['regular', 'trade_deadline', 'playoffs_preview', 'playoffs_round', 'championship', 'season_finale'].includes(episodeType);
  if (isRegularOrPlayoff) {
    if (episodeType === 'regular') steps.push('PowerRankings');
    for (let i = 0; i < matchupCount; i++) steps.push(`Recap_${i}`);
    steps.push('WaiversAndFA');
    for (let t = 0; t < tradeCount; t++) steps.push(`Trade_${t}`);
    steps.push('Spotlight', 'Blurt');
    // Forecast step for episodes that normally include next-week predictions
    if (['regular', 'trade_deadline', 'playoffs_preview', 'playoffs_round'].includes(episodeType)) {
      steps.push('Forecast');
    }
  }

  if (episodeType === 'pre_draft') {
    steps.push('PreDraftTrades', 'MockDraft_R1_Mason', 'MockDraft_R1_Westy', 'MockDraft_R2_Mason', 'MockDraft_R2_Westy');
  }

  if (episodeType === 'post_draft') {
    const count = Array.isArray(draftTeamsOrCount)
      ? draftTeamsOrCount.length
      : (typeof draftTeamsOrCount === 'number' ? draftTeamsOrCount : 12);
    for (let i = 0; i < count; i++) steps.push(`DraftGrade_${i}`);
    steps.push('DraftGrades_Summary');
  }

  if (episodeType === 'offseason') {
    // No extra sections — just Intro + FinalWord
  }

  steps.push('FinalWord');
  // SocialSummary comes after FinalWord so it can summarise the full newsletter
  if (isRegularOrPlayoff) steps.push('SocialSummary');
  return steps;
}

// ============ Shared input type ============

export interface StepInput {
  sectionName: string;
  week: number;
  season: number;
  episodeType: string;
  derived: DerivedData;
  memEntertainer: BotMemory;
  memAnalyst: BotMemory;
  enhancedContext: string;
  preDraftSlots?: Array<{ slot: number; team: string }>;
  preDraftRound2Slots?: Array<{ slot: number; team: string }>;
  isFirstEpisodeEver?: boolean;
  draftData?: LeagueDraftData | null;
  /** For post_draft: ordered list of team names extracted from draftData.picks at job start. */
  draftTeams?: string[];
  // For mock draft R2, needs R1 picks from a previous step
  mockDraftR1Mason?: Array<{ slot: number; team: string; player: string; position: string; analysis: string }>;
  mockDraftR1Westy?: Array<{ slot: number; team: string; player: string; position: string; analysis: string }>;
  /** Graded forecast records from job start — passed into Forecast step so picks embed the running W/L record. */
  forecastRecords?: ForecastRecords | null;
  /**
   * For pre_draft: eligible prospect pool loaded from DB at job start.
   * Mock draft steps MUST use only players from this list. If null/empty, mock draft step fails hard.
   */
  prospectPool?: Array<{ name: string; pos: string; rank: number | null }> | null;
  /**
   * Compact summary of already-completed section outputs (scores, intros, spotlights) for
   * cross-referencing. Lets FinalWord, Blurt, and Spotlight avoid repeating earlier content.
   */
  priorSectionSummary?: string;
  /**
   * For pre_draft: one-line roster composition per team (positions + top players).
   * Lets mock draft bots reason about team needs when making picks.
   */
  rosterContext?: string;
  /**
   * Full dynasty rankings loaded from R2 at job start. Used for per-player rank lookups
   * in waiver and trade sections without bloating the base context string.
   */
  dynastyRankings?: Array<{ name: string; pos: string; nfl: string; rank: number }>;
}

export type StepResult =
  | { ok: true; sectionName: string; data: unknown }
  | { ok: false; sectionName: string; error: string };

// ============ Individual section generators ============

async function genIntro(input: StepInput): Promise<IntroSection> {
  const leagueKnowledge = buildStaticLeagueContext();
  const { week, season, episodeType, derived, memEntertainer, memAnalyst, enhancedContext, isFirstEpisodeEver } = input;
  const pairs = derived.matchup_pairs || [];
  const events = derived.events_scored || [];

  if (episodeType === 'pre_draft') {
    const debutBlock = isFirstEpisodeEver
      ? `IMPORTANT: THIS IS YOUR FIRST EVER EPISODE appearing to the East v. West league.
Mason Reed and Westy are brand new to this league — the members have never heard from you before.
Introduce yourselves briefly, welcome the league, then move straight into draft content.`
      : `You and your co-host are well-established voices for the East v. West league. Reference your history with this league where relevant.`;

    const context = `${leagueKnowledge}\n\n---\n\nEPISODE TYPE: PRE-DRAFT PREVIEW - ${season} ROOKIE DRAFT\n\n${debutBlock}\n\n${enhancedContext}`;

    // Mason goes first — short and punchy, sets up what HE wants to talk about
    const masonConstraint = isFirstEpisodeEver
      ? `Write 2-3 short paragraphs (2-4 sentences each). Introduce yourself to the East v. West league — make it quick, then pivot straight to what excites you about this draft. Name 1-2 specific prospects and why. Drop a bold take about which team is set up to win the draft. Speak directly to Westy as if you're on air together.`
      : `Write 2-3 short paragraphs (2-4 sentences each). Open the draft conversation — what's the storyline you're most locked in on right now? Name 1-2 prospects or teams you're hyped about and WHY specifically. End with a question or provocation for Westy. FACTUAL RULE: Only reference events, records, or trades explicitly stated in the context above.`;

    const bot1_text = await generateSection({
      persona: 'entertainer',
      sectionType: 'Pre-Draft Preview Intro',
      context,
      constraints: masonConstraint,
      maxTokens: 600,
      episodeType: 'pre_draft',
      validate: (t) => t.length >= 200,
    });

    // Westy responds to Mason — he sees exactly what Mason said and picks up the thread
    const westyContext = `${context}\n\n---\nMason Reed just opened the show with this:\n"${bot1_text}"\n\nNow it's your turn to respond.`;
    const westyConstraint = isFirstEpisodeEver
      ? `Write 2-3 short paragraphs (2-4 sentences each). Introduce yourself briefly — your analytical background — then respond directly to what Mason said. Push back on something or add the data angle he's missing. Do NOT re-introduce the draft or the episode — Mason already did that. Speak as if you're sitting across from him.`
      : `Write 2-3 short paragraphs (2-4 sentences each). Respond directly to Mason's take — pick it up from where he left off. Agree with something and push back on something else. Add the analytical angle: what do the numbers say about the prospects or teams he mentioned? Do NOT re-introduce topics Mason already covered. Do NOT reuse his phrases or examples. FACTUAL RULE: Only reference events, records, or trades explicitly stated in the context above.`;

    const bot2_text = await generateSection({
      persona: 'analyst',
      sectionType: 'Pre-Draft Preview Intro',
      context: westyContext,
      constraints: westyConstraint,
      maxTokens: 600,
      episodeType: 'pre_draft',
      validate: (t) => t.length >= 200,
    });

    return { bot1_text, bot2_text };
  }

  const numGames = pairs.length;
  const biggest = pairs[0] || null;
  const closest = pairs.reduce<typeof pairs[0] | null>((a, b) => (!a || b.margin < a.margin ? b : a), null);
  const trades = events.filter(e => e.type === 'trade').length;
  const waivers = events.filter(e => e.type === 'waiver' || e.type === 'fa_add').length;

  const context = `${leagueKnowledge}\n\n---\n\n${enhancedContext}\n\nWeek ${week} Summary:\n- ${numGames} matchups\n- Biggest win: ${biggest ? `${biggest.winner.name} beat ${biggest.loser.name} by ${biggest.margin.toFixed(1)}` : 'N/A'}\n- Closest: ${closest ? `${closest.winner.name} edged ${closest.loser.name} by ${closest.margin.toFixed(1)}` : 'N/A'}\n- ${trades} trades, ${waivers} waiver moves`;

  // Sequential: Mason opens, Westy responds to what Mason actually said
  const bot1_text = await generateSection({
    persona: 'entertainer',
    sectionType: 'Intro',
    context,
    constraints: `Write 2-3 short paragraphs (2-4 sentences each). Lead with the biggest storyline from this week and your gut reaction to it. Give a SPECIFIC REASON for every take — not just what happened, but what it means. End with something that sets up Westy. FACTUAL RULE: Only reference events explicitly stated in the context above.`,
    maxTokens: 500,
    episodeType,
  });

  const westyContext = `${context}\n\n---\nMason Reed just opened the show with this:\n"${bot1_text}"\n\nNow it's your turn.`;
  const bot2_text = await generateSection({
    persona: 'analyst',
    sectionType: 'Intro',
    context: westyContext,
    constraints: `Write 2-3 short paragraphs (2-4 sentences each). Respond directly to Mason's take. Don't re-introduce the week — pick up where he left off. Agree on one thing, push back on one thing, and add a stat or trend that changes the picture. Do NOT reuse Mason's phrases or examples. FACTUAL RULE: Only reference stats or events explicitly stated in the context above.`,
    maxTokens: 500,
    episodeType,
  });

  return { bot1_text, bot2_text };
}

async function genFinalWord(input: StepInput): Promise<FinalWordSection> {
  const { week, episodeType, enhancedContext, priorSectionSummary } = input;
  const leagueKnowledge = buildStaticLeagueContext();

  // If we have a summary of earlier sections, inject it so FinalWord can callback to the show's narrative
  const priorCtxBlock = priorSectionSummary
    ? `\n\n--- WHAT HAPPENED IN THIS NEWSLETTER ---\n${priorSectionSummary}\n--- END SUMMARY ---`
    : '';

  const contextMap: Record<string, { ctx: string; entConstraint: string; anaConstraint: string; tokens: number }> = {
    pre_draft: {
      ctx: `The rookie draft is coming up.\n\n${enhancedContext.slice(0, 600)}`,
      entConstraint: '3-4 sentences closing the draft preview. Name one player you\'re most fired up about and give a SPECIFIC reason why. Call out one team you think is set to steal the draft and explain exactly why. FACTUAL RULE: only reference players and teams from the context provided.',
      anaConstraint: '3-4 sentences of analytical closing. Name one key strategic point about this draft class. Name one team with the best draft capital position and explain the specific reason. FACTUAL RULE: only reference facts explicitly stated in the context.',
      tokens: 600,
    },
    post_draft: {
      ctx: 'The rookie draft is complete. Sign off with final thoughts.',
      entConstraint: '3-4 sentences closing the draft recap. Name the biggest winner and give a SPECIFIC reason why their haul was good. Drop one bold take on a pick that will either look great or terrible in 2 years — and say WHY. FACTUAL RULE: only reference picks explicitly listed in the context.',
      anaConstraint: '3-4 sentences of analytical final thoughts. Name one strategy that worked and one that didn\'t — and explain specifically why. FACTUAL RULE: only reference picks explicitly listed in the context.',
      tokens: 600,
    },
    preseason: {
      ctx: 'The season is about to begin. Sign off the preseason preview.',
      entConstraint: '3-4 sentences of maximum hype. Drop your biggest bold prediction, tease one team you\'re all-in on.',
      anaConstraint: '3-4 sentences of measured analytical closing. Cover the 2-3 most important things to watch, flag a team flying under the radar.',
      tokens: 600,
    },
  };
  const cfg = contextMap[episodeType] ?? {
    // Use actual week context — not just static league knowledge
    ctx: `Week ${week} is in the books.\n\n${enhancedContext.slice(0, 1200)}\n\n${leagueKnowledge}`,
    entConstraint: '3-4 sentences to close the show. Land on the ONE thing that matters most coming out of this week and give a SPECIFIC reason why it matters going forward. Leave them thinking.',
    anaConstraint: '3-4 sentences of measured closing analysis. Biggest analytical takeaway from this week — and WHY it matters for the standings or dynasty outlook.',
    tokens: 400,
  };

  // Sequential: Mason closes first, Westy responds to Mason's closing
  const bot1 = await generateSection({
    persona: 'entertainer',
    sectionType: 'Final Word',
    context: cfg.ctx + priorCtxBlock,
    constraints: cfg.entConstraint,
    maxTokens: cfg.tokens,
    episodeType,
    validate: (t) => t.length >= 100,
  });

  const westyCtx = `${cfg.ctx}\n\n---\nMason Reed just closed the show with:\n"${bot1}"\n\nNow give your final word.`;
  const bot2 = await generateSection({
    persona: 'analyst',
    sectionType: 'Final Word',
    context: westyCtx,
    constraints: cfg.anaConstraint + ' Do NOT re-state what Mason just said. Respond to it briefly or add a different angle.',
    maxTokens: cfg.tokens,
    episodeType,
    validate: (t) => t.length >= 100,
  });

  return { bot1, bot2 };
}

async function genSingleRecap(input: StepInput, matchupIndex: number): Promise<RecapItem> {
  const { week, derived, enhancedContext } = input;
  const pairs = derived.matchup_pairs || [];
  const p = pairs[matchupIndex];
  if (!p) throw new Error(`No matchup at index ${matchupIndex}`);

  const winnerPlayers = p.winner.topPlayers?.map(pl => `${pl.name} (${pl.points} pts)`).join(', ') || 'no player data';
  const loserPlayers  = p.loser.topPlayers?.map(pl => `${pl.name} (${pl.points} pts)`).join(', ') || 'no player data';

  const baseContext = `MATCHUP: ${p.winner.name} defeated ${p.loser.name}\nFinal: ${p.winner.points.toFixed(1)} – ${p.loser.points.toFixed(1)} (margin: ${p.margin.toFixed(1)})\n${p.winner.name} top players: ${winnerPlayers}\n${p.loser.name} top players: ${loserPlayers}\n\n${enhancedContext.slice(0, 2500)}`;

  const lineCount = week >= 17 ? 3 : p.margin <= 5 ? 3 : 2;
  const perBotTokens = week >= 17 ? 350 : p.margin <= 5 ? 300 : 250;

  // Mason speaks first — his genuine take on this specific game
  const masonRaw = await generateSection({
    persona: 'entertainer',
    sectionType: `${p.bracketLabel ?? 'Matchup'} Recap`,
    context: baseContext,
    constraints: `Write ${lineCount} sharp lines reacting to this game. Each line is a separate take — reference actual players, the final score, and the margin. No dialogue labels needed. Be specific about WHY ${p.winner.name} won and what it means. FACTUAL RULE: only reference players and facts from the context above.`,
    maxTokens: perBotTokens,
  }).catch(() => '');

  // Westy responds — he reads what Mason said and adds the analytical counter
  const westyContext = `${baseContext}\n\n--- Mason Reed just said about this game ---\n${masonRaw || '(no comment yet)'}\n---`;
  const westyRaw = await generateSection({
    persona: 'analyst',
    sectionType: `${p.bracketLabel ?? 'Matchup'} Recap`,
    context: westyContext,
    constraints: `Write ${lineCount} analytical lines responding to this game. Reference what the numbers actually show — efficiency, margin context, what ${masonRaw ? "Mason mentioned" : "the scoreline"} misses. Push back on one point or add something Mason overlooked. Be specific. FACTUAL RULE: only reference players and facts from the context above.`,
    maxTokens: perBotTokens,
  }).catch(() => '');

  // Parse each bot's lines into dialogue entries, then interleave them
  const parseLines = (raw: string, speaker: 'entertainer' | 'analyst') =>
    raw.split(/\n+/)
       .map(l => l.replace(/^\*\*|\*\*$|^[-•]\s*/g, '').trim())
       .filter(l => l.length > 12)
       .slice(0, lineCount + 1)
       .map(text => ({ speaker, text }));

  const masonLines = parseLines(masonRaw, 'entertainer');
  const westyLines = parseLines(westyRaw, 'analyst');

  type DT = { speaker: 'entertainer' | 'analyst'; text: string };
  const dialogue: DT[] = [];
  const maxLen = Math.max(masonLines.length, westyLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (masonLines[i]) dialogue.push(masonLines[i]);
    if (westyLines[i]) dialogue.push(westyLines[i]);
  }

  if (dialogue.length < 2) {
    dialogue.push({ speaker: 'entertainer', text: `${p.winner.name} takes it ${p.winner.points.toFixed(1)}-${p.loser.points.toFixed(1)}. ${p.margin > 20 ? 'Not even close.' : 'Hard-fought one.'}` });
    dialogue.push({ speaker: 'analyst',     text: `Margin of ${p.margin.toFixed(1)}. ${winnerPlayers.split(',')[0]?.split(' (')[0] ?? 'Top performer'} was the difference.` });
  }

  const bot1 = dialogue.filter(d => d.speaker === 'entertainer').map(d => d.text).join('\n\n');
  const bot2 = dialogue.filter(d => d.speaker === 'analyst').map(d => d.text).join('\n\n');

  return {
    matchup_id: p.matchup_id,
    bot1: bot1 || `${p.winner.name} wins.`,
    bot2: bot2 || `${p.winner.name} ${p.winner.points.toFixed(1)}, ${p.loser.name} ${p.loser.points.toFixed(1)}.`,
    winner: p.winner.name,
    loser: p.loser.name,
    winner_score: p.winner.points,
    loser_score: p.loser.points,
    winner_top_players: p.winner.topPlayers,
    loser_top_players: p.loser.topPlayers,
    bracketLabel: p.bracketLabel,
    dialogue,
  };
}

async function genWaivers(input: StepInput): Promise<WaiverItem[]> {
  // Include high/medium coverage moves, or any bid >= $5; exclude low-coverage $0 pickups
  const events = (input.derived.events_scored || []).filter(e => {
    if (e.type !== 'waiver' && e.type !== 'fa_add') return false;
    if (e.coverage_level === 'high' || e.coverage_level === 'moderate') return true;
    if ((e.faab_spent ?? 0) >= 5) return true;
    return false;
  });
  if (events.length === 0) return [];

  // Build dynasty rank lookup from stored rankings for per-player annotation
  const dynLookup = (() => {
    const rankings = input.dynastyRankings;
    if (!rankings || rankings.length === 0) return null;
    const byFull = new Map<string, number>();
    const byLast = new Map<string, number>();
    for (const r of rankings) {
      const full = r.name.toLowerCase().trim();
      byFull.set(full, r.rank);
      const last = full.split(' ').pop() ?? '';
      if (last.length >= 4 && !byLast.has(last)) byLast.set(last, r.rank);
    }
    return { byFull, byLast };
  })();

  const getDynastyRank = (name: string | undefined): string => {
    if (!name || !dynLookup) return '';
    const lower = name.toLowerCase().trim();
    const rank = dynLookup.byFull.get(lower) ?? (() => {
      const last = lower.split(' ').pop() ?? '';
      return last.length >= 4 ? dynLookup.byLast.get(last) : undefined;
    })();
    return rank != null ? ` [Dynasty #${rank}]` : '';
  };

  const numberedContext = events.map((e, i) => {
    const faab = e.faab_spent != null ? ` ($${e.faab_spent} FAAB)` : '';
    const dynRank = getDynastyRank(e.player);
    return `${i + 1}. ${e.team} added ${e.player || 'unknown'}${faab}${dynRank}`;
  }).join('\n');

  const splitByNumber = (text: string): string[] =>
    text.split(/\n?(?=\d+\.)/g).filter(p => p.trim()).map(p => p.replace(/^\d+\.\s*/, '').trim());

  const [entRaw, anaRaw] = await Promise.all([
    generateSection({ persona: 'entertainer', sectionType: 'Waivers', context: `Waiver moves:\n${numberedContext}`, constraints: `React to each numbered move (2-3 sentences each). Start each with its number. Be spicy — ${events.length} moves total.`, maxTokens: 600 }),
    generateSection({ persona: 'analyst',     sectionType: 'Waivers', context: `Waiver moves:\n${numberedContext}`, constraints: `Analyze each numbered move (2-3 sentences each). Start each with its number. Cover role, usage, upside — ${events.length} moves total.`, maxTokens: 600 }),
  ]);

  const entParts = splitByNumber(entRaw);
  const anaParts = splitByNumber(anaRaw);

  return events.map((e, i) => ({
    event_id: e.event_id,
    coverage_level: e.coverage_level,
    reasons: e.reasons || [],
    team: e.team,
    player: e.player,
    faab_spent: e.faab_spent,
    bot1: entParts[i] || `${e.team} picks up ${e.player || 'a player'}.`,
    bot2: anaParts[i] || `${e.team} adds ${e.player || 'a player'}. Monitor usage.`,
  }));
}

async function genSingleTradeItem(input: StepInput, tradeIndex: number): Promise<TradeItem | null> {
  const tradeEvents = (input.derived.events_scored || []).filter(e => e.type === 'trade');
  const e = tradeEvents[tradeIndex];
  if (!e) return null;

  // Build dynasty rank lookup so player assets can be annotated inline
  const tradeDynLookup = (() => {
    const rankings = input.dynastyRankings;
    if (!rankings || rankings.length === 0) return null;
    const byFull = new Map<string, number>();
    const byLast = new Map<string, number>();
    for (const r of rankings) {
      const full = r.name.toLowerCase().trim();
      byFull.set(full, r.rank);
      const last = full.split(' ').pop() ?? '';
      if (last.length >= 4 && !byLast.has(last)) byLast.set(last, r.rank);
    }
    return { byFull, byLast };
  })();

  const annotateTradePlayers = (assets: string[] | undefined): string => {
    if (!assets || assets.length === 0) return 'none';
    return assets.map(asset => {
      if (!tradeDynLookup) return asset;
      const lower = asset.toLowerCase().trim();
      const rank = tradeDynLookup.byFull.get(lower) ?? (() => {
        const last = lower.split(' ').pop() ?? '';
        return last.length >= 4 ? tradeDynLookup.byLast.get(last) : undefined;
      })();
      return rank != null ? `${asset} [Dynasty #${rank}]` : asset;
    }).join(', ');
  };

  const byTeam = e.details?.by_team || {};
  const parties = e.parties || Object.keys(byTeam);
  let tradeBreakdown = '';
  for (const team of parties) {
    const a = byTeam[team];
    if (a) tradeBreakdown += `\n${team}: GETS ${annotateTradePlayers(a.gets)} | GIVES ${annotateTradePlayers(a.gives)}`;
  }
  const tradeContext = e.details?.headline
    ? `${parties.join(' ↔ ')}: ${e.details.headline}${tradeBreakdown}`
    : `Trade between ${parties.join(' and ')}${tradeBreakdown}`;

  const extractGrade = (text: string): string => {
    const m = text.match(/\bgrade[:\s]+([A-F][+-]?)\b/i)
      || text.match(/\bgiv(?:e|ing)\s+(?:this\s+)?(?:a\s+)?([A-F][+-]?)\b/i)
      || text.match(/\b([A-F][+-]?)\s*[-–]\s*(?:grade|trade|deal)\b/i);
    if (m) return m[1].toUpperCase();
    for (const line of text.split('\n')) {
      const solo = line.trim().match(/^([A-F][+-]?)\.?$/);
      if (solo) return solo[1].toUpperCase();
    }
    const end = text.trim().match(/[.!]\s*([A-F][+-]?)\.?\s*$/);
    return end ? end[1].toUpperCase() : 'B';
  };

  const analysis: TradeItem['analysis'] = {};
  for (const party of parties) {
    const a = byTeam[party];
    const sideCtx = `Trade for ${party}:\n  RECEIVED: ${annotateTradePlayers(a?.gets)}\n  GAVE UP: ${annotateTradePlayers(a?.gives)}\n\nFull trade breakdown:\n${tradeContext}`;
    const [entR, anaR] = await Promise.all([
      generateSection({ persona: 'entertainer', sectionType: 'Trade Grade', context: sideCtx, constraints: `Grade this trade FOR ${party} specifically (A+ to F). Start with the letter grade. 3-4 sentences on what ${party} got and what they gave up. Give a SPECIFIC reason for the grade — were they the winner or the loser and why? FACTUAL RULE: only reference assets listed in RECEIVED and GAVE UP above. Do not invent players or picks.`, maxTokens: 350 }),
      generateSection({ persona: 'analyst',     sectionType: 'Trade Grade', context: sideCtx, constraints: `Grade this trade FOR ${party} specifically (A+ to F). Start with the letter grade. 3-4 sentences analyzing the value exchange — what did ${party} receive vs. what they surrendered, and is the dynasty cost worth it? FACTUAL RULE: only reference assets listed in RECEIVED and GAVE UP above. Do not invent players or picks.`, maxTokens: 350 }),
    ]);
    analysis[party] = {
      grade: extractGrade(entR),
      entertainer_grade: extractGrade(entR),
      analyst_grade: extractGrade(anaR),
      deltaText: `${party}'s side`,
      entertainer_paragraph: entR,
      analyst_paragraph: anaR,
    };
  }

  return { event_id: e.event_id, coverage_level: e.coverage_level, reasons: e.reasons || [], context: tradeContext, teams: e.details?.by_team || null, analysis };
}

async function genSpotlight(input: StepInput): Promise<SpotlightSection | null> {
  const pairs = input.derived.matchup_pairs || [];
  if (!pairs.length) return null;
  const p = pairs.reduce((best, curr) => curr.winner.points > best.winner.points ? curr : best, pairs[0]);

  const priorBlock = input.priorSectionSummary
    ? `\n\n--- ALREADY COVERED IN THIS NEWSLETTER ---\n${input.priorSectionSummary}\n(Do NOT repeat these storylines — the Spotlight should add a new angle on why ${p.winner.name} dominated)`
    : '';

  const context = `Team of the Week: ${p.winner.name}\n- Beat ${p.loser.name} by ${p.margin.toFixed(1)}\n- Scored ${p.winner.points.toFixed(1)} pts\n${input.enhancedContext.slice(0, 2000)}${priorBlock}`;
  const [bot1, bot2] = await Promise.all([
    generateSection({ persona: 'entertainer', sectionType: 'Spotlight', context, constraints: 'Write 3-4 paragraphs spotlighting this team. Hype them up, reference which players came through, what it means for their season. FACTUAL RULE: only reference players and stats from the context above.', maxTokens: 500 }),
    generateSection({ persona: 'analyst',     sectionType: 'Spotlight', context, constraints: 'Write 3-4 paragraphs analytically dissecting this performance. Stats, sustainability, playoff trajectory. FACTUAL RULE: only reference players and stats from the context above.', maxTokens: 500 }),
  ]);
  return { team: p.winner.name, bot1, bot2 };
}

async function genBlurt(input: StepInput): Promise<BlurtSection> {
  const pairs = input.derived.matchup_pairs || [];
  const weekFacts: string[] = [];
  if (pairs.length > 0) {
    const top = [...pairs].sort((a, b) => b.winner.points - a.winner.points)[0];
    weekFacts.push(`Top scorer: ${top.winner.name} with ${top.winner.points.toFixed(1)} pts`);
    const biggest = [...pairs].sort((a, b) => b.margin - a.margin)[0];
    weekFacts.push(`Biggest win: ${biggest.winner.name} def. ${biggest.loser.name} by ${biggest.margin.toFixed(1)}`);
  }

  const priorBlock = input.priorSectionSummary
    ? `\n\n--- ALREADY COVERED THIS WEEK ---\n${input.priorSectionSummary}\n(Your blurt MUST take a fresh angle — don't repeat anything listed above)`
    : '';

  const ctx = weekFacts.join('\n') + '\n\n' + input.enhancedContext.slice(0, 500) + priorBlock;

  // Sequential: Mason first, Westy responds with a different angle
  const bot1 = await generateSection({
    persona: 'entertainer',
    sectionType: 'Blurt',
    context: ctx,
    constraints: 'One sharp 2-3 sentence hot take — a bold observation or team you can\'t stop thinking about. No speaker label. Pick something NOT already mentioned above.',
    maxTokens: 150,
  }).then(r => r.trim().replace(/^(?:entertainer|the entertainer|mason|mason reed)[:\s]+/i, '') || null).catch(() => null);

  const westyCtx = `${ctx}\n\n--- Mason Reed's aside ---\n"${bot1 ?? '(nothing yet)'}"\n(Your blurt must be a DIFFERENT observation — not a response to Mason, just your own angle)`;
  const bot2 = await generateSection({
    persona: 'analyst',
    sectionType: 'Blurt',
    context: westyCtx,
    constraints: 'One sharp 2-3 sentence data observation or surprising trend. No speaker label. Must be a completely different angle from what Mason said.',
    maxTokens: 150,
  }).then(r => r.trim().replace(/^(?:analyst|the analyst|westy|trent)[:\s]+/i, '') || null).catch(() => null);

  return { bot1: bot1 ?? null, bot2: bot2 ?? null };
}

// Structured JSON power rankings — more reliable than regex parsing
async function genPowerRankings(input: StepInput, preseason = false): Promise<PowerRankingsSection> {
  const leagueKnowledge = buildStaticLeagueContext();

  // Build explicit standings table from matchup pairs so the LLM has concrete data to rank from
  const standingsBlock = (() => {
    const pairs = input.derived.matchup_pairs || [];
    if (pairs.length === 0) return '';
    const allTeams = new Map<string, { pts: number }>();
    for (const p of pairs) {
      allTeams.set(p.winner.name, { pts: p.winner.points });
      allTeams.set(p.loser.name, { pts: p.loser.points });
    }
    const lines = [...allTeams.entries()].map(([name, d]) => `  ${name}: ${d.pts.toFixed(1)} pts this week`);
    return `\n=== WEEK ${input.week} SCORES (use these to inform rankings) ===\n${lines.join('\n')}\n=== END SCORES ===\n`;
  })();

  const ctx = `${leagueKnowledge}\n\n${preseason ? 'PRESEASON ' : ''}POWER RANKINGS — ${input.season}\n${standingsBlock}\n${input.enhancedContext.slice(0, 4000)}`;

  const JSON_FORMAT = `Return ONLY a JSON array (no markdown fences, no other text) of exactly 12 objects:
[{"rank":1,"team":"TeamName","blurb":"2-3 sentence take"},...]
Ranks 1–12, rank 1 = best team. Use exact team names from the league context.`;

  const parseRankings = (raw: string): Array<{ rank: number; team: string; blurb: string }> => {
    try {
      const clean = raw.trim().replace(/^```json?\n?|\n?```$/g, '');
      const parsed = JSON.parse(clean) as Array<{ rank?: number; team?: string; blurb?: string }>;
      if (Array.isArray(parsed) && parsed.length >= 10) {
        return parsed.map((r, i) => ({ rank: Number(r.rank ?? i + 1), team: String(r.team ?? `Team ${i + 1}`), blurb: String(r.blurb ?? '') }));
      }
    } catch { /* fall through to regex */ }
    // Regex fallback
    const lines = raw.split('\n').filter(l => l.trim() && /^\d+\./.test(l.trim()));
    return lines.slice(0, 12).map((line, i) => {
      const m = line.match(/^\d+\.\s*([^-–]+)[-–]\s*(.+)/);
      return { rank: i + 1, team: m ? m[1].trim() : `Team ${i + 1}`, blurb: m ? m[2].trim() : line.trim() };
    });
  };

  const [entRaw, anaRaw] = await Promise.all([
    generateSection({ persona: 'entertainer', sectionType: 'Weekly Power Rankings', context: ctx, constraints: `Rank all 12 teams 1–12 based on current performance, momentum, and your gut feel.\n${JSON_FORMAT}`, maxTokens: 1200 }),
    generateSection({ persona: 'analyst',     sectionType: 'Weekly Power Rankings', context: ctx, constraints: `Rank all 12 teams 1–12 based on points-per-game, roster construction, and efficiency.\n${JSON_FORMAT}`, maxTokens: 1200 }),
  ]);

  const entList = parseRankings(entRaw);
  const anaList = parseRankings(anaRaw);

  const [bot1_intro, bot2_intro] = await Promise.all([
    generateSection({ persona: 'entertainer', sectionType: 'Power Rankings Intro', context: ctx, constraints: `Write 2-3 sentences introducing your ${preseason ? 'preseason' : `Week ${input.week}`} power rankings. Be bold.`, maxTokens: 300 }),
    generateSection({ persona: 'analyst',     sectionType: 'Power Rankings Intro', context: ctx, constraints: `Write 2-3 sentences introducing your ${preseason ? 'preseason' : `Week ${input.week}`} power rankings. Reference key trends.`, maxTokens: 300 }),
  ]);

  const rankings: PowerRankingsSection['rankings'] = entList.map(ent => {
    const ana = anaList.find(a => a.team.toLowerCase() === ent.team.toLowerCase());
    return { rank: ent.rank, team: ent.team, record: '', pointsFor: 0, trend: 'steady' as const, bot1_blurb: ent.blurb, bot2_blurb: ana?.blurb || 'Solid team.' };
  });

  return { rankings, bot1_intro, bot2_intro };
}

// ============ Mock draft prospect validation & repair ============

type ProspectEntry = { name: string; pos: string; rank: number | null };
type MockPick = { slot: number; team: string; player: string; position: string; analysis: string };

function normalizePlayerName(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

function isInProspectPool(playerName: string, pool: ProspectEntry[]): boolean {
  const pNorm = normalizePlayerName(playerName);
  const pLast = pNorm.split(' ').pop() ?? '';
  return pool.some(p => {
    const pl = normalizePlayerName(p.name);
    const poolLast = pl.split(' ').pop() ?? '';
    return pl === pNorm || (pLast.length >= 4 && poolLast === pLast);
  });
}

function validateMockDraftPicks(
  picks: MockPick[],
  pool: ProspectEntry[],
  expectedSlots: Array<{ slot: number; team: string }>,
  round: number,
): { invalidPlayers: string[]; orderMismatches: string[]; withinRoundDupes: string[] } {
  const invalidPlayers: string[] = [];
  const orderMismatches: string[] = [];
  const withinRoundDupes: string[] = [];
  const seenNormalized = new Map<string, number>(); // normalized name → first slot

  for (const pick of picks) {
    if (!isInProspectPool(pick.player, pool)) {
      invalidPlayers.push(`${pick.player} (R${round} slot ${pick.slot})`);
    }
    const expected = expectedSlots.find(s => s.slot === pick.slot);
    if (expected && pick.team && normalizePlayerName(pick.team) !== normalizePlayerName(expected.team)) {
      orderMismatches.push(`Slot ${pick.slot}: expected "${expected.team}", got "${pick.team}"`);
    }
    // Within-round duplicate check
    const norm = normalizePlayerName(pick.player);
    const lastName = norm.split(' ').pop() ?? '';
    const key = lastName.length >= 4 ? lastName : norm;
    if (seenNormalized.has(key)) {
      withinRoundDupes.push(`${pick.player} (R${round} slot ${pick.slot}, also slot ${seenNormalized.get(key)})`);
    } else {
      seenNormalized.set(key, pick.slot);
    }
  }
  return { invalidPlayers, orderMismatches, withinRoundDupes };
}

async function repairMockDraftRound(
  round: number,
  originalPicks: MockPick[],
  invalidPlayerStrings: string[],
  pool: ProspectEntry[],
  slots: Array<{ slot: number; team: string }>,
  alreadyPickedPlayers: string[],
  persona: 'entertainer' | 'analyst',
): Promise<{ picks: MockPick[]; raw: string } | null> {
  console.log(`[ComposeStep] MockDraft R${round} repair started (${persona}) — fixing ${invalidPlayerStrings.length} invalid picks`);

  const availablePool = pool.filter(p =>
    !alreadyPickedPlayers.some(used =>
      normalizePlayerName(used) === normalizePlayerName(p.name) ||
      (normalizePlayerName(used).split(' ').pop() ?? '') === (normalizePlayerName(p.name).split(' ').pop() ?? '')
    )
  );
  const poolText = availablePool.map((p, i) =>
    `${i + 1}. ${p.name} (${p.pos}${p.rank !== null ? `, dynasty rank #${p.rank}` : ', unranked'})`
  ).join('\n');
  const orderText = slots.map((s, i) => `Pick ${round}.${String(i + 1).padStart(2, '0')}: ${s.team}`).join('\n');

  // Mark picks as invalid if: (a) not in pool, OR (b) same player already seen (within-round dupe)
  // The second occurrence of a duplicate must be in invalidPicks so the repair replaces it
  const seenPlayerKeys = new Map<string, number>(); // normalized last-name key → first slot
  const markedInvalidIdx = new Set<number>();
  for (let i = 0; i < originalPicks.length; i++) {
    const p = originalPicks[i];
    const norm = normalizePlayerName(p.player);
    const last = norm.split(' ').pop() ?? norm;
    const key = last.length >= 4 ? last : norm;
    if (!isInProspectPool(p.player, pool) || seenPlayerKeys.has(key)) {
      markedInvalidIdx.add(i);
    } else {
      seenPlayerKeys.set(key, p.slot);
    }
  }
  const invalidPicks = originalPicks.filter((_, i) => markedInvalidIdx.has(i));
  const validPicks   = originalPicks.filter((_, i) => !markedInvalidIdx.has(i));

  const repairContext = `MOCK DRAFT REPAIR — ROUND ${round}

PICKS WITH INVALID PLAYERS (not in the ${new Date().getFullYear()} NFL draft class — must be replaced):
${invalidPicks.map(p => `  Pick ${round}.${String(p.slot).padStart(2, '0')} | ${p.team} | ${p.player} ← INVALID`).join('\n')}

VALID PICKS TO KEEP UNCHANGED:
${validPicks.length > 0 ? validPicks.map(p => `  Pick ${round}.${String(p.slot).padStart(2, '0')} | ${p.team} | ${p.player} | ${p.position}`).join('\n') : '(none — all picks need replacing)'}

ELIGIBLE PLAYERS FOR ROUND ${round} (ONLY these are allowed):
${poolText}

EXACT DRAFT ORDER — ROUND ${round}:
${orderText}`;

  const repairConstraint = `Replace every INVALID pick with a player from the ELIGIBLE PLAYERS list above.
Keep all VALID picks exactly as listed — do not change them.
DO NOT pick the same player twice. Every pick must use a DIFFERENT player from the eligible list.
DO NOT use any player not in the ELIGIBLE list above.
Output ALL ${slots.length} picks in this exact format:
PICK ${round}.01 | [Exact Team] | [Player from eligible list] | [Position]
[3-4 sentence analysis]
(continue through PICK ${round}.${String(slots.length).padStart(2, '0')})`;

  try {
    const repairedRaw = await generateSection({
      persona,
      sectionType: `Mock Draft - Round ${round} Repair`,
      context: repairContext,
      constraints: repairConstraint,
      maxTokens: 6000,
      episodeType: 'pre_draft',
      validate: (t) => (t.replace(/\*\*/g, '').match(/\bPICK\s+\d+\.\d+\s*\|/gim) || []).length >= Math.max(4, Math.floor(slots.length * 0.4)),
    });

    const repairedPicks = parseMockDraftPicksLocal(repairedRaw);
    const { invalidPlayers: stillInvalid, withinRoundDupes: stillDupes } = validateMockDraftPicks(repairedPicks, pool, slots, round);
    const stillBroken = [...stillInvalid, ...stillDupes];

    if (stillBroken.length > 0) {
      console.warn(`[ComposeStep] MockDraft R${round} repair FAILED — still broken: ${stillBroken.join(', ')}`);
      return null;
    }

    console.log(`[ComposeStep] MockDraft R${round} repair SUCCEEDED — ${repairedPicks.length} valid picks`);
    return { picks: repairedPicks, raw: repairedRaw };
  } catch (e) {
    console.error(`[ComposeStep] MockDraft R${round} repair threw:`, e);
    return null;
  }
}

// Pre-draft mock draft sub-steps — each R1/R2 bot is its own step
function parseMockDraftPicksLocal(
  raw: string,
): Array<{ slot: number; team: string; player: string; position: string; analysis: string }> {
  const result: Array<{ slot: number; team: string; player: string; position: string; analysis: string }> = [];
  const lines = raw.split('\n');
  let current: { slot: number; team: string; player: string; position: string } | null = null;
  const analysisLines: string[] = [];

  const flush = () => {
    // Accept picks even with no analysis — missing analysis is better than a dropped pick
    if (current) result.push({ ...current, analysis: analysisLines.join(' ').trim() });
    analysisLines.length = 0;
  };

  for (const line of lines) {
    const clean = line.replace(/\*\*/g, '');
    const m = clean.match(/\bPICK\s+\d+\.(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(.+)/i);
    if (m) {
      flush();
      const rawPos = m[4].trim().split(/[\s|—–\-]/)[0].toUpperCase();
      current = { slot: parseInt(m[1], 10), team: m[2].trim(), player: m[3].trim(), position: rawPos || m[4].trim() };
    } else if (current && line.trim()) {
      analysisLines.push(line.trim());
    } else if (!line.trim() && analysisLines.length > 0) {
      flush(); current = null;
    }
  }
  flush();
  return result.filter(p => p.slot >= 1 && p.slot <= 12);
}

async function genMockDraftR1(
  input: StepInput,
  persona: 'entertainer' | 'analyst',
): Promise<{ picks: ReturnType<typeof parseMockDraftPicksLocal>; raw: string }> {
  const leagueKnowledge = buildStaticLeagueContext();
  const { preDraftSlots = [], season, enhancedContext, draftData, isFirstEpisodeEver, prospectPool } = input;

  // Hard fail if no prospect pool — prevents LLM from hallucinating old-class players
  if (!prospectPool || prospectPool.length === 0) {
    throw new Error(`Mock draft failed — no eligible prospect pool found for ${season}. Load the ${season} NFL draft prospect pool in the admin draft tool before generating a pre_draft newsletter.`);
  }

  const effectiveSlots = preDraftSlots.length > 0
    ? preDraftSlots
    : Array.from({ length: 12 }, (_, i) => ({ slot: i + 1, team: `Team ${i + 1}` }));

  const personaLabel = persona === 'entertainer' ? 'Mason' : 'Westy';
  console.log(`[ComposeStep] MockDraft_R1_${personaLabel} started — ${effectiveSlots.length} teams, ${prospectPool.length} eligible prospects`);
  console.log(`[ComposeStep] MockDraft R1 draft order: ${effectiveSlots.map(s => `${s.slot}.${s.team}`).join(', ')}`);
  console.log(`[ComposeStep] MockDraft R1 first 10 prospects: ${prospectPool.slice(0, 10).map(p => p.name).join(', ')}`);

  const r1Order = effectiveSlots.map((s, i) => `Pick 1.${String(i + 1).padStart(2, '0')}: ${s.team}`).join('\n');
  const debutLine = isFirstEpisodeEver
    ? `FIRST EPISODE: Mason and Westy debut with the East v. West league.`
    : `Mason and Westy are established analysts for this league.`;

  // Prospect pool goes FIRST — before league knowledge and enhanced context — so it is never truncated
  // Dynasty rank (#1 = best dynasty value) is shown so the LLM knows relative prospect value
  const poolText = prospectPool.map((p, i) =>
    `${i + 1}. ${p.name} (${p.pos}${p.rank !== null ? `, dynasty rank #${p.rank}` : ', unranked'})`
  ).join('\n');
  const poolHeader = `=== ELIGIBLE PLAYERS — ${season} NFL DRAFT PROSPECT POOL ===
Dynasty rank #1 = highest dynasty fantasy value. Higher-ranked players should generally go earlier unless a team has a clear positional need for a lower-ranked player.
You may ONLY select players from the list below for this mock draft.
DO NOT use players from any previous draft class.
DO NOT use: Bryce Young, Will Levis, CJ Stroud, Anthony Richardson, Caleb Williams, Drake Maye, or any other player not on this exact list.

${poolText}

=== END ELIGIBLE PLAYER LIST (${prospectPool.length} total) ===`;

  const rosterCtxBlock = input.rosterContext
    ? `=== CURRENT TEAM ROSTERS (use to judge positional needs for each pick) ===\n${input.rosterContext}\n=== END ROSTERS ===\n\n`
    : '';

  const context = `${poolHeader}\n\n${leagueKnowledge}\n\n${rosterCtxBlock}---\n\n${season} EAST V. WEST ROOKIE DRAFT — MOCK DRAFT\n\n${debutLine}\n\nROUND 1 DRAFT ORDER (slot 1 = worst record, slot ${effectiveSlots.length} = champion):\n${r1Order}\n\n${enhancedContext.slice(0, 2000)}`;

  const pickFmt = `EXACTLY this format for all ${effectiveSlots.length} picks:\n\nPICK 1.01 | ${effectiveSlots[0].team} | [Player Name from eligible list] | [Position]\n[4-5 sentence paragraph]\n\nPICK 1.02 | ${effectiveSlots[1]?.team ?? 'Team 2'} | [Player Name from eligible list] | [Position]\n[4-5 sentence paragraph]\n\n(continue through PICK 1.${String(effectiveSlots.length).padStart(2, '0')})`;

  const constraint = `You are ${persona === 'entertainer' ? 'Mason Reed — bold, personality-first' : 'Westy — analytical, data-driven'}. Write YOUR Round 1 mock draft.\n\n⚠️ PLAYER RULE: Every player MUST appear in the ELIGIBLE PLAYERS list above. Do NOT use any other player.\n⚠️ ORDER RULE: Generally pick higher dynasty-ranked players earlier. Deviate only for clear team need (and say why).\n⚠️ ANALYSIS RULE: For each pick paragraph, explain WHY this player goes HERE — what is this team's need, what is this player's dynasty upside, and why does the fit make sense. Vague praise is not enough.\n\n${pickFmt}`;

  const raw = await generateSection({
    persona,
    sectionType: 'Mock Draft - Round 1',
    context,
    constraints: constraint,
    maxTokens: 6000,
    episodeType: 'pre_draft',
    validate: (t) => (t.replace(/\*\*/g, '').match(/\bPICK\s+\d+\.\d+\s*\|/gim) || []).length >= Math.max(4, Math.floor(effectiveSlots.length * 0.4)),
  });

  const picks = parseMockDraftPicksLocal(raw);
  // Use sequential slot numbers (1..N) matching the draft order as presented to the LLM
  const slotsForValidation = effectiveSlots.map((s, i) => ({ slot: i + 1, team: s.team }));
  const { invalidPlayers, orderMismatches, withinRoundDupes } = validateMockDraftPicks(picks, prospectPool, slotsForValidation, 1);

  if (orderMismatches.length > 0) {
    console.warn(`[ComposeStep] MockDraft R1 (${personaLabel}) draft-order mismatches: ${orderMismatches.join('; ')}`);
  }

  const allR1Issues = [...invalidPlayers, ...withinRoundDupes];
  if (allR1Issues.length > 0) {
    if (withinRoundDupes.length > 0) console.warn(`[ComposeStep] MockDraft R1 (${personaLabel}) — ${withinRoundDupes.length} within-round dupes: ${withinRoundDupes.join(', ')}`);
    if (invalidPlayers.length > 0) console.warn(`[ComposeStep] MockDraft R1 (${personaLabel}) — ${invalidPlayers.length} invalid players: ${invalidPlayers.join(', ')}`);
    const repaired = await repairMockDraftRound(1, picks, allR1Issues, prospectPool, slotsForValidation, [], persona);
    if (repaired) return repaired;
    throw new Error(`MockDraft R1 (${personaLabel}) repair failed: ${allR1Issues.join(', ')}`);
  }

  console.log(`[ComposeStep] MockDraft_R1_${personaLabel} completed — ${picks.length} valid picks`);
  return { picks, raw };
}

async function genMockDraftR2(
  input: StepInput,
  persona: 'entertainer' | 'analyst',
  r1Picks: Array<{ slot: number; team: string; player: string; position: string; analysis: string }>,
): Promise<{ picks: ReturnType<typeof parseMockDraftPicksLocal>; raw: string }> {
  const leagueKnowledge = buildStaticLeagueContext();
  const { preDraftSlots = [], preDraftRound2Slots, season, enhancedContext, draftData, isFirstEpisodeEver, prospectPool } = input;

  if (!prospectPool || prospectPool.length === 0) {
    throw new Error(`Mock draft R2 failed — no eligible prospect pool found for ${season}.`);
  }

  const effectiveSlots = preDraftSlots.length > 0
    ? preDraftSlots
    : Array.from({ length: 12 }, (_, i) => ({ slot: i + 1, team: `Team ${i + 1}` }));

  const isSnake = !draftData?.type || draftData.type === 'snake';
  const round2Slots = preDraftRound2Slots && preDraftRound2Slots.length > 0
    ? preDraftRound2Slots
    : (isSnake ? [...effectiveSlots].reverse() : [...effectiveSlots]);

  // Remove R1 picks from the eligible pool so R2 doesn't repeat them
  const r1PlayerNames = r1Picks.map(p => p.player);
  const r2Pool = prospectPool.filter(p =>
    !r1PlayerNames.some(used =>
      normalizePlayerName(used) === normalizePlayerName(p.name) ||
      (normalizePlayerName(used).split(' ').pop() ?? '') === (normalizePlayerName(p.name).split(' ').pop() ?? '')
    )
  );

  const personaLabel = persona === 'entertainer' ? 'Mason' : 'Westy';
  console.log(`[ComposeStep] MockDraft_R2_${personaLabel} started — ${round2Slots.length} picks, ${r2Pool.length} remaining eligible prospects`);
  console.log(`[ComposeStep] MockDraft R2 order: ${round2Slots.map((s, i) => `${i + 1}.${s.team}`).join(', ')}`);

  const poolText = r2Pool.map((p, i) =>
    `${i + 1}. ${p.name} (${p.pos}${p.rank !== null ? `, dynasty rank #${p.rank}` : ', unranked'})`
  ).join('\n');
  const poolHeader = `=== ELIGIBLE PLAYERS — ROUND 2 (${season} prospect pool minus Round 1 picks) ===
Dynasty rank #1 = highest dynasty value. Pick in roughly ranking order unless a team has a specific positional need.
You may ONLY select players from the list below.
DO NOT repeat Round 1 picks. DO NOT use players from any previous draft class.

${poolText}

=== END ELIGIBLE PLAYER LIST (${r2Pool.length} available) ===`;

  const r1Summary = r1Picks.length > 0
    ? `YOUR ROUND 1 PICKS (do NOT repeat these players):\n${r1Picks.map(p => `  Pick 1.${String(p.slot).padStart(2, '0')} | ${p.team} | ${p.player} | ${p.position}`).join('\n')}`
    : 'Round 1 unavailable — choose different players for each slot.';

  const r2Order = round2Slots.map((s, i) => `Pick 2.${String(i + 1).padStart(2, '0')}: ${s.team}`).join('\n');
  const pickFmt = `EXACTLY this format for all ${round2Slots.length} picks:\n\nPICK 2.01 | ${round2Slots[0].team} | [Player Name from eligible list] | [Position]\n[4-5 sentence paragraph]\n\n(continue through PICK 2.${String(round2Slots.length).padStart(2, '0')})`;

  const rosterCtxBlock = input.rosterContext
    ? `=== CURRENT TEAM ROSTERS (use to judge positional needs for each pick) ===\n${input.rosterContext}\n=== END ROSTERS ===\n\n`
    : '';

  const context = `${poolHeader}\n\n${leagueKnowledge}\n\n${rosterCtxBlock}${r1Summary}\n\nROUND 2 ORDER:\n${r2Order}\n\n${enhancedContext.slice(0, 2000)}`;
  const constraint = `Continue your mock draft into ROUND 2 as ${persona === 'entertainer' ? 'Mason Reed' : 'Westy'}.\n${r1Summary}\n⚠️ PLAYER RULE: Every player MUST appear in the ELIGIBLE PLAYERS list above. Do NOT use any other player.\n⚠️ ORDER RULE: Generally pick higher dynasty-ranked players earlier. Deviate only for clear team need (and say why).\n⚠️ ANALYSIS RULE: For each pick, reference what this team took in Round 1 and explain WHY this Round 2 pick complements it — address, need, upside, or dynasty timeline.\n${pickFmt}`;

  const raw = await generateSection({
    persona,
    sectionType: 'Mock Draft - Round 2',
    context,
    constraints: constraint,
    maxTokens: 6000,
    episodeType: 'pre_draft',
    validate: (t) => (t.replace(/\*\*/g, '').match(/\bPICK\s+\d+\.\d+\s*\|/gim) || []).length >= Math.max(4, Math.floor(round2Slots.length * 0.4)),
  });

  const picks = parseMockDraftPicksLocal(raw);
  const slotsForValidation = round2Slots.map((s, i) => ({ slot: i + 1, team: s.team }));
  // Validate against r2Pool (R1 picks already removed) so pool-check also catches cross-round repeats
  const { invalidPlayers, orderMismatches, withinRoundDupes } = validateMockDraftPicks(picks, r2Pool, slotsForValidation, 2);

  if (orderMismatches.length > 0) {
    console.warn(`[ComposeStep] MockDraft R2 (${personaLabel}) draft-order mismatches: ${orderMismatches.join('; ')}`);
  }

  // Also explicitly check cross-round (R1) repeats in case pool check missed a near-match
  const r1Dupes = picks.filter(p =>
    r1PlayerNames.some(used =>
      normalizePlayerName(used) === normalizePlayerName(p.player) ||
      (normalizePlayerName(used).split(' ').pop() ?? '') === (normalizePlayerName(p.player).split(' ').pop() ?? '')
    )
  ).map(p => `${p.player} (R2 slot ${p.slot})`);

  const allR2Issues = [...new Set([...invalidPlayers, ...withinRoundDupes, ...r1Dupes])];

  if (allR2Issues.length > 0) {
    if (withinRoundDupes.length > 0) console.warn(`[ComposeStep] MockDraft R2 (${personaLabel}) — within-round dupes: ${withinRoundDupes.join(', ')}`);
    if (r1Dupes.length > 0) console.warn(`[ComposeStep] MockDraft R2 (${personaLabel}) — R1 repeats: ${r1Dupes.join(', ')}`);
    if (invalidPlayers.length > 0) console.warn(`[ComposeStep] MockDraft R2 (${personaLabel}) — invalid players: ${invalidPlayers.join(', ')}`);
    const repaired = await repairMockDraftRound(2, picks, allR2Issues, r2Pool, slotsForValidation, r1PlayerNames, persona);
    if (repaired) return repaired;
    throw new Error(`MockDraft R2 (${personaLabel}) repair failed — issues: ${allR2Issues.join(', ')}`);
  }

  console.log(`[ComposeStep] MockDraft_R2_${personaLabel} completed — ${picks.length} valid picks`);
  return { picks, raw };
}

async function genPreDraftTrades(input: StepInput): Promise<TradeItem[]> {
  const leagueKnowledge = buildStaticLeagueContext();
  const { season, enhancedContext, memEntertainer, memAnalyst } = input;

  const context = `${leagueKnowledge}\n\n---\n\nPRE-DRAFT TRADE ANALYSIS — ${season}\nReview trades since late ${season - 1} (post-championship offseason through the present).\n${enhancedContext}\n\nCRITICAL: Only mention trades EXPLICITLY listed above. Do NOT invent trades.`;

  const partyGradeConstraint = (p: 'entertainer' | 'analyst') =>
    `Grade each team involved in offseason trades separately.\nFormat EXACTLY:\n===TEAM: [Exact Team Name]===\nGRADE: [A+ to F]\n[2-3 sentence analysis]\n\nIf no trades exist, output exactly: NO_TRADES\n${p === 'analyst' ? 'Focus on analytical value and draft capital impact.' : 'Focus on bold opinion: who won, who got fleeced.'}`;

  const [masonOverview, westyOverview, masonGradesRaw, westyGradesRaw] = await Promise.all([
    generateSection({ persona: 'entertainer', sectionType: 'Offseason Trade Analysis',     context, constraints: `3-4 sentences on key offseason trades. If none, acknowledge the quiet offseason. CRITICAL: Don't invent trades.`, maxTokens: 600, episodeType: 'pre_draft', validate: (t) => t.length >= 150 }),
    generateSection({ persona: 'analyst',     sectionType: 'Offseason Trade Analysis',     context, constraints: `3-4 analytical sentences on offseason trades and draft capital impact. If none, note the quiet market. CRITICAL: Don't invent trades.`, maxTokens: 600, episodeType: 'pre_draft', validate: (t) => t.length >= 150 }),
    generateSection({ persona: 'entertainer', sectionType: 'Offseason Trade Party Grades', context, constraints: partyGradeConstraint('entertainer'), maxTokens: 700, episodeType: 'pre_draft' }),
    generateSection({ persona: 'analyst',     sectionType: 'Offseason Trade Party Grades', context, constraints: partyGradeConstraint('analyst'),     maxTokens: 700, episodeType: 'pre_draft' }),
  ]);

  const parseBlocks = (text: string): Array<{ team: string; grade: string; analysis: string }> => {
    if (/NO_TRADES/i.test(text)) return [];
    const results: Array<{ team: string; grade: string; analysis: string }> = [];
    const parts = text.split(/===TEAM:\s*([^=]+?)===/).slice(1);
    for (let i = 0; i < parts.length; i += 2) {
      const team = parts[i]?.trim();
      const content = (parts[i + 1] ?? '').trim();
      if (!team || !content) continue;
      const gm = content.match(/GRADE:\s*([A-F][+-]?)/i);
      results.push({ team, grade: gm ? gm[1].toUpperCase() : 'B', analysis: content.replace(/GRADE:\s*[A-F][+-]?\s*/i, '').trim() });
    }
    return results;
  };

  const masonGrades = parseBlocks(masonGradesRaw);
  const westyGrades = parseBlocks(westyGradesRaw);

  const analysis: TradeItem['analysis'] = {
    'League Overview': { grade: 'B', entertainer_grade: '–', analyst_grade: '–', deltaText: '', entertainer_paragraph: masonOverview, analyst_paragraph: westyOverview },
  };

  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const teamMap = new Map<string, { canonical: string; mason?: (typeof masonGrades)[0]; westy?: (typeof westyGrades)[0] }>();
  for (const mg of masonGrades) teamMap.set(normalize(mg.team), { canonical: mg.team, mason: mg });
  for (const wg of westyGrades) {
    const key = normalize(wg.team);
    const ex = teamMap.get(key);
    if (ex) ex.westy = wg;
    else teamMap.set(key, { canonical: wg.team, westy: wg });
  }
  for (const { canonical, mason, westy } of teamMap.values()) {
    analysis[canonical] = { grade: mason?.grade ?? westy?.grade ?? 'B', entertainer_grade: mason?.grade, analyst_grade: westy?.grade, deltaText: `${canonical}'s side`, entertainer_paragraph: mason?.analysis ?? '', analyst_paragraph: westy?.analysis ?? '' };
  }

  return [{ event_id: `offseason-trades-${season}`, coverage_level: 'high', reasons: [`${season} offseason trade activity`], context: `${season} Offseason Trades`, teams: null, analysis }];
}

// ============ SeasonPreview ============
// Mirrors buildSeasonPreview in compose.ts — 7 parallel LLM calls for contenders/sleepers/busts/predictions/picks.

async function genSeasonPreview(input: StepInput): Promise<SeasonPreviewSection> {
  const leagueKnowledge = buildStaticLeagueContext();
  const { season, enhancedContext } = input;

  const context = `${leagueKnowledge}

---

SEASON PREVIEW - ${season} SEASON

Create an ESPN/Athletic style season preview. This is BEFORE the season starts.
Base predictions on HISTORICAL performance from previous seasons, roster strength, and offseason moves.

${enhancedContext}

Think like a fantasy analyst doing a season preview:
- Who are the contenders based on roster and history?
- Who are the sleeper teams that could surprise?
- Who might disappoint?
- Make bold predictions for the season`;

  const [contendersRaw, sleepersRaw, bustsRaw, predBot1Raw, predBot2Raw, champBot1Raw, champBot2Raw] = await Promise.all([
    generateSection({ persona: 'analyst',     sectionType: 'Season Preview - Contenders',    context, constraints: 'List 3 championship contenders. Format: "TeamName: 2-3 sentence analysis"', maxTokens: 500 }),
    generateSection({ persona: 'entertainer', sectionType: 'Season Preview - Sleepers',      context, constraints: 'List 2-3 sleeper teams. Format: "TeamName: 2-3 sentence explanation"',        maxTokens: 400 }),
    generateSection({ persona: 'analyst',     sectionType: 'Season Preview - Bust Candidates', context, constraints: 'List 2 bust candidates. Format: "TeamName: 2-3 sentence breakdown"',       maxTokens: 400 }),
    generateSection({ persona: 'entertainer', sectionType: 'Bold Predictions',               context, constraints: '3 bold/spicy predictions for the season. 2-3 sentences each.',               maxTokens: 500 }),
    generateSection({ persona: 'analyst',     sectionType: 'Bold Predictions',               context, constraints: '3 analytical predictions based on data and trends. 2-3 sentences each.',      maxTokens: 500 }),
    generateSection({ persona: 'entertainer', sectionType: 'Championship Pick',              context, constraints: 'Pick your championship winner in 2-3 sentences. Be supremely confident.',    maxTokens: 150 }),
    generateSection({ persona: 'analyst',     sectionType: 'Championship Pick',              context, constraints: 'Pick your championship winner in 2-3 sentences with analytical reasoning.', maxTokens: 150 }),
  ]);

  const parseTeamList = (raw: string): Array<{ team: string; reason: string }> =>
    raw.split('\n').filter(l => l.trim()).slice(0, 3).map(line => {
      const m = line.match(/^[•\-\d.]*\s*([^:]+):\s*(.+)/) || line.match(/^[•\-\d.]*\s*(.+)/);
      return { team: m ? m[1].trim() : 'Unknown Team', reason: m && m[2] ? m[2].trim() : line.trim() };
    });

  const parsePredictions = (raw: string): string[] =>
    raw.split('\n').filter(l => l.trim()).slice(0, 3).map(l => l.replace(/^[•\-\d.]\s*/, '').trim());

  return {
    contenders:       parseTeamList(contendersRaw),
    sleepers:         parseTeamList(sleepersRaw),
    bustCandidates:   parseTeamList(bustsRaw),
    boldPredictions:  { bot1: parsePredictions(predBot1Raw), bot2: parsePredictions(predBot2Raw) },
    championshipPick: { bot1: champBot1Raw.trim(), bot2: champBot2Raw.trim() },
  };
}

// ============ DraftGrades ============

type PickEntry = { round: number; pick_no: number; playerName: string; position: string; nflTeam?: string };

function buildDraftPicksContext(draftData: LeagueDraftData | null | undefined): {
  picksContext: string;
  picksByTeam: Map<string, PickEntry[]>;
} {
  const picksByTeam = new Map<string, PickEntry[]>();
  if (draftData?.picks) {
    for (const pick of draftData.picks) {
      const team = pick.teamName || `Roster ${pick.roster_id}`;
      if (!picksByTeam.has(team)) picksByTeam.set(team, []);
      picksByTeam.get(team)!.push({
        round: pick.round,
        pick_no: pick.pick_no,
        playerName: pick.playerName,
        position: pick.position,
        nflTeam: pick.nflTeam,
      });
    }
  }

  const picksContext = Array.from(picksByTeam.entries()).map(([team, picks]) => {
    const sorted = [...picks].sort((a, b) => a.pick_no - b.pick_no);
    const picksList = sorted.map(p => `  Round ${p.round}, Pick ${p.pick_no}: ${p.playerName} (${p.position}, ${p.nflTeam || 'NFL'})`).join('\n');
    return `${team}:\n${picksList}`;
  }).join('\n\n');

  return { picksContext, picksByTeam };
}

function extractLetterGrade(text: string): string {
  // N/A grade — no-picks team
  if (/^\s*n\/a\b/i.test(text.trim())) return 'N/A';
  const m = text.match(/\bgrade[:\s]+([A-F][+-]?)\b/i)
    || text.match(/\bgiv(?:e|ing)\s+(?:this\s+)?(?:a\s+)?([A-F][+-]?)\b/i)
    || text.match(/\b([A-F][+-]?)\s*[-–]\s*(?:grade|trade|deal)\b/i);
  if (m) return m[1].toUpperCase();
  for (const line of text.split('\n')) {
    const solo = line.trim().match(/^([A-F][+-]?)\.?$/);
    if (solo) return solo[1].toUpperCase();
  }
  const end = text.trim().match(/[.!]\s*([A-F][+-]?)\.?\s*$/);
  return end ? end[1].toUpperCase() : 'B';
}

/** Generate grade for a single team (one DraftGrade_N step). */
async function genDraftGradeTeam(
  input: StepInput,
  teamIndex: number,
): Promise<DraftGradesSection['grades'][0] | null> {
  const { draftData, draftTeams, season, enhancedContext } = input;
  const { picksContext, picksByTeam } = buildDraftPicksContext(draftData);

  // Resolve team name: prefer the stored ordered list, fall back to pick order
  const orderedTeams = draftTeams ?? Array.from(picksByTeam.keys());
  const team = orderedTeams[teamIndex];
  if (!team) return null;

  const teamPicks = picksByTeam.get(team) ?? [];
  const noPicks = teamPicks.length === 0;

  if (noPicks) {
    console.log(`[ComposeStep] post_draft no-pick team at index ${teamIndex}: "${team}" — generating N/A grade`);
  }

  const picksText = noPicks
    ? ''
    : [...teamPicks].sort((a, b) => a.pick_no - b.pick_no)
        .map(p => `Round ${p.round}: ${p.playerName} (${p.position})`).join(', ');

  const leagueKnowledge = buildStaticLeagueContext();
  const context = `${leagueKnowledge}

---

POST-DRAFT GRADES — ${season} ROOKIE DRAFT

Full draft results:
${picksContext || 'Draft picks not yet available.'}

${enhancedContext.slice(0, 2000)}

GRADING: ${team}
Their picks: ${picksText || 'No picks on record — this team had no picks in this draft.'}`;

  const [bot1_analysis, bot2_analysis] = noPicks
    ? await Promise.all([
        generateSection({ persona: 'entertainer', sectionType: `Draft Grade - ${team}`, context, constraints: `${team} had NO PICKS in this draft (either traded all picks away or picks were deferred). Start your response with exactly "N/A —" then write 2-3 sentences on what skipping this rookie class means for their dynasty outlook.`, maxTokens: 250 }),
        generateSection({ persona: 'analyst',     sectionType: `Draft Grade - ${team}`, context, constraints: `${team} had NO PICKS in this draft. Start your response with exactly "N/A —" then give 2-3 analytical sentences on the dynasty implications of sitting out this rookie class entirely.`, maxTokens: 250 }),
      ])
    : await Promise.all([
        generateSection({ persona: 'entertainer', sectionType: `Draft Grade - ${team}`, context, constraints: `Grade ${team}'s draft (A+ to F). Start with the letter grade. Then 2-3 sentences explaining WHY: were these reaches or steals relative to dynasty ranking? Did they fill a need? What does this class mean for their dynasty window? FACTUAL RULE: only reference picks explicitly listed for this team above.`, maxTokens: 300 }),
        generateSection({ persona: 'analyst',     sectionType: `Draft Grade - ${team}`, context, constraints: `Grade ${team}'s draft (A+ to F). Start with the letter grade. Then 2-3 analytical sentences on: (1) value relative to dynasty ranking, (2) fit with team's roster construction, (3) dynasty timeline impact. FACTUAL RULE: only reference picks explicitly listed for this team above.`, maxTokens: 300 }),
      ]);

  return {
    team,
    picks: teamPicks.map(p => ({ round: p.round, pick: p.pick_no, player: p.playerName, position: p.position })),
    grade: noPicks ? 'N/A' : extractLetterGrade(bot1_analysis + bot2_analysis),
    bot1_analysis,
    bot2_analysis,
  };
}

/** Generate overall summaries and best/worst/steal awards (DraftGrades_Summary step). */
async function genDraftGradesSummary(input: StepInput): Promise<Pick<DraftGradesSection, 'bestPick' | 'worstPick' | 'stealOfTheDraft' | 'bot1_summary' | 'bot2_summary'>> {
  const { draftData, season, enhancedContext } = input;
  const { picksContext } = buildDraftPicksContext(draftData);

  const leagueKnowledge = buildStaticLeagueContext();
  const context = `${leagueKnowledge}

---

POST-DRAFT GRADES — ${season} ROOKIE DRAFT

${picksContext || 'Draft picks not yet available.'}

${enhancedContext.slice(0, 2000)}`;

  const [bot1_summary, bot2_summary, awardsRaw] = await Promise.all([
    generateSection({ persona: 'entertainer', sectionType: 'Draft Grades - Overall Summary', context, constraints: '3-4 paragraphs. Biggest winners, favorite pick, bold take on which pick looks best in 2 years.', maxTokens: 600 }),
    generateSection({ persona: 'analyst',     sectionType: 'Draft Grades - Overall Summary', context, constraints: '3-4 analytical paragraphs. Depth of the class, which teams improved dynasty trajectory, best value picks.', maxTokens: 600 }),
    generateSection({ persona: 'analyst',     sectionType: 'Draft Grades - Awards',          context, constraints: 'Identify:\n1. BEST PICK: "TeamName - PlayerName - reason"\n2. WORST PICK: "TeamName - PlayerName - reason"\n3. STEAL OF THE DRAFT: "TeamName - PlayerName - reason"\nFormat exactly as shown.', maxTokens: 400 }),
  ]);

  const parseAward = (text: string, keyword: string): { team: string; player: string; reason: string } => {
    const lines = text.split('\n');
    const line = lines.find(l => l.toUpperCase().includes(keyword)) || '';
    const match = line.match(/([^-]+)\s*-\s*([^-]+)\s*-\s*(.+)/);
    return {
      team:   match ? match[1].trim().replace(/^\d+\.\s*(?:BEST|WORST|STEAL[^:]*)?:?\s*/i, '') : 'TBD',
      player: match ? match[2].trim() : 'TBD',
      reason: match ? match[3].trim() : 'Exceptional value.',
    };
  };

  return {
    bot1_summary,
    bot2_summary,
    bestPick:       parseAward(awardsRaw, 'BEST'),
    worstPick:      parseAward(awardsRaw, 'WORST'),
    stealOfTheDraft: parseAward(awardsRaw, 'STEAL'),
  };
}

// ============ Forecast ============

type ForecastStepOutput = {
  forecast: ForecastData;
  pendingPicks: { week: number; picks: Array<{ matchup_id: string | number; entertainer_pick: string; analyst_pick: string }> };
} | null;

async function genForecast(input: StepInput): Promise<ForecastStepOutput> {
  const { derived, memEntertainer, memAnalyst, week, enhancedContext, forecastRecords } = input;

  console.log(`[ComposeStep] Forecast step started — upcoming pairs: ${derived.upcoming_pairs?.length ?? 0}`);

  if (!derived.upcoming_pairs || derived.upcoming_pairs.length === 0) {
    console.log('[ComposeStep] Forecast skipped — no upcoming pairs available');
    return null;
  }

  const nextWeek = week + 1;
  try {
    const { forecast, pending } = await makeForecast({
      upcoming_pairs: derived.upcoming_pairs,
      last_pairs: derived.matchup_pairs || [],
      memEntertainer,
      memAnalyst,
      nextWeek,
      enhancedContext,
    });

    const forecastWithRecords: ForecastData = {
      ...forecast,
      records: forecastRecords ?? undefined,
    };

    console.log(`[ComposeStep] Forecast completed — ${forecast.picks.length} picks, ${pending.picks.length} pending picks for Week ${nextWeek}`);

    return { forecast: forecastWithRecords, pendingPicks: pending };
  } catch (e) {
    console.error('[ComposeStep] Forecast generation failed:', e);
    return null;
  }
}

// ============ Social Summary ============

async function genSocialSummary(input: StepInput): Promise<{ text: string }> {
  const { week, season, derived, enhancedContext, priorSectionSummary } = input;
  const pairs = derived.matchup_pairs || [];

  const facts: string[] = [`Season ${season}, Week ${week}`];
  if (pairs.length > 0) {
    const top = [...pairs].sort((a, b) => b.winner.points - a.winner.points)[0];
    facts.push(`Top scorer: ${top.winner.name} (${top.winner.points.toFixed(1)} pts)`);
    const biggest = [...pairs].sort((a, b) => b.margin - a.margin)[0];
    if (biggest !== top) {
      facts.push(`Biggest win: ${biggest.winner.name} def. ${biggest.loser.name} by ${biggest.margin.toFixed(1)}`);
    }
  }

  const ctx = [
    `EAST V. WEST — ${facts.join(' | ')}`,
    enhancedContext.slice(0, 800),
    priorSectionSummary ? `NEWSLETTER HIGHLIGHTS:\n${priorSectionSummary}` : '',
  ].filter(Boolean).join('\n\n');

  const text = await generateSection({
    persona: 'entertainer',
    sectionType: 'Social Summary',
    context: ctx,
    constraints: `Write 2-3 sentences for a Discord announcement about this week's newsletter. Cover: the biggest result, the team making headlines, and one spicy take. Target 200-280 characters. No hashtags, no emojis. Punchy and direct — make members want to read it.`,
    maxTokens: 120,
  }).catch(() => `East v. West Week ${week} newsletter is live — check it out.`);

  return { text: text.trim() };
}

// ============ Master dispatch ============

/**
 * Generate a single newsletter section by name. Called once per step endpoint request.
 * Returns { ok, sectionName, data } — data is the typed section payload to store in staged state.
 */
export async function generateNewsletterSection(input: StepInput): Promise<StepResult> {
  const { sectionName } = input;

  try {
    // Simple sections
    if (sectionName === 'Intro')     return { ok: true, sectionName, data: await genIntro(input) };
    if (sectionName === 'FinalWord') return { ok: true, sectionName, data: await genFinalWord(input) };
    if (sectionName === 'WaiversAndFA') return { ok: true, sectionName, data: await genWaivers(input) };
    if (sectionName === 'Spotlight') return { ok: true, sectionName, data: await genSpotlight(input) };
    if (sectionName === 'Blurt')     return { ok: true, sectionName, data: await genBlurt(input) };
    if (sectionName === 'PowerRankings')           return { ok: true, sectionName, data: await genPowerRankings(input) };
    if (sectionName === 'PowerRankings_Preseason') return { ok: true, sectionName, data: await genPowerRankings(input, true) };
    if (sectionName === 'SeasonPreview')           return { ok: true, sectionName, data: await genSeasonPreview(input) };

    // Pre-draft sections
    if (sectionName === 'PreDraftTrades') return { ok: true, sectionName, data: await genPreDraftTrades(input) };

    if (sectionName === 'MockDraft_R1_Mason') {
      const { picks, raw } = await genMockDraftR1(input, 'entertainer');
      return { ok: true, sectionName, data: { picks, raw } };
    }
    if (sectionName === 'MockDraft_R1_Westy') {
      const { picks, raw } = await genMockDraftR1(input, 'analyst');
      return { ok: true, sectionName, data: { picks, raw } };
    }
    if (sectionName === 'MockDraft_R2_Mason') {
      const r1 = (input.mockDraftR1Mason as ReturnType<typeof parseMockDraftPicksLocal>) ?? [];
      const { picks, raw } = await genMockDraftR2(input, 'entertainer', r1);
      return { ok: true, sectionName, data: { picks, raw } };
    }
    if (sectionName === 'MockDraft_R2_Westy') {
      const r1 = (input.mockDraftR1Westy as ReturnType<typeof parseMockDraftPicksLocal>) ?? [];
      const { picks, raw } = await genMockDraftR2(input, 'analyst', r1);
      return { ok: true, sectionName, data: { picks, raw } };
    }

    // Dynamic sections: "Recap_N", "Trade_N"
    const recapMatch = sectionName.match(/^Recap_(\d+)$/);
    if (recapMatch) {
      const data = await genSingleRecap(input, parseInt(recapMatch[1], 10));
      return { ok: true, sectionName, data };
    }

    const tradeMatch = sectionName.match(/^Trade_(\d+)$/);
    if (tradeMatch) {
      const data = await genSingleTradeItem(input, parseInt(tradeMatch[1], 10));
      return { ok: true, sectionName, data };
    }

    // DraftGrade_N — one team per step
    const draftGradeMatch = sectionName.match(/^DraftGrade_(\d+)$/);
    if (draftGradeMatch) {
      const data = await genDraftGradeTeam(input, parseInt(draftGradeMatch[1], 10));
      return { ok: true, sectionName, data };
    }

    if (sectionName === 'DraftGrades_Summary') {
      const data = await genDraftGradesSummary(input);
      return { ok: true, sectionName, data };
    }

    // Forecast step — generates picks for next week and carries pending picks for persistence
    if (sectionName === 'Forecast') {
      const data = await genForecast(input);
      return { ok: true, sectionName, data };
    }

    // Social summary — 2-3 sentence Discord preview, generated after FinalWord
    if (sectionName === 'SocialSummary') {
      const data = await genSocialSummary(input);
      return { ok: true, sectionName, data };
    }

    // Unknown section
    throw new Error(`Unknown section name: "${sectionName}". Check getGenerationSteps() for valid step names.`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ComposeStep] Section "${sectionName}" failed: ${msg}`);
    return { ok: false, sectionName, error: msg };
  }
}

// ============ Newsletter assembly ============

/**
 * Re-assembles a complete Newsletter object from per-section data stored in staged state.
 * Called after all steps are complete.
 */
export function assembleNewsletterFromSections(
  leagueName: string,
  week: number,
  season: number,
  episodeType: string,
  steps: string[],
  sectionData: Record<string, unknown>,
): Newsletter {
  const sections: NewsletterSection[] = [];
  const epType = episodeType as EpisodeType;

  // Pull typed data by section name and add to newsletter sections array
  const get = <T>(name: string): T | null => (sectionData[name] ?? null) as T | null;

  // Intro
  const intro = get<IntroSection>('Intro');
  if (intro) sections.push({ type: 'Intro', data: intro });

  // Power Rankings
  const pr = get<PowerRankingsSection>('PowerRankings') ?? get<PowerRankingsSection>('PowerRankings_Preseason');
  if (pr) sections.push({ type: 'PowerRankings', data: pr });

  // Matchup Recaps — collect all Recap_N in order
  const recaps: RecapItem[] = [];
  for (const step of steps) {
    if (step.match(/^Recap_\d+$/)) {
      const r = get<RecapItem>(step);
      if (r) recaps.push(r);
    }
  }
  if (recaps.length > 0) sections.push({ type: 'MatchupRecaps', data: recaps });

  // Waivers
  const waivers = get<WaiverItem[]>('WaiversAndFA');
  if (waivers && waivers.length > 0) sections.push({ type: 'WaiversAndFA', data: waivers });

  // Trades — collect all Trade_N in order OR pre-draft trades
  const preDraftTrades = get<TradeItem[]>('PreDraftTrades');
  if (preDraftTrades && preDraftTrades.length > 0) {
    sections.push({ type: 'Trades', data: preDraftTrades });
  } else {
    const trades: TradeItem[] = [];
    for (const step of steps) {
      if (step.match(/^Trade_\d+$/)) {
        const t = get<TradeItem>(step);
        if (t) trades.push(t);
      }
    }
    if (trades.length > 0) sections.push({ type: 'Trades', data: trades });
  }

  // Mock Draft assembly
  if (steps.includes('MockDraft_R1_Mason')) {
    const mR1 = sectionData['MockDraft_R1_Mason'] as { picks: ReturnType<typeof parseMockDraftPicksLocal> } | null;
    const wR1 = sectionData['MockDraft_R1_Westy'] as { picks: ReturnType<typeof parseMockDraftPicksLocal> } | null;
    const mR2 = sectionData['MockDraft_R2_Mason'] as { picks: ReturnType<typeof parseMockDraftPicksLocal> } | null;
    const wR2 = sectionData['MockDraft_R2_Westy'] as { picks: ReturnType<typeof parseMockDraftPicksLocal> } | null;

    if (mR1 || wR1) {
      const picks: MockDraftPick[] = [];
      const teamCount = Math.max(mR1?.picks.length ?? 0, wR1?.picks.length ?? 0, 12);

      const buildPick = (round: number, idx: number, slotTeam: string, mPicks: ReturnType<typeof parseMockDraftPicksLocal>, wPicks: ReturnType<typeof parseMockDraftPicksLocal>): MockDraftPick => {
        const slot = idx + 1;
        // Only match by slot — never fall back by index; an index fallback creates silent duplicates
        // when the parsed array has gaps (e.g. slot 3 missing → index 2 returns slot 4's player twice)
        const mp = mPicks.find(p => p.slot === slot);
        const wp = wPicks.find(p => p.slot === slot);
        return {
          overall: round === 1 ? slot : teamCount + slot,
          round, slot,
          originalTeam: slotTeam,
          ownerTeam: slotTeam,
          mason: { player: mp ? `${mp.player}${mp.position ? ` (${mp.position})` : ''}` : 'TBD', analysis: mp?.analysis ?? '' },
          westy: { player: wp ? `${wp.player}${wp.position ? ` (${wp.position})` : ''}` : 'TBD', analysis: wp?.analysis ?? '' },
        };
      };

      const r1M = mR1?.picks ?? [];
      const r1W = wR1?.picks ?? [];
      for (let i = 0; i < teamCount; i++) picks.push(buildPick(1, i, r1M[i]?.team ?? r1W[i]?.team ?? `Slot ${i + 1}`, r1M, r1W));

      if (mR2 || wR2) {
        const r2M = mR2?.picks ?? [];
        const r2W = wR2?.picks ?? [];
        for (let i = 0; i < teamCount; i++) picks.push(buildPick(2, i, r2M[i]?.team ?? r2W[i]?.team ?? `Slot ${i + 1}`, r2M, r2W));
      }

      const mockDraftSection: MockDraftSection = {
        picks,
        mason_intro: "Here's how I see this draft going down.",
        westy_intro: "My projections for each pick, based on the data.",
      };
      sections.push({ type: 'MockDraft', data: mockDraftSection });
    }
  }

  // SeasonPreview (preseason episodes)
  const seasonPreview = get<SeasonPreviewSection>('SeasonPreview');
  if (seasonPreview) sections.push({ type: 'SeasonPreview', data: seasonPreview });

  // DraftGrades (post_draft) — combine per-team steps + summary
  if (steps.some(s => s.match(/^DraftGrade_\d+$/))) {
    const teamGrades: DraftGradesSection['grades'] = [];
    for (const step of steps) {
      if (step.match(/^DraftGrade_\d+$/)) {
        const grade = get<DraftGradesSection['grades'][0]>(step);
        if (grade) teamGrades.push(grade);
      }
    }
    const summary = get<Pick<DraftGradesSection, 'bestPick' | 'worstPick' | 'stealOfTheDraft' | 'bot1_summary' | 'bot2_summary'>>('DraftGrades_Summary');
    if (teamGrades.length > 0) {
      const draftGradesSection: DraftGradesSection = {
        grades: teamGrades,
        bestPick:       summary?.bestPick       ?? { team: 'TBD', player: 'TBD', reason: 'Exceptional value.' },
        worstPick:      summary?.worstPick      ?? { team: 'TBD', player: 'TBD', reason: 'Questionable selection.' },
        stealOfTheDraft: summary?.stealOfTheDraft ?? { team: 'TBD', player: 'TBD', reason: 'Great value.' },
        bot1_summary:   summary?.bot1_summary   ?? '',
        bot2_summary:   summary?.bot2_summary   ?? '',
      };
      sections.push({ type: 'DraftGrades', data: draftGradesSection });
    }
  }

  // Spotlight
  const spotlight = get<SpotlightSection>('Spotlight');
  if (spotlight) sections.push({ type: 'SpotlightTeam', data: spotlight });

  // Blurt
  const blurt = get<BlurtSection>('Blurt');
  if (blurt && (blurt.bot1 || blurt.bot2)) sections.push({ type: 'Blurt', data: blurt });

  // Forecast (regular/trade_deadline/playoffs_preview/playoffs_round)
  if (steps.includes('Forecast')) {
    const forecastOutput = sectionData['Forecast'] as { forecast?: ForecastData; pendingPicks?: unknown } | null;
    const forecastData = forecastOutput?.forecast;
    if (forecastData && Array.isArray(forecastData.picks) && forecastData.picks.length > 0) {
      sections.push({ type: 'Forecast', data: forecastData });
    }
  }

  // Final Word
  const fw = get<FinalWordSection>('FinalWord');
  if (fw) sections.push({ type: 'FinalWord', data: fw });

  const episodeConfig = (() => {
    try { return getEpisodeConfig(epType, week, season); } catch { return null; }
  })();

  return {
    meta: {
      leagueName,
      week: ['pre_draft', 'post_draft', 'preseason', 'offseason'].includes(episodeType) ? 0 : week,
      date: new Date().toLocaleDateString(),
      season,
      episodeType: epType,
      episodeTitle: episodeConfig?.title,
      episodeSubtitle: episodeConfig?.subtitle,
    },
    sections,
  };
}

// ============ Validation ============

export interface ValidationResult {
  passed: boolean;
  missing: string[];
  issues: string[];
}

export function validateNewsletterSections(
  newsletter: Newsletter,
  episodeType: string,
  expectedMatchupCount: number,
  expectedTeamCount?: number,
): ValidationResult {
  const missing: string[] = [];
  const issues: string[] = [];
  const types = new Set(newsletter.sections.map(s => s.type));

  // Every episode requires Intro and FinalWord
  if (!types.has('Intro')) missing.push('Intro');
  if (!types.has('FinalWord')) missing.push('FinalWord');

  // Check intro/finalword are non-empty
  const intro = newsletter.sections.find(s => s.type === 'Intro')?.data as { bot1_text?: string; bot2_text?: string } | undefined;
  if (intro && !intro.bot1_text && !intro.bot2_text) issues.push('Intro section is empty (both bots returned nothing)');

  if (episodeType === 'regular' || ['trade_deadline', 'playoffs_preview', 'playoffs_round', 'championship', 'season_finale'].includes(episodeType)) {
    if (expectedMatchupCount > 0) {
      const recaps = newsletter.sections.find(s => s.type === 'MatchupRecaps');
      if (!recaps) {
        missing.push('MatchupRecaps');
      } else {
        const count = (recaps.data as RecapItem[]).length;
        if (count < expectedMatchupCount) {
          issues.push(`MatchupRecaps has ${count}/${expectedMatchupCount} matchups`);
        }
      }
    }
    if (episodeType === 'regular') {
      const pr = newsletter.sections.find(s => s.type === 'PowerRankings');
      if (!pr) {
        issues.push('PowerRankings missing');
      } else {
        const rankCount = ((pr.data as PowerRankingsSection).rankings ?? []).length;
        if (rankCount < LEAGUE_IDENTITY.format.teamCount) {
          issues.push(`PowerRankings has only ${rankCount}/${LEAGUE_IDENTITY.format.teamCount} teams`);
        }
      }
    }
    // Forecast is required for regular/trade_deadline/playoffs_preview/playoffs_round
    if (['regular', 'trade_deadline', 'playoffs_preview', 'playoffs_round'].includes(episodeType)) {
      const forecastSec = newsletter.sections.find(s => s.type === 'Forecast');
      if (!forecastSec) {
        missing.push('Forecast');
      }
    }
  }

  if (episodeType === 'preseason') {
    if (!types.has('SeasonPreview')) missing.push('SeasonPreview');
  }

  if (episodeType === 'pre_draft') {
    const mockDraftSec = newsletter.sections.find(s => s.type === 'MockDraft');
    if (!mockDraftSec) {
      missing.push('MockDraft');
    } else {
      const allPicks = (mockDraftSec.data as MockDraftSection).picks;
      const teamCount = LEAGUE_IDENTITY.format.teamCount;
      const r1 = allPicks.filter(p => p.round === 1);
      const r2 = allPicks.filter(p => p.round === 2);

      // Round 1 count — blocking
      if (r1.length < teamCount) {
        missing.push(`MockDraft — Round 1 incomplete (${r1.length}/${teamCount} picks). Retry the failed MockDraft_R1 steps.`);
      } else {
        const r1Slots = r1.map(p => p.slot);
        const r1Dupes = r1Slots.filter((s, i) => r1Slots.indexOf(s) !== i);
        if (r1Dupes.length > 0) missing.push(`MockDraft — Round 1 duplicate slot numbers: ${[...new Set(r1Dupes)].join(', ')}`);
        const r1Missing = Array.from({ length: teamCount }, (_, i) => i + 1).filter(s => !r1Slots.includes(s));
        if (r1Missing.length > 0) missing.push(`MockDraft — Round 1 missing slots: ${r1Missing.join(', ')}`);
      }

      // Round 2 count — blocking
      if (r2.length < teamCount) {
        missing.push(`MockDraft — Round 2 incomplete (${r2.length}/${teamCount} picks). Retry the failed MockDraft_R2 steps.`);
      } else {
        const r2Slots = r2.map(p => p.slot);
        const r2Dupes = r2Slots.filter((s, i) => r2Slots.indexOf(s) !== i);
        if (r2Dupes.length > 0) missing.push(`MockDraft — Round 2 duplicate slot numbers: ${[...new Set(r2Dupes)].join(', ')}`);
        const r2Missing = Array.from({ length: teamCount }, (_, i) => i + 1).filter(s => !r2Slots.includes(s));
        if (r2Missing.length > 0) missing.push(`MockDraft — Round 2 missing slots: ${r2Missing.join(', ')}`);
      }

      // Duplicate player names within each bot's full draft (R1 + R2) — blocking
      const stripPos = (name: string) => name.replace(/\s*\([^)]+\)\s*$/, '').trim().toLowerCase();
      for (const [bot, key] of [['Mason', 'mason'], ['Westy', 'westy']] as const) {
        const names = allPicks.map(p => stripPos((p as unknown as Record<string, { player: string }>)[key].player)).filter(n => n && n !== 'tbd');
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        if (dupes.length > 0) missing.push(`MockDraft — ${bot} has duplicate player picks: ${[...new Set(dupes)].join(', ')}`);
      }
    }
  }

  if (episodeType === 'post_draft') {
    const grades = newsletter.sections.find(s => s.type === 'DraftGrades');
    if (!grades) {
      missing.push('DraftGrades');
    } else {
      const teamCount = (grades.data as DraftGradesSection).grades.length;
      const expected = expectedTeamCount ?? LEAGUE_IDENTITY.format.teamCount;
      if (teamCount < expected) {
        // Blocking: all 12 teams must have a grade entry (no-pick teams get N/A grade)
        missing.push(`DraftGrades requires all ${expected} team grades — only ${teamCount} present`);
      }
    }
  }

  return { passed: missing.length === 0, missing, issues };
}
