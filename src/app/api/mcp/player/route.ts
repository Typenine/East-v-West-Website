/**
 * MCP Tool: get_player
 * Returns a single player's profile and, if they are on a league roster,
 * which team currently owns them.
 *
 * Reuses getAllPlayersCached (same cache the website already fills) and
 * getLeagueRosters. Never returns the full player database.
 *
 * Required query params:
 *   ?id=<sleeper_player_id>    — Sleeper numeric player ID
 *
 * OR search by name (returns up to 5 matches):
 *   ?name=Patrick+Mahomes
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth, mcpMeta } from '@/lib/mcp/auth';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  getAllPlayersCached,
  getLeagueRosters,
  getTeamsData,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const idParam = (url.searchParams.get('id') ?? '').trim();
    const nameParam = (url.searchParams.get('name') ?? '').trim().toLowerCase();

    if (!idParam && !nameParam) {
      return NextResponse.json(
        { error: 'missing_param', message: 'Provide ?id=<player_id> or ?name=<search_term>' },
        { status: 400 },
      );
    }

    const leagueId = LEAGUE_IDS.CURRENT;
    const opts = { timeoutMs: 12000 };

    const [allPlayers, rosters, teams] = await Promise.all([
      getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
      getLeagueRosters(leagueId, opts).catch(() => []),
      getTeamsData(leagueId, opts).catch(() => []),
    ]);

    // Build reverse map: playerId -> team name
    const rosterIdToName = new Map<number, string>(
      teams.map((t) => [t.rosterId, t.teamName]),
    );
    const playerToTeam = new Map<string, string>();
    for (const r of rosters) {
      const teamName = rosterIdToName.get(r.roster_id) ?? `Roster ${r.roster_id}`;
      for (const pid of [...(r.players ?? []), ...(r.reserve ?? []), ...(r.taxi ?? [])]) {
        if (pid) playerToTeam.set(pid, teamName);
      }
    }

    function formatPlayer(id: string, p: SleeperPlayer) {
      return {
        id,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        position: p.position ?? null,
        nflTeam: p.team ?? null,
        status: p.injury_status ?? p.status ?? null,
        yearsExp: typeof p.years_exp === 'number' ? p.years_exp : null,
        rookieYear: (p as { rookie_year?: string | number }).rookie_year ?? null,
        fantasyOwner: playerToTeam.get(id) ?? null,
      };
    }

    // Single-player lookup by ID
    if (idParam) {
      const p = allPlayers[idParam] as SleeperPlayer | undefined;
      if (!p) {
        return NextResponse.json({ error: 'not_found', id: idParam }, { status: 404 });
      }
      return NextResponse.json({
        meta: mcpMeta('get_player', { lookupType: 'id' }),
        player: formatPlayer(idParam, p),
      });
    }

    // Search by name — scan ALL players before capping to avoid missing best matches
    const limitRaw = Number(url.searchParams.get('limit') ?? 5);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 20) : 5;

    const matches: ReturnType<typeof formatPlayer>[] = [];
    for (const [id, p] of Object.entries(allPlayers as Record<string, SleeperPlayer>)) {
      const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
      if (fullName.includes(nameParam)) {
        matches.push(formatPlayer(id, p));
      }
      // No early exit — scan all ~100K players so we don't miss a better match
    }

    matches.sort((a, b) => {
      // Exact starts-with wins, then owned-by-league players first, then alpha
      const aStarts = a.name.toLowerCase().startsWith(nameParam) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(nameParam) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      const aOwned = a.fantasyOwner ? 0 : 1;
      const bOwned = b.fantasyOwner ? 0 : 1;
      if (aOwned !== bOwned) return aOwned - bOwned;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      meta: mcpMeta('get_player', {
        lookupType: 'name_search',
        query: nameParam,
        totalMatches: matches.length,
        returned: Math.min(matches.length, limit),
      }),
      players: matches.slice(0, limit),
    });
  } catch (err) {
    console.error('[mcp/player]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
