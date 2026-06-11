/**
 * Newsletter Fact-Audit API
 *
 * POST /api/newsletter/fact-audit
 *   Body: { season, week, runId? }
 *   Runs the Gemini fact-audit over the staged newsletter for (season, week),
 *   stores the result on the generation run (runId if given, else the latest
 *   run for that week), and returns the audit.
 *
 * GET /api/newsletter/fact-audit?season=2026&week=12
 *   Returns the stored audit from the latest run for that week (or null).
 *
 * Admin-only. Advisory-only — never blocks or modifies the newsletter.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { getDb } from '@/server/db/client';
import { newsletters } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { runFactAudit } from '@/lib/newsletter/fact-audit';
import { saveFactAudit, getLatestRunForWeek } from '@/server/db/observability-queries';
import type { Newsletter } from '@/lib/newsletter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminCookieValue(cookieStore.get('evw_admin')?.value);
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { season?: number; week?: number; runId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const season = Number(body.season);
  const week = Number(body.week);
  if (!season || week === undefined || Number.isNaN(week)) {
    return NextResponse.json({ error: 'Missing required fields: season, week' }, { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(newsletters)
    .where(and(eq(newsletters.season, season), eq(newsletters.week, week)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
  }

  const content = row.content as Newsletter;
  const sections = Array.isArray(content?.sections) ? content.sections : [];

  const audit = await runFactAudit(sections);

  // Attach to the run so the diagnostics page and editor can find it later.
  let attachedRunId: string | null = body.runId ?? null;
  if (!attachedRunId) {
    const latest = await getLatestRunForWeek(season, week).catch(() => null);
    attachedRunId = latest?.runId ?? null;
  }
  if (attachedRunId) {
    await saveFactAudit(attachedRunId, audit as unknown as Record<string, unknown>);
  }

  return NextResponse.json({ audit, runId: attachedRunId });
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const season = Number(searchParams.get('season'));
  const week = Number(searchParams.get('week'));
  if (!season || Number.isNaN(week)) {
    return NextResponse.json({ error: 'Missing query params: season, week' }, { status: 400 });
  }

  const latest = await getLatestRunForWeek(season, week).catch(() => null);
  return NextResponse.json({
    audit: latest?.factAudit ?? null,
    runId: latest?.runId ?? null,
  });
}
