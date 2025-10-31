import { getNFLState, getLeagueMatchups, getTeamsData, getAllPlayersCached, getLeagueRosters } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getLeagueIdByYear(year: string): string | null {
  if (year === '2025') return LEAGUE_IDS.CURRENT;
  const prev = (LEAGUE_IDS.PREVIOUS as Record<string, string | undefined>)[year];
  return prev || null;
}

type Matchup = { roster_id?: number; matchup_id?: number; starters?: string[]; players?: string[]; points?: number; custom_points?: number };

export async function GET() {
  try {
    const state = await getNFLState();
    const season = String(state.season || '2025');
    const leagueId = getLeagueIdByYear(season);
    if (!leagueId) return Response.json({ error: 'no_league' }, { status: 400 });

    // Determine last completed week using matchups with any points recorded
    const weeks = Array.from({ length: 17 }, (_, i) => i + 1);
    const weekly = await Promise.all(weeks.map((w) => getLeagueMatchups(leagueId, w).catch(() => [] as Matchup[])));
    let lastPlayed = 0;
    for (let i = 0; i < weekly.length; i++) {
      const w = i + 1;
      const arr = weekly[i] as Matchup[];
      const anyPoints = arr.some((m) => Number(m.custom_points ?? m.points ?? 0) > 0);
      if (anyPoints) lastPlayed = w;
    }
    if (lastPlayed <= 0) return Response.json({ ok: true, skipped: 'no_played_weeks' });

    const { list, put } = await import('@vercel/blob');
    const key = `logs/lineups/snapshots/${season}-W${lastPlayed}.json`;

    // Skip if already exists
    try {
      const { blobs } = await list({ prefix: 'logs/lineups/snapshots/' });
      type BlobMeta = { pathname: string };
      const hit = (blobs as unknown as BlobMeta[]).find((b) => b.pathname === key);
      if (hit) return Response.json({ ok: true, skipped: 'exists', key });
    } catch {}

    // Build snapshot from matchups + current rosters for reserve/taxi
    const [teams, players, rosters] = await Promise.all([
      getTeamsData(leagueId).catch(() => [] as Array<{ rosterId: number; teamName: string }>),
      getAllPlayersCached().catch(() => ({} as Record<string, { first_name?: string; last_name?: string; position?: string }>)),
      getLeagueRosters(leagueId).catch(() => [] as Array<{ roster_id: number; reserve?: string[]; taxi?: string[] }>),
    ]);

    const byRoster = new Map<number, { starters: string[]; players: string[] }>();
    {
      const arr = (weekly[lastPlayed - 1] || []) as Array<{ roster_id: number; starters?: string[]; players?: string[] }>;
      for (const m of arr) {
        const cur = byRoster.get(m.roster_id) || { starters: [], players: [] };
        cur.starters = Array.isArray(m.starters) ? m.starters.filter(Boolean) : [];
        cur.players = Array.isArray(m.players) ? m.players.filter(Boolean) : [];
        byRoster.set(m.roster_id, cur);
      }
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

      const bench: string[] = [];
      for (const id of (r.players || [])) {
        if (!id || startersSet.has(id)) continue;
        if (bench.includes(id)) continue;
        bench.push(id);
      }
      const used = new Set<string>([...starters, ...bench]);

      const reserveSrc = reserveMap.get(t.rosterId) || [];
      const reserve: string[] = [];
      for (const id of reserveSrc) {
        if (!id || used.has(id)) continue;
        if (reserve.includes(id)) continue;
        reserve.push(id);
      }
      for (const id of reserve) used.add(id);

      const taxiSrc = taxiMap.get(t.rosterId) || [];
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
      year: season,
      week: lastPlayed,
      generatedAt: new Date().toISOString(),
      teams: rows,
      playersMeta: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), position: p.position || null }])) as Record<string, { name: string; position: string | null }>,
    };

    await put(key, JSON.stringify(snapshot, null, 2), {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: false,
    });

    return Response.json({ ok: true, generated: { year: season, week: lastPlayed, key } });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
