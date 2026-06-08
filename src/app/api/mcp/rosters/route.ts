/**
 * MCP Tool: get_rosters
 * Returns slim per-team rosters for the current season. Each player entry
 * includes name, position, and NFL team — never the raw 10 MB Sleeper player
 * database. The full player object is looked up from the cached player map
 * but only selected fields are returned.
 *
 * Optional query params:
 *   ?team=Belltown+Raptors   — filter to a single team (case-insensitive)
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth, mcpMeta } from '@/lib/mcp/auth';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  getTeamsData,
  getLeagueRosters,
  getAllPlayersCached,
  type SleeperPlayer,
  type SleeperRoster,
} from '@/lib/utils/sleeper-api';
import { getTeamLogoPath } from '@/lib/utils/team-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SlimPlayer = {
  id: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
  status: string | null;
  slot: 'active' | 'ir' | 'taxi';
};

type TeamRoster = {
  team: string;
  logoUrl: string;
  rosterId: number;
  record: { wins: number; losses: number; ties: number } | null;
  players: SlimPlayer[];
};

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const teamFilter = (url.searchParams.get('team') ?? '').toLowerCase().trim();

    const leagueId = LEAGUE_IDS.CURRENT;
    const opts = { timeoutMs: 15000 };

    const [teams, rosters, allPlayers] = await Promise.all([
      getTeamsData(leagueId, opts).catch(() => []),
      getLeagueRosters(leagueId, opts).catch(() => [] as SleeperRoster[]),
      getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    ]);

    const rosterById = new Map<number, SleeperRoster>(
      rosters.map((r) => [r.roster_id, r]),
    );

    function toSlim(pid: string, slot: SlimPlayer['slot']): SlimPlayer {
      const p = allPlayers[pid] as SleeperPlayer | undefined;
      const name = p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : pid;
      return {
        id: pid,
        name: name || pid,
        position: p?.position ?? null,
        nflTeam: p?.team ?? null,
        status: p?.injury_status ?? p?.status ?? null,
        slot,
      };
    }

    const result: TeamRoster[] = [];

    for (const team of teams) {
      if (teamFilter && !team.teamName.toLowerCase().includes(teamFilter)) continue;

      const r = rosterById.get(team.rosterId);
      const irSet = new Set<string>(r?.reserve ?? []);
      const taxiSet = new Set<string>(r?.taxi ?? []);
      const allIds: string[] = r?.players ?? team.players ?? [];

      const players: SlimPlayer[] = allIds
        .filter(Boolean)
        .map((pid) => {
          const slot: SlimPlayer['slot'] = irSet.has(pid)
            ? 'ir'
            : taxiSet.has(pid)
            ? 'taxi'
            : 'active';
          return toSlim(pid, slot);
        });

      const settings = r?.settings as { wins?: number; losses?: number; ties?: number } | undefined;
      const record = settings
        ? {
            wins: settings.wins ?? 0,
            losses: settings.losses ?? 0,
            ties: settings.ties ?? 0,
          }
        : null;

      result.push({
        team: team.teamName,
        logoUrl: getTeamLogoPath(team.teamName),
        rosterId: team.rosterId,
        record,
        players,
      });
    }

    result.sort((a, b) => a.team.localeCompare(b.team));

    return NextResponse.json({
      meta: mcpMeta('get_rosters', {
        leagueId,
        teamCount: result.length,
        note: 'Active roster only. Status field reflects latest Sleeper injury/availability data.',
      }),
      rosters: result,
    });
  } catch (err) {
    console.error('[mcp/rosters]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
