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
  EpisodeType,
} from './types';
import type { DerivedData } from './types';
import type { LeagueDraftData } from './sleeper-ingest';
import { generateSection } from './llm/groq';
import { buildStaticLeagueContext, LEAGUE_IDENTITY } from './league-knowledge';
import { getEpisodeConfig } from './episodes';

// ============ Step catalog ============

/**
 * Canonical ordered list of generation steps per episode type.
 * Each step corresponds to exactly one call to generateNewsletterSection().
 *
 * @param draftTeams   For post_draft: ordered list of team names from draft data.
 *                     Length determines the number of DraftGrade_N steps.
 *                     Pass undefined to fall back to teamCount.
 */
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
Introduce yourselves, welcome the league, and set the stage for your draft preview newsletter.`
      : `You and your co-host are well-established voices for the East v. West league. Reference your history with this league where relevant.`;

    const context = `${leagueKnowledge}\n\n---\n\nEPISODE TYPE: PRE-DRAFT PREVIEW - ${season} ROOKIE DRAFT\n\n${debutBlock}\n\n${enhancedContext}`;
    const entertainerConstraint = isFirstEpisodeEver
      ? `Write 3-4 paragraphs. Introduce yourself (Mason Reed) to the East v. West league — first episode ever. Welcome the league, build draft hype, name the prospects you're most fired up about, drop a bold take.`
      : `Write 3-4 paragraphs opening the draft preview. Dive straight in — build draft hype, name top prospects, call out teams set up to win the draft.`;
    const analystConstraint = isFirstEpisodeEver
      ? `Write 3-4 paragraphs. Introduce yourself (Westy) to the East v. West league — first episode ever. Frame your analytical approach, lay out the draft capital landscape, set expectations for your mock picks.`
      : `Write 3-4 paragraphs opening the draft preview analytically. Lay out draft capital, positional scarcity, and team fit. Reference prior seasons where relevant.`;

    const [bot1_text, bot2_text] = await Promise.all([
      generateSection({ persona: 'entertainer', sectionType: 'Pre-Draft Preview Intro', context, constraints: entertainerConstraint, maxTokens: 1500, episodeType: 'pre_draft', validate: (t) => t.length >= 300 }),
      generateSection({ persona: 'analyst',     sectionType: 'Pre-Draft Preview Intro', context, constraints: analystConstraint,     maxTokens: 1400, episodeType: 'pre_draft', validate: (t) => t.length >= 300 }),
    ]);
    return { bot1_text, bot2_text };
  }

  const numGames = pairs.length;
  const biggest = pairs[0] || null;
  const closest = pairs.reduce<typeof pairs[0] | null>((a, b) => (!a || b.margin < a.margin ? b : a), null);
  const trades = events.filter(e => e.type === 'trade').length;
  const waivers = events.filter(e => e.type === 'waiver' || e.type === 'fa_add').length;

  const context = `${leagueKnowledge}\n\n---\n\n${enhancedContext}\n\nWeek ${week} Summary:\n- ${numGames} matchups\n- Biggest win: ${biggest ? `${biggest.winner.name} beat ${biggest.loser.name} by ${biggest.margin.toFixed(1)}` : 'N/A'}\n- Closest: ${closest ? `${closest.winner.name} edged ${closest.loser.name} by ${closest.margin.toFixed(1)}` : 'N/A'}\n- ${trades} trades, ${waivers} waiver moves`;

  const [bot1_text, bot2_text] = await Promise.all([
    generateSection({ persona: 'entertainer', sectionType: 'Intro', context, constraints: 'Write 3-4 paragraphs. Set the tone with big personality — reference the week\'s top storylines, drop bold takes.', maxTokens: 600, episodeType }),
    generateSection({ persona: 'analyst',     sectionType: 'Intro', context, constraints: 'Write 3-4 paragraphs. Provide analytical depth — specific stats, trends, honest assessment.', maxTokens: 500, episodeType }),
  ]);
  return { bot1_text, bot2_text };
}

