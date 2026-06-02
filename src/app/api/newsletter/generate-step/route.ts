/**
 * Newsletter Generate-Step Endpoint
 *
 * POST /api/newsletter/generate-step
 *
 * Advances a staged newsletter job by exactly ONE section per request.
 * Each call runs comfortably under the Vercel 300-second timeout.
 *
 * Typical flow:
 *   1. POST /api/newsletter { mode: 'start', ... } → creates job, returns { status: 'started' }
 *   2. Client loops: POST /api/newsletter/generate-step { season, week }
 *      → returns { done: false, step: 'Intro', completedCount: 1, totalSteps: 8 }
 *   3. When done=true, client fetches full newsletter: GET /api/newsletter?season=X&week=Y
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getConfiguredAdminSecret, isAdminCookieValue } from '@/lib/auth/admin';
import {
  loadStagedNewsletter,
  mergeStagedDerivedData,
  updateStagedNewsletter,
  loadBotMemory,
  saveBotMemory,
  saveNewsletter,
  saveForecastRecords,
  savePendingPicks,
} from '@/server/db/newsletter-queries';
import { applyBotBrainOverride } from '@/lib/newsletter/bot-brain';
import { setTeamCardOverride } from '@/lib/newsletter/team-narratives';
import { setRuntimeBannedPhrases } from '@/lib/newsletter/guardrails';
import type { BotSettingsRow } from '@/server/db/personality-queries';
import type { BotMemory } from '@/lib/newsletter/types';
import {
  getGenerationSteps,
  getRequiredSteps,
  generateNewsletterSection,
  assembleNewsletterFromSections,
  validateNewsletterSections,
  type StepInput,
} from '@/lib/newsletter/compose-step';
import { renderHtml } from '@/lib/newsletter/template';
import type { DerivedData } from '@/lib/newsletter/types';
import type { LeagueDraftData } from '@/lib/newsletter/sleeper-ingest';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getLeagueTransactionsAllWeeks, getAllPlayersCached } from '@/lib/utils/sleeper-api';

function toBotBrainOverrideStep(settings: BotSettingsRow) {
  const override: Parameters<typeof applyBotBrainOverride>[1] = {};
  if (settings.displayName)                       override.displayName = settings.displayName;
  if (settings.roleDescription)                   override.role = settings.roleDescription;
  if (settings.voiceConfig)                       override.voice = settings.voiceConfig;
  if (settings.signaturePhrases?.openers?.length) override.openers = settings.signaturePhrases.openers;
  if (settings.signaturePhrases?.closers?.length) override.closers = settings.signaturePhrases.closers;
  if (settings.signaturePhrases?.verbalTics?.length) override.verbalTics = settings.signaturePhrases.verbalTics;
  if (settings.safetyBoundaries?.length)          override.safetyBoundaries = settings.safetyBoundaries;
  return override;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 270; // 270s — generous per step, well under the 300s Vercel limit

// ============ Auth ============

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

// ============ Handler ============

// ============ Required-step pre-finalization guard ============

function checkRequiredStepsGuard(
  allSteps: string[],
  requiredSteps: Set<string>,
  completedSteps: Set<string>,
  failedSteps: Set<string>,
  sectionOutputs: Record<string, unknown>,
): { message: string; response: Record<string, unknown> } | null {
  const missingRequired: string[] = [];
  const failedRequired: string[] = [];

  for (const step of allSteps) {
    if (!requiredSteps.has(step)) continue;
    const hasOutput = completedSteps.has(step) || step in sectionOutputs;
    if (failedSteps.has(step)) {
      failedRequired.push(step);
    } else if (!hasOutput) {
      missingRequired.push(step);
    }
  }

  if (failedRequired.length === 0 && missingRequired.length === 0) return null;

  const message = [
    failedRequired.length > 0 ? `Failed required steps: ${failedRequired.join(', ')}` : '',
    missingRequired.length > 0 ? `Missing required steps: ${missingRequired.join(', ')}` : '',
  ].filter(Boolean).join('; ');

  return {
    message,
    response: {
      done: false,
      status: 'needs_attention',
      missingRequiredSteps: missingRequired,
      failedRequiredSteps: failedRequired,
      nextAction: 'retry_missing_required_steps',
      message: `Cannot finalize — required steps are blocked. ${message}. Use step override to retry each.`,
    },
  };
}

// ============ Prior-section summary builder ============

/**
 * Extracts key facts from already-completed section outputs into a compact string.
 * Passed into later steps (FinalWord, Blurt, Spotlight) so they avoid repeating earlier content.
 */
