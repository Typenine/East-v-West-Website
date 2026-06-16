/**
 * Newsletter Section Lab API
 *
 * POST /api/newsletter/generate-section
 *
 * Generates exactly ONE newsletter section in isolation using the same code path
 * as the full staged generator. Useful for testing specific sections (especially
 * Trade_N) without spending credits on the entire newsletter.
 *
 * GUARANTEES:
 * - Never writes to the `newsletters` table
 * - Never writes to the `newsletter_staged` table (reads staged data only)
 * - Never publishes or exposes content to end users
 * - Always generates fresh LLM output (no reuse of old section output)
 * - No-store cache headers on every response
 *
 * DATA STRATEGY:
 * - Reads stored staged job data (derivedData) if a staged job exists for season/week.
 *   This avoids re-fetching all Sleeper data when the admin already ran mode:start.
 * - Falls back to a minimal fresh Sleeper data fetch if no staged data exists.
 * - For Trade_N sections, always re-derives trade events live from Sleeper
 *   (same as the regular generate-step route does), regardless of staged data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { getConfiguredAdminSecret, isAdminCookieValue } from '@/lib/auth/admin';
import { loadStagedNewsletter, loadBotMemory } from '@/server/db/newsletter-queries';
import {
  getGenerationSteps,
  generateNewsletterSection,
  assembleNewsletterFromSections,
  type StepInput,
} from '@/lib/newsletter/compose-step';
import { renderHtml, renderNewsletterData } from '@/lib/newsletter/template';
import { getLeagueIdForSeason, LEAGUE_IDS } from '@/lib/constants/league';
import { getLeagueTransactionsAllWeeks, getAllPlayersCached } from '@/lib/utils/sleeper-api';
import type { BotMemory, DerivedData } from '@/lib/newsletter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 270;

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' };

// ── Auth ──────────────────────────────────────────────────────────────────────

async function isAdmin(req: NextRequest): Promise<boolean> {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get('evw_admin');
  const secret = getConfiguredAdminSecret();
  if (!secret) return false;
  const headerSecret = req.headers.get('x-admin-secret');
  const urlSecret = new URL(req.url).searchParams.get('secret');
  return (
    isAdminCookieValue(adminCookie?.value) ||
    headerSecret === secret ||
    urlSecret === secret
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function contentHash(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 12);
}

function freshMemory(bot: 'entertainer' | 'analyst', ts: string): BotMemory {
  return { bot, updated_at: ts, summaryMood: 'Focused', teams: {} };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403, headers: NO_STORE });
  }

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const generatedAt = new Date().toISOString();

  try {
    const body = await request.json().catch(() => ({})) as {
      season?: number;
      week?: number;
      episodeType?: string;
      sectionName?: string;
      debug?: boolean;
      contextOnly?: boolean;
    };

    const season = Number(body.season);
    const week = Number(body.week ?? 0);
    const episodeType = body.episodeType || 'regular';
    const sectionName = body.sectionName ?? '';
    const debug = Boolean(body.debug);
    const contextOnly = Boolean(body.contextOnly);

    if (!season || isNaN(season)) return NextResponse.json({ ok: false, error: 'season required' }, { status: 400, headers: NO_STORE });
    if (!sectionName)             return NextResponse.json({ ok: false, error: 'sectionName required' }, { status: 400, headers: NO_STORE });

    console.log(`[SectionLab] runId=${runId} section="${sectionName}" S${season}W${week} (${episodeType}) debug=${debug} contextOnly=${contextOnly}`);

    // Validate section name against a generous step list for the episode type
    const isTrade  = /^Trade_\d+$/.test(sectionName);
    const isRecap  = /^Recap_\d+$/.test(sectionName);
    const isDraftGrade = /^DraftGrade_\d+$/.test(sectionName);
    const tradeIdx = isTrade  ? parseInt(sectionName.replace('Trade_',      ''), 10) : -1;
    const recapIdx = isRecap  ? parseInt(sectionName.replace('Recap_',      ''), 10) : -1;
    const gradeIdx = isDraftGrade ? parseInt(sectionName.replace('DraftGrade_', ''), 10) : -1;

    const validSteps = getGenerationSteps(
      episodeType,
      isRecap  ? Math.max(6, recapIdx + 1) : 6,
      isTrade  ? Math.max(5, tradeIdx + 1) : 5,
      isDraftGrade ? Array.from({ length: Math.max(12, gradeIdx + 1) }, (_, i) => `Team ${i + 1}`) : undefined,
    );

    if (!validSteps.includes(sectionName)) {
      return NextResponse.json({
        ok: false,
        error: `"${sectionName}" is not valid for episodeType "${episodeType}". Valid: ${validSteps.join(', ')}`,
        debug: { availableSteps: validSteps },
      }, { status: 400, headers: NO_STORE });
    }

    // ── Build StepInput ───────────────────────────────────────────────────────
    //
    // Fast path: use existing staged job data from a prior mode:start run.
    //   Reading stored context is instant — no Sleeper/external API calls.
    //
    // Full-build path: when no staged data exists, run the complete context
    //   pipeline (identical to startStagedJob) — same Sleeper ingest, standings,
    //   transactions, external data, dynasty rankings, bot memories.
    //   A degraded context would produce meaningless test results, so there is
    //   no fallback — either staged data or a full build, nothing in between.

    let derived: DerivedData = { matchup_pairs: [], upcoming_pairs: [], events_scored: [] };
    let enhancedContext = '';
    let memEntertainer: BotMemory = freshMemory('entertainer', generatedAt);
    let memAnalyst:     BotMemory = freshMemory('analyst',     generatedAt);
    let forecastRecords: { entertainer: { w: number; l: number }; analyst: { w: number; l: number } } | null = null;
    let prospectPool: Array<{ name: string; pos: string; nfl?: string | null; college?: string | null; rank: number | null; value?: number | null }> | null = null;
    let sectionOffseasonTrades: import('@/lib/newsletter/offseason-trades').OffseasonTradeFact[] | null = null;
    let rosterContext = '';
    let leagueName = 'East v. West';
    let storedUsers: unknown[]   = [];
    let storedRosters: unknown[] = [];
    let preDraftSlots:      Array<{ slot: number; team: string }> | undefined;
    let preDraftRound2Slots: Array<{ slot: number; team: string }> | undefined;
    let draftTeams: string[] | undefined;
    let draftData: unknown = null;
    let usedStagedData = false;

    const staged = await loadStagedNewsletter(season, week).catch(() => null);

    if (staged?.derivedData) {
      const dd = staged.derivedData as Record<string, unknown>;
      const jobMeta = dd.__jobMeta as Record<string, unknown> | undefined;
      if (jobMeta && typeof dd.__context === 'string') {
        usedStagedData    = true;
        enhancedContext   = dd.__context as string;
        derived           = (dd.__derived  as DerivedData)  ?? derived;
        leagueName        = (jobMeta.leagueName as string)  ?? 'East v. West';
        storedUsers       = (dd.users   as unknown[])       ?? [];
        storedRosters     = (dd.rosters as unknown[])       ?? [];
        preDraftSlots      = jobMeta.preDraftSlots      as typeof preDraftSlots;
        preDraftRound2Slots = jobMeta.preDraftRound2Slots as typeof preDraftRound2Slots;
        draftTeams        = jobMeta.draftTeams          as typeof draftTeams;
        draftData         = dd.__draftData              ?? null;
        prospectPool      = (dd.__prospectPool as typeof prospectPool) ?? null;
        sectionOffseasonTrades = (dd.__offseasonTrades as typeof sectionOffseasonTrades) ?? null;
        rosterContext     = (dd.__rosterContext as string)              ?? '';
        forecastRecords   = (dd.__forecastRecords as typeof forecastRecords) ?? null;
        const mEnt = dd.__memoryEntertainer as BotMemory | undefined;
        const mAna = dd.__memoryAnalyst     as BotMemory | undefined;
        if (mEnt) memEntertainer = mEnt;
        if (mAna) memAnalyst     = mAna;
        console.log(`[SectionLab] runId=${runId} using staged data (${Object.keys(dd).length} keys, context=${Math.round(enhancedContext.length / 1000)}K chars)`);
      }
    }

    if (!usedStagedData) {
      // Full context build — identical pipeline to startStagedJob in route.ts.
      // No shortcuts. The section lab must test against the same data the real
      // newsletter uses; degraded context produces meaningless test results.
      console.log(`[SectionLab] runId=${runId} no staged data — running full context build (same as mode:start)`);

      const leagueId = getLeagueIdForSeason(String(season));
      if (!leagueId) {
        return NextResponse.json({ ok: false, error: `No league ID configured for season ${season}` }, { status: 400, headers: NO_STORE });
      }

      const {
        fetchNewsletterData, buildDerived, setPlayerNameCache,
        fetchCurrentWeekContext, buildCurrentStandingsContext, buildTransactionsContext,
        getLeagueRulesContext, fetchComprehensiveLeagueData, buildComprehensiveContextString,
        fetchAllExternalData, buildExternalDataContext,
        loadDynastyRankings, buildDynastyOverviewContext,
      } = await import('@/lib/newsletter');

      // Sleeper ingest — same single call as startStagedJob
      const ingestData = await fetchNewsletterData(leagueId, week);
      const { leagueName: ln, users, rosters, matchups, nextMatchups, transactions, allTransactions, playerMap, draftData: draftDataRaw } = ingestData;
      leagueName    = ln || 'East v. West';
      storedUsers   = users   as unknown[];
      storedRosters = rosters as unknown[];
      draftData     = draftDataRaw ?? null;
      setPlayerNameCache(playerMap);

      derived = buildDerived({
        users, rosters, matchups,
        nextMatchups: nextMatchups ?? [],
        transactions:    transactions.map(t => ({ ...t, adds: t.adds ?? undefined, drops: t.drops ?? undefined })),
        allTransactions: allTransactions?.map(t => ({ ...t, adds: t.adds ?? undefined, drops: t.drops ?? undefined })),
      });

      // Build roster name sets for ESPN injury filtering
      const rosterPids = new Set(rosters.flatMap(r => (r as { players?: string[] }).players ?? []));
      const rosterNames = { full: new Set<string>(), last: new Set<string>() };
      for (const pid of rosterPids) {
        const p = playerMap[pid] as { full_name?: string; first_name?: string; last_name?: string } | undefined;
        if (!p) continue;
        const full = (p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`).toLowerCase().trim();
        if (full) { rosterNames.full.add(full); const last = full.split(' ').pop() ?? ''; if (last.length >= 4) rosterNames.last.add(last); }
      }

      // Parallel data fetches — same set as startStagedJob regular episode path
      const [mEnt, mAna, weekCtx, comprehensiveData, externalData, dynastyResult, fRecords] = await Promise.all([
        loadBotMemory('entertainer', season),
        loadBotMemory('analyst', season),
        fetchCurrentWeekContext(leagueId, season, week).catch(() => null),
        fetchComprehensiveLeagueData(),
        fetchAllExternalData(),
        loadDynastyRankings().catch(() => [] as Awaited<ReturnType<typeof loadDynastyRankings>>),
        import('@/server/db/newsletter-queries').then(m => m.loadForecastRecords(season)).catch(() => null),
      ]);
      if (mEnt) memEntertainer = mEnt;
      if (mAna) memAnalyst     = mAna;
      forecastRecords = fRecords;

      // Assemble full enhanced context string — same order as startStagedJob
      const teamNameBlock = (() => {
        const lines = ['=== CURRENT TEAM NAMES (may differ from historical records) ===',
          'Use [SL:username] to correlate teams across seasons if names have changed.',
        ];
        for (const u of users) {
          const meta = (u as { metadata?: { team_name?: string } }).metadata;
          const teamName = meta?.team_name || u.display_name || u.username || `User ${u.user_id}`;
          lines.push(`- ${teamName} [SL:${u.username || u.display_name || u.user_id}]`);
        }
        return lines.join('\n');
      })();
      const standingsStr   = weekCtx ? buildCurrentStandingsContext(weekCtx) : '';
      const txStr          = weekCtx ? buildTransactionsContext(weekCtx)      : '';
      const comprehensiveStr = buildComprehensiveContextString(comprehensiveData);
      const rulesStr       = getLeagueRulesContext();
      const externalStr    = buildExternalDataContext(externalData, rosterNames);
      const dynastyStr     = buildDynastyOverviewContext(dynastyResult);
      const rosterInjuries = ingestData.injuries.filter(inj => inj.status && inj.status !== 'Active' && inj.status !== 'Healthy');
      const injuryStr      = rosterInjuries.length > 0
        ? `=== ROSTER INJURIES ===\n${rosterInjuries.slice(0, 20).map(i => `- ${i.playerName} (${i.nflTeam}): ${i.injuryStatus || i.status}`).join('\n')}`
        : '';

      // For preseason episode types, the regular season context (standings, transactions)
      // is not what the LLM needs — it needs the offseason trade history.
      // buildPreseasonHistoricalContext (in route.ts) generates this, but it's not exported.
      // Instead, we inject the essential piece here: the offseason trades block.
      // genPreDraftTrades relies on an explicit "=== OFFSEASON TRADES ===" block in the
      // context; without it the LLM obeys its "If no trades exist → NO_TRADES" instruction.
      let offseasonTradesStr = '';
      const isPreseasonEp = ['preseason', 'pre_draft', 'post_draft', 'offseason'].includes(episodeType);
      if (isPreseasonEp) {
        try {
          const { fetchTradesAllTime } = await import('@/lib/utils/trades');
          const { buildOffseasonTradeFacts, buildOffseasonTradesContextBlock } = await import('@/lib/newsletter/offseason-trades');
          const allTrades = await fetchTradesAllTime();
          // Sender-aware facts block (Received AND Sent per team + routing for
          // multi-team trades) — same source of truth the staged job uses.
          sectionOffseasonTrades = buildOffseasonTradeFacts(allTrades, season);
          offseasonTradesStr = buildOffseasonTradesContextBlock(sectionOffseasonTrades, season);
          console.log(`[SectionLab] runId=${runId} offseason trades: ${sectionOffseasonTrades.length} found`);
        } catch (tradesFetchErr) {
          console.warn(`[SectionLab] runId=${runId} offseason trades fetch failed:`, tradesFetchErr instanceof Error ? tradesFetchErr.message : String(tradesFetchErr));
        }
      }

      // Preseason episodes: put offseason trades first so the LLM sees them prominently.
      // Regular episodes: standard context order.
      const contextParts = isPreseasonEp
        ? [offseasonTradesStr, teamNameBlock, rulesStr, comprehensiveStr].filter(Boolean)
        : [teamNameBlock, standingsStr, txStr, injuryStr, dynastyStr, externalStr, rulesStr, comprehensiveStr].filter(Boolean);
      enhancedContext = contextParts.join('\n\n');

      console.log(`[SectionLab] runId=${runId} full context built (${Math.round(enhancedContext.length / 1000)}K chars, ${derived.events_scored.length} events, dynasty=${dynastyResult.length} players)`);
    }

    // ── Trade re-derive: always fetch live transaction data ───────────────────
    // Applies to Trade_N (regular season) and PreDraftTrades (pre_draft episode).
    // Mirrors generate-step/route.ts exactly so the same trade event data is used.
    let tradeDebug: Record<string, unknown> | undefined;

    if (isTrade || sectionName === 'PreDraftTrades') {
      try {
        const { buildDerived, setPlayerNameCache } = await import('@/lib/newsletter');
        const allLeagueIds = [LEAGUE_IDS.CURRENT, ...Object.values(LEAGUE_IDS.PREVIOUS)].filter(Boolean) as string[];

        const txArrays = await Promise.all(
          allLeagueIds.map(lid => getLeagueTransactionsAllWeeks(lid).catch(() => []))
        );
        const allTransactions = txArrays.flat();
        const weekTransactions = txArrays[0].filter(t => t.leg === week);

        const allPlayers = await getAllPlayersCached().catch(() => ({}) as Record<string, unknown>);
        setPlayerNameCache(allPlayers as Record<string, { full_name?: string; first_name?: string; last_name?: string }>);

        type BuildDerivedUsers = Parameters<typeof import('@/lib/newsletter').buildDerived>[0]['users'];
        const freshDerived = buildDerived({
          users:           storedUsers   as BuildDerivedUsers,
          rosters:         storedRosters as Parameters<typeof import('@/lib/newsletter').buildDerived>[0]['rosters'],
          matchups:        [],
          transactions:    weekTransactions.map(t => ({ ...t, adds: t.adds ?? undefined, drops: t.drops ?? undefined })),
          allTransactions: allTransactions.map(t => ({ ...t, adds: t.adds ?? undefined, drops: t.drops ?? undefined })),
        });

        const freshTrades = freshDerived.events_scored.filter(e => e.type === 'trade');
        const nonTrades   = derived.events_scored.filter(e => e.type !== 'trade');
        derived = { ...derived, events_scored: [...nonTrades, ...freshTrades] };

        const targetTrade = freshTrades[tradeIdx];
        tradeDebug = {
          tradeIndex:          tradeIdx,
          freshTradeCount:     freshTrades.length,
          weekTransactionCount: weekTransactions.length,
          allTransactionCount:  allTransactions.length,
          tradeIds:            freshTrades.map(t => t.event_id),
          parties:             freshTrades.map(t => ({ id: t.event_id, parties: t.parties })),
          targetFound:         Boolean(targetTrade),
          byTeam:              targetTrade?.details?.by_team ?? null,
        };
        console.log(`[SectionLab] runId=${runId} Trade_${tradeIdx} re-derive: ${freshTrades.length} trade event(s)`);
      } catch (tradeErr) {
        const msg = tradeErr instanceof Error ? tradeErr.message : String(tradeErr);
        console.warn(`[SectionLab] runId=${runId} Trade re-derive failed (using frozen derived): ${msg}`);
        tradeDebug = { error: msg, usedFrozenData: true };
      }
    }

    // ── Context-only mode ─────────────────────────────────────────────────────
    // Returns source data summary without calling the LLM — useful for verifying
    // trade facts before spending credits.
    if (contextOnly) {
      const tradeEvents = derived.events_scored.filter(e => e.type === 'trade');
      const targetTrade = isTrade ? tradeEvents[tradeIdx] : null;
      return NextResponse.json({
        ok: true,
        runId,
        season, week, episodeType, sectionName,
        generatedAt,
        contextOnly: true,
        usedStagedData,
        debug: {
          availableSteps: validSteps,
          matchupCount:  derived.matchup_pairs.length,
          tradeCount:    tradeEvents.length,
          contextLength: enhancedContext.length,
          contextPreview: enhancedContext.slice(0, 800),
          tradeDebug,
          targetTradeEvent: targetTrade
            ? { event_id: targetTrade.event_id, parties: targetTrade.parties, by_team: targetTrade.details?.by_team }
            : null,
        },
      }, { headers: NO_STORE });
    }

    // ── Generate the section ──────────────────────────────────────────────────
    const stepInput: StepInput = {
      sectionName,
      week,
      season,
      episodeType,
      derived,
      memEntertainer,
      memAnalyst,
      enhancedContext,
      preDraftSlots,
      preDraftRound2Slots,
      isFirstEpisodeEver: false,
      draftData: draftData as import('@/lib/newsletter/sleeper-ingest').LeagueDraftData | null,
      draftTeams,
      prospectPool,
      offseasonTrades: sectionOffseasonTrades,
      rosterContext: rosterContext || undefined,
      forecastRecords,
    };

    console.log(`[SectionLab] runId=${runId} calling generateNewsletterSection("${sectionName}")`);
    const result = await generateNewsletterSection(stepInput);

    if (!result.ok) {
      console.error(`[SectionLab] runId=${runId} generation failed: ${result.error}`);
      return NextResponse.json({
        ok: false, runId, sectionName,
        error: result.error,
        debug: debug ? { availableSteps: validSteps, tradeDebug } : undefined,
      }, { status: 500, headers: NO_STORE });
    }

    const rawSectionData = result.data;
    const hash = contentHash(rawSectionData);

    // ── Render via the exact same pipeline as the full newsletter ─────────────
    // assembleNewsletterFromSections handles the mapping from step name to section
    // type (e.g. Trade_0 → Trades array). renderHtml produces a full document.
    const newsletter = assembleNewsletterFromSections(
      leagueName, week, season, episodeType,
      [sectionName],
      { [sectionName]: rawSectionData },
    );

    let renderedHtml = '';
    let sectionHtml  = '';
    try {
      renderedHtml = renderHtml(newsletter);
      sectionHtml  = renderNewsletterData(newsletter).htmlSections.map(s => s.html).join('\n');
    } catch (renderErr) {
      const msg = renderErr instanceof Error ? renderErr.message : String(renderErr);
      console.error(`[SectionLab] runId=${runId} renderHtml failed: ${msg}`);
      renderedHtml = `<html><body><pre style="color:red">Render error: ${msg}</pre></body></html>`;
      sectionHtml  = `<pre style="color:red">Render error: ${msg}</pre>`;
    }

    console.log(`[SectionLab] runId=${runId} "${sectionName}" complete — hash=${hash} renderedHtml=${renderedHtml.length}chars usedStagedData=${usedStagedData}`);

    return NextResponse.json({
      ok: true,
      runId,
      season, week, episodeType, sectionName,
      generatedAt,
      contentHash: hash,
      renderedHtml,
      sectionHtml,
      rawSectionData,
      usedStagedData,
      debug: debug ? {
        availableSteps: validSteps,
        tradeDebug,
        sourceDataSummary: {
          matchupCount:  derived.matchup_pairs.length,
          tradeCount:    derived.events_scored.filter(e => e.type === 'trade').length,
          contextLength: enhancedContext.length,
          usedStagedData,
        },
      } : undefined,
    }, { headers: NO_STORE });

  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    console.error(`[SectionLab] runId=${runId} unhandled error: ${msg}`);
    return NextResponse.json({ ok: false, runId, error: msg }, { status: 500, headers: NO_STORE });
  }
}
