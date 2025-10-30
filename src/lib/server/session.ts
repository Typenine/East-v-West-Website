import { cookies } from 'next/headers';
import { verifySession } from '@/lib/server/auth';
import { getUserIdForTeam } from '@/lib/server/user-identity';

export async function requireTeamUser(): Promise<{ team: string; userId: string } | null> {
  try {
    const jar = await cookies();
    const token = jar.get('evw_session')?.value || '';
    const claims = token ? verifySession(token) : null;
    const team = (claims?.team as string) || (claims?.sub as string) || '';
    if (!team) return null;
    const userId = getUserIdForTeam(team);
    return { team, userId };
  } catch {
    return null;
  }
}
