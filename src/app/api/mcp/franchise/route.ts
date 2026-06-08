/**
 * MCP Tool: get_franchise
 * Returns per-team franchise summaries: all-time regular-season and playoff
 * records, points totals, and championship counts.
 * Wraps getSplitRecordsAllTime (same source as /api/franchise-summaries).
 *
 * Query params:
 *   ?team=Belltown+Raptors  — filter to a single team (partial, case-insensitive)
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth, mcpMeta } from '@/lib/mcp/auth';
import { CHAMPIONS } from '@/lib/constants/league';
import { getSplitRecordsAllTime } from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const teamFilter = (url.searchParams.get('team') ?? '').toLowerCase().trim();

    const splits = await getSplitRecordsAllTime({ timeoutMs: 20000 });

    // Championship counts
    const champCounts: Record<string, number> = {};
    const runnerUpCounts: Record<string, number> = {};
    for (const c of Object.values(CHAMPIONS)) {
      if (c.champion && c.champion !== 'TBD') {
        champCounts[c.champion] = (champCounts[c.champion] ?? 0) + 1;
      }
      if (c.runnerUp && c.runnerUp !== 'TBD') {
        runnerUpCounts[c.runnerUp] = (runnerUpCounts[c.runnerUp] ?? 0) + 1;
      }
    }

    const franchises = Object.entries(splits)
      .filter(([, s]) => !teamFilter || s.teamName.toLowerCase().includes(teamFilter))
      .map(([, s]) => {
        const reg = s.regular;
        const plo = s.playoffs;
        const regGames = reg.wins + reg.losses + reg.ties;
        const ploGames = plo.wins + plo.losses + plo.ties;
        return {
          team: s.teamName,
          regularSeason: {
            wins: reg.wins,
            losses: reg.losses,
            ties: reg.ties,
            winPct: regGames > 0 ? Math.round((reg.wins / regGames) * 1000) / 10 : 0,
            pf: Math.round(reg.pf * 100) / 100,
            pa: Math.round(reg.pa * 100) / 100,
            avgPf: regGames > 0 ? Math.round((reg.pf / regGames) * 100) / 100 : 0,
          },
          playoffs: {
            wins: plo.wins,
            losses: plo.losses,
            ties: plo.ties,
            winPct: ploGames > 0 ? Math.round((plo.wins / ploGames) * 1000) / 10 : 0,
          },
          championships: champCounts[s.teamName] ?? 0,
          runnerUps: runnerUpCounts[s.teamName] ?? 0,
        };
      })
      .sort((a, b) => b.championships - a.championships || b.regularSeason.winPct - a.regularSeason.winPct);

    return NextResponse.json({
      meta: mcpMeta('get_franchise', {
        teamCount: franchises.length,
        note: 'Records cover all regular-season and playoff games across all league seasons.',
      }),
      franchises,
    });
  } catch (err) {
    console.error('[mcp/franchise]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
