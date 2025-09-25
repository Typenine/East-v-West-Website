import SectionHeader from "@/components/ui/SectionHeader";
import Card, { CardContent } from "@/components/ui/Card";
import TransactionsTable from "@/components/transactions/TransactionsTable";
import TransactionsFilters from "@/components/transactions/TransactionsFilters";
import TransactionsViewTabs from "@/components/transactions/TransactionsViewTabs";
import GroupedByYear from "@/components/transactions/GroupedByYear";
import GroupedByTeam from "@/components/transactions/GroupedByTeam";
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

  const season = Array.isArray(seasonParamRaw) ? seasonParamRaw[0] : seasonParamRaw;
  const team = Array.isArray(teamParamRaw) ? teamParamRaw[0] : teamParamRaw;
  const sort = Array.isArray(sortParamRaw) ? sortParamRaw[0] : sortParamRaw;
  const direction = Array.isArray(dirParamRaw) ? dirParamRaw[0] : dirParamRaw;

  // Determine seasons list (static order) and selected season (default: 2025)
  const allSeasons = listAllSeasons();
  const selectedSeason = season && allSeasons.includes(season) ? season : allSeasons[0] || "2025";

  // Build data server-side with minimal IO: fetch only selected season by default
  let ledger: LeagueTransaction[] = [];
  try {
    ledger = await buildTransactionLedger({ season: selectedSeason });
  } catch {
    ledger = [];
  }
  const seasons = allSeasons;
  const teams = Array.from(new Set(ledger.map((t) => t.team))).sort();

  const sortKey = (sort as SortKey) || "created";
  const sortDirection = direction === "asc" ? "asc" : "desc";
  let filtered = ledger;
  if (season) filtered = filtered.filter((t) => t.season === season);
  if (team) filtered = filtered.filter((t) => t.team === team);
  const transactions = sortTransactions(filtered, sortKey, sortDirection);
  const summary = buildSummary(transactions);
  const view = (Array.isArray(params.view) ? params.view[0] : params.view) || "all";

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Transactions" subtitle="Waiver and free agent history across seasons" />
      <TransactionsFilters summary={summary} seasons={seasons} teams={teams} />
      <TransactionsViewTabs />
      {view === 'all' && (
        <Card className="mt-4">
          <CardContent className="p-0">
            <TransactionsTable data={transactions} sortKey={sortKey} direction={sortDirection} />
          </CardContent>
        </Card>
      )}
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
    </div>
  );
}
