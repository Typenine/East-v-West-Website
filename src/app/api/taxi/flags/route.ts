import { getLatestTaxiRunMeta, getTaxiSnapshotsForRun } from '@/server/db/queries';
import { getAllPlayersCached } from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Flag = { team: string; type: 'violation' | 'warning'; message: string };
let cache: { ts: number; data: { generatedAt: string; runType?: string; season?: number; week?: number; actual: Flag[]; potential: Flag[] } } | null = null;
const TTL_MS = 30 * 1000;

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) {
    return Response.json(cache.data);
  }
  try {
    const meta = await getLatestTaxiRunMeta();
    if (!meta) {
      const empty = { generatedAt: new Date().toISOString(), actual: [], potential: [] };
      cache = { ts: now, data: empty };
      return Response.json(empty);
    }
    const rows = await getTaxiSnapshotsForRun({ season: meta.season, week: meta.week, runType: meta.runType as 'wed_warn' | 'thu_warn' | 'sun_am_warn' | 'sun_pm_official' | 'admin_rerun' });
    const players = await getAllPlayersCached().catch(() => ({} as Record<string, { first_name?: string; last_name?: string }>));
    const nameOf = (pid: string) => {
      const p = players[pid];
      if (!p) return pid;
      const nm = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      return nm || pid;
    };
    const actual: Flag[] = [];
    const potential: Flag[] = [];
    const isOfficial = meta.runType === 'sun_pm_official';
    const push = (target: Flag[], team: string, msg: string) => target.push({ team, type: isOfficial ? 'violation' : 'warning', message: `${team}: ${msg}` });

    for (const r of rows) {
      const nonCompliant = (r.compliant as unknown as number) === 0 || (r.compliant as unknown as boolean) === false;
      if (!nonCompliant) continue;
      const msgParts: string[] = [];
      const list = Array.isArray(r.violations) ? (r.violations as Array<{ code: string; detail?: string; players?: string[] }>) : [];
      for (const v of list) {
        if (v.code === 'too_many_on_taxi') msgParts.push('>3 players on taxi');
        else if (v.code === 'too_many_qbs') msgParts.push('2+ QBs on taxi (limit 1)');
        else if (v.code === 'invalid_intake') msgParts.push('Taxi intake must be FA/Trade/Draft');
        else if (v.code === 'roster_inconsistent') msgParts.push('Taxi conflicts with starters/IR');
        else if (v.code === 'boomerang_active_player') {
          const names = (v.players || []).map(nameOf).slice(0, 3).join(', ');
          msgParts.push(`Previously active this tenure on taxi${names ? `: ${names}` : ''}`);
        }
      }
      const msg = msgParts.join('; ') || 'Non-compliant taxi configuration';
      if (isOfficial) push(actual, r.teamId as unknown as string, msg); else push(potential, r.teamId as unknown as string, msg);
    }

    const data = { generatedAt: new Date().toISOString(), runType: meta.runType, season: meta.season, week: meta.week, actual, potential };
    cache = { ts: now, data };
    return Response.json(data);
  } catch {
    return Response.json({ generatedAt: new Date().toISOString(), actual: [], potential: [] });
  }
}
