import SectionHeader from "@/components/ui/SectionHeader";
import Card, { CardContent } from "@/components/ui/Card";
import TransactionsTable from "@/components/transactions/TransactionsTable";
import TransactionsFilters from "@/components/transactions/TransactionsFilters";
import TransactionsViewTabs from "@/components/transactions/TransactionsViewTabs";
import GroupedByYear from "@/components/transactions/GroupedByYear";
import GroupedByTeam from "@/components/transactions/GroupedByTeam";
import type { LeagueTransaction, TransactionsSummary } from "@/lib/utils/transactions";

type TransactionsApiResponse = {
  transactions: LeagueTransaction[];
  summary: TransactionsSummary;
  options: {
    seasons: string[];
    teams: string[];
  };
};

async function fetchTransactions(params?: { season?: string; team?: string; sort?: string; direction?: string }) {
  const sp = new URLSearchParams();
  if (params?.season) sp.set("season", params.season);
  if (params?.team) sp.set("team", params.team);
  if (params?.sort) sp.set("sort", params.sort);
  if (params?.direction) sp.set("direction", params.direction);
  const url = `/api/transactions${sp.toString() ? `?${sp.toString()}` : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("transactions_fetch_failed");
  return res.json() as Promise<TransactionsApiResponse>;
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

  const data = await fetchTransactions({ season, team, sort, direction });
  const sortKey = sort || "created";
  const sortDirection = direction === "asc" ? "asc" : "desc";
  const view = (Array.isArray(params.view) ? params.view[0] : params.view) || "all";

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Transactions" subtitle="Waiver and free agent history across seasons" />
      <TransactionsFilters summary={data.summary} seasons={data.options.seasons} teams={data.options.teams} />
      <TransactionsViewTabs />
      {view === 'all' && (
        <Card className="mt-4">
          <CardContent className="p-0">
            <TransactionsTable data={data.transactions} sortKey={sortKey} direction={sortDirection} />
          </CardContent>
        </Card>
      )}
      {view === 'year' && (
        <Card className="mt-4">
          <CardContent className="p-0">
            <GroupedByYear data={data.transactions} />
          </CardContent>
        </Card>
      )}
      {view === 'team' && (
        <Card className="mt-4">
          <CardContent className="p-0">
            <GroupedByTeam data={data.transactions} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
