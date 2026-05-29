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
} from '@/server/db/newsletter-queries';
import type { BotMemory } from '@/lib/newsletter/types';
import {
  getGenerationSteps,
  generateNewsletterSection,
  assembleNewsletterFromSections,
  validateNewsletterSections,
  type StepInput,
} from '@/lib/newsletter/compose-step';
import { renderHtml } from '@/lib/newsletter/template';
import type { DerivedData } from '@/lib/newsletter/types';
import type { LeagueDraftData } from '@/lib/newsletter/sleeper-ingest';
import { postToDiscordWebhook, buildNewsletterEmbed } from '@/lib/utils/discord';
import { getDb } from '@/server/db/client';
import { discordNotifications } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';

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
  const derived = (derivedData.__derived as DerivedData) ?? { matchup_pairs: [], upcoming_pairs: [], events_scored: [] };
  const draftData = (derivedData.__draftData as LeagueDraftData | null) ?? null;
  const sectionOutputs = (derivedData.sections as Record<string, unknown>) ?? {};

  const { episodeType, leagueName, matchupCount, tradeCount, preDraftSlots, preDraftRound2Slots, isFirstEpisodeEver, draftTeams } = jobMeta;

  // ── Determine all steps and find the next incomplete one ──
  const allSteps = getGenerationSteps(episodeType, matchupCount, tradeCount, draftTeams);
  const completedSteps = new Set(staged.sectionsCompleted ?? []);
  const failedSteps = new Set<string>((derivedData.__failedSteps as string[]) ?? []);

  const nextStep = stepOverride
    ? stepOverride
    : allSteps.find(s => !completedSteps.has(s) && !failedSteps.has(s));

  if (!nextStep) {
    // All steps done (or only failed steps remain) — assemble and save
    console.log(`[Step] No remaining steps for S${season}W${week} — triggering final assembly`);
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
  };

  // ── Mark step as running ──
  await updateStagedNewsletter(season, week, { status: 'in_progress', currentSection: nextStep });

  // ── Generate the section ──
  console.log(`[Step] Generating section "${nextStep}" for Season ${season} Week ${week} (${episodeType})`);
  const result = await generateNewsletterSection(stepInput);

  if (!result.ok) {
    // Record failure but don't halt — subsequent calls will skip this step
    const currentFailed = (derivedData.__failedSteps as string[]) ?? [];
    await mergeStagedDerivedData(season, week, {
      __failedSteps: [...currentFailed, nextStep],
      [`__err_${nextStep}`]: result.error,
    });
    console.error(`[Step] Section "${nextStep}" failed: ${result.error}`);
    const newCompleted = [...(staged.sectionsCompleted ?? [])];
    await updateStagedNewsletter(season, week, { currentSection: null, sectionsCompleted: newCompleted });
    return NextResponse.json({
      done: false,
      step: nextStep,
      status: 'step_failed',
      error: result.error,
      completedCount: completedSteps.size,
      totalSteps: allSteps.length,
      failedSteps: [...failedSteps, nextStep],
    });
  }

  // ── Save section output and mark complete ──
  await mergeStagedDerivedData(season, week, { sections: { ...sectionOutputs, [nextStep]: result.data } });
  const newCompleted = [...(staged.sectionsCompleted ?? []), nextStep];
  await updateStagedNewsletter(season, week, { currentSection: null, sectionsCompleted: newCompleted });

  console.log(`[Step] Section "${nextStep}" complete. ${newCompleted.length}/${allSteps.length} steps done.`);

  // ── Check if all steps are now done ──
  const remaining = allSteps.filter(s => !new Set(newCompleted).has(s) && !failedSteps.has(s));
  if (remaining.length === 0) {
    const updatedOutputs = { ...sectionOutputs, [nextStep]: result.data };
    console.log(`[Step] Last step "${nextStep}" done — triggering final assembly`);
    return await finalizeNewsletter(season, week, leagueName, episodeType, allSteps, updatedOutputs, derived, newCompleted, derivedData);
  }

  return NextResponse.json({
    done: false,
    step: nextStep,
    status: 'step_complete',
    completedCount: newCompleted.length,
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

  // Discord notification
  const discordWebhookUrl = process.env.DISCORD_NEWSLETTER_WEBHOOK_URL;
  const siteUrl = process.env.SITE_URL || 'https://eastvswest.football';
  if (discordWebhookUrl) {
    try {
      const db = getDb();
      const dedupeKey = `${season}-${week}`;
      const existing = await db.select().from(discordNotifications)
        .where(and(eq(discordNotifications.notificationType, 'newsletter_published'), eq(discordNotifications.dedupeKey, dedupeKey)))
        .limit(1).catch(() => []);
      if (existing.length === 0) {
        const embed = buildNewsletterEmbed({ season, week, siteUrl });
        const res = await postToDiscordWebhook(discordWebhookUrl, { embeds: [embed] });
        if (res.success) {
          await db.insert(discordNotifications).values({ notificationType: 'newsletter_published', dedupeKey, meta: { season, week } }).catch(() => {});
          console.log(`[Step] Discord embed posted — S${season}W${week}`);
        } else {
          console.warn(`[Step] Discord post failed: ${res.error}`);
        }
      } else {
        console.log(`[Step] Discord already posted for S${season}W${week} — skipping`);
      }
    } catch (discordErr) {
      console.warn('[Step] Discord notification error (non-fatal):', discordErr);
    }
  }

  return NextResponse.json({
    done: true,
    status: 'complete',
    completedSteps,
    validation,
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
