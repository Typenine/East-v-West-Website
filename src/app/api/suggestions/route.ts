import { promises as fs } from 'fs';
import path from 'path';
import { sendEmail } from '@/lib/utils/email';
import { getKV } from '@/lib/server/kv';
import { listSuggestions as dbListSuggestions, createSuggestion as dbCreateSuggestion } from '@/server/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type Suggestion = {
  id: string;
  content: string;
  category?: string;
  createdAt: string; // ISO string
};

const DATA_PATH = path.join(process.cwd(), 'data', 'suggestions.json');
const USE_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_TOKEN);
const NOTIFY_EMAIL = process.env.SUGGESTIONS_NOTIFY_EMAIL || 'patrickmmcnulty62@gmail.com';

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

async function readSuggestions(): Promise<Suggestion[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Suggestion[];
    return [];
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeSuggestions(items: Suggestion[]) {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(items, null, 2), 'utf8');
}

async function readSuggestionsLocalAll(): Promise<Suggestion[]> {
  const out: Record<string, Suggestion> = {};
  const files = [
    path.join(process.cwd(), 'data', 'suggestions.json'),
    path.join(process.cwd(), 'logs', 'suggestions.json'),
    path.join(process.cwd(), 'public', 'suggestions.json'),
  ];
  try {
    const dir = path.join(process.cwd(), 'data', 'suggestions');
    const entries = await fs.readdir(dir).catch(() => [] as string[]);
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(dir, name), 'utf8');
        const j = JSON.parse(raw) as unknown;
        const it = j as Suggestion;
        if (it && it.id) out[it.id] = it;
      } catch {}
    }
  } catch {}
  for (const f of files) {
    try {
      const raw = await fs.readFile(f, 'utf8');
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j)) {
        for (const it of j as Suggestion[]) if (it && (it as Suggestion).id) out[(it as Suggestion).id] = it as Suggestion;
      }
    } catch {}
  }
  return Object.values(out);
}

