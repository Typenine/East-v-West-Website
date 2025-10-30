import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamsData } from '@/lib/utils/sleeper-api';
import { computeTaxiAnalysisForRoster } from '@/lib/utils/taxi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Flag = { team: string; type: 'over_qb' | 'over_slots' | 'player_ineligible' | 'player_potential'; message: string };

let cache: { ts: number; data: { generatedAt: string; actual: Flag[]; potential: Flag[] } } | null = null;
const TTL_MS = 60 * 1000;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) {
    return Response.json(cache.data);
  }
  try {
    const season = '2025';
    const leagueId = LEAGUE_IDS.CURRENT;
    const teams = await getTeamsData(leagueId).catch(() => [] as Array<{ teamName: string; rosterId: number }>);
    const actual: Flag[] = [];
    const potential: Flag[] = [];

    for (const t of teams) {
      try {
        const a = await computeTaxiAnalysisForRoster(season, t.rosterId);
        if (!a) continue;
        const team = t.teamName;
        if (a.current.counts.qbs > a.limits.maxQB) {
          actual.push({ team, type: 'over_qb', message: `${team} has ${a.current.counts.qbs} QBs on Taxi (limit ${a.limits.maxQB}).` });
        }
        if (a.current.counts.total > a.limits.maxSlots) {
          actual.push({ team, type: 'over_slots', message: `${team} has ${a.current.counts.total} players on Taxi (limit ${a.limits.maxSlots}).` });
        }
        for (const p of a.current.taxi) {
          if (p.activatedSinceJoin) {
            const wk = p.activatedAt ? `Week ${p.activatedAt.week} ${p.activatedAt.year}` : 'a prior week';
            actual.push({ team, type: 'player_ineligible', message: `${p.name || p.playerId} appeared in lineup/bench/IR (${wk}) and is now on Taxi for ${team}.` });
          } else if (p.potentialActivatedSinceJoin) {
            potential.push({ team, type: 'player_potential', message: `${p.name || p.playerId} appears in this week's lineup/bench/IR for ${team}. If games complete, they'll become ineligible for Taxi.` });
          }
        }
      } catch {}
    }

    const data = { generatedAt: new Date().toISOString(), actual, potential };
    cache = { ts: now, data };
    return Response.json(data);
  } catch {
    return Response.json({ generatedAt: new Date().toISOString(), actual: [], potential: [] });
  }
}
