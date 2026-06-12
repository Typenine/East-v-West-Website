/**
 * Newsletter draft order helper.
 *
 * Fetches the same draft order shown on the website's draft order page by calling
 * the /api/draft/next-order route handler directly (no HTTP round-trip).
 * This accounts for traded pick ownership and the correct playoff finishing order
 * (champion last, runner-up second-to-last, etc.) — exactly what the website shows.
 *
 * Falls back to empty arrays if the route fails; caller should handle gracefully.
 */

import type { NextRequest } from 'next/server';

export interface NewsletterDraftOrder {
  round1: Array<{ slot: number; team: string }>;
  round2: Array<{ slot: number; team: string }> | undefined;
}

/**
 * Returns the pick order for rounds 1 and 2, using the same source as the
 * /api/draft/next-order page endpoint. Picks reflect current trade ownership.
 */
export async function getNewsletterDraftOrder(seasonNum: number): Promise<NewsletterDraftOrder | null> {
  try {
    const { GET } = await import('@/app/api/draft/next-order/route');

    // Build a minimal Request with the season param — the handler only reads req.url
    const req = new Request(`http://localhost/api/draft/next-order?season=${seasonNum}`);
    const res = await GET(req as unknown as NextRequest);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[DraftOrder] next-order returned HTTP ${res.status} for season ${seasonNum}${body ? ` — ${body.slice(0, 300)}` : ''}`);
      return null;
    }

    const data = await res.json() as {
      slotOrder?: Array<{ slot: number; team: string }>;
      roundsData?: Array<{ round: number; picks: Array<{ slot: number; ownerTeam: string; originalTeam: string }> }>;
    };

    const r1 = data.roundsData?.find(r => r.round === 1);
    const r2 = data.roundsData?.find(r => r.round === 2);

    // Use ownerTeam (current owner after trades) not originalTeam
    const round1 = r1
      ? r1.picks.map(p => ({ slot: p.slot, team: p.ownerTeam }))
      : (data.slotOrder ?? []).map(s => ({ slot: s.slot, team: s.team }));

    const round2 = r2
      ? r2.picks.map(p => ({ slot: p.slot, team: p.ownerTeam }))
      : undefined;

    if (round1.length > 0) {
      console.log(`[DraftOrder] Loaded from next-order: R1 = ${round1.map(p => `${p.slot}.${p.team}`).join(', ')}`);
      if (round2?.length) {
        console.log(`[DraftOrder] R2 = ${round2.map(p => `${p.slot}.${p.team}`).join(', ')}`);
      }
    } else {
      console.warn('[DraftOrder] next-order returned empty round 1 order');
      return null;
    }

    return { round1, round2 };
  } catch (e) {
    console.warn('[DraftOrder] Failed to load from next-order route:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
