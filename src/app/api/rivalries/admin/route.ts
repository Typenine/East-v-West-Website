import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminCookieValue } from '@/lib/auth/admin';
import {
  getLatestCycle,
  createCycle,
  updateCycleStatus,
  getSubmissionsForCycle,
  reopenSubmission,
  deleteSubmission,
  storePairs,
  publishPairs,
} from '@/server/db/rivalry-queries';
import { calculatePairings } from '@/lib/rivalry/algorithm';
import { TEAM_NAMES } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(): Promise<boolean> {
  const jar = await cookies();
  return isAdminCookieValue(jar.get('evw_admin')?.value);
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = (body as { action?: string }).action;
  const teamId = (body as { teamId?: string }).teamId;
  const now = new Date().toISOString();

  switch (action) {
    case 'reopen-submission': {
      if (!teamId || !TEAM_NAMES.includes(teamId)) {
        return Response.json({ error: 'Valid teamId required' }, { status: 400 });
      }
      const cycle = await getLatestCycle();
      if (!cycle || cycle.status === 'published') {
        return Response.json({ error: 'Cannot reopen a submission after rivalries are published' }, { status: 409 });
      }
      await reopenSubmission(cycle.id, teamId);
      return Response.json({ ok: true });
    }

    case 'delete-submission': {
      if (!teamId || !TEAM_NAMES.includes(teamId)) {
        return Response.json({ error: 'Valid teamId required' }, { status: 400 });
      }
      const cycle = await getLatestCycle();
      if (!cycle) return Response.json({ error: 'No active cycle' }, { status: 404 });
      if (cycle.status === 'published') {
        return Response.json({ error: 'Cannot delete a submission after rivalries are published' }, { status: 409 });
      }
      await deleteSubmission(cycle.id, teamId);
      return Response.json({ ok: true });
    }

    case 'calculate': {
      // Get or create cycle — teams may have submitted without admin ever touching the cycle
      let cycle = await getLatestCycle();
      if (!cycle) {
        cycle = await createCycle();
        if (!cycle) return Response.json({ error: 'Failed to create cycle' }, { status: 500 });
      }
      if (cycle.status === 'published') {
        return Response.json({ error: 'Rivalries are already published' }, { status: 409 });
      }
      const subs = await getSubmissionsForCycle(cycle.id);
      const present = subs.filter((s) => !s.reopenedAt);
      if (present.length !== TEAM_NAMES.length) {
        return Response.json({
          error: `Need all ${TEAM_NAMES.length} submissions, have ${present.length}`,
        }, { status: 409 });
      }
      const result = calculatePairings(present.map((s) => ({ teamId: s.teamId, scores: s.scores })));
      if (result.errors.length > 0) {
        return Response.json({ error: 'Calculation failed', details: result.errors }, { status: 422 });
      }
      const stored = await storePairs(cycle.id, result.pairs);
      if (!stored) return Response.json({ error: 'Failed to store pairs' }, { status: 500 });
      await updateCycleStatus(cycle.id, 'calculated', { calculatedAt: now });
      return Response.json({ ok: true, pairs: result.pairs });
    }

    case 'publish': {
      const cycle = await getLatestCycle();
      if (!cycle || cycle.status !== 'calculated') {
        return Response.json({ error: 'Run Calculate Pairings before publishing' }, { status: 409 });
      }
      await publishPairs(cycle.id);
      await updateCycleStatus(cycle.id, 'published', { publishedAt: now });
      return Response.json({ ok: true });
    }

    default:
      return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
