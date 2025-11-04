export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { putObjectText, presignGet, publicUrl } from '@/server/storage/r2';

export async function GET() {
  try {
    const account = (process.env.R2_ACCOUNT_ID || '').trim();
    const bucket = (process.env.R2_BUCKET || '').trim();
    const access = (process.env.R2_ACCESS_KEY_ID || '').trim();
    const secret = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
    if (!account || !bucket || !access || !secret) {
      return Response.json({ ok: false, error: 'R2 envs missing' }, { status: 500 });
    }

    const key = `diagnostics/test-${Date.now()}.txt`;
    const body = `hello evw ${new Date().toISOString()}`;

    await putObjectText({ key, text: body });

    const direct = publicUrl(key);
    const url = direct || (await presignGet({ key, expiresSec: 300 }));

    return Response.json({ ok: true, key, url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
