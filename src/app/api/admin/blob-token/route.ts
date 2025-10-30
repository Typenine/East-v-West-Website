import { NextRequest } from 'next/server';
import { getKV } from '@/lib/server/kv';
import { TEAM_NAMES } from '@/lib/constants/league';
import { readPins, writeTeamPin, readTeamPin, StoredPin } from '@/lib/server/pins';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.AUTH_SECRET;
  if (!secret) return false;
  const header = req.headers.get('x-admin-secret');
  return !!header && header === secret;
}

async function hasExistingToken(): Promise<boolean> {
  if (process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_READ_WRITE_TOKEN.length > 0) return true;
  try {
    const kv = await getKV();
    if (kv) {
      const raw = (await kv.get('blob:token')) as string | null;
      if (raw && raw.length > 0) return true;
    }
  } catch {}
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const already = await hasExistingToken();
    const url = new URL(req.url);
    const tokenParam = url.searchParams.get('token') || '';
    if (!already && tokenParam) {
      // One-time bootstrap via GET query param
      const kv = await getKV();
      if (!kv) return Response.json({ error: 'KV unavailable' }, { status: 500 });
      await kv.set('blob:token', tokenParam);
      let blobOk = false;
      try {
        const { put } = await import('@vercel/blob');
        await put('auth/_ping.txt', 'ok', { access: 'public', contentType: 'text/plain; charset=utf-8', addRandomSuffix: true, token: tokenParam });
        blobOk = true;
      } catch {
        blobOk = false;
      }

      // Best-effort migration
      let migrated = 0;
      let skipped = 0;
      try {
        const legacy = await readPins();
        for (const team of TEAM_NAMES) {
          const entry = legacy[team] as StoredPin | undefined;
          if (!entry) continue;
          const existing = await readTeamPin(team);
          if (existing && (existing.pinVersion || 0) >= (entry.pinVersion || 0)) {
            skipped++;
            continue;
          }
          const ok = await writeTeamPin(team, entry);
          if (ok) migrated++;
        }
      } catch {}

      return Response.json({ ok: true, blobOk, migrated, skipped, bootstrapped: true });
    }

    if (!requireAdmin(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const kv = await getKV();
    let hasToken = false;
    if (kv) {
      const raw = (await kv.get('blob:token')) as string | null;
      hasToken = !!raw && raw.length > 0;
    }
    return Response.json({ hasToken });
  } catch {
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const already = await hasExistingToken();
    if (already) {
      if (!requireAdmin(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) return Response.json({ error: 'token required' }, { status: 400 });
    const kv = await getKV();
    if (!kv) return Response.json({ error: 'KV unavailable' }, { status: 500 });
    await kv.set('blob:token', token);

    // Optional: try a small authenticated write to validate token
    let blobOk = false;
    try {
      const { put } = await import('@vercel/blob');
      await put('auth/_ping.txt', 'ok', { access: 'public', contentType: 'text/plain; charset=utf-8', addRandomSuffix: true, token });
      blobOk = true;
    } catch {
      blobOk = false;
    }

    // Best-effort migration: copy legacy map to per-team blobs where newer/not present
    let migrated = 0;
    let skipped = 0;
    try {
      const legacy = await readPins();
      for (const team of TEAM_NAMES) {
        const entry = legacy[team] as StoredPin | undefined;
        if (!entry) continue;
        const existing = await readTeamPin(team);
        if (existing && (existing.pinVersion || 0) >= (entry.pinVersion || 0)) {
          skipped++;
          continue;
        }
        const ok = await writeTeamPin(team, entry);
        if (ok) migrated++;
      }
    } catch {}

    return Response.json({ ok: true, blobOk, migrated, skipped });
  } catch {
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
