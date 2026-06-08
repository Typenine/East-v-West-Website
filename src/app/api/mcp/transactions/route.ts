/**
 * MCP Tool: get_transactions
 * Returns recent waiver/free-agent transactions. Deliberately limited to the
 * most recent entries to avoid large payloads. Full history is in export/trades.
 *
 * Reuses buildTransactionLedger from transactions.ts (same source as the
 * website's /api/transactions page) — no new Sleeper fetch logic.
 *
 * Query params:
 *   ?limit=25     — max rows to return (default 25, max 100)
 *   ?team=Belltown+Raptors  — filter to a single team
 *   ?season=2025  — filter to a season
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth, mcpMeta } from '@/lib/mcp/auth';
import { buildTransactionLedger } from '@/lib/utils/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const teamFilter = (url.searchParams.get('team') ?? '').toLowerCase().trim();
    const seasonFilter = (url.searchParams.get('season') ?? '').trim();

    const ledger = await buildTransactionLedger();

    // Apply filters
    let filtered = ledger;
    if (seasonFilter) {
      filtered = filtered.filter((t) => t.season === seasonFilter);
    }
    if (teamFilter) {
      filtered = filtered.filter((t) => t.team.toLowerCase().includes(teamFilter));
    }

    // Sort most-recent first, then take limit
    const sorted = [...filtered].sort((a, b) => b.created - a.created);
    const page = sorted.slice(0, limit);

    // Slim each entry: strip large fields, keep what an LLM needs
    const slim = page.map((t) => ({
      id: t.id,
      season: t.season,
      week: t.week,
      team: t.team,
      type: t.type,
      faab: t.faab,
      added: t.added.map((p) => ({ playerId: p.playerId, name: p.name ?? p.playerId })),
      dropped: t.dropped.map((p) => ({ playerId: p.playerId, name: p.name ?? p.playerId })),
      createdAt: new Date(t.created).toISOString(),
    }));

    return NextResponse.json({
      meta: mcpMeta('get_transactions', {
        totalMatched: filtered.length,
        returned: slim.length,
        limit,
        filters: { season: seasonFilter || null, team: teamFilter || null },
      }),
      transactions: slim,
    });
  } catch (err) {
    console.error('[mcp/transactions]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
