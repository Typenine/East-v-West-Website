import { NextResponse } from 'next/server';
import { getNFLWeekStats, getNFLState } from '@/lib/utils/sleeper-api';

// 10 min TTL per season-week
const TTL_MS = 10 * 60 * 1000;
const cache: Record<string, { ts: number; data: unknown }> = {};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const playerId = url.searchParams.get('playerId');
    let season = url.searchParams.get('season') || '';
    if (!playerId) return NextResponse.json({ error: 'missing_playerId' }, { status: 400 });

    if (!season) {
      try {
        const state = await getNFLState();
        season = String(state.season || new Date().getFullYear());
      } catch {
        season = String(new Date().getFullYear());
      }
    }

    const key = `logs:${playerId}:${season}`;
    const now = Date.now();
    const cached = cache[key];
    if (cached && now - cached.ts < TTL_MS) {
      return NextResponse.json(cached.data, { status: 200 });
    }

    // Fetch all 17 weeks in parallel; ignore failures and missing weeks
    const weeks = Array.from({ length: 17 }, (_, i) => i + 1);
    const results = await Promise.all(
      weeks.map(async (w) => {
        try {
          const stats = await getNFLWeekStats(season!, w);
          const st = stats[playerId];
          if (!st) return { week: w, ptsPPR: 0 };
          const pts = Number((st as unknown as Record<string, number | undefined>)['pts_ppr'] ?? 0);
          return { week: w, ptsPPR: pts };
        } catch {
          return { week: w, ptsPPR: 0 };
        }
      })
    );

    const payload = { playerId, season, logs: results };
    cache[key] = { ts: now, data: payload };
    return NextResponse.json(payload, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
