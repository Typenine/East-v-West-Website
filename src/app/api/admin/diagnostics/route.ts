/**
 * Admin Diagnostics API
 *
 * GET /api/admin/diagnostics
 *   → { runs: last 20 generation runs, mcpCalls: last 100 MCP tool calls }
 *
 * GET /api/admin/diagnostics?runId=<id>
 *   → { run, sections } — full detail for one run
 *
 * GET /api/admin/diagnostics?season=2026&week=12
 *   → { run, sections } — latest run for that newsletter (used by the editor
 *     to show provider badges, coverage warnings, and fact-audit flags)
 *
 * Admin-only, read-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminCookieValue } from '@/lib/auth/admin';
import {
  listRecentRuns,
  getRunWithSections,
  getLatestRunForWeek,
  listRecentMcpCalls,
} from '@/server/db/observability-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminCookieValue(cookieStore.get('evw_admin')?.value);
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('runId');
  const season = searchParams.get('season');
  const week = searchParams.get('week');

  try {
    // ── Single run detail ──
    if (runId) {
      const { run, sections } = await getRunWithSections(runId);
      if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      return NextResponse.json({ run, sections });
    }

    // ── Latest run for a newsletter (editor badges) ──
    if (season && week !== null && week !== '') {
      const run = await getLatestRunForWeek(Number(season), Number(week));
      if (!run) return NextResponse.json({ run: null, sections: [] });
      const { sections } = await getRunWithSections(run.runId);
      return NextResponse.json({ run, sections });
    }

    // ── Overview: recent runs + MCP call log ──
    const onlyErrors = searchParams.get('onlyErrors') === 'true';
    const [runs, mcpCalls] = await Promise.all([
      listRecentRuns(20),
      listRecentMcpCalls(100, onlyErrors),
    ]);
    return NextResponse.json({ runs, mcpCalls });
  } catch (err) {
    console.error('[admin/diagnostics]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
