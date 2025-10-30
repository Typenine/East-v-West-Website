import { getUserIdForTeam } from '@/lib/server/user-identity';
import { readUserDoc } from '@/lib/server/user-store';
import { TEAM_NAMES } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Discover which teams exist (TEAM_NAMES) and read each user doc
    const results: Record<string, { up: number; down: number }> = {};

    for (const team of TEAM_NAMES) {
      try {
        const userId = getUserIdForTeam(team);
        const doc = await readUserDoc(userId, team);
        const votes = (doc.votes && doc.votes['suggestions']) || {};
        for (const [id, valRaw] of Object.entries(votes)) {
          const val = typeof valRaw === 'number' ? valRaw : 0;
          if (!results[id]) results[id] = { up: 0, down: 0 };
          if (val > 0) results[id].up += 1;
          else if (val < 0) results[id].down += 1;
        }
      } catch {}
    }

    return Response.json({ tallies: results });
  } catch {
    return Response.json({ error: 'Failed to compute tallies' }, { status: 500 });
  }
}
