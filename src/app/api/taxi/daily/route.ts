import { NextRequest } from 'next/server';
import { getLatestTaxiRunMeta } from '@/server/db/queries.fixed';
import { claimTaxiAuditDay, easternDay, finishTaxiAuditDay } from '@/lib/server/taxi-daily-claim';
import { runTaxiReport } from '@/lib/server/run-taxi-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * No cron is configured: the first visitor on a day may request one refresh.
 * The database claim is shared by every production instance, so simultaneous
 * homepage views cannot launch multiple full audits.
 * All other visits continue to read /api/taxi/flags (saved results).
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin) {
    return Response.json({ error: 'Same-origin request required' }, { status: 403 });
  }

  const day = easternDay(new Date());
  try {
    // A successful commissioner or rule-specific audit today is already fresh.
    const latest = await getLatestTaxiRunMeta();
    if (latest?.runTs && easternDay(new Date(latest.runTs)) === day) {
      return Response.json({ refreshed: false, reason: 'recent_saved_report' });
    }

    const claimId = await claimTaxiAuditDay(day);
    if (!claimId) {
      return Response.json({ refreshed: false, reason: 'daily_audit_already_claimed' });
    }

    let success = false;
    try {
      const result = await runTaxiReport();
      if (result.ok) {
        const payload = await result.clone().json().catch(() => null) as
          { complete?: boolean; checkedTeams?: number; expectedTeams?: number } | null;
        success = payload?.complete === true
          && Number(payload?.checkedTeams) === Number(payload?.expectedTeams)
          && Number(payload?.expectedTeams) === 12;
      }
      return success
        ? Response.json({ refreshed: true })
        : Response.json({ error: 'Daily taxi audit incomplete; showing last saved report' }, { status: 503 });
    } finally {
      await finishTaxiAuditDay(day, claimId, success);
    }
  } catch (error) {
    console.error('[taxi-daily] Could not run daily on-demand audit:', error);
    return Response.json({ error: 'Latest saved report remains available' }, { status: 503 });
  }
}
