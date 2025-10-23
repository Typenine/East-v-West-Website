import { promises as fs } from 'fs';
import path from 'path';
import { sendEmail } from '@/lib/utils/email';

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
  if (USE_BLOB) {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: 'suggestions/' });
    type MinimalBlob = { url: string; uploadedAt?: string };
    const items = blobs as unknown as MinimalBlob[];
    // Sort newest first by uploadedAt
    const sorted = [...items].sort(
      (a, b) => Date.parse(b.uploadedAt ?? '0') - Date.parse(a.uploadedAt ?? '0')
    );
    const results: Suggestion[] = [];
    for (const b of sorted) {
      try {
        // Read JSON content server-side
        const res = await fetch(b.url);
        const json = (await res.json()) as Suggestion;
        results.push(json);
      } catch {
        // ignore corrupt item
      }
    }
    return Response.json(results);
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

    if (USE_BLOB) {
      const { put } = await import('@vercel/blob');
      await put(`suggestions/${item.id}.json`, JSON.stringify(item), {
        access: 'public',
        contentType: 'application/json; charset=utf-8',
      });
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
    }

    const items = await readSuggestions();
    items.push(item);
    await writeSuggestions(items);
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
