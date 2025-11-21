import { NextResponse } from 'next/server';
import { fetchTradesAllTime, type Trade } from '@/lib/utils/trades';
import {
  buildTransactionLedger,
  listAllSeasons,
  type LeagueTransaction,
  type TransactionsSummary,
} from '@/lib/utils/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildSummary(transactions: LeagueTransaction[]): TransactionsSummary {
  const totalsByTeam = new Map<string, number>();
  const totalsBySeason = new Map<string, number>();
  let grandTotal = 0;
  for (const txn of transactions) {
    if (txn.faab > 0) {
      grandTotal += txn.faab;
      totalsByTeam.set(txn.team, (totalsByTeam.get(txn.team) ?? 0) + txn.faab);
      totalsBySeason.set(txn.season, (totalsBySeason.get(txn.season) ?? 0) + txn.faab);
    }
  }
  return {
    totalFaab: grandTotal,
    totalsByTeam: Array.from(totalsByTeam.entries())
      .map(([team, faab]) => ({ team, faab }))
      .sort((a, b) => b.faab - a.faab),
    totalsBySeason: Array.from(totalsBySeason.entries())
      .map(([season, faab]) => ({ season, faab }))
      .sort((a, b) => b.season.localeCompare(a.season)),
    count: transactions.length,
  };
}

export async function GET() {
  try {
    const seasons = listAllSeasons();

    const [trades, ledger] = await Promise.all<[
      Trade[],
      LeagueTransaction[],
    ]>([
      fetchTradesAllTime(),
      buildTransactionLedger(),
    ]);

    const summary = buildSummary(ledger);

    const body = {
      meta: {
        type: 'trades-and-transactions',
        version: 1,
        generatedAt: new Date().toISOString(),
        seasons,
      },
      trades,
      transactions: {
        ledger,
        summary,
      },
    };

    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="evw-trades-and-transactions.json"',
      },
    });
  } catch (err) {
    console.error('export/trades GET error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
