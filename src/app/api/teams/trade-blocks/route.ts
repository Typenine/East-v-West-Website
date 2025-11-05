import { TEAM_NAMES } from '@/lib/constants/league';
import { getUserIdForTeam } from '@/lib/server/user-identity';
import { readUserDoc, TradeAsset, TradeWants } from '@/lib/server/user-store';
import { getTeamAssets } from '@/lib/server/trade-assets';

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
        let tradeBlock = Array.isArray(doc.tradeBlock) ? doc.tradeBlock : [];
        try {
          const assets = await getTeamAssets(team);
          const playerSet = new Set<string>(assets.players);
          const ownedPicks = new Set<string>(assets.picks.map((p) => `${p.year}-${p.round}-${p.originalTeam}`));
          const filtered: TradeAsset[] = [];
          for (const a of tradeBlock) {
            if (a && typeof a === 'object') {
              if ((a as TradeAsset).type === 'player' && typeof (a as { playerId?: string }).playerId === 'string') {
                if (playerSet.has((a as { playerId: string }).playerId)) filtered.push(a);
              } else if ((a as TradeAsset).type === 'pick') {
                const y = (a as { year?: number }).year;
                const r = (a as { round?: number }).round;
                const ot = (a as { originalTeam?: string }).originalTeam || team;
                const k = `${y}-${r}-${ot}`;
                if (Number.isFinite(y) && Number.isFinite(r) && ownedPicks.has(k)) filtered.push({ ...a, originalTeam: ot } as TradeAsset);
              } else if ((a as TradeAsset).type === 'faab') {
                const amt = Number((a as { amount?: number }).amount ?? assets.faab);
                const safe = Math.max(0, Math.min(assets.faab, Number.isFinite(amt) ? amt : 0));
                filtered.push({ type: 'faab', amount: safe } as TradeAsset);
              }
            }
          }
          tradeBlock = filtered;
        } catch {}
        rows.push({ team, tradeBlock, tradeWants: doc.tradeWants ?? null, updatedAt: doc.updatedAt || null });
      } catch {
        rows.push({ team, tradeBlock: [], tradeWants: null, updatedAt: null });
      }
    }

    return Response.json({ teams: rows });
  } catch {
    return Response.json({ error: 'Failed to load trade blocks' }, { status: 500 });
  }
}
