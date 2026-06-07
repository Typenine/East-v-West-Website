import { NextRequest } from 'next/server';
import { hashPin } from '@/lib/server/auth';
import { readTeamPin, writeTeamPinWithError } from '@/lib/server/pins';
import { getConfiguredAdminSecret, isAdminCookieValue } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  const adminSecret = getConfiguredAdminSecret();
  if (!adminSecret) return false;
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) return auth.slice('Bearer '.length) === adminSecret;
  const hdr = req.headers.get('x-admin-key');
  if (hdr && hdr === adminSecret) return true;
  return isAdminCookieValue(req.cookies.get('evw_admin')?.value);
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({} as { team?: string; pin?: string }));
    const team = typeof body.team === 'string' ? body.team.trim() : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (!team || !/^[0-9]{4,12}$/.test(pin)) return Response.json({ error: 'bad_request' }, { status: 400 });
    const { hash, salt } = await hashPin(pin);
    const prev = await readTeamPin(team);
    const rec = { hash, salt, pinVersion: (prev?.pinVersion ?? 0) + 1, updatedAt: new Date().toISOString() };
    const res = await writeTeamPinWithError(team, rec);
    if (!res.ok) return Response.json({ error: `write_failed: ${res.error || 'unknown'}` }, { status: 500 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
