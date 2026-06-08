/**
 * MCP Tool: get_standings
 * Returns current-season standings by reusing getSplitRecordsAllTime from
 * sleeper-api.ts. The response is slimmed to what an LLM needs: team name,
 * W/L/T, points for/against, avg points, and championships won.
 *
 * Optional query params:
 *   ?season=2025   — filter to a specific season (default: current)
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth, mcpMeta } from '@/lib/mcp/auth';
import { CHAMPIONS, CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import {
  getSplitRecordsAllTime,
  getLeagueRosters,
  getTeamsData,
} from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  try {
    const opts = { timeoutMs: 20000 };

    // Run both fetches in parallel
    const [splits, rosters, teams] = await Promise.all([
      getSplitRecordsAllTime(opts),
      getLeagueRosters(LEAGUE_IDS.CURRENT, opts).catch(() => []),
      getTeamsData(LEAGUE_IDS.CURRENT, opts).catch(() => []),
    ]);

    // Championship counts
    const champCounts: Record<string, number> = {};
    for (const c of Object.values(CHAMPIONS)) {
      if (c.champion && c.champion !== 'TBD') {
        champCounts[c.champion] = (champCounts[c.champion] ?? 0) + 1;
      }
    }

    // Current-season W/L from Sleeper roster settings (live, per-season)
    const rosterIdToName = new Map<number, string>(
      teams.map((t) => [t.rosterId, t.teamName]),
    );
    type CurrentRecord = { wins: number; losses: number; ties: number; pf: number; pa: number };
    const currentSeason: Record<string, CurrentRecord> = {};
    for (const r of rosters) {
      const name = rosterIdToName.get(r.roster_id) ?? `Roster ${r.roster_id}`;
      const s = r.settings as {
        wins?: number; losses?: number; ties?: number;
        fpts?: number; fpts_decimal?: number;
        fpts_against?: number; fpts_against_decimal?: number;
      } | undefined;
      if (!s) continue;
      const pf = (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100;
      const pa = (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100;
      currentSeason[name] = {
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        ties: s.ties ?? 0,
        pf: Math.round(pf * 100) / 100,
        pa: Math.round(pa * 100) / 100,
      };
    }

    // Current-season standings table (sorted by wins, then pf)
    const currentRows = Object.entries(currentSeason)
      .map(([team, rec]) => {
        const games = rec.wins + rec.losses + rec.ties;
        return {
          rank: 0,
          team,
          wins: rec.wins,
          losses: rec.losses,
          ties: rec.ties,
          pf: rec.pf,
          pa: rec.pa,
          avgPf: games > 0 ? Math.round((rec.pf / games) * 100) / 100 : 0,
          championships: champCounts[team] ?? 0,
        };
      })
      .sort((a, b) => b.wins - a.wins || b.pf - a.pf);
    currentRows.forEach((r, i) => { r.rank = i + 1; });

    // All-time regular-season standings table
    const allTimeRows = Object.entries(splits)
      .map(([, s]) => {
        const reg = s.regular;
        const games = reg.wins + reg.losses + reg.ties;
        return {
          rank: 0,
          team: s.teamName,
          wins: reg.wins,
          losses: reg.losses,
          ties: reg.ties,
          pf: Math.round(reg.pf * 100) / 100,
          pa: Math.round(reg.pa * 100) / 100,
          avgPf: games > 0 ? Math.round((reg.pf / games) * 100) / 100 : 0,
          championships: champCounts[s.teamName] ?? 0,
        };
      })
      .sort((a, b) => b.wins - a.wins || b.pf - a.pf);
    allTimeRows.forEach((r, i) => { r.rank = i + 1; });

    return NextResponse.json({
      meta: mcpMeta('get_standings', {
        currentSeason: CURRENT_SEASON,
        note: 'currentSeasonStandings reflects live Sleeper roster W/L for the active season. allTimeStandings covers all regular-season games across all seasons.',
      }),
      currentSeasonStandings: currentRows,
      allTimeStandings: allTimeRows,
      champions: CHAMPIONS,
    });
  } catch (err) {
    console.error('[mcp/standings]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
