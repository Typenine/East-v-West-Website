/**
 * Homepage summary endpoint.
 *
 * Aggregates lightweight data the homepage needs without requiring multiple
 * round-trips from the client.  All Sleeper data goes through the existing
 * in-memory cache layer.
 *
 * Returns:
 *   - allPlayerIds: all player IDs currently rostered across all teams
 *   - positionCounts: per-team position counts for RosterConstruction
 *   - rosterIdToTeam: map from roster_id → canonical team name
 *
 * Caching: moderate (5 minutes). Roster moves don't happen in real-time and
 * the live matchup section (This Week) reads directly from Sleeper via the
 * page's own fetch.
 */

import { NextResponse } from 'next/server';
import {
  getLeagueRosters,
  getAllPlayersCached,
  getRosterIdToTeamNameMap,
  buildYearToLeagueMapUnique,
  SleeperPlayer,
  getNFLState,
} from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS, CURRENT_SEASON } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// In-memory cache for the summary (avoids hammering Sleeper on every homepage load)
let cachedSummary: {
  ts: number;
  data: {
    allPlayerIds: string[];
    positionCounts: Record<string, Record<string, number>>;
    rosterIdToTeam: Record<number, string>;
  };
} | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const now = Date.now();
  if (cachedSummary && now - cachedSummary.ts < CACHE_TTL_MS) {
    return NextResponse.json(cachedSummary.data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120' },
    });
  }

  try {
    // Resolve current league ID
    let leagueId = LEAGUE_IDS.CURRENT;
    try {
      const nflState = await getNFLState().catch(() => null);
      if (nflState) {
        const season = String((nflState as { season?: string | number }).season ?? CURRENT_SEASON);
        const yearMap = await buildYearToLeagueMapUnique().catch(() => ({} as Record<string, string>));
        leagueId = yearMap[season] || leagueId;
      }
    } catch { /* use default */ }

    const [rosters, playersIndex, nameMap] = await Promise.all([
      getLeagueRosters(leagueId).catch(() => []),
      getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
      getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
    ]);

    const rosterIdToTeam: Record<number, string> = {};
    nameMap.forEach((name, id) => { rosterIdToTeam[id] = name; });

    // All rostered player IDs (main roster + taxi + IR)
    const allPlayerIdSet = new Set<string>();
    const positionCounts: Record<string, Record<string, number>> = {};

    for (const roster of rosters) {
      const teamName = rosterIdToTeam[roster.roster_id] || `Roster ${roster.roster_id}`;
      const counts: Record<string, number> = {};

      const allIds = [
        ...(roster.players || []),
        ...(roster.taxi || []),
        ...(roster.reserve || []),
      ];

      for (const pid of allIds) {
        allPlayerIdSet.add(pid);
        const player = (playersIndex as Record<string, SleeperPlayer>)[pid];
        if (player?.position) {
          counts[player.position] = (counts[player.position] ?? 0) + 1;
        }
      }
      positionCounts[teamName] = counts;
    }

    const data = {
      allPlayerIds: Array.from(allPlayerIdSet),
      positionCounts,
      rosterIdToTeam,
    };

    cachedSummary = { ts: now, data };

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120' },
    });
  } catch (err) {
    console.error('Homepage summary error', err);
    return NextResponse.json(
      { allPlayerIds: [], positionCounts: {}, rosterIdToTeam: {} },
      { status: 200 }
    );
  }
}
