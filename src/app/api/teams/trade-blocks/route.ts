import { TEAM_NAMES } from '@/lib/constants/league';
import { getUserIdForTeam } from '@/lib/server/user-identity';
import { readUserDoc, TradeAsset, TradeWants } from '@/lib/server/user-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows: Array<{ team: string; tradeBlock: TradeAsset[]; tradeWants: TradeWants | null; updatedAt: string | null }>
      = [];

    for (const team of TEAM_NAMES) {
      try {
        const userId = getUserIdForTeam(team);
        const doc = await readUserDoc(userId, team);
        rows.push({
          team,
          tradeBlock: Array.isArray(doc.tradeBlock) ? doc.tradeBlock : [],
          tradeWants: doc.tradeWants ?? null,
          updatedAt: doc.updatedAt || null,
        });
      } catch {
        rows.push({ team, tradeBlock: [], tradeWants: null, updatedAt: null });
      }
    }

    return Response.json({ teams: rows });
  } catch {
    return Response.json({ error: 'Failed to load trade blocks' }, { status: 500 });
  }
}
