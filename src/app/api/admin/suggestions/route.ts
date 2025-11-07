import { NextRequest } from 'next/server';
import { updateSuggestionStatus, deleteSuggestion } from '@/server/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSecret(): string {
  return process.env.EVW_ADMIN_SECRET || '002023';
}

function isAdmin(req: NextRequest): boolean {
  try {
    const cookie = req.cookies.get('evw_admin')?.value;
    return cookie === getSecret();
  } catch {
    return false;
  }
}

export async function PUT(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  const status = body?.status as 'draft' | 'open' | 'accepted' | 'rejected' | undefined;
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  if (!status || !['draft', 'open', 'accepted', 'rejected'].includes(status)) {
    return Response.json({ error: 'invalid status' }, { status: 400 });
  }
  try {
    const row = await updateSuggestionStatus(id, status);
    return Response.json({ ok: true, id, status, resolvedAt: row?.resolvedAt || null });
  } catch {
    return Response.json({ error: 'update failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  let id = '';
  try {
    const body = await req.json().catch(() => ({}));
    id = typeof body?.id === 'string' ? body.id : '';
  } catch {}
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  try {
    const ok = await deleteSuggestion(id);
    return ok ? Response.json({ ok: true, id }) : Response.json({ error: 'not found' }, { status: 404 });
  } catch {
    return Response.json({ error: 'delete failed' }, { status: 500 });
  }
}