export async function GET(req: Request) {
  const urlObj = new URL(req.url);
  const qpToken = (urlObj.searchParams.get('token') || '').trim();
  const qpHost = (urlObj.searchParams.get('host') || '').trim();
  try {
    const rows = await dbListSuggestions();
    if (Array.isArray(rows) && rows.length >= 0) {
      type Row = { id: string; text: string; category: string | null; createdAt: string | Date };
      const items = (rows as Row[]).map((r) => ({ id: String(r.id), content: String(r.text), category: r.category || undefined, createdAt: new Date(r.createdAt).toISOString() } as Suggestion));
      return Response.json(items);
    }
  } catch {}
  async function getPublicHosts(): Promise<string[]> {
    let conf = '';
    try {
      const kv = await getKV();
      if (kv) {
        const raw = (await kv.get('blob:public_host')) as string | null;
        if (raw && typeof raw === 'string') conf = raw;
      }
    } catch {}
    const envHost = (process.env.BLOB_PUBLIC_HOST || '').trim();
    const one = (qpHost || conf || envHost).trim();
    const hosts: string[] = [];
    if (one) hosts.push(one.replace(/^https?:\/\//, '').replace(/\/$/, ''));
    hosts.push('east-v-west-website-blob.public.blob.vercel-storage.com');
    return Array.from(new Set(hosts));
  }
  async function tryPublicAggregates(): Promise<Suggestion[]> {
    const hosts = await getPublicHosts();
    const keys = [
      'evw/snapshots/suggestions/latest.json',
      'suggestions.json',
      'data/suggestions.json',
      'evw/suggestions.json',
      'logs/suggestions.json',
      'public/suggestions.json',
    ];
    const out: Record<string, Suggestion> = {};
    for (const h of hosts) {
      for (const k of keys) {
        try {
          const url = `https://${h}/${k}`;
          const r = await fetch(url, { cache: 'no-store' });
          if (!r.ok) continue;
          const j = (await r.json()) as unknown;
          if (Array.isArray(j)) {
            for (const it of j as Suggestion[]) if (it && (it as Suggestion).id) out[(it as Suggestion).id] = it as Suggestion;
            if (Object.keys(out).length > 0) return Object.values(out);
          }
        } catch {}
      }
    }
    return [] as Suggestion[];
  }
  try {
    const kv = await getKV();
    if (kv) {
      const raw = (await kv.get('suggestions:items')) as string | null;
      if (raw && typeof raw === 'string') {
        const arr = JSON.parse(raw) as unknown;
        if (Array.isArray(arr)) {
          const items = (arr as Suggestion[]).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
          return Response.json(items);
        }
      }
    }
  } catch {}

  const merged: Record<string, Suggestion> = {};

  try {
    const pub = await tryPublicAggregates();
    for (const it of pub) if (it && it.id) merged[it.id] = it;
  } catch {}

  try {
    const local = await readSuggestionsLocalAll();
    for (const it of local) if (it && it.id) merged[it.id] = it;
  } catch {}

  try {
    const { list } = await import('@vercel/blob');
    const token = qpToken || (await getBlobToken());
    const prefixes = ['suggestions/', 'evw/suggestions/', 'logs/suggestions/', 'content/suggestions/', 'public/suggestions/'];
    for (const pref of prefixes) {
      let blobs: Array<{ url: string; pathname?: string; uploadedAt?: string }> = [];
      try {
        const r1 = await list({ prefix: pref } as { prefix: string });
        blobs = (r1 as unknown as { blobs?: Array<{ url: string; pathname?: string; uploadedAt?: string }> }).blobs || [];
      } catch {}
      if ((!blobs || blobs.length === 0) && token) {
        try {
          const r2 = await list({ prefix: pref, token } as { prefix: string; token?: string });
          blobs = (r2 as unknown as { blobs?: Array<{ url: string; pathname?: string; uploadedAt?: string }> }).blobs || [];
        } catch {}
      }
      type MinimalBlob = { url: string; uploadedAt?: string };
      const items = (blobs as unknown as MinimalBlob[]) || [];
      for (const b of items) {
        try {
          const res = await fetch(b.url, { cache: 'no-store' });
          if (!res.ok) continue;
          const json = (await res.json()) as Suggestion;
          if (json && json.id) merged[json.id] = json;
        } catch {}
      }
    }
    if (Object.keys(merged).length === 0) {
      try {
        const singleFiles = ['suggestions.json', 'data/suggestions.json', 'evw/suggestions.json', 'logs/suggestions.json', 'public/suggestions.json'];
        for (const key of singleFiles) {
          const r3 = await list({ prefix: key, token } as { prefix: string; token?: string });
          const arr = (r3 as unknown as { blobs?: Array<{ url: string }> }).blobs || [];
          if (arr.length > 0) {
            const res2 = await fetch(arr[0].url, { cache: 'no-store' });
            if (res2.ok) {
              const json2 = (await res2.json()) as unknown;
              if (Array.isArray(json2)) {
                for (const it of json2 as Suggestion[]) if (it && (it as Suggestion).id) merged[(it as Suggestion).id] = it as Suggestion;
              }
            }
          }
          if (Object.keys(merged).length > 0) break;
        }
      } catch {}
    }
  } catch {}

  const items = Object.values(merged).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  try {
    if (items.length > 0) {
      const kv = await getKV();
      if (kv) await kv.set('suggestions:items', JSON.stringify(items));
    }
  } catch {}
  return Response.json(items);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : undefined;

    if (!content || content.length < 3) {
      return Response.json({ error: 'Content must be at least 3 characters.' }, { status: 400 });
    }
    if (content.length > 5000) {
      return Response.json({ error: 'Content too long (max 5000 chars).' }, { status: 400 });
    }

    // basic IP rate-limit 10/min
    try {
      const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
      const kv = await getKV();
      if (kv) {
        const key = `rl:suggestions:${ip}`;
        const n = await kv.incr(key);
        if (kv.expire && n === 1) await kv.expire(key, 60);
        if (n > 10) return Response.json({ error: 'Too many requests' }, { status: 429 });
      }
    } catch {}

    const now = new Date().toISOString();
    const item: Suggestion = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      category: category && category.length > 0 ? category : undefined,
      createdAt: now,
    };
    // DB first
    try {
      const row = await dbCreateSuggestion({ userId: null, text: item.content, category: item.category || null });
      if (row && row.id) {
        item.id = String(row.id);
        item.createdAt = new Date(row.createdAt).toISOString();
      }
    } catch {}

    if (USE_BLOB) {
      try {
        const { put } = await import('@vercel/blob');
        const token = await getBlobToken();
        await put(`suggestions/${item.id}.json`, JSON.stringify(item), {
          access: 'public',
          contentType: 'application/json; charset=utf-8',
          token,
          addRandomSuffix: false,
          allowOverwrite: false,
        });
      } catch (e) {
        console.warn('[suggestions] blob write failed', e);
      }
    }

    try {
      const items = await readSuggestions();
      items.push(item);
      await writeSuggestions(items);
    } catch {}
    // Fire notification email (best-effort)
    try {
      await sendEmail({
        to: NOTIFY_EMAIL,
        subject: `New suggestion${item.category ? ` (${item.category})` : ''}`,
        text: `A new suggestion was submitted at ${item.createdAt}.\n\nCategory: ${item.category || 'N/A'}\n\n${item.content}`,
        html: `<p>A new suggestion was submitted at <strong>${item.createdAt}</strong>.</p><p><strong>Category:</strong> ${item.category || 'N/A'}</p><pre style="white-space:pre-wrap;word-wrap:break-word;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace">${item.content.replace(/</g,'&lt;')}</pre>`
      });
    } catch (e) {
      console.warn('[suggestions] notify email failed', e);
    }
    return Response.json(item, { status: 201 });
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    console.error('POST /api/suggestions failed', err);
    const msg = err && (err.code === 'EROFS' || err.code === 'EACCES')
      ? 'Persistent storage not configured on deployment (read-only filesystem). Configure Vercel Blob to enable submissions.'
      : 'Failed to save suggestion';
    return Response.json({ error: msg }, { status: 500 });
  }
}
