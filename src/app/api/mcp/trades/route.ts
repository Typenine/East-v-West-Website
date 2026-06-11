/**
 * MCP Tool: get_trades
 * Returns slim trade history. Reuses fetchTradesAllTime from trades.ts —
 * the same source powering export/trades — but strips pick-provenance detail
 * and limits the payload to what an LLM needs.
 *
 * Query params:
 *   ?team=Belltown+Raptors  — filter trades involving a team (partial, case-insensitive)
 *   ?season=2025            — filter to a specific season
 *   ?limit=20               — max trades to return (default 20, max 50)
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth, mcpMeta } from '@/lib/mcp/auth';
import { fetchTradesAllTime } from '@/lib/utils/trades';
import { slimTradeTeams } from '@/lib/mcp/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const teamFilter = (url.searchParams.get('team') ?? '').toLowerCase().trim();
    const seasonFilter = (url.searchParams.get('season') ?? '').trim();
    const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const allTrades = await fetchTradesAllTime();

    // Apply filters
    let filtered = allTrades;
    if (seasonFilter) {
      filtered = filtered.filter((t) => String(t.season) === seasonFilter);
    }
    if (teamFilter) {
      filtered = filtered.filter((t) =>
        t.teams.some((side) => side.name.toLowerCase().includes(teamFilter)),
      );
    }

    // Sort most-recent first using created timestamp or date string
    const sorted = [...filtered].sort((a, b) => {
      const ta = typeof a.created === 'number' ? a.created : Date.parse(a.date ?? '0');
      const tb = typeof b.created === 'number' ? b.created : Date.parse(b.date ?? '0');
      return tb - ta;
    });

    const page = sorted.slice(0, limit);

    // Slim each trade: keep teams, assets (player names + positions), season/week.
    // Multi-team trades get per-asset sender attribution via slimTradeTeams.
    const slim = page.map((t) => ({
      id: t.id,
      season: t.season ?? null,
      week: t.week ?? null,
      date: t.date,
      teams: slimTradeTeams(t),
    }));

    return NextResponse.json({
      meta: mcpMeta('get_trades', {
        totalMatched: filtered.length,
        returned: slim.length,
        limit,
        filters: { season: seasonFilter || null, team: teamFilter || null },
      }),
      trades: slim,
    });
  } catch (err) {
    console.error('[mcp/trades]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
