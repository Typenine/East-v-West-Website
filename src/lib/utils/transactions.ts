import { LEAGUE_IDS } from "@/lib/constants/league";
import {
  getRosterIdToTeamNameMap,
  getLeagueTransactionsAllWeeks,
  type SleeperTransaction,
  type SleeperPlayer,
  getAllPlayersCached,
} from "@/lib/utils/sleeper-api";

export type LeagueTransaction = {
  id: string;
  type: "waiver" | "free_agent";
  season: string;
  week: number;
  created: number;
  team: string;
  rosterId: number;
  added: Array<{ playerId: string; name: string | null; position?: string | null; nflTeam?: string | null }>;
  dropped: Array<{ playerId: string; name: string | null; position?: string | null; nflTeam?: string | null }>;
  faab: number;
  metadata?: Record<string, unknown> | null;
};

export type TransactionsSummary = {
  totalFaab: number;
  totalsByTeam: { team: string; faab: number }[];
  totalsBySeason: { season: string; faab: number }[];
  count: number;
};

export async function buildTransactionLedger(): Promise<LeagueTransaction[]> {
  const players = await getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>));
  const out: LeagueTransaction[] = [];

  const yearToLeague: Record<string, string> = {
    '2025': LEAGUE_IDS.CURRENT,
    ...LEAGUE_IDS.PREVIOUS,
  };

  for (const [season, leagueId] of Object.entries(yearToLeague)) {
    if (!leagueId) continue;
    const transactions = await getLeagueTransactionsAllWeeks(leagueId).catch(() => [] as SleeperTransaction[]);
    const rosterNameMap = await getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>());

    for (const txn of transactions) {
      if (!txn || txn.status !== "complete") continue;
      if (txn.type !== "waiver" && txn.type !== "free_agent") continue;

      const week = Number(txn.leg ?? 0) || 0;
      const created = Number(txn.created ?? 0) || 0;

      const addsEntries = Object.entries(txn.adds || {});
      if (addsEntries.length === 0) continue;

      const dropsEntries = Object.entries(txn.drops || {});

      for (const [playerId, rosterId] of addsEntries) {
        const teamName = rosterNameMap.get(rosterId) || `Roster ${rosterId}`;
        const addedPlayer = players[playerId];
        const added = [buildPlayerRecord(playerId, addedPlayer)];
        const dropped = dropsEntries
          .filter(([, dropRosterId]) => dropRosterId === rosterId)
          .map(([pid]) => buildPlayerRecord(pid, players[pid]));

        const faab = resolveWaiverBid(txn, rosterId);

        out.push({
          id: txn.transaction_id,
          type: txn.type,
          season,
          week,
          created,
          team: teamName,
          rosterId,
          added,
          dropped,
          faab,
          metadata: txn.metadata || undefined,
        });
      }
    }
  }

  out.sort((a, b) => b.created - a.created);
  return out;
}

function buildPlayerRecord(playerId: string, player: SleeperPlayer | undefined) {
  if (!player) {
    return { playerId, name: null, position: null, nflTeam: null };
  }
  const name = `${player.first_name || ""} ${player.last_name || ""}`.trim() || null;
  return {
    playerId,
    name,
    position: player.position || null,
    nflTeam: player.team || null,
  };
}

function resolveWaiverBid(txn: SleeperTransaction, rosterId: number): number {
  if (txn.type !== "waiver") return 0;
  const settingsBid = Number((txn.settings as { waiver_bid?: number })?.waiver_bid ?? 0);
  if (Number.isFinite(settingsBid) && settingsBid > 0) return settingsBid;

  const metadataBid = Number((txn.metadata as { waiver_bid?: number })?.waiver_bid ?? 0);
  if (Number.isFinite(metadataBid) && metadataBid > 0) return metadataBid;

  if (Array.isArray(txn.waiver_budget)) {
    const transfer = txn.waiver_budget.find((budget) => budget.receiver === rosterId);
    if (transfer && Number.isFinite(Number(transfer.amount))) {
      return Number(transfer.amount);
    }
  }
  return 0;
}
