/**
 * Shared trade-section composer — used by staged (compose-step) and sync (compose) paths.
 */

import type { BotMemory, ScoredEvent, TradeItem } from './types';
import { generateSection } from './llm/groq';
import { buildDedupeContext } from './memory';
import { guardText } from './guardrails';
import { getPhaseRules, buildPhaseRulesContext } from './episodes';
import { buildTeamCardContext } from './team-narratives';
import {
  buildTradeFacts,
  buildTradePartyScopeBlock,
  stripTradeGradeLeadIn,
  stripTradeIntroBoilerplate,
  findTradeAttributionViolations,
  stripViolatingSentences,
} from './trade-facts';

export type DynastyRankingRow = { name: string; pos: string; nfl: string; rank: number };

export interface ComposeTradeSectionInput {
  event: ScoredEvent;
  memEntertainer: BotMemory;
  memAnalyst: BotMemory;
  episodeType?: string;
  dynastyRankings?: DynastyRankingRow[];
  rosterContext?: string;
}

export async function composeTradeItemFromEvent(input: ComposeTradeSectionInput): Promise<TradeItem> {
  const {
    event: e,
    memEntertainer,
    memAnalyst,
    episodeType = 'regular',
    dynastyRankings,
    rosterContext,
  } = input;

  const tradeDynLookup = (() => {
    if (!dynastyRankings?.length) return null;
    const byFull = new Map<string, number>();
    const byLast = new Map<string, number>();
    for (const r of dynastyRankings) {
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
  const isMultiTeam = parties.length > 2;
  const tradeFacts = buildTradeFacts(parties, byTeam, annotateTradePlayers, e.details?.routing);
  const tradeDisplayHeadline = e.details?.headline || `Trade between ${parties.join(' and ')}`;

  const polishTradeGrade = (text: string, logPrefix: string): string => {
    let out = stripTradeIntroBoilerplate(text, (pat) => {
      if (process.env.NEWSLETTER_TRADE_DEBUG === 'true') {
        console.log(`[TradeDebug] ${logPrefix}: stripped intro boilerplate — pattern: ${pat}`);
      }
    });
    const beforeLead = out;
    out = stripTradeGradeLeadIn(out, tradeDisplayHeadline);
    if (process.env.NEWSLETTER_TRADE_DEBUG === 'true' && out !== beforeLead) {
      console.log(`[TradeDebug] ${logPrefix}: stripped trade-recap lead-in sentence`);
    }
    return out;
  };

  const getTeamRoster = (teamName: string): string => {
    if (!rosterContext) return '';
    // Only consider blocks that are actual team rosters (header ends in the
    // "[SL:username]" marker) — the roster context also carries a freshness
    // preamble that must never be returned as a team match.
    const blocks = rosterContext.split('\n\n').filter(b => /\[SL:[^\]]*\]/i.test(b.split('\n')[0]));
    const lower = teamName.toLowerCase();
    const match =
      blocks.find(block => block.split('\n')[0].toLowerCase().includes(lower)) ??
      blocks.find(block => block.split('\n')[0].toLowerCase().includes(lower.split(/\s+/)[0]));
    return match
      ? `\n\nCURRENT ROSTER (live from Sleeper — each player shows NFL team/depth role, age, injury status; this overrides your training data):\n${match}`
      : '';
  };

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

  const tradeStepDedupeEnt = buildDedupeContext(memEntertainer);
  const tradeStepDedupeAna = buildDedupeContext(memAnalyst);
  const tradeStepPhaseCtx = buildPhaseRulesContext(getPhaseRules(episodeType));

  // Shared fantasy-analysis grounding — format awareness + dynasty fundamentals.
  const analysisPrinciples = [
    'ANALYSIS PRINCIPLES (apply them — do not recite them):',
    '- League format: 12-team SuperFlex dynasty, 0.5 PPR. QB is the premium position; TE is 1-deep (extra TEs carry little value).',
    '- Age vs positional curve: RBs typically decline around 26-27, WRs around 29-30; QBs and TEs age gracefully. Weigh every player\'s age.',
    '- CURRENT NFL ROLE: the roster data in context is live from Sleeper (NFL team, depth-chart role, age, injury status). It overrides anything you remember about a player from your training data — depth charts change.',
    '- Pick value: a future 1st from a contender projects as a late 1st; from a rebuilder, an early 1st. Say which when grading pick swaps.',
    '- Contention window: rebuilders should be acquiring youth and picks; contenders should be acquiring now-production. Judge each side against THEIR window, not in a vacuum.',
  ].join('\n');

  /**
   * Generate a grade paragraph, then lint it for direction-flipped attribution
   * claims (the recurring "Badgers traded Thomas" failure). One retry with
   * explicit corrections; if it still fails, keep the cleaner draft and strip
   * the offending sentences deterministically.
   */
  const generateGradeChecked = async (opts: {
    persona: 'entertainer' | 'analyst';
    context: string;
    constraints: string;
    party: string;
    logName: string;
  }): Promise<string> => {
    const routing = e.details?.routing;
    const lint = (text: string) =>
      findTradeAttributionViolations(opts.party, parties, byTeam, text, routing);

    const first = await generateSection({
      persona: opts.persona,
      sectionType: 'Trade Grade',
      context: opts.context,
      constraints: opts.constraints,
      maxTokens: 1100,
    });
    const v1 = lint(first);
    if (v1.length === 0) return first;

    console.warn(
      `[trade:${opts.logName}] ${v1.length} attribution violation(s), retrying — ${v1.map(v => `${v.kind}:${v.asset}`).join(', ')}`,
    );
    const correction = [
      '⚠️ YOUR PREVIOUS DRAFT CONTAINED ATTRIBUTION ERRORS. Fix ALL of these:',
      ...v1.map(v => `- You wrote: "${v.sentence}" — WRONG. ${v.correction}`),
      'Rewrite your full response. Before writing any send/receive claim, verify it against PAIRWISE ROUTING and GRADING SCOPE above.',
    ].join('\n');
    const second = await generateSection({
      persona: opts.persona,
      sectionType: 'Trade Grade',
      context: opts.context,
      constraints: opts.constraints + '\n\n' + correction,
      maxTokens: 1100,
    });
    const v2 = lint(second);
    if (v2.length === 0) return second;

    console.warn(
      `[trade:${opts.logName}] retry still has ${v2.length} violation(s) — stripping offending sentences`,
    );
    const [text, viols] = v2.length <= v1.length ? [second, v2] : [first, v1];
    return stripViolatingSentences(text, viols);
  };

  const analysis: TradeItem['analysis'] = {};
  for (const party of parties) {
    const tradePartyCard = buildTeamCardContext(party, {
      recentStance: memEntertainer.recentOutputLog?.recentStances?.[party],
      dataConfidenceFilter: 'medium',
    });
    const otherTeams = parties.filter(p => p !== party).join(' and ');
    const tradeScope = buildTradePartyScopeBlock(party, parties, byTeam, annotateTradePlayers);

    const sideCtx = [
      tradeFacts,
      '',
      tradeScope,
      '',
      `YOUR ASSIGNMENT: Grade this trade for ${party} only.`,
      isMultiTeam
        ? 'Use PAIRWISE ROUTING and GRADING SCOPE above — each asset has its own sender; do not merge senders.'
        : '',
      getTeamRoster(party),
      tradePartyCard,
      '',
      analysisPrinciples,
    ].filter(Boolean).join('\n');

    const fallbackAnalysis = `Grade: B. Analysis unavailable for this side of the trade.`;

    const gradeOpenRule =
      `OPENING: First sentence = your verdict for ${party} only (grade or clear win/lose). ` +
      `No trade-section intro, no full-deal recap, no "let's break down". ` +
      `Mason and Westy publish side-by-side — do not introduce the trade for the other voice. ` +
      `Headline + Receives/Sends cards are the only setup.\n`;

    const masonConstraint = isMultiTeam
      ? `You are Mason Reed. Grade this ${parties.length}-team trade for ${party} (A+ to F).\n` +
        gradeOpenRule +
        `Do NOT open with a trade summary or introduction — the trade facts are already displayed above.\n` +
        `Do NOT use phrases like "Welcome to", "Let's break down", "This week's trade", "In this trade".\n` +
        `CRITICAL: Only discuss assets under ${party}'s Gave/Received in GRADING SCOPE. If Brian Thomas appears under another team's SENT line, ${party} did NOT trade him away.\n` +
        `CRITICAL: A player "(from X)" and a pick "(from Y)" can have DIFFERENT senders — never assume one partner sent everything ${party} received.\n` +
        `CRITICAL: Do NOT count draft picks ${party} already owned before this trade — only picks listed under their Received line were acquired here.\n` +
        `Write 2-3 paragraphs:\n` +
        `  1. Where does ${party} land vs ${otherTeams}? Winner, break-even, or loser — and why?\n` +
        `  2. React to each specific asset in their "Gave" and "Received" with your personality.\n` +
        `  3. What does this mean for ${party}'s season?\n` +
        `Stick to assets listed under ${party} in TRADE FACTS / GRADING SCOPE. End with your letter grade.`
      : `You are Mason Reed. Grade this trade for ${party} (A+ to F).\n` +
        gradeOpenRule +
        `Do NOT open with a trade summary or introduction — the trade facts are already displayed above.\n` +
        `Do NOT use phrases like "Welcome to", "Let's break down", "This week's trade", "In this trade".\n` +
        `Write 2-3 paragraphs:\n` +
        `  1. Was this a heist, a robbery, or a fair deal for ${party}?\n` +
        `  2. React to each specific asset in their "Gave" and "Received" with your personality.\n` +
        `  3. What does this mean for ${party}'s dynasty outlook?\n` +
        `Stick to assets listed under ${party} in TRADE FACTS. End with your letter grade.`;

    // Westy publishes AFTER Mason and gets Mason's take in context, so he reacts
    // instead of re-introducing the trade the reader just heard about.
    const westyDebateRule =
      `MASON'S TAKE on ${party} appears in your context. The reader has already seen it.\n` +
      `Do NOT re-describe the trade or repeat his framing — get straight to YOUR verdict.\n` +
      `Engage Mason directly at least once: name one specific claim of his you push back on with data, or — if he's right — concede it and take the analysis a level deeper.\n` +
      `Bring at least one angle Mason missed entirely.\n`;

    const westyConstraint = isMultiTeam
      ? `You are Westy (Trent Weston). Grade this ${parties.length}-team trade for ${party} (A+ to F).\n` +
        gradeOpenRule +
        westyDebateRule +
        `Do NOT open with a trade summary or introduction — the trade facts are already displayed above.\n` +
        `Do NOT use phrases like "Welcome to", "Let's break down", "This week's trade", "In this trade".\n` +
        `CRITICAL: Only discuss assets under ${party}'s Gave/Received in GRADING SCOPE. Never attribute another team's SENT assets to ${party}.\n` +
        `CRITICAL: Each received asset has its own sender in PAIRWISE ROUTING — e.g. a RB "(from Team A)" does NOT mean Team A sent a draft pick too.\n` +
        `CRITICAL: Do NOT invent extra picks acquired in this deal — only picks under ${party}'s Received line count.\n` +
        `Write 2-3 paragraphs:\n` +
        `  1. Net value: did ${party} win or lose vs ${otherTeams}? State the verdict.\n` +
        `  2. Break down each asset under ${party}'s "Gave" and "Received": age curve, current NFL role, dynasty value, positional scarcity, pick round/year cost. Use dynasty rankings shown if available.\n` +
        `  3. Roster fit and championship window impact for ${party}.\n` +
        `Only penalize ${party} for assets listed under their "Gave". End with your letter grade.`
      : `You are Westy (Trent Weston). Grade this trade for ${party} (A+ to F).\n` +
        gradeOpenRule +
        westyDebateRule +
        `Do NOT open with a trade summary or introduction — the trade facts are already displayed above.\n` +
        `Do NOT use phrases like "Welcome to", "Let's break down", "This week's trade", "In this trade".\n` +
        `Write 2-3 paragraphs:\n` +
        `  1. Net value verdict for ${party}: did they win or lose?\n` +
        `  2. Break down each asset under ${party}'s "Gave" and "Received": age, current NFL role, dynasty value, positional scarcity. Use dynasty rankings if available.\n` +
        `  3. Roster fit and championship window implications.\n` +
        `Stick to assets listed under ${party} in TRADE FACTS. End with your letter grade.`;

    const rawEntTrade = await generateGradeChecked({
      persona: 'entertainer',
      context: sideCtx + '\n\n' + tradeStepDedupeEnt + tradeStepPhaseCtx,
      constraints: masonConstraint,
      party,
      logName: `TradeGrade:${party}:mason`,
    }).catch(() => fallbackAnalysis);

    const masonTakeCtx =
      `MASON'S TAKE ON ${party} (already published above your segment — react to it, do not repeat it):\n` +
      `"""\n${rawEntTrade}\n"""`;

    const rawAnaTrade = await generateGradeChecked({
      persona: 'analyst',
      context: sideCtx + '\n\n' + masonTakeCtx + '\n\n' + tradeStepDedupeAna + tradeStepPhaseCtx,
      constraints: westyConstraint,
      party,
      logName: `TradeGrade:${party}:westy`,
    }).catch(() => fallbackAnalysis);

    const entR = polishTradeGrade(
      guardText(rawEntTrade, { sectionType: 'Trade Grade', logPrefix: `[trade:TradeGrade:${party}:entertainer]` }),
      `TradeGrade:${party}:mason`,
    );
    const anaR = polishTradeGrade(
      guardText(rawAnaTrade, { sectionType: 'Trade Grade', logPrefix: `[trade:TradeGrade:${party}:analyst]` }),
      `TradeGrade:${party}:westy`,
    );

    analysis[party] = {
      grade: extractGrade(entR),
      entertainer_grade: extractGrade(entR),
      analyst_grade: extractGrade(anaR),
      deltaText: `${party}'s side`,
      entertainer_paragraph: entR,
      analyst_paragraph: anaR,
    };
  }

  return {
    event_id: e.event_id,
    coverage_level: e.coverage_level,
    reasons: e.reasons || [],
    context: tradeDisplayHeadline,
    teams: e.details?.by_team || null,
    analysis,
  };
}

/** Compose all trade items (serial — respects LLM rate limits). */
export async function composeAllTradeItems(opts: {
  tradeEvents: ScoredEvent[];
  memEntertainer: BotMemory;
  memAnalyst: BotMemory;
  episodeType?: string;
  dynastyRankings?: DynastyRankingRow[];
  rosterContext?: string;
}): Promise<TradeItem[]> {
  const items: TradeItem[] = [];
  for (const event of opts.tradeEvents) {
    items.push(await composeTradeItemFromEvent({
      event,
      memEntertainer: opts.memEntertainer,
      memAnalyst: opts.memAnalyst,
      episodeType: opts.episodeType,
      dynastyRankings: opts.dynastyRankings,
      rosterContext: opts.rosterContext,
    }));
  }
  return items;
}
