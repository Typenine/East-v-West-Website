import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamsData, getLeagueMatchups, getAllPlayersCached } from '@/lib/utils/sleeper-api';
import { getObjectText, putObjectText } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getLeagueIdByYear(year: string): string | null {
  if (year === '2025') return LEAGUE_IDS.CURRENT;
  const prev = (LEAGUE_IDS.PREVIOUS as Record<string, string | undefined>)[year];
  return prev || null;
}

type Matchup = { roster_id: number; starters?: string[]; players?: string[]; points?: number; custom_points?: number; matchup_id?: number };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = url.searchParams.get('year') || '2025';
  const overwrite = (url.searchParams.get('overwrite') || 'false').toLowerCase() === 'true';
  const leagueId = getLeagueIdByYear(year);
  if (!leagueId) return Response.json({ error: 'bad_request' }, { status: 400 });

  try {
    const weeks = Array.from({ length: 17 }, (_, i) => i + 1);
    const weekly = await Promise.all(weeks.map((w) => getLeagueMatchups(leagueId, w).catch(() => [] as Matchup[])));

    // Determine played weeks
    const playedWeeks: number[] = [];
    for (let i = 0; i < weekly.length; i++) {
      const arr = weekly[i] || [];
      const anyPoints = arr.some((m) => Number((m.custom_points ?? m.points) || 0) > 0);
      if (anyPoints) playedWeeks.push(i + 1);
    }

    // Gather existing snapshot keys by attempting a get on each target key when needed
    const existing = new Set<string>();

    const [teams, players] = await Promise.all([
      getTeamsData(leagueId).catch(() => [] as Array<{ rosterId: number; teamName: string }>),
      getAllPlayersCached().catch(() => ({} as Record<string, { first_name?: string; last_name?: string; position?: string }>)),
    ]);

    const results: Array<{ week: number; status: 'generated' | 'skipped' }> = [];

    for (const week of playedWeeks) {
      const key = `logs/lineups/snapshots/${year}-W${week}.json`;
      if (!overwrite && (existing.has(key) || (await getObjectText({ key })) )) {
        results.push({ week, status: 'skipped' });
        continue;
      }

      const matchups = (weekly[week - 1] || []) as Matchup[];
      const byRoster = new Map<number, { starters: string[]; players: string[] }>();
      for (const m of matchups) {
        const cur = byRoster.get(m.roster_id) || { starters: [], players: [] };
        cur.starters = Array.isArray(m.starters) ? m.starters.filter(Boolean) : [];
        cur.players = Array.isArray(m.players) ? m.players.filter(Boolean) : [];
        byRoster.set(m.roster_id, cur);
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
        return {
          teamName: t.teamName,
          rosterId: t.rosterId,
          starters,
          bench,
          reserve: [],
          taxi: [],
        };
      });

      const snapshot = {
        year,
        week,
        generatedAt: new Date().toISOString(),
        teams: rows,
        playersMeta: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), position: p.position || null }])) as Record<string, { name: string; position: string | null }>,
        meta: { source: 'backfill', accurateTaxi: false, accurateReserve: false },
      };

      await putObjectText({ key, text: JSON.stringify(snapshot, null, 2) });
      results.push({ week, status: 'generated' });
    }

    return Response.json({ ok: true, year, results });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
