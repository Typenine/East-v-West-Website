import { cookies } from 'next/headers';
import { verifySession } from '@/lib/server/auth';
import { canonicalizeTeamName } from '@/lib/server/user-identity';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { getLatestCycle, getSubmissionsForCycle, getSubmission } from '@/server/db/rivalry-queries';
import { TEAM_NAMES } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const cycle = await getLatestCycle();
  if (!cycle) {
    return Response.json({ cycle: null, submittedCount: 0, totalTeams: TEAM_NAMES.length, teams: [], mySubmission: null });
  }

  const jar = await cookies();
  const isAdmin = isAdminCookieValue(jar.get('evw_admin')?.value);
  const token = jar.get('evw_session')?.value || '';
  const claims = token ? verifySession(token) : null;
  const rawTeam = claims ? ((claims.team as string) || (claims.sub as string) || '') : '';
  const myTeam = rawTeam ? canonicalizeTeamName(rawTeam) : null;

  const allSubs = await getSubmissionsForCycle(cycle.id);
  const subMap = new Map(allSubs.map((s) => [s.teamId, s]));

  const teams = TEAM_NAMES.map((name) => {
    const sub = subMap.get(name);
    return {
      teamId: name,
      submitted: !!sub && !sub.reopenedAt,
      submittedAt: sub && !sub.reopenedAt ? sub.submittedAt : null,
      reopened: !!sub?.reopenedAt,
    };
  });

  const submittedCount = teams.filter((t) => t.submitted).length;

  // Own submission: return scores only to the submitting team or admin
  let mySubmission: { submittedAt: string; scores: { targetTeamId: string; score: number }[] } | null = null;
  if (myTeam) {
    const sub = await getSubmission(cycle.id, myTeam);
    if (sub && !sub.reopenedAt) {
      mySubmission = { submittedAt: sub.submittedAt, scores: sub.scores };
    }
  }

  // Admin always sees all submitted ballot scores
  let adminSubmissions: Array<{ teamId: string; scores: { targetTeamId: string; score: number }[] }> | null = null;
  if (isAdmin) {
    adminSubmissions = allSubs.map((s) => ({ teamId: s.teamId, scores: s.scores }));
  }

  return Response.json({
    cycle,
    submittedCount,
    totalTeams: TEAM_NAMES.length,
    teams,
    mySubmission,
    ...(isAdmin ? { adminSubmissions } : {}),
  });
}
