import { NextRequest, NextResponse } from 'next/server';
import { getNFLState } from '@/lib/utils/sleeper-api';
import { getLeagueScoredBaselinesV3 } from '@/lib/fantasy/weekly-projections-next';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parsePlayersParam(param: string | null): string[] {
  if (!param) return [];
  return Array.from(new Set(
    param
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  ));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const players = parsePlayersParam(searchParams.get('players'));
    if (!players.length) {
      return NextResponse.json({ error: 'missing_players' }, { status: 400 });
    }

    const state = await getNFLState().catch(() => ({
      season: String(new Date().getFullYear()),
      week: 1,
      display_week: 1,
    }));
    const season = searchParams.get('season')
      || String(state.season || new Date().getFullYear());
    const requestedThroughWeek = Number(searchParams.get('throughWeek'));
    const throughWeek = Number.isFinite(requestedThroughWeek)
      ? Math.max(0, Math.min(18, requestedThroughWeek))
      : Math.max(0, Number(state.week ?? state.display_week ?? 1) - 1);

    const baselines = await getLeagueScoredBaselinesV3({
      season,
      throughWeek,
      playerIds: players,
    });

    return NextResponse.json(
      { season, throughWeek, players: players.length, modelVersion: 'statline-v3.0', baselines },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=900' } }
    );
  } catch (error) {
    console.error('player-baselines API error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
