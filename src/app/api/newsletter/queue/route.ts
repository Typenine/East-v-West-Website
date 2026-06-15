/**
 * Editorial Calendar / Generation Queue API (admin only)
 *
 * GET    /api/newsletter/queue            → list queue items (optional ?status=&season=)
 * POST   /api/newsletter/queue            → create { season, week?, episodeType, scheduledFor, note? }
 * PATCH  /api/newsletter/queue            → update { id, status?, scheduledFor?, note? }
 * DELETE /api/newsletter/queue?id=...     → delete a queue item
 *
 * Queue items only PLAN generation. The runner generates due items into DRAFTS;
 * this API never publishes and never posts Discord.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminCookieValue } from '@/lib/auth/admin';
import {
  listQueueItems,
  createQueueItem,
  updateQueueItem,
  deleteQueueItem,
  type QueueStatus,
} from '@/server/db/newsletter-queue-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_STATUSES: QueueStatus[] = ['queued', 'generated', 'skipped', 'failed', 'published', 'archived'];

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminCookieValue(cookieStore.get('evw_admin')?.value);
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status');
  const seasonParam = searchParams.get('season');
  const statuses = statusParam
    ? statusParam.split(',').filter((s): s is QueueStatus => (VALID_STATUSES as string[]).includes(s))
    : undefined;
  const season = seasonParam ? parseInt(seasonParam, 10) : undefined;
  const items = await listQueueItems({ statuses, season });
  return NextResponse.json({ success: true, items });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { season?: number; week?: number | null; episodeType?: string; scheduledFor?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const season = Number(body.season);
  const episodeType = String(body.episodeType ?? '').trim();
  const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;

  if (!season || Number.isNaN(season)) return NextResponse.json({ error: 'season is required' }, { status: 400 });
  if (!episodeType) return NextResponse.json({ error: 'episodeType is required' }, { status: 400 });
  if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
    return NextResponse.json({ error: 'scheduledFor must be a valid date/time' }, { status: 400 });
  }

  const week = body.week === null || body.week === undefined || body.week === ('' as unknown) ? null : Number(body.week);

  const item = await createQueueItem({
    season,
    week: week !== null && !Number.isNaN(week) ? week : null,
    episodeType,
    scheduledFor,
    note: body.note?.trim() || null,
  });
  return NextResponse.json({ success: true, item });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: { id?: string; status?: string; scheduledFor?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const patch: Parameters<typeof updateQueueItem>[1] = {};
  if (body.status !== undefined) {
    if (!(VALID_STATUSES as string[]).includes(body.status)) {
      return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
    }
    patch.status = body.status as QueueStatus;
    // Re-queuing (Retry) clears the prior failure/result so the next runner pass
    // treats it as fresh.
    if (body.status === 'queued') {
      patch.error = null;
      patch.generatedAt = null;
    }
  }
  if (body.scheduledFor !== undefined) {
    const d = new Date(body.scheduledFor);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid scheduledFor' }, { status: 400 });
    patch.scheduledFor = d;
  }
  if (body.note !== undefined) patch.note = body.note.trim() || null;

  const item = await updateQueueItem(id, patch);
  if (!item) return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
  return NextResponse.json({ success: true, item });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
  await deleteQueueItem(id);
  return NextResponse.json({ success: true });
}
