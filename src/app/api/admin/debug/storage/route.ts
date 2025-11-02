import { NextRequest } from 'next/server';
import { getKV } from '@/lib/server/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

export async function GET(req: NextRequest) {
  try {
    const out: Record<string, unknown> = { ok: true };

    // Suggestions in Blob
    try {
      const { list } = await import('@vercel/blob');
      const token = await getBlobToken();
      const prefixes = ['suggestions/', 'evw/suggestions/', 'logs/suggestions/', 'content/suggestions/', 'public/suggestions/'];
      const counts: Record<string, number> = {};
      for (const pref of prefixes) {
        try {
          const r1 = await list({ prefix: pref } as { prefix: string });
          const c1 = (r1 as unknown as { blobs?: unknown[] }).blobs?.length || 0;
          let c = c1;
          if (c === 0 && token) {
            const r2 = await list({ prefix: pref, token } as { prefix: string; token?: string });
            c = (r2 as unknown as { blobs?: unknown[] }).blobs?.length || 0;
          }
          counts[pref] = c;
        } catch {}
      }
      out.blobSuggestions = counts;
    } catch (e) {
      out.blobSuggestions = { error: String(e) };
    }

    // Suggestions KV
    try {
      const kv = await getKV();
      if (kv) {
        const raw = (await kv.get('suggestions:items')) as string | null;
        out.kvSuggestionsCount = raw ? (Array.isArray(JSON.parse(raw)) ? (JSON.parse(raw) as unknown[]).length : -1) : 0;
      } else {
        out.kvSuggestionsCount = 'kv_unavailable';
      }
    } catch (e) {
      out.kvSuggestionsCount = { error: String(e) };
    }

    // Pins Map in Blob (global)
    try {
      const { list } = await import('@vercel/blob');
      const token = await getBlobToken();
      const keys = ['auth/team-pins.json', 'evw/team-pins.json', 'data/team-pins.json', 'auth/pins.json'];
      const counts: Record<string, number> = {};
      for (const key of keys) {
        try {
          const r = await list({ prefix: key, token } as { prefix: string; token?: string });
          counts[key] = (r as unknown as { blobs?: unknown[] }).blobs?.length || 0;
        } catch {}
      }
      out.blobPinsMaps = counts;
    } catch (e) {
      out.blobPinsMaps = { error: String(e) };
    }

    // Per-team pin files in Blob
    try {
      const { list } = await import('@vercel/blob');
      const token = await getBlobToken();
      const prefixes = ['auth/pins/', 'auth/team-pins/', 'evw/pins/'];
      const counts: Record<string, number> = {};
      for (const pref of prefixes) {
        try {
          const r = await list({ prefix: pref, token } as { prefix: string; token?: string });
          counts[pref] = (r as unknown as { blobs?: unknown[] }).blobs?.length || 0;
        } catch {}
      }
      out.blobPinsPerTeam = counts;
    } catch (e) {
      out.blobPinsPerTeam = { error: String(e) };
    }

    return Response.json(out);
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
