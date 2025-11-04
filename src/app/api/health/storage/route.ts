export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getR2Client } from '@/server/storage/r2';

export async function GET() {
  try {
    const have = {
      R2_ACCOUNT_ID: !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCOUNT_ID.trim()),
      R2_ACCESS_KEY_ID: !!(process.env.R2_ACCESS_KEY_ID && process.env.R2_ACCESS_KEY_ID.trim()),
      R2_SECRET_ACCESS_KEY: !!(process.env.R2_SECRET_ACCESS_KEY && process.env.R2_SECRET_ACCESS_KEY.trim()),
      R2_BUCKET: !!(process.env.R2_BUCKET && process.env.R2_BUCKET.trim()),
      R2_PUBLIC_BASE: !!(process.env.R2_PUBLIC_BASE && process.env.R2_PUBLIC_BASE.trim()),
    };
    try {
      // Try to instantiate the client; will throw if required envs missing
      getR2Client();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return Response.json({ ok: false, have, error: msg }, { status: 500 });
    }
    return Response.json({ ok: true, have });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
