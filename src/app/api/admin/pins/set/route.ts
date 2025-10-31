import { NextRequest } from 'next/server';
import { hashPin } from '@/lib/server/auth';
import { writeTeamPinWithError } from '@/lib/server/pins';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  const adminSecret = process.env.EVW_ADMIN_SECRET || '002023';
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) return auth.slice('Bearer '.length) === adminSecret;
  const hdr = req.headers.get('x-admin-key');
  if (hdr && hdr === adminSecret) return true;
  const cookie = req.cookies.get('evw_admin')?.value;
  if (cookie && cookie === adminSecret) return true;
  return false;
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({} as { team?: string; pin?: string }));
    const team = typeof body.team === 'string' ? body.team.trim() : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (!team || !/^[0-9]{4,12}$/.test(pin)) return Response.json({ error: 'bad_request' }, { status: 400 });
    const { hash, salt } = await hashPin(pin);
    const rec = { hash, salt, pinVersion: Date.now(), updatedAt: new Date().toISOString() };
    const res = await writeTeamPinWithError(team, rec);
    if (!res.ok) return Response.json({ error: `write_failed: ${res.error || 'unknown'}` }, { status: 500 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
