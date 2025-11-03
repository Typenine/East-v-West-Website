import { getPresignedGet, r2PublicUrlForKey } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Record<string, string | string[]> }) {
  try {
    const raw = ctx.params?.key;
    const key = Array.isArray(raw) ? raw.join('/') : (typeof raw === 'string' ? raw : '');
    if (!key) return Response.json({ error: 'missing_key' }, { status: 400 });
    const pub = r2PublicUrlForKey(key);
    const url = pub || (await getPresignedGet({ key, expiresSec: 300 }));
    return Response.redirect(url, 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
