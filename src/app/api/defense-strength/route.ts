import { NextRequest, NextResponse } from 'next/server';
import { getNFLState } from '@/lib/utils/sleeper-api';
import { getLeagueDefenseFactors } from '@/lib/fantasy/weekly-projections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const state = await getNFLState().catch(() => ({
      season: String(new Date().getFullYear()),
      week: 1,
      display_week: 1,
    }));
    const season = searchParams.get('season')
      || String(state.season || new Date().getFullYear());
    const requestedThroughWeek = Number(searchParams.get('uptoWeek'));
    const throughWeek = Number.isFinite(requestedThroughWeek)
      ? Math.max(0, Math.min(18, requestedThroughWeek))
      : Math.max(0, Number(state.week ?? state.display_week ?? 1) - 1);

    const positionFactors = await getLeagueDefenseFactors({ season, throughWeek });

    // The matchup screen now receives V3 player projections, and V3 already
    // includes the player's opponent adjustment. RosterColumn and
    // WinProbability are older live-game consumers that also request this
    // endpoint and would otherwise apply defense a second time. Keep the
    // position-level data available for diagnostics/future features, but give
    // the legacy aggregate multiplier a neutral value by returning no overrides.
    const factors: Record<string, number> = {};

    return NextResponse.json(
      { season, uptoWeek: throughWeek, factors, positionFactors },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=900' } }
    );
  } catch (error) {
    console.error('defense-strength API error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
