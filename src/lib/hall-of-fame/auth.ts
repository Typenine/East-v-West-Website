import { cookies } from 'next/headers';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { verifySession } from '@/lib/server/auth';
import { readPins } from '@/lib/server/pins';
import { canonicalizeTeamName, getUserIdForTeam } from '@/lib/server/user-identity';

export interface HallOfFameActor {
  isAdmin: boolean;
  teamName: string | null;
  franchiseId: string | null;
  sessionValid: boolean;
}

export async function getHallOfFameActor(): Promise<HallOfFameActor> {
  const jar = await cookies();
  const isAdmin = isAdminCookieValue(jar.get('evw_admin')?.value);
  const token = jar.get('evw_session')?.value || '';
  const claims = token ? verifySession(token) : null;
  if (!claims || typeof claims.team !== 'string') {
    return { isAdmin, teamName: null, franchiseId: null, sessionValid: false };
  }

  const teamName = canonicalizeTeamName(claims.team);
  let sessionValid = true;
  try {
    const pins = await readPins();
    const currentPinVersion = pins[teamName]?.pinVersion ?? 0;
    const claimPinVersion = typeof (claims as { pv?: unknown }).pv === 'number'
      ? Number((claims as { pv?: unknown }).pv)
      : 0;
    if (currentPinVersion > claimPinVersion) sessionValid = false;
  } catch {
    // PIN storage is best-effort for the same reason as the existing authenticated routes.
  }

  return {
    isAdmin,
    teamName,
    franchiseId: getUserIdForTeam(teamName),
    sessionValid,
  };
}

export function canManageFranchise(actor: HallOfFameActor, franchiseId: string): boolean {
  if (actor.isAdmin) return true;
  return actor.sessionValid && actor.franchiseId === franchiseId;
}
