import { NextRequest } from 'next/server';
import { getPresignedPut, getPresignedGet, r2PublicUrlForKey } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} is missing`);
  return v;
}

function makeKey(hint?: string, extHint?: string) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 10);
  const base = hint && /^[a-z0-9\-_/]+$/i.test(hint) ? hint.replace(/^\/+|\/+$/g, '') : 'uploads';
  const ext = extHint && /^[a-z0-9]+$/i.test(extHint) ? `.${extHint}` : '';
  return `${base}/${yyyy}/${mm}/${dd}/${Date.now()}-${rand}${ext}`;
}

export async function POST(req: NextRequest) {
  try {
    requireEnv('R2_ACCOUNT_ID');
    requireEnv('R2_ACCESS_KEY_ID');
    requireEnv('R2_SECRET_ACCESS_KEY');
    requireEnv('R2_BUCKET');

    const body = await req.json().catch(() => ({}));
    const contentType = typeof body.contentType === 'string' ? body.contentType : 'application/octet-stream';
    const keyHint = typeof body.key === 'string' ? body.key : undefined;
    const ext = typeof body.ext === 'string' ? body.ext : undefined;
    const key = keyHint && keyHint.length > 0 ? keyHint : makeKey(undefined, ext);

    const putUrl = await getPresignedPut({ key, contentType, expiresSec: 300 });
    const publicUrl = r2PublicUrlForKey(key);
    const getUrl = publicUrl || (await getPresignedGet({ key, expiresSec: 300 }));

    return Response.json({ key, putUrl, getUrl }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