function buildPriorSectionSummary(
  sectionOutputs: Record<string, unknown>,
  completedSteps: string[],
): string {
  const parts: string[] = [];

  // Game results from recaps
  const recapSteps = completedSteps.filter(s => /^Recap_\d+$/.test(s));
  if (recapSteps.length > 0) {
    const recapLines: string[] = [];
    for (const step of recapSteps) {
      const recap = sectionOutputs[step] as {
        winner?: string; loser?: string; winner_score?: number; loser_score?: number; bracketLabel?: string;
      } | null;
      if (recap?.winner && recap?.loser) {
        const label = recap.bracketLabel ? `[${recap.bracketLabel}] ` : '';
        recapLines.push(`${label}${recap.winner} def. ${recap.loser} (${(recap.winner_score ?? 0).toFixed(1)}–${(recap.loser_score ?? 0).toFixed(1)})`);
      }
    }
    if (recapLines.length > 0) parts.push(`Game results: ${recapLines.join('; ')}`);
  }

  // Spotlight team
  if (completedSteps.includes('Spotlight')) {
    const spotlight = sectionOutputs['Spotlight'] as { team?: string } | null;
    if (spotlight?.team) parts.push(`Team of the Week spotlighted: ${spotlight.team}`);
  }

  // Notable waiver adds
  if (completedSteps.includes('WaiversAndFA')) {
    const waivers = sectionOutputs['WaiversAndFA'] as Array<{
      player?: string; team?: string; faab_spent?: number; coverage_level?: string;
    }> | null;
    if (waivers && waivers.length > 0) {
      const notable = waivers
        .filter(w => w.coverage_level === 'high' || w.coverage_level === 'moderate' || (w.faab_spent ?? 0) >= 10)
        .slice(0, 3)
        .map(w => `${w.player ?? 'unknown'} to ${w.team ?? 'unknown'}${w.faab_spent ? ` ($${w.faab_spent})` : ''}`);
      if (notable.length > 0) parts.push(`Notable adds: ${notable.join(', ')}`);
    }
  }

  // Power rankings top 3
  const pr = (sectionOutputs['PowerRankings'] ?? sectionOutputs['PowerRankings_Preseason']) as {
    rankings?: Array<{ rank: number; team: string }>
  } | null;
  if (pr?.rankings && pr.rankings.length >= 3) {
    const top3 = pr.rankings.slice(0, 3).map(r => r.team).join(', ');
    parts.push(`Top 3 power rankings: ${top3}`);
  }

  // Trade grades — summarise which teams were graded and their letter grade
  const tradeSteps = completedSteps.filter(s => /^Trade_\d+$/.test(s));
  if (tradeSteps.length > 0) {
    const tradeLines: string[] = [];
    for (const step of tradeSteps) {
      const trade = sectionOutputs[step] as {
        analysis?: Record<string, { entertainer_grade?: string; analyst_grade?: string }>
      } | null;
      if (trade?.analysis) {
        for (const [team, grades] of Object.entries(trade.analysis)) {
          if (team === 'League Overview') continue;
          const g = grades.entertainer_grade ?? grades.analyst_grade;
          if (g) tradeLines.push(`${team}: ${g}`);
        }
      }
    }
    if (tradeLines.length > 0) parts.push(`Trade grades: ${tradeLines.join(', ')}`);
  }

  return parts.join('\n');
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let season: number;
  let week: number;
  let stepOverride: string | undefined;

  try {
    const body = await request.json().catch(() => ({})) as { season?: number; week?: number; step?: string };
    season = Number(body.season);
    week = Number(body.week);
    stepOverride = body.step;
    if (!season || isNaN(season)) return NextResponse.json({ error: 'Missing season' }, { status: 400 });
    if (week === undefined || isNaN(week)) return NextResponse.json({ error: 'Missing week' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // ── Load staged job ──
  const staged = await loadStagedNewsletter(season, week);
  if (!staged) {
    return NextResponse.json({ error: `No staged job found for Season ${season} Week ${week}. Call POST /api/newsletter first to start a job.` }, { status: 404 });
  }

  if (staged.status === 'completed' || staged.status === 'published') {
    return NextResponse.json({ done: true, status: staged.status, message: 'Job already complete.' });
  }

  // ── Reconstruct job metadata from derivedData ──
  const derivedData = (staged.derivedData as Record<string, unknown>) ?? {};
  const jobMeta = (derivedData.__jobMeta as {
    episodeType: string;
    leagueName: string;
    leagueId: string;
    preDraftSlots?: Array<{ slot: number; team: string }>;
    preDraftRound2Slots?: Array<{ slot: number; team: string }>;
    isFirstEpisodeEver?: boolean;
    matchupCount: number;
    tradeCount: number;
    draftTeams?: string[];
  } | undefined);

  if (!jobMeta) {
    return NextResponse.json({ error: 'Job metadata missing from staged state. Re-start job with POST /api/newsletter.' }, { status: 400 });
  }

  const enhancedContextString = (derivedData.__context as string) ?? '';
  let derived = (derivedData.__derived as DerivedData) ?? { matchup_pairs: [], upcoming_pairs: [], events_scored: [] };
  const draftData = (derivedData.__draftData as LeagueDraftData | null) ?? null;
  const sectionOutputs = (derivedData.sections as Record<string, unknown>) ?? {};
  const forecastRecords = (derivedData.__forecastRecords as { entertainer: { w: number; l: number }; analyst: { w: number; l: number } } | null) ?? null;
  const prospectPool = (derivedData.__prospectPool as Array<{ name: string; pos: string; rank: number | null }> | null) ?? null;
  const dynastyRankings = (derivedData.__dynastyRankings as Array<{ name: string; pos: string; nfl: string; rank: number }> | null) ?? undefined;

  const { episodeType, leagueName, matchupCount, tradeCount, preDraftSlots, preDraftRound2Slots, isFirstEpisodeEver, draftTeams } = jobMeta;

  // ── Determine all steps, required steps, and find the next incomplete one ──
  const allSteps = getGenerationSteps(episodeType, matchupCount, tradeCount, draftTeams);
  const requiredSteps = new Set(getRequiredSteps(episodeType, matchupCount, tradeCount, draftTeams));
  const optionalSteps = allSteps.filter(s => !requiredSteps.has(s));
  const completedSteps = new Set(staged.sectionsCompleted ?? []);
  const failedSteps = new Set<string>((derivedData.__failedSteps as string[]) ?? []);

  console.log(`[Step] S${season}W${week} (${episodeType}) — all steps: ${allSteps.join(', ')}`);
  console.log(`[Step] Required: ${[...requiredSteps].join(', ')}`);
  if (optionalSteps.length) console.log(`[Step] Optional: ${optionalSteps.join(', ')}`);
  console.log(`[Step] Completed: ${[...completedSteps].join(', ') || 'none'} | Failed: ${[...failedSteps].join(', ') || 'none'}`);
  console.log(`[Step] Section outputs saved: ${Object.keys(sectionOutputs).join(', ') || 'none'}`);

  const nextStep = stepOverride
    ? stepOverride
    : allSteps.find(s => !completedSteps.has(s) && !failedSteps.has(s));

  if (!nextStep) {
    // All steps done (or only failed steps remain) — run required-step guard before assembling
    console.log(`[Step] No remaining pending steps for S${season}W${week} — running required-step guard`);
    const guardResult = checkRequiredStepsGuard(allSteps, requiredSteps, completedSteps, failedSteps, sectionOutputs);
    if (guardResult) {
      console.warn(`[Step] Pre-finalization guard BLOCKED: ${guardResult.message}`);
      await updateStagedNewsletter(season, week, { status: 'failed', error: guardResult.message });
      return NextResponse.json(guardResult.response);
    }
    console.log(`[Step] Required-step guard passed — triggering final assembly`);
    return await finalizeNewsletter(season, week, leagueName, episodeType, allSteps, sectionOutputs, derived, staged.sectionsCompleted ?? [], derivedData);
  }

  // ── Load bot memories from staged state (evolved at job start) ──
  // Fall back to live DB load if not stored (e.g. jobs started before this update)
  const storedMemEnt = (derivedData.__memoryEntertainer as BotMemory | undefined)
    ?? await loadBotMemory('entertainer', season)
    ?? { bot: 'entertainer' as const, updated_at: new Date().toISOString(), summaryMood: 'Focused' as const, teams: {} };
  const storedMemAna = (derivedData.__memoryAnalyst as BotMemory | undefined)
    ?? await loadBotMemory('analyst', season)
    ?? { bot: 'analyst' as const, updated_at: new Date().toISOString(), summaryMood: 'Focused' as const, teams: {} };

  // For mock draft R2 steps, load R1 picks from stored outputs
  const mockDraftR1Mason = sectionOutputs['MockDraft_R1_Mason'] as { picks: StepInput['mockDraftR1Mason'] } | undefined;
  const mockDraftR1Westy = sectionOutputs['MockDraft_R1_Westy'] as { picks: StepInput['mockDraftR1Westy'] } | undefined;

  // For Trade steps: re-derive trade events fresh from Sleeper so pick history is always
  // current. The stored __derived was frozen at job-creation time — if trades happened
  // before the job was created, or if the pick attribution code was updated after job
  // creation, the stored data would produce wrong analysis. Re-deriving is cheap (only
  // trade events are swapped in) and guarantees correct GIVES/GETS.
  if (/^Trade_\d+$/.test(nextStep)) {
    try {
      const { leagueId } = jobMeta;
      const storedUsers = (derivedData.users as Parameters<typeof import('@/lib/newsletter').buildDerived>[0]['users']) ?? [];
      const storedRosters = (derivedData.rosters as Parameters<typeof import('@/lib/newsletter').buildDerived>[0]['rosters']) ?? [];

      // Fetch fresh current-week transactions and full cross-season history in parallel
      const allLeagueIds = [LEAGUE_IDS.CURRENT, ...Object.values(LEAGUE_IDS.PREVIOUS)].filter(Boolean) as string[];
      const txArrays = await Promise.all(
        allLeagueIds.map(lid => getLeagueTransactionsAllWeeks(lid).catch(() => []))
      );
      const allTransactions = txArrays.flat();
      // Current-season transactions scoped to this week for the main event loop
      const weekTransactions = txArrays[0].filter(t => t.leg === week);

      const { buildDerived, setPlayerNameCache } = await import('@/lib/newsletter');
      const allPlayers = await getAllPlayersCached().catch(() => ({} as Record<string, never>));
      setPlayerNameCache(allPlayers as Parameters<typeof setPlayerNameCache>[0]);

      const freshDerived = buildDerived({
        users: storedUsers,
        rosters: storedRosters,
        matchups: [],
        transactions: weekTransactions.map(t => ({ ...t, adds: t.adds ?? undefined, drops: t.drops ?? undefined })),
        allTransactions: allTransactions.map(t => ({ ...t, adds: t.adds ?? undefined, drops: t.drops ?? undefined })),
      });

      const freshTrades = freshDerived.events_scored.filter(e => e.type === 'trade');
      const nonTrades = derived.events_scored.filter(e => e.type !== 'trade');
      derived = { ...derived, events_scored: [...nonTrades, ...freshTrades] };
      console.log(`[Step] Trade step: re-derived ${freshTrades.length} trade event(s) with live Sleeper data`);
    } catch (err) {
      console.warn('[Step] Trade re-derive failed — falling back to stored derived data:', err);
    }
  }

  // Build a compact summary of completed sections for cross-referencing in later steps
  const priorSectionSummary = buildPriorSectionSummary(sectionOutputs, Array.from(completedSteps));

  // Load roster context built at job start (used by mock draft steps for team needs)
  const rosterContext = (derivedData.__rosterContext as string | undefined) ?? '';

  const stepInput: StepInput = {
    sectionName: nextStep,
    week,
    season,
    episodeType,
    derived,
    memEntertainer: storedMemEnt,
    memAnalyst: storedMemAna,
    enhancedContext: enhancedContextString,
    preDraftSlots,
    preDraftRound2Slots,
    isFirstEpisodeEver,
    draftData,
    draftTeams,
    mockDraftR1Mason: mockDraftR1Mason?.picks,
    mockDraftR1Westy: mockDraftR1Westy?.picks,
    forecastRecords,
    prospectPool,
    priorSectionSummary: priorSectionSummary || undefined,
    rosterContext: rosterContext || undefined,
    dynastyRankings,
  };

  // ── Phase 3: load admin personality overrides (mirrors sync route — non-fatal) ──
  try {
    const { loadBotSettings, loadAllTeamNarrativeOverrides, loadPhrasePool } =
      await import('@/server/db/personality-queries').catch(() => ({
        loadBotSettings: null as null, loadAllTeamNarrativeOverrides: null as null, loadPhrasePool: null as null,
      }));

    if (loadBotSettings && loadAllTeamNarrativeOverrides && loadPhrasePool) {
      const [entSettings, anaSettings, teamCardRows, bannedPool] = await Promise.allSettled([
        loadBotSettings('entertainer'),
        loadBotSettings('analyst'),
        loadAllTeamNarrativeOverrides(),
        loadPhrasePool('banned_global'),
      ]);

      if (entSettings.status === 'fulfilled' && entSettings.value) {
        applyBotBrainOverride('entertainer', toBotBrainOverrideStep(entSettings.value));
      }
      if (anaSettings.status === 'fulfilled' && anaSettings.value) {
        applyBotBrainOverride('analyst', toBotBrainOverrideStep(anaSettings.value));
      }
      if (teamCardRows.status === 'fulfilled') {
        for (const card of teamCardRows.value) {
          setTeamCardOverride(card.teamName, card.cardData);
        }
      }
      if (bannedPool.status === 'fulfilled' && bannedPool.value) {
        setRuntimeBannedPhrases(bannedPool.value);
      }
    }
  } catch {
    console.warn('[Step] personality overrides load failed; using hardcoded defaults');
  }

  // ── Mark step as running ──
  await updateStagedNewsletter(season, week, { status: 'in_progress', currentSection: nextStep });

  // ── Generate the section ──
  console.log(`[Step] Generating section "${nextStep}" for Season ${season} Week ${week} (${episodeType})`);
  const result = await generateNewsletterSection(stepInput);

  const isRequired = requiredSteps.has(nextStep);

  if (!result.ok) {
    const currentFailed = (derivedData.__failedSteps as string[]) ?? [];
    const newFailed = [...currentFailed, nextStep];
    await mergeStagedDerivedData(season, week, {
      __failedSteps: newFailed,
      [`__err_${nextStep}`]: result.error,
    });
    await updateStagedNewsletter(season, week, { currentSection: null, sectionsCompleted: staged.sectionsCompleted ?? [] });

    const handledCount = completedSteps.size + newFailed.length; // completed + all failed (for progress)

    if (isRequired) {
      console.error(`[Step] REQUIRED section "${nextStep}" FAILED — generation blocked: ${result.error}`);
      return NextResponse.json({
        done: false,
        step: nextStep,
        status: 'step_failed_required',
        isRequiredStep: true,
        error: result.error,
        completedCount: handledCount,
        totalSteps: allSteps.length,
        failedSteps: newFailed,
        message: `Required step "${nextStep}" failed. Retry this step before generation can continue.`,
      });
    }

    // Optional step failure — record and continue
    console.warn(`[Step] Optional section "${nextStep}" failed (skipping): ${result.error}`);
    return NextResponse.json({
      done: false,
      step: nextStep,
      status: 'step_failed',
      isRequiredStep: false,
      error: result.error,
      completedCount: handledCount,
      totalSteps: allSteps.length,
      failedSteps: newFailed,
    });
  }

  // ── Save section output and mark complete ──
  await mergeStagedDerivedData(season, week, { sections: { ...sectionOutputs, [nextStep]: result.data } });
  const newCompleted = [...(staged.sectionsCompleted ?? []), nextStep];
  await updateStagedNewsletter(season, week, { currentSection: null, sectionsCompleted: newCompleted });

  const handledCountSuccess = newCompleted.length + failedSteps.size; // completed + already-failed
  console.log(`[Step] Section "${nextStep}" complete. ${newCompleted.length} done, ${failedSteps.size} failed, ${allSteps.length} total.`);

  // ── Check if all steps are now done ──
  const remaining = allSteps.filter(s => !new Set(newCompleted).has(s) && !failedSteps.has(s));
  if (remaining.length === 0) {
    const updatedOutputs = { ...sectionOutputs, [nextStep]: result.data };
    console.log(`[Step] Last pending step "${nextStep}" done — running required-step guard before final assembly`);
    const guardResult = checkRequiredStepsGuard(allSteps, requiredSteps, new Set(newCompleted), failedSteps, updatedOutputs);
    if (guardResult) {
      console.warn(`[Step] Pre-finalization guard BLOCKED: ${guardResult.message}`);
      await updateStagedNewsletter(season, week, { status: 'failed', error: guardResult.message });
      return NextResponse.json(guardResult.response);
    }
    console.log(`[Step] Required-step guard passed — triggering final assembly`);
    return await finalizeNewsletter(season, week, leagueName, episodeType, allSteps, updatedOutputs, derived, newCompleted, derivedData);
  }

  return NextResponse.json({
    done: false,
    step: nextStep,
    status: 'step_complete',
    isRequiredStep: isRequired,
    completedCount: handledCountSuccess,
    totalSteps: allSteps.length,
    nextStep: remaining[0],
    remainingSteps: remaining.length,
  });
}

// ============ Final assembly ============

async function finalizeNewsletter(
  season: number,
  week: number,
  leagueName: string,
  episodeType: string,
  allSteps: string[],
  sectionOutputs: Record<string, unknown>,
  derived: DerivedData,
  completedSteps: string[],
  derivedData: Record<string, unknown>,
) {
  console.log(`[Step] All steps done — assembling newsletter S${season}W${week} (${episodeType})`);

  // Determine expected team count for post_draft validation
  const draftTeams = (derivedData.__jobMeta as { draftTeams?: string[] } | undefined)?.draftTeams;

  const newsletter = assembleNewsletterFromSections(leagueName, week, season, episodeType, allSteps, sectionOutputs);
  const validation = validateNewsletterSections(
    newsletter,
    episodeType,
    derived.matchup_pairs?.length ?? 0,
    draftTeams?.length,
  );

  if (!validation.passed) {
    await updateStagedNewsletter(season, week, {
      status: 'failed',
      error: `Validation failed — missing: ${validation.missing.join(', ')}${validation.issues.length ? '; issues: ' + validation.issues.join(', ') : ''}`,
    });
    return NextResponse.json({
      done: false,
      status: 'needs_attention',
      validation,
      message: 'Some required sections are missing. You can retry failed steps.',
      completedSteps,
    });
  }

  if (validation.issues.length > 0) {
    console.warn(`[Step] Validation issues (non-fatal): ${validation.issues.join('; ')}`);
  }
  console.log(`[Step] Validation passed — sections: ${newsletter.sections.map(s => s.type).join(', ')}`);

  // ── Save evolved bot memories from staged state ──
  const storedMemEnt = derivedData.__memoryEntertainer as BotMemory | undefined;
  const storedMemAna = derivedData.__memoryAnalyst as BotMemory | undefined;
  if (storedMemEnt) {
    await saveBotMemory('entertainer', season, storedMemEnt)
      .catch(e => console.warn('[Step] Failed to save entertainer memory:', e));
    console.log(`[Step] Bot memory saved — Entertainer: ${storedMemEnt.summaryMood}`);
  } else {
    console.log('[Step] Bot memory skipped — no evolved memory in staged state (job may have been started before memory persistence was added)');
  }
  if (storedMemAna) {
    await saveBotMemory('analyst', season, storedMemAna)
      .catch(e => console.warn('[Step] Failed to save analyst memory:', e));
    console.log(`[Step] Bot memory saved — Analyst: ${storedMemAna.summaryMood}`);
  }

  // ── Save forecast records + pending picks if the Forecast step ran ──
  type ForecastStepOutput = {
    forecast?: { records?: { entertainer: { w: number; l: number }; analyst: { w: number; l: number } } };
    pendingPicks?: { week: number; picks: Array<{ matchup_id: string | number; entertainer_pick: string; analyst_pick: string }> };
  };
  const forecastOutput = sectionOutputs['Forecast'] as ForecastStepOutput | null | undefined;
  if (forecastOutput) {
    if (forecastOutput.forecast?.records) {
      await saveForecastRecords(season, forecastOutput.forecast.records)
        .catch(e => console.warn('[Step] Failed to save forecast records:', e));
      console.log(`[Step] Forecast records saved — Entertainer: ${forecastOutput.forecast.records.entertainer.w}W-${forecastOutput.forecast.records.entertainer.l}L, Analyst: ${forecastOutput.forecast.records.analyst.w}W-${forecastOutput.forecast.records.analyst.l}L`);
    }
    if (forecastOutput.pendingPicks && forecastOutput.pendingPicks.picks.length > 0) {
      await savePendingPicks(season, forecastOutput.pendingPicks)
        .catch(e => console.warn('[Step] Failed to save pending picks:', e));
      console.log(`[Step] Forecast pending picks saved — ${forecastOutput.pendingPicks.picks.length} picks for Week ${forecastOutput.pendingPicks.week}`);
    }
  }

  // ── Render HTML ──
  let html = '';
  try {
    html = renderHtml(newsletter);
  } catch (err) {
    console.error('[Step] renderHtml failed:', err);
    html = `<html><body><pre>${JSON.stringify(newsletter, null, 2)}</pre></body></html>`;
  }

  // ── Save newsletter to DB ──
  await saveNewsletter(
    season,
    week,
    leagueName,
    newsletter as Parameters<typeof saveNewsletter>[3],
    html,
  );

  await updateStagedNewsletter(season, week, { status: 'completed' });

  console.log(`[Step] Newsletter saved to DB — S${season}W${week} (${episodeType}), ${newsletter.sections.length} sections, ${html.length} HTML chars`);
  console.log(`[Step] Staged generation complete — Discord notification NOT posted (use Publish to announce)`);

  // Include social summary in response if the step ran
  const socialSummaryOutput = sectionOutputs['SocialSummary'] as { text?: string } | null | undefined;
  const socialSummary = socialSummaryOutput?.text ?? null;

  return NextResponse.json({
    done: true,
    status: 'complete',
    completedSteps,
    validation,
    ...(socialSummary ? { socialSummary } : {}),
    message: `Newsletter assembled and saved for Season ${season} Week ${week}.`,
  });
}

// ============ GET: step status ============

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const season = parseInt(searchParams.get('season') ?? '0', 10);
  const week = parseInt(searchParams.get('week') ?? '0', 10);
  if (!season || !week) return NextResponse.json({ error: 'season and week required' }, { status: 400 });

  const staged = await loadStagedNewsletter(season, week);
  if (!staged) return NextResponse.json({ status: 'not_found' });

  const derivedData = (staged.derivedData as Record<string, unknown>) ?? {};
  const jobMeta = derivedData.__jobMeta as { episodeType: string; matchupCount: number; tradeCount: number } | undefined;
  const allSteps = jobMeta ? getGenerationSteps(jobMeta.episodeType, jobMeta.matchupCount, jobMeta.tradeCount) : [];
  const failedSteps = (derivedData.__failedSteps as string[]) ?? [];

  return NextResponse.json({
    status: staged.status,
    currentSection: staged.currentSection,
    sectionsCompleted: staged.sectionsCompleted,
    failedSteps,
    totalSteps: allSteps.length,
    remainingSteps: allSteps.filter(s => !new Set(staged.sectionsCompleted).has(s) && !new Set(failedSteps).has(s)).length,
    startedAt: staged.startedAt,
    error: staged.error,
  });
}
