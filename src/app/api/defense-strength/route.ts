import { NextRequest, NextResponse } from 'next/server';
import { getAllPlayersCached, getNFLState, getNFLWeekStats, type SleeperPlayer } from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 30 min TTL cache per season
const TTL_MS = 30 * 60 * 1000;
const cache: Record<string, { ts: number; data: unknown }> = {};

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let season = searchParams.get('season') || '';
    const uptoWeekParam = Number(searchParams.get('uptoWeek'));
    let uptoWeek: number | undefined = Number.isFinite(uptoWeekParam) ? uptoWeekParam : undefined;

    if (!season) {
      try {
        const s = await getNFLState();
        season = String((s as { season?: string }).season || new Date().getFullYear());
        if (!uptoWeek) uptoWeek = Math.max(1, Number((s as { week?: number }).week ?? 1) - 1);
      } catch {
        season = String(new Date().getFullYear());
        if (!uptoWeek) uptoWeek = 10;
      }
    }
    if (!uptoWeek || uptoWeek < 1) uptoWeek = 10;

    const key = `def-strength:${season}:${uptoWeek}`;
    const now = Date.now();
    const cached = cache[key];
    if (cached && now - cached.ts < TTL_MS) {
      return NextResponse.json(cached.data, { status: 200 });
    }

    const players = await getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>));

    // Accumulate DST PPR per team
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (let w = 1; w <= uptoWeek; w++) {
      try {
        const stats = await getNFLWeekStats(season, w);
        const st = stats as unknown as Record<string, Record<string, number | undefined>>;
        for (const pid in st) {
          const p = players[pid];
          if (!p) continue;
          if ((p.position || '').toUpperCase() !== 'DEF') continue;
          const team = (p.team || '').toUpperCase();
          if (!team) continue;
          const pts = Number(st[pid]['pts_ppr'] ?? 0);
          sums[team] = (sums[team] || 0) + (isFinite(pts) ? pts : 0);
          counts[team] = (counts[team] || 0) + 1;
        }
      } catch {
        // ignore week
      }
    }

    const means: Record<string, number> = {};
    const arr: number[] = [];
    for (const t in sums) {
      const m = sums[t] / Math.max(1, counts[t] || 1);
      means[t] = m;
      arr.push(m);
    }
    const leagueMean = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const leagueStd = arr.length > 1 ? Math.sqrt(arr.reduce((a, b) => a + (b - leagueMean) * (b - leagueMean), 0) / (arr.length - 1)) : 1;

    // Factor: tougher defenses (higher DST mean) -> reduce offensive expectations
    const factors: Record<string, number> = {};
    for (const t in means) {
      const z = leagueStd > 0 ? (means[t] - leagueMean) / leagueStd : 0;
      // 1 sigma tougher -> ~6% decrease; 1 sigma easier -> ~6% increase
      const f = clamp(1 - 0.06 * z, 0.85, 1.15);
      factors[t] = Number(f.toFixed(3));
    }

    const payload = { season, uptoWeek, leagueMean, leagueStd, factors };
    cache[key] = { ts: now, data: payload };
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error('defense-strength API error', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
