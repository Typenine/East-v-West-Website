/**
 * Newsletter Fact-Audit API
 *
 * Extracts claims with Gemini, then deterministically verifies them against the
 * frozen generation context and structured newsletter fields. Advisory to the
 * editor: manual edits remain publishable because the league admin is the final
 * factual authority.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { getDb } from '@/server/db/client';
import { newsletters } from '@/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { runFactAudit } from '@/lib/newsletter/fact-audit';
import { saveFactAudit, getLatestRunForWeek, getRunWithSections } from '@/server/db/observability-queries';
import type { Newsletter } from '@/lib/newsletter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminCookieValue(cookieStore.get('evw_admin')?.value);
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { season?: number; week?: number; runId?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const season = Number(body.season);
  const week = Number(body.week);
  if (!season || body.week === undefined || Number.isNaN(week)) {
    return NextResponse.json({ error: 'Missing required fields: season, week' }, { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(newsletters)
    .where(body.id
      ? eq(newsletters.id, body.id)
      : and(eq(newsletters.season, season), eq(newsletters.week, week)))
    .orderBy(desc(newsletters.generatedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });

  const content = row.content as Newsletter;
  const sections = Array.isArray(content?.sections) ? content.sections : [];
  const latestRun = body.runId ? null : await getLatestRunForWeek(season, week).catch(() => null);
  const runId = body.runId ?? latestRun?.runId ?? null;
  const selectedRun = body.runId
    ? (await getRunWithSections(body.runId).catch(() => null))?.run ?? null
    : latestRun;
  const contextPacket = selectedRun?.contextPacket as { enhancedContext?: string } | null | undefined;

  const audit = await runFactAudit(sections, {
    referenceText: contextPacket?.enhancedContext ?? '',
  });

  if (runId) await saveFactAudit(runId, audit as unknown as Record<string, unknown>);
  return NextResponse.json({ audit, runId, newsletterId: row.id });
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const season = Number(searchParams.get('season'));
  const week = Number(searchParams.get('week'));
  if (!season || Number.isNaN(week)) {
    return NextResponse.json({ error: 'Missing query params: season, week' }, { status: 400 });
  }
  const latest = await getLatestRunForWeek(season, week).catch(() => null);
  return NextResponse.json({ audit: latest?.factAudit ?? null, runId: latest?.runId ?? null });
}
