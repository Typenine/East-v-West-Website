import { LEAGUE_IDS } from '@/lib/constants/league';
import { getLeague, getLeagueRosters, getRosterIdToTeamNameMap, getLeagueTrades, SleeperTransaction } from '@/lib/utils/sleeper-api';
import { canonicalizeTeamName } from '@/lib/server/user-identity';

export type TeamAssets = {
  players: string[];
  picks: Array<{ year: number; round: number; originalTeam: string }>;
  faab: number;
};

export async function getTeamAssets(team: string): Promise<TeamAssets> {
  const leagueId = LEAGUE_IDS.CURRENT;
  const league = await getLeague(leagueId).catch(() => null);
  const rosters = await getLeagueRosters(leagueId).catch(() => []);
  const nameMap = await getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>());

  const canon = canonicalizeTeamName(team);

  // Find roster for this team by owner mapping via team name heuristic
  let rosterPlayers: string[] = [];
  let waiverBudgetUsed = 0;

  if (rosters && rosters.length > 0) {
    const match = rosters.find((r) => nameMap.get(r.roster_id) === canon);
    if (match) {
      rosterPlayers = Array.isArray(match.players) ? match.players.filter(Boolean) : [];
      const used = Number((match.settings as unknown as { waiver_budget_used?: number })?.waiver_budget_used ?? 0);
      waiverBudgetUsed = Number.isFinite(used) ? used : 0;
    }
  }

  const picks: Array<{ year: number; round: number; originalTeam: string }> = [];
  const ownership = await loadNextDraftOwnership({ leagueId, league, rosters, nameMap });

  if (ownership && rosters.length > 0) {
    const teamRoster = rosters.find((r) => nameMap.get(r.roster_id) === canon);
    if (teamRoster) {
      for (const [key, value] of Object.entries(ownership.ownership)) {
        if (value.ownerRosterId !== teamRoster.roster_id) continue;
        const [origRosterIdStr, roundStr] = key.split('-');
        const round = Number(roundStr);
        if (!Number.isFinite(round)) continue;
        const originalTeam =
          ownership.rosterIdToTeam[origRosterIdStr] ||
          nameMap.get(Number(origRosterIdStr)) ||
          canon;
        picks.push({ year: ownership.season, round, originalTeam });
      }
    }
  }

  // FAAB available estimation
  const leagueWaiverBudget = Number(((league?.settings as unknown as { waiver_budget?: number })?.waiver_budget) ?? 100);
  const faabAvail = Math.max(0, leagueWaiverBudget - waiverBudgetUsed);

  return { players: rosterPlayers, picks, faab: faabAvail };
}

type LoadNextDraftArgs = {
  leagueId: string;
  league?: Awaited<ReturnType<typeof getLeague>> | null;
  rosters?: Awaited<ReturnType<typeof getLeagueRosters>>;
  nameMap?: Map<number, string>;
};

async function loadNextDraftOwnership(args: LoadNextDraftArgs): Promise<NextDraftOwnership | null> {
  const league = args.league ?? (await getLeague(args.leagueId).catch(() => null));
  const rosters = args.rosters ?? (await getLeagueRosters(args.leagueId).catch(() => []));
  const nameMap = args.nameMap ?? (await getRosterIdToTeamNameMap(args.leagueId).catch(() => new Map<number, string>()));

  if (!league || !rosters.length) return null;

  const nextSeason = Number((league as unknown as { season?: string })?.season ?? new Date().getFullYear()) + 1;
  const nextSeasonStr = String(nextSeason);
  const rounds = Math.max(1, Number(((league?.settings as unknown as { draft_rounds?: number })?.draft_rounds) ?? 4));

  const baseOwners: Map<string, number> = new Map();
  const historyMap: Map<string, DraftPickTransferEvent[]> = new Map();

  for (const r of rosters) {
    for (let rd = 1; rd <= rounds; rd++) {
      baseOwners.set(`${r.roster_id}-${rd}`, r.roster_id);
    }
  }

  try {
    const url = `https://api.sleeper.app/v1/league/${args.leagueId}/traded_picks`;
    const resp = await fetch(url, { cache: 'no-store' });
    if (resp.ok) {
      type SleeperTradedPick = { season?: string; round?: number; roster_id?: number; owner_id?: number };
      const arr = (await resp.json()) as SleeperTradedPick[];
      for (const tp of arr) {
        if (!tp || String(tp.season) !== nextSeasonStr) continue;
        const key = `${Number(tp.roster_id)}-${Number(tp.round)}`;
        if (Number.isFinite(tp.owner_id as number)) {
          baseOwners.set(key, Number(tp.owner_id));
        }
      }
    }
  } catch {}

  try {
    const txns = await getLeagueTrades(args.leagueId);
    const sorted = [...txns]
      .filter((t) => t && t.status === 'complete')
      .sort((a: SleeperTransaction, b: SleeperTransaction) => {
        const aTs = Number(a.status_updated || a.created || 0);
        const bTs = Number(b.status_updated || b.created || 0);
        return aTs - bTs;
      });
    for (const txn of sorted) {
      if (!Array.isArray(txn.draft_picks)) continue;
      const timestamp = Number(txn.status_updated || txn.created || 0);
      for (const p of txn.draft_picks) {
        if (!p || String(p.season) !== nextSeasonStr) continue;
        const key = `${p.roster_id}-${p.round}`;
        const prevOwner = Number(p.previous_owner_id);
        const newOwner = Number(p.owner_id);
        if (!Number.isFinite(prevOwner) || !Number.isFinite(newOwner) || prevOwner === newOwner) continue;
        baseOwners.set(key, newOwner);
        const fromTeam = nameMap.get(prevOwner) || `Roster ${prevOwner}`;
        const toTeam = nameMap.get(newOwner) || `Roster ${newOwner}`;
        const event: DraftPickTransferEvent = {
          tradeId: String(txn.transaction_id),
          timestamp,
          fromRosterId: prevOwner,
          toRosterId: newOwner,
          fromTeam,
          toTeam,
        };
        const arr = historyMap.get(key) || [];
        arr.push(event);
        historyMap.set(key, arr);
      }
    }
  } catch {}

  const ownership: Record<string, { ownerRosterId: number; history: DraftPickTransferEvent[] }> = {};
  for (const [key, owner] of baseOwners.entries()) {
    const history = historyMap.get(key) || [];
    history.sort((a, b) => a.timestamp - b.timestamp);
    ownership[key] = {
      ownerRosterId: owner,
      history,
    };
  }

  const rosterIdToTeam: Record<string, string> = {};
  for (const [rosterId, teamName] of nameMap.entries()) {
    rosterIdToTeam[String(rosterId)] = teamName;
  }

  return {
    season: nextSeason,
    rounds,
    rosterCount: rosters.length,
    rosterIdToTeam,
    ownership,
  };
}

export type DraftPickTransferEvent = {
  tradeId: string;
  timestamp: number;
  fromRosterId: number;
  toRosterId: number;
  fromTeam: string;
  toTeam: string;
};

export type NextDraftOwnership = {
  season: number;
  rounds: number;
  rosterCount: number;
  rosterIdToTeam: Record<string, string>;
  ownership: Record<string, { ownerRosterId: number; history: DraftPickTransferEvent[] }>;
};

export async function getNextDraftOwnership(): Promise<NextDraftOwnership | null> {
  return loadNextDraftOwnership({ leagueId: LEAGUE_IDS.CURRENT });
}
