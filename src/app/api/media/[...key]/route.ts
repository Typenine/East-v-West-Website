import { presignGet, publicUrl } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const path = url.pathname;
    // Extract everything after /api/media/
    const idx = path.indexOf('/api/media/');
    const key = idx >= 0 ? decodeURIComponent(path.slice(idx + '/api/media/'.length)) : '';
    if (!key) return Response.json({ error: 'missing_key' }, { status: 400 });
    const pub = publicUrl(key);
    const getUrl = pub || (await presignGet({ key, expiresSec: 300 }));
    return Response.redirect(getUrl, 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
