import { NextResponse } from 'next/server';
import { fetchTradesAllTime } from '@/lib/utils/trades';
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

    const trades = await fetchTradesAllTime();
    const ledger = await buildTransactionLedger();

    const summary = buildSummary(ledger);

    // Build player-centric movement events from ledger (waivers/free agents)
    // and trades (players received by each team).
    type PlayerMovementEvent = {
      season: string;
      week: number | null;
      team: string;
      direction: 'in' | 'out';
      via: 'waiver' | 'free_agent' | 'trade';
      transactionId?: string;
    };

    const playerMovement: Record<string, PlayerMovementEvent[]> = {};

    const pushEvent = (playerId: string, ev: PlayerMovementEvent) => {
      const arr = playerMovement[playerId] || [];
      arr.push(ev);
      playerMovement[playerId] = arr;
    };

    // From waiver/free-agent ledger
    for (const txn of ledger) {
      for (const p of txn.added) {
        pushEvent(p.playerId, {
          season: txn.season,
          week: txn.week || null,
          team: txn.team,
          direction: 'in',
          via: txn.type,
          transactionId: txn.id,
        });
      }
      for (const p of txn.dropped) {
        pushEvent(p.playerId, {
          season: txn.season,
          week: txn.week || null,
          team: txn.team,
          direction: 'out',
          via: txn.type,
          transactionId: txn.id,
        });
      }
    }

    // From trades (players received by each team)
    for (const trade of trades) {
      const season = trade.season ?? 'unknown';
      const week = typeof trade.week === 'number' ? trade.week : null;
      for (const team of trade.teams) {
        for (const asset of team.assets) {
          if (asset.type !== 'player' || !asset.playerId) continue;
          pushEvent(asset.playerId, {
            season,
            week,
            team: team.name,
            direction: 'in',
            via: 'trade',
            transactionId: trade.id,
          });
        }
      }
    }

    // Sort each player's movement chronologically by season then week
    const seasonNum = (s: string) => {
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };
    for (const events of Object.values(playerMovement)) {
      events.sort((a, b) => {
        const sa = seasonNum(a.season);
        const sb = seasonNum(b.season);
        if (sa !== sb) return sa - sb;
        const wa = a.week ?? 0;
        const wb = b.week ?? 0;
        if (wa !== wb) return wa - wb;
        return a.team.localeCompare(b.team);
      });
    }

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
      playerMovement,
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
