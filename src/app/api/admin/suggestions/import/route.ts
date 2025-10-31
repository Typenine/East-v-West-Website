import { NextRequest } from 'next/server';
import { getKV } from '@/lib/server/kv';
import { Suggestion } from '@/app/api/suggestions/route';

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

async function getBlobToken(): Promise<string | undefined> {
  try {
    const kv = await getKV();
    if (kv) {
      const raw = (await kv.get('blob:token')) as string | null;
      if (raw && typeof raw === 'string' && raw.length > 0) return raw;
    }
  } catch {}
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_TOKEN || undefined;
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({} as { items?: Suggestion[] }));
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return Response.json({ error: 'no_items' }, { status: 400 });

    let blobOk = 0;
    let fileOk = 0;

    // Write to Blob itemized
    try {
      const { put } = await import('@vercel/blob');
      const token = await getBlobToken();
      for (const it of items) {
        if (!it || !it.id) continue;
        await put(`suggestions/${it.id}.json`, JSON.stringify(it), {
          access: 'public',
          contentType: 'application/json; charset=utf-8',
          token,
          addRandomSuffix: false,
          allowOverwrite: false,
        });
        blobOk++;
      }
    } catch {}

    // Merge into local file
    try {
      const { promises: fs } = await import('fs');
      const path = await import('path');
      const DATA_PATH = path.join(process.cwd(), 'data', 'suggestions.json');
      let cur: Suggestion[] = [];
      try {
        const raw = await fs.readFile(DATA_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) cur = parsed as Suggestion[];
      } catch {}
      const map = new Map<string, Suggestion>();
      for (const s of cur) map.set(s.id, s);
      for (const it of items) map.set(it.id, it);
      const merged = Array.from(map.values()).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
      await fs.writeFile(DATA_PATH, JSON.stringify(merged, null, 2), 'utf8');
      fileOk = merged.length;
    } catch {}

    return Response.json({ ok: true, writtenBlob: blobOk, totalFile: fileOk });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
