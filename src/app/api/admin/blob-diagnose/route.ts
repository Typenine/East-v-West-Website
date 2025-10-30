import { NextRequest } from 'next/server';
import { getKV } from '@/lib/server/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getToken(): Promise<{ token?: string; source: 'kv' | 'env' | 'none' }> {
  try {
    const kv = await getKV();
    if (kv) {
      const raw = (await kv.get('blob:token')) as string | null;
      if (raw && typeof raw === 'string' && raw.length > 0) return { token: raw, source: 'kv' };
    }
  } catch {}
  if (process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_READ_WRITE_TOKEN.length > 0) {
    return { token: process.env.BLOB_READ_WRITE_TOKEN, source: 'env' };
  }
  return { source: 'none' };
}

export async function GET(_req: NextRequest) {
  try {
    const { token, source } = await getToken();
    const hasToken = !!token;
    let pingOk = false;
    let err: string | undefined;
    if (token) {
      try {
        const { put } = await import('@vercel/blob');
        await put('auth/_diag.txt', new Date().toISOString(), {
          access: 'public',
          contentType: 'text/plain; charset=utf-8',
          token,
          addRandomSuffix: true,
        });
        pingOk = true;
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
      }
    }
    return Response.json({ hasToken, tokenSource: source, pingOk, error: err ?? null });
  } catch (e) {
    return Response.json({ error: 'diagnostic failed' }, { status: 500 });
  }
}
