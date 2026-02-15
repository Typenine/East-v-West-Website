import { NextResponse } from 'next/server';
import { CHAMPIONS } from '@/lib/constants/league';
import {
  getSplitRecordsAllTime,
  type FranchiseSummary,
  type SleeperFetchOptions,
} from '@/lib/utils/sleeper-api';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fresh = searchParams.get('fresh');

    const opts: SleeperFetchOptions = fresh ? { forceFresh: true, timeoutMs: 20000 } : { timeoutMs: 20000 };

    // Use split records for accurate regular-season-only stats
    const splits = await getSplitRecordsAllTime(opts);

    // championship counts by team name
    const champCounts: Record<string, number> = {};
    Object.values(CHAMPIONS).forEach((c) => {
      if (c.champion && c.champion !== 'TBD') {
        champCounts[c.champion] = (champCounts[c.champion] || 0) + 1;
      }
    });

    // Build franchise summaries from split records (regular season only)
    const franchises: FranchiseSummary[] = Object.entries(splits).map(([ownerId, s]) => {
      const reg = s.regular;
      const games = reg.wins + reg.losses + reg.ties;
      return {
        ownerId,
        teamName: s.teamName,
        wins: reg.wins,
        losses: reg.losses,
        ties: reg.ties,
        totalPF: reg.pf,
        totalPA: reg.pa,
        avgPF: games > 0 ? reg.pf / games : 0,
        avgPA: games > 0 ? reg.pa / games : 0,
        championships: champCounts[s.teamName] || 0,
      };
    });

    return NextResponse.json({ franchises, updatedAt: new Date().toISOString() }, { status: 200 });
  } catch (e) {
    console.error('franchise-summaries API error', e);
    return NextResponse.json({ error: 'Failed to compute franchise summaries' }, { status: 500 });
  }
}
