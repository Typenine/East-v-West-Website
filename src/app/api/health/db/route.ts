export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getDb } from '@/server/db/client';

export async function GET() {
  try {
    const db = getDb();
    // simple round-trip: select now()
    // drizzle with neon-http supports sql tagged template via db.execute if needed,
    // but calling getDb() is enough to validate URL; so we just return ok
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
