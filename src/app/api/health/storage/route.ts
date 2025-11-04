export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getR2Status, putObjectText } from '@/server/storage/r2';

export async function GET() {
  const have = {
    R2_ACCOUNT_ID: !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCOUNT_ID.trim()),
    R2_ACCESS_KEY_ID: !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_ACCESS_KEY_ID.trim()),
    R2_SECRET_ACCESS_KEY: !!(process.env.R2_SECRET_ACCESS_KEY && process.env.R2_SECRET_ACCESS_KEY.trim()),
    R2_BUCKET: !!(process.env.R2_BUCKET && process.env.R2_BUCKET.trim()),
    R2_PUBLIC_BASE: !!(process.env.R2_PUBLIC_BASE && process.env.R2_PUBLIC_BASE.trim()),
  };
  try {
    let putSmoke: string = 'skip';
    try {
      await putObjectText({ key: 'health/ping.txt', text: `ok ${new Date().toISOString()}` });
      putSmoke = 'ok';
    } catch (e) {
      putSmoke = e instanceof Error ? e.message : String(e);
    }
    const status = getR2Status();
    return Response.json({ ok: true, have, mode: status.mode || null, lastVerifiedAt: status.lastVerifiedAt || null, putSmoke, corsHint: !process.env.R2_PUBLIC_BASE ? 'Configure Cloudflare R2 CORS and allow PUT from your origins' : undefined });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, have, error: msg }, { status: 500 });
  }
}

