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
    const factors: Record<string, number> = {};
    for (const [team, values] of Object.entries(positionFactors) as Array<[string, Record<string, number>]>) {
      factors[team] = values.ALL ?? 1;
    }

    return NextResponse.json(
      { season, uptoWeek: throughWeek, factors, positionFactors },
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=900' } }
    );
  } catch (error) {
    console.error('defense-strength API error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
