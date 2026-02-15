import { Suspense } from "react";
import SectionHeader from "@/components/ui/SectionHeader";
import Card, { CardContent } from "@/components/ui/Card";
import TransactionsTable from "@/components/transactions/TransactionsTable";
import TransactionsFilters from "@/components/transactions/TransactionsFilters";
import TransactionsViewTabs from "@/components/transactions/TransactionsViewTabs";
import GroupedByYear from "@/components/transactions/GroupedByYear";
import GroupedByTeam from "@/components/transactions/GroupedByTeam";
import GroupedToolbar from "@/components/transactions/GroupedToolbar";
import TransactionsPagination from "@/components/transactions/TransactionsPagination";
import { buildTransactionLedger, listAllSeasons, type LeagueTransaction, type TransactionsSummary } from "@/lib/utils/transactions";

type SortKey = "created" | "faab" | "team" | "season" | "week";

function sortTransactions(list: LeagueTransaction[], sortKey: SortKey, direction: "asc" | "desc") {
  const dir = direction === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    if (sortKey === "faab") return dir * ((a.faab || 0) - (b.faab || 0));
    if (sortKey === "team") return dir * a.team.localeCompare(b.team);
    if (sortKey === "season") return dir * a.season.localeCompare(b.season);
    if (sortKey === "week") return dir * ((a.week || 0) - (b.week || 0));
    return dir * ((a.created || 0) - (b.created || 0));
  });
}

function buildSummary(transactions: LeagueTransaction[]): TransactionsSummary {
  const totalsByTeam = new Map<string, number>();
  const totalsBySeason = new Map<string, number>();
  let grandTotal = 0;
  for (const t of transactions) {
    const amt = Number(t.faab || 0);
    if (amt > 0) {
      grandTotal += amt;
      totalsByTeam.set(t.team, (totalsByTeam.get(t.team) ?? 0) + amt);
      totalsBySeason.set(t.season, (totalsBySeason.get(t.season) ?? 0) + amt);
    }
  }
  return {
    totalFaab: grandTotal,
    totalsByTeam: Array.from(totalsByTeam.entries()).map(([team, faab]) => ({ team, faab })).sort((a, b) => b.faab - a.faab),
    totalsBySeason: Array.from(totalsBySeason.entries()).map(([season, faab]) => ({ season, faab })).sort((a, b) => b.season.localeCompare(a.season)),
    count: transactions.length,
  };
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await (searchParams ?? Promise.resolve({}))) as Record<string, string | string[] | undefined>;
  const seasonParamRaw = params.season;
  const teamParamRaw = params.team;
  const sortParamRaw = params.sort;
  const dirParamRaw = params.direction;
  const pageParamRaw = params.page;
  const perPageParamRaw = params.perPage;
  const weekParamRaw = params.week;
  const positionParamRaw = params.position;

  const season = Array.isArray(seasonParamRaw) ? seasonParamRaw[0] : seasonParamRaw;
  const team = Array.isArray(teamParamRaw) ? teamParamRaw[0] : teamParamRaw;
  const sort = Array.isArray(sortParamRaw) ? sortParamRaw[0] : sortParamRaw;
  const direction = Array.isArray(dirParamRaw) ? dirParamRaw[0] : dirParamRaw;
  const pageStr = Array.isArray(pageParamRaw) ? pageParamRaw[0] : pageParamRaw;
  const perPageStr = Array.isArray(perPageParamRaw) ? perPageParamRaw[0] : perPageParamRaw;
  const weekStr = Array.isArray(weekParamRaw) ? weekParamRaw[0] : weekParamRaw;
  const position = Array.isArray(positionParamRaw) ? positionParamRaw[0] : positionParamRaw;

  // Determine seasons list
  const allSeasons = listAllSeasons();

  // Build data server-side
  let ledger: LeagueTransaction[] = [];
  try {
    const seasonIsAll = season === "all";
    if (!seasonIsAll && season && allSeasons.includes(season)) {
      // Specific season selected
      ledger = await buildTransactionLedger({ season });
    } else {
      // "All seasons" (no season filter) -> collect all seasons
      ledger = await buildTransactionLedger();
    }
  } catch {
    ledger = [];
  }
  const seasons = allSeasons;
  const teams = Array.from(new Set(ledger.map((t) => t.team))).sort();
  const positions = Array.from(
    new Set(
      ledger.flatMap((t) => [
        ...t.added.map((p) => p.position).filter(Boolean),
        ...t.dropped.map((p) => p.position).filter(Boolean),
      ]) as string[]
    )
  )
    .filter(Boolean)
    .sort();

  const sortKey = (sort as SortKey) || "created";
  const sortDirection = direction === "asc" ? "asc" : "desc";
  let filtered = ledger;
  const seasonFilter = season && season !== "all" ? season : undefined;
  if (seasonFilter) filtered = filtered.filter((t) => t.season === seasonFilter);
  if (team) filtered = filtered.filter((t) => t.team === team);
  const week = weekStr && weekStr !== "all" ? Number(weekStr) : undefined;
  if (week && !Number.isNaN(week)) filtered = filtered.filter((t) => (t.week || 0) === week);
  const pos = position && position !== "all" ? position : undefined;
  if (pos) filtered = filtered.filter((t) => t.added.some((p) => p.position === pos));
  const transactions = sortTransactions(filtered, sortKey, sortDirection);
  const summary = buildSummary(transactions);
  const view = (Array.isArray(params.view) ? params.view[0] : params.view) || "all";

  // Pagination (All view only)
  const perPageDefault = 50;
  const perPage = Math.max(1, Math.min(1000, Number(perPageStr) || perPageDefault));
  const page = Math.max(1, Number(pageStr) || 1);
  const start = (page - 1) * perPage;
  const end = start + perPage;
  const paged = transactions.slice(start, end);

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Transactions" subtitle="Waiver and free agent history across seasons" />
      <Suspense fallback={null}>
        <TransactionsViewTabs />
      </Suspense>
      {view === 'all' && (
        <>
          <Suspense fallback={null}>
            <TransactionsFilters summary={summary} seasons={seasons} teams={teams} positions={positions} />
          </Suspense>
        <Card className="mt-4">
          <CardContent className="p-0">
            <TransactionsTable data={paged} sortKey={sortKey} direction={sortDirection} />
            <Suspense fallback={null}>
              <TransactionsPagination total={transactions.length} page={page} perPage={perPage} />
            </Suspense>
          </CardContent>
        </Card>
        </>
      )}
      {view !== 'all' && (
        <>
          <Suspense fallback={null}>
            <GroupedToolbar seasons={seasons} teams={teams} positions={positions} />
          </Suspense>
          {view === 'year' && (
            <Card className="mt-4">
              <CardContent className="p-0">
                <GroupedByYear data={transactions} />
              </CardContent>
            </Card>
          )}
          {view === 'team' && (
            <Card className="mt-4">
              <CardContent className="p-0">
                <GroupedByTeam data={transactions} />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
