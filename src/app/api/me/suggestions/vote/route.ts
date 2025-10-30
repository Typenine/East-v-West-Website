import { NextRequest } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { readUserDoc, writeUserDoc } from '@/lib/server/user-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  const ident = await requireTeamUser();
  if (!ident) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const suggestionId = typeof body?.suggestionId === 'string' ? body.suggestionId.trim() : '';
  const valueRaw = body?.value;
  const value = typeof valueRaw === 'number' ? valueRaw : NaN;
  if (!suggestionId) return Response.json({ error: 'suggestionId required' }, { status: 400 });
  if (![ -1, 0, 1 ].includes(value)) return Response.json({ error: 'value must be -1, 0, or 1' }, { status: 400 });

  const doc = await readUserDoc(ident.userId, ident.team);
  if (!doc.votes) doc.votes = {};
  const key = 'suggestions';
  if (!doc.votes[key]) doc.votes[key] = {};
  if (value === 0) delete doc.votes[key][suggestionId]; else doc.votes[key][suggestionId] = value;
  doc.version = (doc.version || 0) + 1;
  doc.updatedAt = new Date().toISOString();
  const ok = await writeUserDoc(doc);
  if (!ok) return Response.json({ error: 'Persist failed' }, { status: 500 });
  return Response.json({ ok: true, suggestionId, value: value === 0 ? null : value });
}
