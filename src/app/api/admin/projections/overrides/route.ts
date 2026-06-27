import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredAdminSecret, isAdminCookieValue } from '@/lib/auth/admin';
import { getAllPlayersCached } from '@/lib/utils/sleeper-api';
import {
  createProjectionOverride,
  deleteProjectionOverride,
  listProjectionOverrides,
  sanitizeProjectionOverride,
  setProjectionOverrideActive,
} from '@/lib/fantasy/projection-overrides';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  const secret = getConfiguredAdminSecret();
  return Boolean(
    isAdminCookieValue(req.cookies.get('evw_admin')?.value) ||
    (secret && req.headers.get('x-admin-secret') === secret)
  );
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const rows = await listProjectionOverrides({ includeInactive: true });
  const players: Awaited<ReturnType<typeof getAllPlayersCached>> = await getAllPlayersCached().catch(() => ({}));
  return NextResponse.json({
    overrides: rows.map((row) => ({
      ...row,
      playerName: row.playerId
        ? `${players[row.playerId]?.first_name || ''} ${players[row.playerId]?.last_name || ''}`.trim() || row.playerId
        : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const input = sanitizeProjectionOverride(body);
    const created = await createProjectionOverride(input);
    return NextResponse.json({ ok: true, override: created });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create override' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Valid override ID required' }, { status: 400 });
  const updated = await setProjectionOverrideActive(id, body.active !== false);
  if (!updated) return NextResponse.json({ error: 'Override not found' }, { status: 404 });
  return NextResponse.json({ ok: true, override: updated });
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Valid override ID required' }, { status: 400 });
  const deleted = await deleteProjectionOverride(id);
  return NextResponse.json({ ok: deleted });
}
