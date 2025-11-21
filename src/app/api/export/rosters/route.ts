import { NextResponse } from 'next/server';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamsData, type TeamData, type SleeperFetchOptions } from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildYearToLeagueMap(): Record<string, string | undefined> {
  return {
    '2025': LEAGUE_IDS.CURRENT,
    ...LEAGUE_IDS.PREVIOUS,
  } as Record<string, string | undefined>;
}

export async function GET() {
  try {
    const yearToLeague = buildYearToLeagueMap();
    const seasons = Object.keys(yearToLeague)
      .filter((season) => Boolean(yearToLeague[season]))
      .sort();

    const opts: SleeperFetchOptions = { timeoutMs: 15000 };

    const results = await Promise.all(
      seasons.map(async (season) => {
        const leagueId = yearToLeague[season];
        if (!leagueId) return [season, [] as TeamData[]] as const;
        const teams = await getTeamsData(leagueId, opts).catch(() => [] as TeamData[]);
        return [season, teams] as const;
      }),
    );

    const teamsBySeason: Record<string, TeamData[]> = {};
    for (const [season, teams] of results) {
      teamsBySeason[season] = teams;
    }

    const body = {
      meta: {
        type: 'rosters-and-teams',
        version: 1,
        generatedAt: new Date().toISOString(),
        seasons,
      },
      teamsBySeason,
    };

    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="evw-rosters-and-teams.json"',
      },
    });
  } catch (err) {
    console.error('export/rosters GET error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
