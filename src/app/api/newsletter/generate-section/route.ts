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
    // Preferred: use staged job data from a previous mode:start run.
    //   The staged job stores all context (enhancedContext, derived data, bot
    //   memories) without any section output. Reading it is free and instant.
    //
    // Fallback: minimal fresh Sleeper fetch when no staged data exists.

    let derived: DerivedData = { matchup_pairs: [], upcoming_pairs: [], events_scored: [] };
    let enhancedContext = '';
    let memEntertainer: BotMemory = freshMemory('entertainer', generatedAt);
    let memAnalyst:     BotMemory = freshMemory('analyst',     generatedAt);
    let forecastRecords: { entertainer: { w: number; l: number }; analyst: { w: number; l: number } } | null = null;
    let prospectPool: Array<{ name: string; pos: string; rank: number | null }> | null = null;
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
      // Minimal fresh context build — best-effort, context will be less rich than a full staged job.
      // For richest results, run mode:start first, then use the Section Lab.
      console.log(`[SectionLab] runId=${runId} no staged data — building minimal context from Sleeper`);
      try {
        const leagueId = getLeagueIdForSeason(String(season));
        if (!leagueId) throw new Error(`No league ID for season ${season}`);

        const { fetchNewsletterData, buildDerived, setPlayerNameCache,
                fetchCurrentWeekContext, buildCurrentStandingsContext,
                buildTransactionsContext, getLeagueRulesContext } = await import('@/lib/newsletter');

        const ingestData = await fetchNewsletterData(leagueId, week);
        const { leagueName: ln, users, rosters, matchups, transactions, allTransactions, playerMap } = ingestData;
        leagueName    = ln || 'East v. West';
        storedUsers   = users   as unknown[];
        storedRosters = rosters as unknown[];
        setPlayerNameCache(playerMap);

        derived = buildDerived({
          users, rosters, matchups,
          transactions:    transactions.map(t => ({ ...t, adds: t.adds ?? undefined, drops: t.drops ?? undefined })),
          allTransactions: allTransactions?.map(t => ({ ...t, adds: t.adds ?? undefined, drops: t.drops ?? undefined })),
        });

        const [mEnt, mAna, weekCtx] = await Promise.all([
          loadBotMemory('entertainer', season),
          loadBotMemory('analyst', season),
          fetchCurrentWeekContext(leagueId, season, week).catch(() => null),
        ]);
        if (mEnt) memEntertainer = mEnt;
        if (mAna) memAnalyst     = mAna;

        const standingsStr = weekCtx ? buildCurrentStandingsContext(weekCtx) : '';
        const txStr        = weekCtx ? buildTransactionsContext(weekCtx)      : '';
        enhancedContext = [standingsStr, txStr, getLeagueRulesContext()].filter(Boolean).join('\n\n');
        console.log(`[SectionLab] runId=${runId} fresh context built (${Math.round(enhancedContext.length / 1000)}K chars)`);
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.warn(`[SectionLab] runId=${runId} fresh context build failed: ${msg}`);
        enhancedContext = `[SectionLab warning] Context build failed: ${msg}. Output quality will be degraded.`;
      }
    }

    // ── Trade_N: always re-derive trade events live ───────────────────────────
    // Mirrors the re-derive logic in generate-step/route.ts exactly so the same
    // trade event data is used in both paths.
    let tradeDebug: Record<string, unknown> | undefined;

    if (isTrade) {
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
