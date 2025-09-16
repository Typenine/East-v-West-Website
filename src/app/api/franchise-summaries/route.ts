import { NextResponse } from 'next/server';
import { CHAMPIONS, LEAGUE_IDS } from '@/lib/constants/league';
import {
  getTeamsData,
  type TeamData,
  type FranchiseSummary,
  type SleeperFetchOptions,
} from '@/lib/utils/sleeper-api';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fresh = searchParams.get('fresh');
    const yearsParam = searchParams.get('years');
    const years: string[] = yearsParam ? yearsParam.split(',') : ['2025', '2024', '2023'];

    const optsFresh: SleeperFetchOptions = { forceFresh: true, timeoutMs: 12000 };
    const optsCached: SleeperFetchOptions = { timeoutMs: 12000 };

    // map year -> leagueId
    const yearToLeague: Record<string, string | undefined> = {
      '2025': LEAGUE_IDS.CURRENT,
      ...LEAGUE_IDS.PREVIOUS,
    } as Record<string, string | undefined>;

    // fetch teams by year (current fresh, prev cached)
    const results = await Promise.all(
      years.map((y) => {
        const lid = yearToLeague[y];
        if (!lid) return Promise.resolve<[string, TeamData[]]>([y, []]);
        const opts = fresh && y === '2025' ? optsFresh : optsCached;
        return getTeamsData(lid, opts)
          .then((arr) => [y, arr] as [string, TeamData[]])
          .catch(() => [y, []] as [string, TeamData[]]);
      })
    );

    const byYear: Record<string, TeamData[]> = Object.fromEntries(results);

    // championship counts by team name
    const champCounts: Record<string, number> = {};
    Object.values(CHAMPIONS).forEach((c) => {
      if (c.champion && c.champion !== 'TBD') {
        champCounts[c.champion] = (champCounts[c.champion] || 0) + 1;
      }
    });

    // aggregate across years by ownerId
    const agg: Record<string, { teamName: string; wins: number; losses: number; ties: number; totalPF: number; totalPA: number; games: number; championships: number }> = {};
    for (const y of years) {
      const teams = byYear[y] || [];
      for (const t of teams) {
        const a = (agg[t.ownerId] ||= {
          teamName: t.teamName,
          wins: 0,
          losses: 0,
          ties: 0,
          totalPF: 0,
          totalPA: 0,
          games: 0,
          championships: 0,
        });
        a.teamName = t.teamName || a.teamName;
        a.wins += t.wins || 0;
        a.losses += t.losses || 0;
        a.ties += t.ties || 0;
        a.totalPF += t.fpts || 0;
        a.totalPA += t.fptsAgainst || 0;
        a.games += (t.wins || 0) + (t.losses || 0) + (t.ties || 0);
      }
    }
    for (const ownerId of Object.keys(agg)) {
      const tn = agg[ownerId].teamName;
      agg[ownerId].championships = champCounts[tn] || 0;
    }

    const franchises: FranchiseSummary[] = Object.entries(agg)
      .map(([ownerId, a]) => ({
        ownerId,
        teamName: a.teamName,
        wins: a.wins,
        losses: a.losses,
        ties: a.ties,
        totalPF: a.totalPF,
        totalPA: a.totalPA,
        avgPF: a.games > 0 ? a.totalPF / a.games : 0,
        avgPA: a.games > 0 ? a.totalPA / a.games : 0,
        championships: a.championships,
      }));

    return NextResponse.json({ franchises, years: years, updatedAt: new Date().toISOString() }, { status: 200 });
  } catch (e) {
    console.error('franchise-summaries API error', e);
    return NextResponse.json({ error: 'Failed to compute franchise summaries' }, { status: 500 });
  }
}
