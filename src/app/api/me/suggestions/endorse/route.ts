import { NextRequest } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { addSuggestionEndorsement, removeSuggestionEndorsement } from '@/server/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  const ident = await requireTeamUser();
  if (!ident) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  type EndorseBody = { suggestionId?: string; endorse?: boolean };
  const body = (await req.json().catch(() => ({}))) as EndorseBody;
  const suggestionId = typeof body.suggestionId === 'string' ? body.suggestionId.trim() : '';
  const endorseRaw = body.endorse;
  const endorse = typeof endorseRaw === 'boolean' ? endorseRaw : null;
  if (!suggestionId) return Response.json({ error: 'suggestionId required' }, { status: 400 });
  if (endorse === null) return Response.json({ error: 'endorse boolean required' }, { status: 400 });
  try {
    const ok = endorse
      ? await addSuggestionEndorsement(suggestionId, ident.team)
      : await removeSuggestionEndorsement(suggestionId, ident.team);
    if (!ok) return Response.json({ error: 'Persist failed' }, { status: 500 });
    return Response.json({ ok: true, suggestionId, endorse });
  } catch {
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
