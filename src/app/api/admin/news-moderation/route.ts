import { NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import {
  getNewsModerationRules,
  addNewsModerationRule,
  deleteNewsModerationRule,
} from '@/server/db/news-moderation-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  try {
    const cookie = req.cookies.get('evw_admin')?.value;
    return isAdminCookieValue(cookie);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const rules = await getNewsModerationRules().catch(() => []);
  return Response.json({ rules });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const type = body?.type as string | undefined;
  const value = typeof body?.value === 'string' ? body.value.trim() : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() || undefined : undefined;

  if (!['hide_url', 'block_match', 'block_headline'].includes(type ?? '')) {
    return Response.json({ error: 'Invalid type. Must be hide_url, block_match, or block_headline.' }, { status: 400 });
  }
  if (!value) {
    return Response.json({ error: 'value is required' }, { status: 400 });
  }

  const rule = await addNewsModerationRule({
    type: type as 'hide_url' | 'block_match' | 'block_headline',
    value,
    reason,
  });
  return Response.json({ rule }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  const deleted = await deleteNewsModerationRule(id).catch(() => false);
  return Response.json({ deleted });
}