async function genFinalWord(input: StepInput): Promise<FinalWordSection> {
  const { week, episodeType, enhancedContext } = input;
  const leagueKnowledge = buildStaticLeagueContext();
  const contextMap: Record<string, { ctx: string; entConstraint: string; anaConstraint: string; tokens: number }> = {
    pre_draft: {
      ctx: `The rookie draft is coming up.\n\n${enhancedContext.slice(0, 600)}`,
      entConstraint: '3-4 sentences closing the draft preview. Build hype, name a player you\'re most excited about, call out a team set to steal the draft.',
      anaConstraint: '3-4 sentences of analytical closing thoughts. Key strategic takeaway, best draft capital position, projection on how this draft changes the competitive landscape.',
      tokens: 600,
    },
    post_draft: {
      ctx: 'The rookie draft is complete. Sign off with final thoughts.',
      entConstraint: '3-4 sentences closing the draft recap. Who was the biggest winner? Drop a bold take on which pick will look best in 2 years.',
      anaConstraint: '3-4 sentences of analytical final thoughts. What does this draft mean for the competitive landscape? Which strategy surprised you?',
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
    ctx: `Week ${week} is in the books.\n\n${leagueKnowledge}`,
    entConstraint: '3-4 sentences to close the show. Reference the week\'s biggest story, drop a take on what it means going forward.',
    anaConstraint: '3-4 sentences of measured closing analysis. Biggest statistical takeaway, what it means for the standings.',
    tokens: 350,
  };

  const [bot1, bot2] = await Promise.all([
    generateSection({ persona: 'entertainer', sectionType: 'Final Word', context: cfg.ctx, constraints: cfg.entConstraint, maxTokens: cfg.tokens, episodeType, validate: (t) => t.length >= 100 }),
    generateSection({ persona: 'analyst',     sectionType: 'Final Word', context: cfg.ctx, constraints: cfg.anaConstraint, maxTokens: cfg.tokens, episodeType, validate: (t) => t.length >= 100 }),
  ]);
  return { bot1, bot2 };
}

async function genSingleRecap(input: StepInput, matchupIndex: number): Promise<RecapItem> {
  const { week, derived, memEntertainer, memAnalyst, enhancedContext } = input;
  const pairs = derived.matchup_pairs || [];
  const p = pairs[matchupIndex];
  if (!p) throw new Error(`No matchup at index ${matchupIndex}`);

  const winnerPlayers = p.winner.topPlayers?.map(pl => `${pl.name} (${pl.points} pts)`).join(', ') || 'no player data';
  const loserPlayers = p.loser.topPlayers?.map(pl => `${pl.name} (${pl.points} pts)`).join(', ') || 'no player data';

  const context = `MATCHUP: ${p.winner.name} defeated ${p.loser.name}\nFinal: ${p.winner.points.toFixed(1)} – ${p.loser.points.toFixed(1)} (margin: ${p.margin.toFixed(1)})\n${p.winner.name} heroes: ${winnerPlayers}\n${p.loser.name} scorers: ${loserPlayers}\n\n${enhancedContext.slice(0, 3000)}`;

  const exchangeTokens = week >= 17 ? 900 : p.margin <= 5 ? 700 : 550;

  const dialogueRaw = await generateSection({
    persona: 'entertainer',
    sectionType: `${p.bracketLabel ?? 'Matchup'} Recap`,
    context,
    constraints: `Generate ${week >= 17 ? '6-8' : '4-5'} alternating lines of commentary about this specific matchup.\nFormat: "ENTERTAINER: [line]" OR "ANALYST: [line]"\nEntertainer (Mason Reed) speaks first.\nReference the actual scores, players, and margin. No other teams.\nBegin immediately:`,
    maxTokens: exchangeTokens,
  }).catch(() => '');

  type DT = { speaker: 'entertainer' | 'analyst'; text: string };
  const dialogue: DT[] = [];
  for (const line of dialogueRaw.split('\n')) {
    const clean = line.replace(/^\*\*/, '').replace(/\*\*$/, '').trim();
    const em = clean.match(/^(?:ENTERTAINER|MASON REED|MASON)[:\s]+(.+)/i);
    const am = clean.match(/^(?:ANALYST|WESTY|TRENT WESTON)[:\s]+(.+)/i);
    if (em && em[1].trim().length > 10) dialogue.push({ speaker: 'entertainer', text: em[1].trim() });
    else if (am && am[1].trim().length > 10) dialogue.push({ speaker: 'analyst', text: am[1].trim() });
  }

  if (dialogue.length < 2) {
    dialogue.push({ speaker: 'entertainer', text: `${p.winner.name} takes it ${p.winner.points.toFixed(1)}-${p.loser.points.toFixed(1)}. ${p.margin > 20 ? 'Not even close.' : 'Close one.'}` });
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
  const events = (input.derived.events_scored || []).filter(e =>
    (e.type === 'waiver' || e.type === 'fa_add') && (e.faab_spent ?? 0) >= 3
  );
  if (events.length === 0) return [];

  const numberedContext = events.map((e, i) => {
    const faab = e.faab_spent != null ? ` ($${e.faab_spent} FAAB)` : '';
    return `${i + 1}. ${e.team} added ${e.player || 'unknown'}${faab}`;
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

  const byTeam = e.details?.by_team || {};
  const parties = e.parties || Object.keys(byTeam);
  let tradeBreakdown = '';
  for (const team of parties) {
    const a = byTeam[team];
    if (a) tradeBreakdown += `\n${team}: GETS ${a.gets?.join(', ')} | GIVES ${a.gives?.join(', ')}`;
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
    const sideCtx = `Trade for ${party}: RECEIVED ${a?.gets?.join(', ')} | GAVE ${a?.gives?.join(', ')}\nFull trade: ${tradeContext}`;
    const [entR, anaR] = await Promise.all([
      generateSection({ persona: 'entertainer', sectionType: 'Trade Grade', context: sideCtx, constraints: `Grade this trade for ${party} (A+ to F). 3-4 sentences with personality. Include your letter grade.`, maxTokens: 350 }),
      generateSection({ persona: 'analyst',     sectionType: 'Trade Grade', context: sideCtx, constraints: `Grade this trade for ${party} (A+ to F). 3-4 analytical sentences on short/long-term value and fit. Include letter grade.`, maxTokens: 350 }),
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
  const context = `Team of the Week: ${p.winner.name}\n- Beat ${p.loser.name} by ${p.margin.toFixed(1)}\n- Scored ${p.winner.points.toFixed(1)} pts\n${input.enhancedContext.slice(0, 2000)}`;
  const [bot1, bot2] = await Promise.all([
    generateSection({ persona: 'entertainer', sectionType: 'Spotlight', context, constraints: 'Write 3-4 paragraphs spotlighting this team. Hype them up, reference which players came through, what it means for their season.', maxTokens: 500 }),
    generateSection({ persona: 'analyst',     sectionType: 'Spotlight', context, constraints: 'Write 3-4 paragraphs analytically dissecting this performance. Stats, sustainability, playoff trajectory.', maxTokens: 500 }),
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
  const ctx = weekFacts.join('\n') + '\n\n' + input.enhancedContext.slice(0, 500);
  const [bot1, bot2] = await Promise.all([
    generateSection({ persona: 'entertainer', sectionType: 'Blurt', context: ctx, constraints: 'One sharp 2-3 sentence aside — a hot observation or team you can\'t stop thinking about. No speaker label.', maxTokens: 150 })
      .then(r => r.trim().replace(/^(?:entertainer|the entertainer)[:\s]+/i, '') || null).catch(() => null),
    generateSection({ persona: 'analyst',     sectionType: 'Blurt', context: ctx, constraints: 'One sharp 2-3 sentence data observation or surprising trend. No speaker label.', maxTokens: 150 })
      .then(r => r.trim().replace(/^(?:analyst|the analyst)[:\s]+/i, '') || null).catch(() => null),
  ]);
  return { bot1: bot1 ?? null, bot2: bot2 ?? null };
}

// Structured JSON power rankings — more reliable than regex parsing
async function genPowerRankings(input: StepInput, preseason = false): Promise<PowerRankingsSection> {
  const leagueKnowledge = buildStaticLeagueContext();
  const ctx = `${leagueKnowledge}\n\n${preseason ? 'PRESEASON ' : ''}POWER RANKINGS — ${input.season}\n\n${input.enhancedContext.slice(0, 4000)}`;

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

// Pre-draft mock draft sub-steps — each R1/R2 bot is its own step
function parseMockDraftPicksLocal(
  raw: string,
): Array<{ slot: number; team: string; player: string; position: string; analysis: string }> {
  const result: Array<{ slot: number; team: string; player: string; position: string; analysis: string }> = [];
  const lines = raw.split('\n');
  let current: { slot: number; team: string; player: string; position: string } | null = null;
  const analysisLines: string[] = [];

  const flush = () => {
    if (current && analysisLines.length > 0) result.push({ ...current, analysis: analysisLines.join(' ').trim() });
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
): Promise<{ picks: typeof parseMockDraftPicksLocal extends (...args: infer _) => infer R ? R : never; raw: string }> {
  const leagueKnowledge = buildStaticLeagueContext();
  const { preDraftSlots = [], season, enhancedContext, draftData, isFirstEpisodeEver } = input;

  const effectiveSlots = preDraftSlots.length > 0
    ? preDraftSlots
    : Array.from({ length: 12 }, (_, i) => ({ slot: i + 1, team: `Team ${i + 1}` }));

  const r1Order = effectiveSlots.map(s => `Pick 1.${String(s.slot).padStart(2, '0')}: ${s.team}`).join('\n');
  const debutLine = isFirstEpisodeEver
    ? `FIRST EPISODE: Mason and Westy debut with the East v. West league.`
    : `Mason and Westy are established analysts for this league.`;

  const context = `${leagueKnowledge}\n\n---\n\n${season} EAST V. WEST ROOKIE DRAFT — MOCK DRAFT\n\n${debutLine}\n\nROUND 1 DRAFT ORDER (slot 1 = worst record, ${effectiveSlots.length} = champion):\n${r1Order}\n\n${enhancedContext.slice(0, 5000)}`;

  const pickFmt = `EXACTLY this format for all ${effectiveSlots.length} picks:\n\nPICK 1.01 | ${effectiveSlots[0].team} | [Player Name] | [Position]\n[4-5 sentence paragraph]\n\nPICK 1.02 | ${effectiveSlots[1]?.team ?? 'Team 2'} | [Player Name] | [Position]\n[4-5 sentence paragraph]\n\n(continue through PICK 1.${String(effectiveSlots.length).padStart(2, '0')})`;

  const constraint = `You are ${persona === 'entertainer' ? 'Mason Reed — bold, personality-first' : 'Westy — analytical, data-driven'}. Write YOUR Round 1 mock draft.\n${pickFmt}`;

  const raw = await generateSection({ persona, sectionType: 'Mock Draft - Round 1', context, constraints: constraint, maxTokens: 3500, episodeType: 'pre_draft', validate: (t) => (t.replace(/\*\*/g, '').match(/\bPICK\s+\d+\.\d+\s*\|/gim) || []).length >= Math.max(4, Math.floor(effectiveSlots.length * 0.4)) });

  return { picks: parseMockDraftPicksLocal(raw), raw };
}

async function genMockDraftR2(
  input: StepInput,
  persona: 'entertainer' | 'analyst',
  r1Picks: Array<{ slot: number; team: string; player: string; position: string; analysis: string }>,
): Promise<{ picks: ReturnType<typeof parseMockDraftPicksLocal>; raw: string }> {
  const leagueKnowledge = buildStaticLeagueContext();
  const { preDraftSlots = [], preDraftRound2Slots, season, enhancedContext, draftData, isFirstEpisodeEver } = input;

  const effectiveSlots = preDraftSlots.length > 0
    ? preDraftSlots
    : Array.from({ length: 12 }, (_, i) => ({ slot: i + 1, team: `Team ${i + 1}` }));

  const isSnake = !draftData?.type || draftData.type === 'snake';
  const round2Slots = preDraftRound2Slots && preDraftRound2Slots.length > 0
    ? preDraftRound2Slots
    : (isSnake ? [...effectiveSlots].reverse() : [...effectiveSlots]);

  const r1Summary = r1Picks.length > 0
    ? `YOUR ROUND 1 PICKS (do NOT repeat these players):\n${r1Picks.map(p => `  Pick 1.${String(p.slot).padStart(2, '0')} | ${p.team} | ${p.player} | ${p.position}`).join('\n')}`
    : 'Round 1 unavailable — choose different players for each slot.';

  const r2Order = round2Slots.map((s, i) => `Pick 2.${String(i + 1).padStart(2, '0')}: ${s.team}`).join('\n');
  const pickFmt = `EXACTLY this format for all ${round2Slots.length} picks:\n\nPICK 2.01 | ${round2Slots[0].team} | [Player Name] | [Position]\n[4-5 sentence paragraph]\n\n(continue through PICK 2.${String(round2Slots.length).padStart(2, '0')})`;

  const context = `${leagueKnowledge}\n\n${r1Summary}\n\nROUND 2 ORDER:\n${r2Order}\n\n${enhancedContext.slice(0, 4000)}`;
  const constraint = `Continue your mock draft into ROUND 2 as ${persona === 'entertainer' ? 'Mason Reed' : 'Westy'}.\n${r1Summary}\nFor each R2 pick, reference what this team took in Round 1.\n${pickFmt}`;

  const raw = await generateSection({ persona, sectionType: 'Mock Draft - Round 2', context, constraints: constraint, maxTokens: 3500, episodeType: 'pre_draft', validate: (t) => (t.replace(/\*\*/g, '').match(/\bPICK\s+\d+\.\d+\s*\|/gim) || []).length >= Math.max(4, Math.floor(round2Slots.length * 0.4)) });

  return { picks: parseMockDraftPicksLocal(raw), raw };
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
  const picksText = [...teamPicks].sort((a, b) => a.pick_no - b.pick_no)
    .map(p => `Round ${p.round}: ${p.playerName} (${p.position})`).join(', ');

  const leagueKnowledge = buildStaticLeagueContext();
  const context = `${leagueKnowledge}

---

POST-DRAFT GRADES — ${season} ROOKIE DRAFT

Full draft results:
${picksContext || 'Draft picks not yet available.'}

${enhancedContext.slice(0, 2000)}

GRADING: ${team}
Their picks: ${picksText || 'No picks on record.'}`;

  const [bot1_analysis, bot2_analysis] = await Promise.all([
    generateSection({ persona: 'entertainer', sectionType: `Draft Grade - ${team}`, context, constraints: `Grade ${team}'s draft (A+ to F). 2-3 sentences personality-driven reaction. Start with the letter grade.`, maxTokens: 300 }),
    generateSection({ persona: 'analyst',     sectionType: `Draft Grade - ${team}`, context, constraints: `Grade ${team}'s draft (A+ to F). 2-3 analytical sentences on value, needs, dynasty trajectory. Start with letter grade.`, maxTokens: 300 }),
  ]);

  return {
    team,
    picks: teamPicks.map(p => ({ round: p.round, pick: p.pick_no, player: p.playerName, position: p.position })),
    grade: extractLetterGrade(bot1_analysis + bot2_analysis),
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
        const mp = mPicks.find(p => p.slot === slot) ?? mPicks[idx];
        const wp = wPicks.find(p => p.slot === slot) ?? wPicks[idx];
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
  }

  if (episodeType === 'preseason') {
    if (!types.has('SeasonPreview')) missing.push('SeasonPreview');
  }

  if (episodeType === 'pre_draft') {
    const mockDraft = newsletter.sections.find(s => s.type === 'MockDraft');
    if (!mockDraft) {
      missing.push('MockDraft');
    } else {
      const picks = (mockDraft.data as MockDraftSection).picks;
      const expectedPicks = LEAGUE_IDENTITY.format.teamCount * 2; // 2 rounds
      if (picks.length < LEAGUE_IDENTITY.format.teamCount) {
        issues.push(`MockDraft has only ${picks.length} picks (expected ≥${LEAGUE_IDENTITY.format.teamCount} for Round 1)`);
      } else if (picks.length < expectedPicks) {
        issues.push(`MockDraft has only ${picks.length}/${expectedPicks} picks (Round 2 may be incomplete)`);
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
        issues.push(`DraftGrades has ${teamCount}/${expected} team grades`);
      }
    }
  }

  return { passed: missing.length === 0, missing, issues };
}
