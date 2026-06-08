/**
 * MCP Tool: get_matchups
 * Returns the current week's matchups with team names and scores.
 * Reuses getLeagueMatchups + getTeamsData from sleeper-api.ts.
 * Resolves team names via the existing rosterId→teamName pipeline.
 *
 * Optional query params:
 *   ?week=5    — override the week (default: current NFL week from Sleeper state)
 *   ?season=2025 — not currently multi-season; reserved for future use
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth, mcpMeta } from '@/lib/mcp/auth';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  getNFLState,
  getLeagueMatchups,
  getTeamsData,
  type SleeperMatchup,
} from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const leagueId = LEAGUE_IDS.CURRENT;
    const opts = { timeoutMs: 10000 };

    // Resolve current week from Sleeper state unless overridden
    let week = Number(url.searchParams.get('week'));
    let seasonType = 'unknown';
    let nflSeason = '';

    if (!Number.isFinite(week) || week < 1) {
      try {
        const state = await getNFLState(undefined, opts);
        week = Number(state?.week ?? 1);
        seasonType = (state as { season_type?: string }).season_type ?? 'unknown';
        nflSeason = String((state as { season?: string | number }).season ?? '');
      } catch {
        week = 1;
      }
    }

    const [matchups, teams] = await Promise.all([
      getLeagueMatchups(leagueId, week, opts).catch(() => [] as SleeperMatchup[]),
      getTeamsData(leagueId, opts).catch(() => []),
    ]);

    const rosterIdToName = new Map<number, string>(
      teams.map((t) => [t.rosterId, t.teamName]),
    );

    // Group matchups by matchup_id into pairs
    const byMatchupId = new Map<number, SleeperMatchup[]>();
    for (const m of matchups) {
      const arr = byMatchupId.get(m.matchup_id) ?? [];
      arr.push(m);
      byMatchupId.set(m.matchup_id, arr);
    }

    type MatchupEntry = {
      matchupId: number;
      home: { team: string; rosterId: number; points: number };
      away: { team: string; rosterId: number; points: number };
      played: boolean;
    };

    const result: MatchupEntry[] = [];

    for (const [matchupId, pair] of byMatchupId.entries()) {
      if (pair.length < 2) continue;
      const [a, b] = pair;
      const aPts = Number(a.custom_points ?? a.points ?? 0);
      const bPts = Number(b.custom_points ?? b.points ?? 0);
      result.push({
        matchupId,
        home: {
          team: rosterIdToName.get(b.roster_id) ?? `Roster ${b.roster_id}`,
          rosterId: b.roster_id,
          points: Math.round(bPts * 100) / 100,
        },
        away: {
          team: rosterIdToName.get(a.roster_id) ?? `Roster ${a.roster_id}`,
          rosterId: a.roster_id,
          points: Math.round(aPts * 100) / 100,
        },
        played: aPts > 0 || bPts > 0,
      });
    }

    result.sort((a, b) => a.matchupId - b.matchupId);

    return NextResponse.json({
      meta: mcpMeta('get_matchups', {
        leagueId,
        week,
        nflSeason,
        seasonType,
      }),
      week,
      matchups: result,
    });
  } catch (err) {
    console.error('[mcp/matchups]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
