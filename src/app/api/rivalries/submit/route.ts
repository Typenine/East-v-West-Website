import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/server/auth';
import { canonicalizeTeamName } from '@/lib/server/user-identity';
import { getLatestCycle, createCycle, getSubmission, upsertSubmission } from '@/server/db/rivalry-queries';
import { validateSubmission, RIVALRY_OTHERS, RIVALRY_BUDGET } from '@/lib/rivalry/algorithm';
import { isBeforeDeadline } from '@/lib/rivalry/deadline';
import { TEAM_NAMES } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Auth
  const jar = await cookies();
  const token = jar.get('evw_session')?.value || '';
  const claims = token ? verifySession(token) : null;
  const rawTeam = claims ? ((claims.team as string) || (claims.sub as string) || '') : '';
  const myTeam = rawTeam ? canonicalizeTeamName(rawTeam) : null;
  if (!myTeam || !TEAM_NAMES.includes(myTeam)) {
    return Response.json({ error: 'Not authenticated as a league team' }, { status: 401 });
  }

  // Auto-create a cycle if none exists — teams don't need admin to "open" anything
  let cycle = await getLatestCycle();
  if (!cycle) {
    cycle = await createCycle();
    if (!cycle) return Response.json({ error: 'Failed to initialize rivalry cycle' }, { status: 500 });
  }

  // Block only if rivalries are already published and locked
  if (cycle.status === 'published') {
    return Response.json({ error: 'Rivalries are already locked and published.' }, { status: 409 });
  }

  // Existing submission: allow update before deadline, or if commissioner reopened
  const existing = await getSubmission(cycle.id, myTeam);
  if (existing && !existing.reopenedAt) {
    if (!isBeforeDeadline()) {
      return Response.json({
        error: 'The submission deadline has passed. Ask a commissioner to reopen your submission.',
      }, { status: 409 });
    }
    // Before deadline — allow self-service update
  }

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const scores = (body as { scores?: unknown }).scores;
  if (!Array.isArray(scores) || scores.length !== RIVALRY_OTHERS) {
    return Response.json({ error: `Expected exactly ${RIVALRY_OTHERS} scores` }, { status: 400 });
  }

  const parsed = scores.map((s: unknown) => {
    const obj = s as { targetTeamId?: unknown; score?: unknown };
    return { targetTeamId: String(obj.targetTeamId ?? ''), score: Number(obj.score) };
  });

  const otherTeams = TEAM_NAMES.filter((t) => t !== myTeam);
  const targetSet = new Set(parsed.map((s) => s.targetTeamId));
  for (const t of otherTeams) {
    if (!targetSet.has(t)) {
      return Response.json({ error: `Missing score for ${t}` }, { status: 400 });
    }
  }
  if (parsed.some((s) => s.targetTeamId === myTeam)) {
    return Response.json({ error: 'Cannot score your own team' }, { status: 400 });
  }

  const validationErrors = validateSubmission({ teamId: myTeam, scores: parsed }, TEAM_NAMES);
  if (validationErrors.length > 0) {
    return Response.json({ error: 'Invalid ballot', details: validationErrors }, { status: 400 });
  }

  const total = parsed.reduce((s, e) => s + e.score, 0);
  if (total !== RIVALRY_BUDGET) {
    return Response.json({ error: `Total must be ${RIVALRY_BUDGET}, got ${total}` }, { status: 400 });
  }

  const ok = await upsertSubmission({
    cycleId: cycle.id,
    teamId: myTeam,
    submittedAt: new Date().toISOString(),
    scores: parsed,
  });

  if (!ok) {
    return Response.json({ error: 'Failed to save submission' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
