import { NextResponse } from 'next/server';
import { CURRENT_SEASON, getLeagueIdForSeason } from '@/lib/constants/league';
import { assertHistoricalLuckMatchesOfficial, calculateHistoricalLuck } from '@/lib/fantasy/historical-luck';
import { getLeagueStatsDatasetV2 } from '@/lib/stats/league-stats-v2';
import { getTeamsData } from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// This endpoint serves the single Luck column on /standings. It only considers
// fully finalized regular-season weeks, never scores from games in progress.
export async function GET(request: Request) {
  const season = new URL(request.url).searchParams.get('season') ?? CURRENT_SEASON;
  const leagueId = getLeagueIdForSeason(season);
  if (!/^20\d{2}$/.test(season) || season < '2023' ||
      season > CURRENT_SEASON || !leagueId) {
    return NextResponse.json({ error: 'invalid_season' }, { status: 400 });
  }
  try {
    const [dataset, teams] = await Promise.all([
      getLeagueStatsDatasetV2(),
      getTeamsData(leagueId, {
        forceFresh: season === CURRENT_SEASON,
        timeoutMs: 8000,
        retries: 1,
      }),
    ]);
    if (teams.length < 2) throw new Error('Missing league rosters');

    // Validate that no configured historical season was silently omitted.
    for (let year = 2023; year <= Number(season); year += 1) {
      if (!dataset.seasons.includes(String(year))) {
        throw new Error('Missing historical season: ' + year);
      }
    }

    const throughWeek = Math.min(14, ...teams.map((t) =>
      Math.max(0, t.wins + t.losses + t.ties)));
    if (throughWeek === 0) {
      return NextResponse.json({
        season, throughWeek, baselineCount: 0, teams: [],
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const report = calculateHistoricalLuck(dataset.games, season, throughWeek, teams.length);
    assertHistoricalLuckMatchesOfficial(report, teams);

    return NextResponse.json({
      season,
      throughWeek,
      baselineCount: report.baselineCount,
      teams: report.teams.map((t) => ({
        rosterId: t.rosterId,
        expectedWins: t.combinedExpected,
        luck: t.combinedLuck,
        allPlayExpected: t.allPlayExpected,
        historicalExpected: t.historicalExpected,
      })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[standings/luck] Historical luck is unavailable:', error);
    return NextResponse.json({ error: 'luck_unavailable' }, { status: 503 });
  }
}
