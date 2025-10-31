import { NextRequest } from 'next/server';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamsData, getLeagueMatchups, getAllPlayersCached, getLeagueRosters } from '@/lib/utils/sleeper-api';

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
    const { list } = await import('@vercel/blob');
    const key = `logs/lineups/snapshots/${year}-W${week}.json`;
    const { blobs } = await list({ prefix: 'logs/lineups/snapshots/' });
    type BlobMeta = { pathname: string; url: string };
    const arr = (blobs as unknown as BlobMeta[]) || [];
    const hit = arr.find((b) => b.pathname === key);
    if (!hit) return Response.json({ error: 'not_found' }, { status: 404 });
    const r = await fetch(hit.url, { cache: 'no-store' });
    if (!r.ok) return Response.json({ error: 'not_found' }, { status: 404 });
    const j = await r.json();
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
      getLeagueRosters(leagueId).catch(() => []),
    ]);

    // Group matchups by roster
    const byRoster = new Map<number, { starters: string[]; players: string[] }>();
    for (const m of matchups as Array<{ roster_id: number; starters?: string[]; players?: string[] }>) {
      const cur = byRoster.get(m.roster_id) || { starters: [], players: [] };
      cur.starters = Array.isArray(m.starters) ? m.starters.filter(Boolean) : [];
      cur.players = Array.isArray(m.players) ? m.players.filter(Boolean) : [];
      byRoster.set(m.roster_id, cur);
    }

    const reserveMap = new Map<number, string[]>();
    for (const r of rosters as Array<{ roster_id: number; reserve?: string[] }>) {
      reserveMap.set(r.roster_id, Array.isArray(r.reserve) ? r.reserve.filter(Boolean) : []);
    }

    const rows = teams.map((t) => {
      const r = byRoster.get(t.rosterId) || { starters: [], players: [] };
      const bench = r.players.filter((id) => !new Set(r.starters).has(id));
      return {
        teamName: t.teamName,
        rosterId: t.rosterId,
        starters: r.starters,
        bench,
        reserve: reserveMap.get(t.rosterId) || [],
      };
    });

    const snapshot = {
      year,
      week,
      generatedAt: new Date().toISOString(),
      teams: rows,
      playersMeta: Object.fromEntries(Object.entries(players).map(([id, p]) => [id, { name: `${p.first_name || ''} ${p.last_name || ''}`.trim(), position: p.position || null }])) as Record<string, { name: string; position: string | null }> ,
    };

    const { put } = await import('@vercel/blob');
    const key = `logs/lineups/snapshots/${year}-W${week}.json`;
    await put(key, JSON.stringify(snapshot, null, 2), {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true,
    });

    return Response.json({ ok: true, key });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
