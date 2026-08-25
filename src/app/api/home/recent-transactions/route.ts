import { NextResponse } from 'next/server';
import { CURRENT_SEASON } from '@/lib/constants/league';
import { buildTransactionLedger } from '@/lib/utils/transactions';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ledger = await buildTransactionLedger({ season: CURRENT_SEASON });
    const items = ledger.slice(0, 8).map((txn) => ({
      id: txn.id,
      type: txn.type,
      team: txn.team,
      week: txn.week,
      created: txn.created,
      faab: txn.faab,
      added: txn.added.slice(0, 4).map((p) => p.name || p.playerId),
      dropped: txn.dropped.slice(0, 4).map((p) => p.name || p.playerId),
    }));

    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch {
    return NextResponse.json({ items: [] }, { status: 200 });
  }
}
