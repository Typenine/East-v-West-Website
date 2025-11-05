import { NextRequest } from 'next/server';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamsData, getLeagueMatchups, getAllPlayersCached, getLeagueRosters } from '@/lib/utils/sleeper-api';
import { getObjectText, putObjectText } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getLeagueIdByYear(year: string): string | null {
  if (year === '2025') return LEAGUE_IDS.CURRENT;
  const prev = (LEAGUE_IDS.PREVIOUS as Record<string, string | undefined>)[year];
  return prev || null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const year = url.searchParams.get('year') || '';
  const weekStr = url.searchParams.get('week') || '';
  const week = Number(weekStr);
  if (!year || !Number.isFinite(week) || week <= 0) return Response.json({ error: 'bad_request' }, { status: 400 });
  try {
    const key = `logs/lineups/snapshots/${year}-W${week}.json`;
    const txt = await getObjectText({ key });
    if (!txt) return Response.json({ error: 'not_found' }, { status: 404 });
    const j = JSON.parse(txt);
    return Response.json(j);
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let raw: unknown;
    try { raw = await req.json(); } catch { raw = {}; }
    const body = (raw || {}) as Record<string, unknown>;
    const year = String((body.year as string | number | undefined) ?? '2025');
    const week = Number((body.week as string | number | undefined) ?? 1);
    const leagueId = getLeagueIdByYear(year);
    if (!leagueId || !Number.isFinite(week) || week <= 0) return Response.json({ error: 'bad_request' }, { status: 400 });

    const [teams, matchups, players, rosters] = await Promise.all([
      getTeamsData(leagueId).catch(() => [] as Array<{ rosterId: number; teamName: string }>),
      getLeagueMatchups(leagueId, week).catch(() => []),
      getAllPlayersCached().catch(() => ({} as Record<string, { first_name?: string; last_name?: string; position?: string }>)),
      getLeagueRosters(leagueId).catch(() => [] as Array<{ roster_id: number; reserve?: string[]; taxi?: string[] }>),
    ]);

    // Group matchups by roster (players = starters + bench for that week)
    const byRoster = new Map<number, { starters: string[]; players: string[] }>();
    for (const m of matchups as Array<{ roster_id: number; starters?: string[]; players?: string[] }>) {
      const cur = byRoster.get(m.roster_id) || { starters: [], players: [] };
      cur.starters = Array.isArray(m.starters) ? m.starters.filter(Boolean) : [];
      cur.players = Array.isArray(m.players) ? m.players.filter(Boolean) : [];
      byRoster.set(m.roster_id, cur);
    }

    const reserveMap = new Map<number, string[]>();
    const taxiMap = new Map<number, string[]>();
    for (const r of rosters) {
      reserveMap.set(r.roster_id, Array.isArray(r.reserve) ? r.reserve.filter(Boolean) : []);
      taxiMap.set(r.roster_id, Array.isArray(r.taxi) ? r.taxi.filter(Boolean) : []);
    }

    const rows = teams.map((t) => {
      const r = byRoster.get(t.rosterId) || { starters: [], players: [] };
      const starters = Array.from(new Set((r.starters || []).filter(Boolean)));
      const startersSet = new Set(starters);

      const reserveSrc = reserveMap.get(t.rosterId) || [];
      const taxiSrc = taxiMap.get(t.rosterId) || [];
      const reserveSet = new Set((reserveSrc || []).filter(Boolean));
      const taxiSet = new Set((taxiSrc || []).filter(Boolean));

      const bench: string[] = [];
      for (const id of (r.players || [])) {
        if (!id || startersSet.has(id) || reserveSet.has(id) || taxiSet.has(id)) continue;
        if (bench.includes(id)) continue;
        bench.push(id);
      }

      const reserve: string[] = [];
      for (const id of reserveSrc) {
        if (!id || startersSet.has(id) || bench.includes(id)) continue;
        if (reserve.includes(id)) continue;
        reserve.push(id);
      }

      const used = new Set<string>([...starters, ...bench, ...reserve]);
      const taxi: string[] = [];
      for (const id of taxiSrc) {
        if (!id || used.has(id)) continue;
        if (taxi.includes(id)) continue;
        taxi.push(id);
      }

      return {
        teamName: t.teamName,
        rosterId: t.rosterId,
        starters,
        bench,
        reserve,
        taxi,
      };
    });

    const snapshot = {
      year,
      week,
      generatedAt: new Date().toISOString(),
      teams: rows,
      playersMeta: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), position: p.position || null }])) as Record<string, { name: string; position: string | null }>,
      meta: { source: 'manual', accurateTaxi: true, accurateReserve: true },
    };

    const key = `logs/lineups/snapshots/${year}-W${week}.json`;
    await putObjectText({ key, text: JSON.stringify(snapshot, null, 2) });

    return Response.json({ ok: true, key });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
