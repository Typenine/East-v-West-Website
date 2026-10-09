import { getLeagueRosters, getRosterIdToTeamNameMap } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type OwnershipCache = { expires: number; owners: Record<string, string>; updatedAt: string };
let ownershipCache: OwnershipCache | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function GET() {
  if (ownershipCache && Date.now() < ownershipCache.expires) {
    return Response.json({ owners: ownershipCache.owners, updatedAt: ownershipCache.updatedAt, cached: true });
  }
  try {
    const leagueId = LEAGUE_IDS.CURRENT;
    const [rosters, names] = await Promise.all([
      getLeagueRosters(leagueId),
      getRosterIdToTeamNameMap(leagueId),
    ]);
    if (!rosters.length || !names.size) {
      return Response.json({ error: 'League rosters are currently unavailable' }, { status: 503 });
    }

    const owners: Record<string, string> = Object.create(null);
    for (const roster of rosters) {
      const team = names.get(roster.roster_id);
      if (!team || !Array.isArray(roster.players)) continue;
      for (const playerId of roster.players) {
        if (playerId) owners[String(playerId)] = team;
      }
    }
    const updatedAt = new Date().toISOString();
    ownershipCache = { owners, updatedAt, expires: Date.now() + TTL_MS };
    return Response.json({ owners, updatedAt, cached: false });
  } catch (error) {
    if (ownershipCache) {
      return Response.json({ owners: ownershipCache.owners, updatedAt: ownershipCache.updatedAt, cached: true, stale: true });
    }
    console.error('[trade-analyzer/ownership] Failed to load league rosters', error);
    return Response.json({ error: 'League ownership unavailable' }, { status: 502 });
  }
}
