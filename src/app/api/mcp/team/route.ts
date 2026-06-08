/**
 * MCP Tool: get_team
 * Returns a single team's dashboard: current record, full roster (with player
 * details and slot), all-time franchise stats, and this season's champion history.
 *
 * Required query param:
 *   ?name=Belltown+Raptors   — team name (partial, case-insensitive)
 *
 * Returns 400 if omitted, 404 if no team matches.
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth, mcpMeta } from '@/lib/mcp/auth';
import { CHAMPIONS, CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import {
  getTeamsData,
  getLeagueRosters,
  getAllPlayersCached,
  getSplitRecordsAllTime,
  type SleeperPlayer,
  type SleeperRoster,
} from '@/lib/utils/sleeper-api';
import { getTeamLogoPath } from '@/lib/utils/team-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const nameParam = (url.searchParams.get('name') ?? '').trim().toLowerCase();

    if (!nameParam) {
      return NextResponse.json(
        { error: 'missing_param', message: 'Provide ?name=<team name>' },
        { status: 400 },
      );
    }

    const leagueId = LEAGUE_IDS.CURRENT;
    const opts = { timeoutMs: 18000 };

    const [teams, rosters, allPlayers, splits] = await Promise.all([
      getTeamsData(leagueId, opts).catch(() => []),
      getLeagueRosters(leagueId, opts).catch(() => [] as SleeperRoster[]),
      getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
      getSplitRecordsAllTime(opts).catch(() => ({} as Record<string, { teamName: string; regular: { wins: number; losses: number; ties: number; pf: number; pa: number }; playoffs: { wins: number; losses: number; ties: number; pf: number; pa: number }; toilet: { wins: number; losses: number; ties: number; pf: number; pa: number } }>)),
    ]);

    // Find matching team
    const team = teams.find((t) => t.teamName.toLowerCase().includes(nameParam));
    if (!team) {
      return NextResponse.json(
        {
          error: 'team_not_found',
          availableTeams: teams.map((t) => t.teamName).sort(),
        },
        { status: 404 },
      );
    }

    // Roster details
    const rosterById = new Map<number, SleeperRoster>(rosters.map((r) => [r.roster_id, r]));
    const r = rosterById.get(team.rosterId);
    const irSet = new Set<string>(r?.reserve ?? []);
    const taxiSet = new Set<string>(r?.taxi ?? []);
    const allPlayerIds: string[] = r?.players ?? team.players ?? [];

    const players = allPlayerIds.filter(Boolean).map((pid) => {
      const p = allPlayers[pid] as SleeperPlayer | undefined;
      const slot = irSet.has(pid) ? 'ir' : taxiSet.has(pid) ? 'taxi' : 'active';
      return {
        id: pid,
        name: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : pid,
        position: p?.position ?? null,
        nflTeam: p?.team ?? null,
        status: p?.injury_status ?? p?.status ?? null,
        slot,
      };
    });

    // Current-season record from roster settings
    const rs = r?.settings as {
      wins?: number; losses?: number; ties?: number;
      fpts?: number; fpts_decimal?: number;
      fpts_against?: number; fpts_against_decimal?: number;
    } | undefined;
    const pf = rs ? (rs.fpts ?? 0) + (rs.fpts_decimal ?? 0) / 100 : 0;
    const pa = rs ? (rs.fpts_against ?? 0) + (rs.fpts_against_decimal ?? 0) / 100 : 0;
    const currentRecord = {
      season: CURRENT_SEASON,
      wins: rs?.wins ?? 0,
      losses: rs?.losses ?? 0,
      ties: rs?.ties ?? 0,
      pf: Math.round(pf * 100) / 100,
      pa: Math.round(pa * 100) / 100,
    };

    // All-time stats from splits (match by teamName)
    const splitEntry = Object.values(splits).find(
      (s) => s.teamName.toLowerCase() === team.teamName.toLowerCase(),
    );
    const allTime = splitEntry
      ? {
          regularSeason: {
            wins: splitEntry.regular.wins,
            losses: splitEntry.regular.losses,
            ties: splitEntry.regular.ties,
            pf: Math.round(splitEntry.regular.pf * 100) / 100,
            pa: Math.round(splitEntry.regular.pa * 100) / 100,
          },
          playoffs: {
            wins: splitEntry.playoffs.wins,
            losses: splitEntry.playoffs.losses,
          },
        }
      : null;

    // Championship history
    const champHistory = Object.entries(CHAMPIONS)
      .filter(
        ([, c]) =>
          c.champion === team.teamName ||
          c.runnerUp === team.teamName ||
          (c as { thirdPlace?: string }).thirdPlace === team.teamName,
      )
      .map(([year, c]) => {
        const finish =
          c.champion === team.teamName
            ? '1st (Champion)'
            : c.runnerUp === team.teamName
            ? '2nd (Runner-up)'
            : '3rd Place';
        return { year: Number(year), finish };
      })
      .sort((a, b) => a.year - b.year);

    return NextResponse.json({
      meta: mcpMeta('get_team', {
        leagueId,
        team: team.teamName,
        dataSource: 'sleeper-live + static-constants',
      }),
      team: {
        name: team.teamName,
        logoUrl: getTeamLogoPath(team.teamName),
        rosterId: team.rosterId,
        currentRecord,
        allTimeStats: allTime,
        championships: champHistory.filter((c) => c.finish.startsWith('1st')).length,
        championshipHistory: champHistory,
      },
      roster: {
        active: players.filter((p) => p.slot === 'active'),
        ir: players.filter((p) => p.slot === 'ir'),
        taxi: players.filter((p) => p.slot === 'taxi'),
        note: 'Active includes both starters and bench — starter vs bench distinction requires matchup data.',
      },
    });
  } catch (err) {
    console.error('[mcp/team]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
