import { NextRequest } from 'next/server';
import { writeTeamPinWithResult } from '@/lib/server/pins';

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
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items as Array<Record<string, unknown>> : [];
    const map = body && typeof body.map === 'object' ? body.map as Record<string, Record<string, unknown>> : undefined;

    const entries: Array<{ team: string; hash: string; salt: string; pinVersion?: number; updatedAt?: string }> = [];
    if (items.length > 0) {
      for (const it of items) {
        const team = typeof it.team === 'string' ? it.team : '';
        const hash = typeof it.hash === 'string' ? it.hash : '';
        const salt = typeof it.salt === 'string' ? it.salt : '';
        const pinVersion = typeof it.pinVersion === 'number' ? it.pinVersion : 1;
        const updatedAt = typeof it.updatedAt === 'string' ? it.updatedAt : new Date().toISOString();
        if (team && hash && salt) entries.push({ team, hash, salt, pinVersion, updatedAt });
      }
    } else if (map && Object.keys(map).length > 0) {
      for (const [team, v] of Object.entries(map)) {
        const hash = typeof v.hash === 'string' ? v.hash : '';
        const salt = typeof v.salt === 'string' ? v.salt : '';
        const pinVersion = typeof v.pinVersion === 'number' ? v.pinVersion : 1;
        const updatedAt = typeof v.updatedAt === 'string' ? v.updatedAt : new Date().toISOString();
        if (team && hash && salt) entries.push({ team, hash, salt, pinVersion, updatedAt });
      }
    }

    if (entries.length === 0) return Response.json({ ok: true, imported: 0 });

    let ok = 0;
    for (const e of entries) {
      try {
        const res = await writeTeamPinWithResult(e.team, { hash: e.hash, salt: e.salt, pinVersion: e.pinVersion || 1, updatedAt: e.updatedAt || new Date().toISOString() });
        if (res?.blob || res?.kv || res?.fs) ok += 1;
      } catch {}
    }
    return Response.json({ ok: true, imported: ok, total: entries.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'server_error' }, { status: 500 });
  }
}
