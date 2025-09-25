import { NextResponse } from "next/server";
import { buildTransactionLedger } from "@/lib/utils/transactions";

const TTL_MS = 5 * 60 * 1000;
let cache: { ts: number; data: Awaited<ReturnType<typeof buildTransactionLedger>> } | null = null;

async function getLedgerCached() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) {
    return cache.data;
  }
  const data = await buildTransactionLedger();
  cache = { ts: now, data };
  return data;
}

function sortTransactions(
  transactions: Awaited<ReturnType<typeof buildTransactionLedger>>,
  sortKey: string | null,
  direction: string | null,
) {
  const dir = direction === "asc" ? 1 : -1;
  const key = sortKey || "created";
  const sorted = [...transactions];
  sorted.sort((a, b) => {
    if (key === "faab") {
      return dir * (a.faab - b.faab);
    }
    if (key === "team") {
      return dir * a.team.localeCompare(b.team);
    }
    if (key === "season") {
      return dir * a.season.localeCompare(b.season);
    }
    if (key === "week") {
      return dir * (a.week - b.week);
    }
    // default created timestamp
    return dir * (a.created - b.created);
  });
  return sorted;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const season = url.searchParams.get("season");
    const team = url.searchParams.get("team");
    const sortKey = url.searchParams.get("sort");
    const direction = url.searchParams.get("direction");

    const ledger = await getLedgerCached();
    const allSeasons = Array.from(new Set(ledger.map((txn) => txn.season))).sort((a, b) => b.localeCompare(a));
    const allTeams = Array.from(new Set(ledger.map((txn) => txn.team))).sort();

    let filtered = ledger;
    if (season && season.toLowerCase() !== "all") {
      filtered = filtered.filter((txn) => txn.season === season);
    }
    if (team && team.toLowerCase() !== "all") {
      filtered = filtered.filter((txn) => txn.team === team);
    }

    const sorted = sortTransactions(filtered, sortKey, direction);

    const summary = buildSummary(sorted);

    return NextResponse.json({
      transactions: sorted,
      summary,
      options: {
        seasons: allSeasons,
        teams: allTeams,
      },
    });
  } catch (error) {
    console.error("/api/transactions error", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

function buildSummary(transactions: Awaited<ReturnType<typeof buildTransactionLedger>>) {
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
    totalsByTeam: Array.from(totalsByTeam.entries()).map(([team, faab]) => ({ team, faab })).sort((a, b) => b.faab - a.faab),
    totalsBySeason: Array.from(totalsBySeason.entries()).map(([season, faab]) => ({ season, faab })).sort((a, b) => b.season.localeCompare(a.season)),
    count: transactions.length,
  };
}
