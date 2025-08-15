import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type Suggestion = {
  id: string;
  content: string;
  category?: string;
  createdAt: string; // ISO string
};

const DATA_PATH = path.join(process.cwd(), 'data', 'suggestions.json');
const USE_KV = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

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

export async function GET() {
  if (USE_KV) {
    const { kv } = (await import('@vercel/kv')) as {
      kv: {
        lrange<T>(key: string, start: number, end: number): Promise<T[]>;
        lpush(key: string, value: string): Promise<number>;
      };
    };
    const raw = await kv.lrange<string>('suggestions', 0, 1000);
    const items: Suggestion[] = raw.map((v: string) => {
      try { return JSON.parse(v) as Suggestion; } catch { return null as unknown as Suggestion; }
    }).filter(Boolean);
    items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return Response.json(items);
  }

  const items = await readSuggestions();
  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
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

    const now = new Date().toISOString();
    const item: Suggestion = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      category: category && category.length > 0 ? category : undefined,
      createdAt: now,
    };

    if (USE_KV) {
      const { kv } = (await import('@vercel/kv')) as {
        kv: { lpush(key: string, value: string): Promise<number> };
      };
      await kv.lpush('suggestions', JSON.stringify(item));
      return Response.json(item, { status: 201 });
    }

    const items = await readSuggestions();
    items.push(item);
    await writeSuggestions(items);

    return Response.json(item, { status: 201 });
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    console.error('POST /api/suggestions failed', err);
    const msg = err && (err.code === 'EROFS' || err.code === 'EACCES')
      ? 'Persistent storage not configured on deployment (read-only filesystem). Configure Vercel KV to enable submissions.'
      : 'Failed to save suggestion';
    return Response.json({ error: msg }, { status: 500 });
  }
}
