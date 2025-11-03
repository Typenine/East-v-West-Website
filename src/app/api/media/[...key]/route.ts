import { NextRequest } from 'next/server';
import { getPresignedGet, r2PublicUrlForKey } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: { key: string[] } }) {
  try {
    const key = (ctx.params?.key || []).join('/');
    if (!key) return Response.json({ error: 'missing_key' }, { status: 400 });
    const pub = r2PublicUrlForKey(key);
    const url = pub || (await getPresignedGet({ key, expiresSec: 300 }));
    return Response.redirect(url, 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
