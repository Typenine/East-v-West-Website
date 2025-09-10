import { NextResponse } from 'next/server';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getLeagueMatchups, getNFLState, type SleeperMatchup } from '@/lib/utils/sleeper-api';

// 15s in-memory cache per league/week
const TTL_MS = 15_000;

type MatchupPointsPayload = {
  leagueId: string;
  week: number;
  updatedAt: string;
  playerPoints: Record<string, number>;
  rosterPoints: Record<number, number>;
};

const cache: Record<string, { ts: number; data: MatchupPointsPayload }> = {};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const leagueId = url.searchParams.get('leagueId') ?? LEAGUE_IDS.CURRENT;
    let week = Number(url.searchParams.get('week'));
    if (!Number.isFinite(week)) {
      // fallback to current Sleeper week
      try {
        const state = (await getNFLState()) as { week?: number };
        week = Number(state?.week ?? 1);
      } catch {
        week = 1;
      }
    }

    const key = `${leagueId}:${week}`;
    const now = Date.now();
    const cached = cache[key];
    if (cached && now - cached.ts < TTL_MS) {
      return NextResponse.json(cached.data, { status: 200 });
    }

    const matchups = await getLeagueMatchups(leagueId, week).catch(() => [] as SleeperMatchup[]);

    const playerPoints: Record<string, number> = {};
    const rosterPoints: Record<number, number> = {};

    for (const m of matchups) {
      const pp = (m.players_points || {}) as Record<string, number>;
      for (const [pid, pts] of Object.entries(pp)) {
        // last write wins (players appear once per week)
        playerPoints[pid] = Number(pts ?? 0);
      }
      const total = Number((m.custom_points ?? m.points ?? 0));
      rosterPoints[m.roster_id] = total;
    }

    const payload: MatchupPointsPayload = {
      leagueId,
      week,
      updatedAt: new Date().toISOString(),
      playerPoints,
      rosterPoints,
    };

    cache[key] = { ts: now, data: payload };
    return NextResponse.json(payload, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'failed_to_compute_points' }, { status: 500 });
  }
}
