import { NextRequest, NextResponse } from 'next/server';
import { getNFLState, getNFLWeekStats } from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 10 min TTL cache per season & player set
const TTL_MS = 10 * 60 * 1000;
const cache: Record<string, { ts: number; data: unknown }> = {};

function parsePlayersParam(param: string | null): string[] {
  if (!param) return [];
  return param
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  const s = values.reduce((a, b) => a + b, 0);
  return s / values.length;
}

function stddev(values: number[]): number {
  const n = values.length;
  if (n <= 1) return 0;
  const m = mean(values);
  let ss = 0;
  for (const v of values) ss += (v - m) * (v - m);
  return Math.sqrt(ss / (n - 1));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playersParam = searchParams.get('players');
    let season = searchParams.get('season') || '';

    const players = parsePlayersParam(playersParam);
    if (players.length === 0) {
      return NextResponse.json({ error: 'missing_players' }, { status: 400 });
    }

    if (!season) {
      try {
        const s = await getNFLState();
        season = String((s as { season?: string }).season || new Date().getFullYear());
      } catch {
        season = String(new Date().getFullYear());
      }
    }

    const key = `baselines:${season}:${players.sort().join('|')}`;
    const now = Date.now();
    const cached = cache[key];
    if (cached && now - cached.ts < TTL_MS) {
      return NextResponse.json(cached.data, { status: 200 });
    }

    const weeks = Array.from({ length: 17 }, (_, i) => i + 1);

    // Prepare holder for values per player
    const valuesByPlayer: Record<string, number[]> = {};
    for (const pid of players) valuesByPlayer[pid] = [];

    // Fetch each week once and collect PPR points if a player appears in stats
    for (const w of weeks) {
      try {
        const stats = await getNFLWeekStats(season, w);
        // stats is Record<playerId, StatMap>
        for (const pid of players) {
          const st = (stats as Record<string, Record<string, number | undefined>>)[pid];
          if (!st) continue; // did not play or no entry
          const pts = Number(st['pts_ppr'] ?? 0);
          // Include zeros if present in stats as a valid game
          valuesByPlayer[pid].push(isFinite(pts) ? pts : 0);
        }
      } catch {
        // ignore this week
      }
    }

    const baselines: Record<string, { mean: number; stddev: number; games: number; last3Avg: number }> = {};
    for (const pid of players) {
      const arr = valuesByPlayer[pid] || [];
      const last3 = arr.slice(-3);
      baselines[pid] = {
        mean: mean(arr),
        stddev: stddev(arr),
        games: arr.length,
        last3Avg: mean(last3),
      };
    }

    const payload = { season, players: players.length, baselines };
    cache[key] = { ts: now, data: payload };
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error('player-baselines API error', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
