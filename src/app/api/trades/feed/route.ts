import { NextRequest, NextResponse } from 'next/server';
import { getTradeFeed } from '@/server/trade-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Precomputed trade feed for the /trades page.
 * The heavy Sleeper aggregation happens server-side (cached in memory with
 * stale-while-revalidate); clients receive ready-to-render card view models.
 * `?fresh=1` bypasses the server cache (used after admin trade edits).
 */
export async function GET(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get('fresh') === '1';
  try {
    const payload = await getTradeFeed({ fresh });
    return NextResponse.json(payload, {
      status: 200,
      headers: fresh
        ? { 'Cache-Control': 'no-store' }
        : { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
    });
  } catch (err) {
    console.error('trades/feed GET error', err);
    return NextResponse.json({ error: 'Failed to build trade feed' }, { status: 500 });
  }
}
