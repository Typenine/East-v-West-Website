import { NextRequest } from 'next/server';
import { updateSuggestionStatus, deleteSuggestion, setSuggestionSponsor, setSuggestionVague } from '@/server/db/queries';
import { canonicalizeTeamName } from '@/lib/server/user-identity';

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
  const sponsorRaw = body?.sponsorTeam;
  let sponsorTeam: string | null | undefined = undefined;
  const vagueRaw = body?.vague;
  const vague: boolean | undefined = typeof vagueRaw === 'boolean' ? vagueRaw : undefined;
  if (typeof sponsorRaw === 'string') {
    const val = sponsorRaw.trim();
    sponsorTeam = val ? canonicalizeTeamName(val) : null;
  } else if (sponsorRaw === null) {
    sponsorTeam = null;
  }
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  if (!status && sponsorTeam === undefined && vague === undefined) {
    return Response.json({ error: 'nothing to update' }, { status: 400 });
  }
  try {
    let resolvedAt: string | null | undefined;
    if (status) {
      if (!['draft', 'open', 'accepted', 'rejected'].includes(status)) {
        return Response.json({ error: 'invalid status' }, { status: 400 });
      }
      const row = await updateSuggestionStatus(id, status);
      resolvedAt = row?.resolvedAt ? new Date(row.resolvedAt as unknown as Date).toISOString() : null;
    }
    if (sponsorTeam !== undefined) {
      await setSuggestionSponsor(id, sponsorTeam);
    }
    if (vague !== undefined) {
      await setSuggestionVague(id, vague);
    }
    return Response.json({ ok: true, id, status, resolvedAt: resolvedAt ?? null, sponsorTeam: sponsorTeam ?? undefined, vague });
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
