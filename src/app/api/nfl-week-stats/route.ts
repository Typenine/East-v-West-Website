import { NextRequest, NextResponse } from 'next/server';
import { getNFLState, getNFLWeekStats } from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 15_000;
const cache: Record<string, { ts: number; data: unknown }> = {};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const weekParam = Number(searchParams.get('week'));
    const week = clamp(Number.isFinite(weekParam) ? weekParam : 1, 1, 23);
    let season = searchParams.get('season') || undefined;
    if (!season) {
      try {
        const s = await getNFLState();
        season = String((s as { season?: string }).season || new Date().getFullYear());
      } catch {
        season = String(new Date().getFullYear());
      }
    }
    const cacheKey = `season:${season}-week:${week}`;

    const now = Date.now();
    const cached = cache[cacheKey];
    if (cached && now - cached.ts < TTL_MS) {
      return NextResponse.json(cached.data, { status: 200 });
    }

    const stats = await getNFLWeekStats(season!, week);

    const payload = {
      season,
      week,
      generatedAt: new Date().toISOString(),
      stats,
    };

    cache[cacheKey] = { ts: now, data: payload };
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error('nfl-week-stats API error', err);
    return NextResponse.json({ error: 'Failed to load week stats' }, { status: 500 });
  }
}
