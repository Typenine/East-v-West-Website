import { promises as fs } from 'fs';
import path from 'path';
import { sendEmail } from '@/lib/utils/email';
import { getKV } from '@/lib/server/kv';

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
  // Per-item directory (data/suggestions/*.json)
  try {
    const dir = path.join(process.cwd(), 'data', 'suggestions');
    const entries = await fs.readdir(dir).catch(() => [] as string[]);
    for (const name of entries) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(dir, name), 'utf8');
        const j = JSON.parse(raw) as unknown;
        if (j && typeof j === 'object' && (j as Suggestion).id) out[(j as Suggestion).id] = j as Suggestion;
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

export async function GET() {
  // Merge sources: Blob + local file, to preserve legacy entries
  const merged: Record<string, Suggestion> = {};

  try {
    const { list } = await import('@vercel/blob');
    const token = await getBlobToken();
    const prefixes = ['suggestions/', 'evw/suggestions/', 'logs/suggestions/', 'content/suggestions/', 'public/suggestions/'];
    for (const pref of prefixes) {
      // Try without token then with token
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
    // Fallback: support a single JSON file stored in Blob (legacy)
    if (Object.keys(merged).length === 0) {
      try {
        const singleFiles = ['data/suggestions.json', 'evw/suggestions.json', 'logs/suggestions.json'];
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

  try {
    const local = await readSuggestionsLocalAll();
    for (const it of local) if (it && it.id) merged[it.id] = it;
  } catch {}

  // KV
  try {
    const kv = await getKV();
    if (kv) {
      const raw = (await kv.get('suggestions:items')) as string | null;
      if (raw && typeof raw === 'string') {
        const arr = JSON.parse(raw) as unknown;
        if (Array.isArray(arr)) {
          for (const it of arr as Suggestion[]) if (it && (it as Suggestion).id) merged[(it as Suggestion).id] = it as Suggestion;
        }
      }
    }
  } catch {}

  const items = Object.values(merged).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (items.length > 0) {
    return Response.json(items);
  }

  // Auto-recover from Resend email history if available and nothing found
  async function recoverFromResend(): Promise<Suggestion[]> {
    const key = process.env.RESEND_API_KEY;
    if (!key) return [];
    try {
      const r = await fetch('https://api.resend.com/emails?limit=1000', { headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) return [];
      const j = (await r.json()) as { data?: Array<Record<string, unknown>> };
      const arr = (j?.data || []) as Array<Record<string, unknown>>;
      const out: Suggestion[] = [];
      for (const o of arr) {
        const subj = typeof o['subject'] === 'string' ? (o['subject'] as string) : '';
        if (!subj.toLowerCase().startsWith('new suggestion')) continue;
        const createdAt = typeof o['created_at'] === 'string' ? (o['created_at'] as string) : new Date().toISOString();
        const m = subj.match(/New suggestion\s*\(([^)]+)\)/i);
        const category = m ? m[1] : undefined;
        let content = typeof o['text'] === 'string' ? (o['text'] as string) : '';
        if (!content && typeof o['html'] === 'string') {
          content = (o['html'] as string).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        if (!content) continue;
        const parts = content.split(/\n\s*\n/);
        if (parts.length >= 2) content = parts.slice(-1)[0].trim();
        const id = `${Date.parse(createdAt) || Date.now()}-${Buffer.from(content).toString('base64').slice(0,6)}`;
        out.push({ id, content, category, createdAt });
      }
      // Persist to Blob, KV and local to stabilize future reads
      if (out.length > 0) {
        try {
          const { put } = await import('@vercel/blob');
          const token = await getBlobToken();
          for (const it of out) {
            try {
              await put(`suggestions/${it.id}.json`, JSON.stringify(it), {
                access: 'public',
                contentType: 'application/json; charset=utf-8',
                token,
                addRandomSuffix: false,
                allowOverwrite: false,
              });
            } catch {}
          }
        } catch {}
        try {
          const existing = await readSuggestions().catch(() => [] as Suggestion[]);
          const map = new Map<string, Suggestion>();
          for (const s of existing) map.set(s.id, s);
          for (const s of out) map.set(s.id, s);
          await writeSuggestions(Array.from(map.values()));
        } catch {}
        try {
          const kv = await getKV();
          if (kv) {
            const list = Object.values(out);
            const raw = (await kv.get('suggestions:items')) as string | null;
            const prior = raw && typeof raw === 'string' ? (JSON.parse(raw) as Suggestion[]) : [];
            const m = new Map<string, Suggestion>();
            for (const s of prior) m.set(s.id, s);
            for (const s of list) m.set(s.id, s);
            await kv.set('suggestions:items', JSON.stringify(Array.from(m.values())));
          }
        } catch {}
      }
      return out;
    } catch {
      return [];
    }
  }

  const recovered = await recoverFromResend();
  return Response.json(recovered);
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

    const now = new Date().toISOString();
    const item: Suggestion = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      category: category && category.length > 0 ? category : undefined,
      createdAt: now,
    };

    // Write to all stores best-effort
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
    try {
      const kv = await getKV();
      if (kv) {
        const raw = (await kv.get('suggestions:items')) as string | null;
        const arr = raw && typeof raw === 'string' ? (JSON.parse(raw) as Suggestion[]) : [];
        arr.push(item);
        await kv.set('suggestions:items', JSON.stringify(arr));
      }
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
