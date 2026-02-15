import { LEAGUE_IDS } from '@/lib/constants/league';
import { getLeague, getLeagueRosters, getRosterIdToTeamNameMap } from '@/lib/utils/sleeper-api';
import { getObjectText } from '@/server/storage/r2';
import { canonicalizeTeamName } from '@/lib/server/user-identity';
import { getCurrentPhase } from '@/lib/utils/phase-resolver';

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
  const phase = getCurrentPhase();

  // Find roster for this team by owner mapping via team name heuristic
  let rosterPlayers: string[] = [];
  let waiverBudgetUsed = 0;

  if (rosters && rosters.length > 0) {
    const match = rosters.find((r) => nameMap.get(r.roster_id) === canon);
    if (match) {
      rosterPlayers = Array.isArray(match.players) ? match.players.filter(Boolean) : [];
      // Only count waiver budget used if we're in-season
      // During offseason/pre-season, reset to full budget
      const inSeason = phase === 'regular_season' || phase === 'playoffs';
      if (inSeason) {
        const used = Number((match.settings as unknown as { waiver_budget_used?: number })?.waiver_budget_used ?? 0);
        waiverBudgetUsed = Number.isFinite(used) ? used : 0;
      } else {
        waiverBudgetUsed = 0; // Full budget available in offseason
      }
    }
  }

  const picks: Array<{ year: number; round: number; originalTeam: string }> = [];
  const seenPickKeys = new Set<string>();
  const baseSeason = Number((league as unknown as { season?: string })?.season ?? new Date().getFullYear()) + 1;
  const seasons = phase === 'post_championship_pre_draft'
    ? [baseSeason, baseSeason + 1, baseSeason + 2]
    : [baseSeason + 1, baseSeason + 2];

  const ownerships = await Promise.all(
    seasons.map((season) => loadDraftOwnershipForSeason({ leagueId, league, rosters, nameMap, season }))
  );

  if (rosters.length > 0) {
    const teamRoster = rosters.find((r) => nameMap.get(r.roster_id) === canon);
    if (teamRoster) {
      for (const ownership of ownerships) {
        if (!ownership) continue;
        for (const [key, value] of Object.entries(ownership.ownership)) {
          if (value.ownerRosterId !== teamRoster.roster_id) continue;
          const [origRosterIdStr, roundStr] = key.split('-');
          const round = Number(roundStr);
          if (!Number.isFinite(round)) continue;
          const originalTeam =
            ownership.rosterIdToTeam[origRosterIdStr] ||
            nameMap.get(Number(origRosterIdStr)) ||
            canon;
          const pickKey = `${ownership.season}-${round}-${originalTeam}`;
          if (seenPickKeys.has(pickKey)) continue;
          seenPickKeys.add(pickKey);
          picks.push({ year: ownership.season, round, originalTeam });
        }
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

async function loadDraftOwnershipForSeason(args: LoadNextDraftArgs & { season: number }): Promise<NextDraftOwnership | null> {
  const league = args.league ?? (await getLeague(args.leagueId).catch(() => null));
  const rosters = args.rosters ?? (await getLeagueRosters(args.leagueId).catch(() => []));
  const nameMap = args.nameMap ?? (await getRosterIdToTeamNameMap(args.leagueId).catch(() => new Map<number, string>()));

  if (!league || !rosters.length) return null;

  const targetSeason = Number(args.season);
  const targetSeasonStr = String(targetSeason);
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
        if (!tp || String(tp.season) !== targetSeasonStr) continue;
        const key = `${Number(tp.roster_id)}-${Number(tp.round)}`;
        if (Number.isFinite(tp.owner_id as number)) {
          baseOwners.set(key, Number(tp.owner_id));
        }
      }
    }
  } catch {}

  

  // Intentionally skip fetching Sleeper weekly transactions for speed. Ownership is determined
  // by traded_picks plus manual overrides. History will include manual-trade events only.

  // Apply manual trades last so overrides win and appear in history
  try {
    type ManualTradeAsset = { type: 'player' | 'pick' | 'cash'; name: string; year?: string; round?: number; originalOwner?: string };
    type ManualTradeTeam = { name: string; assets: ManualTradeAsset[] };
    type ManualTrade = { id: string; date: string; status: 'completed' | 'pending' | 'vetoed'; teams: ManualTradeTeam[]; active?: boolean };
    const BLOB_PATH = 'evw/manual_trades.json';
    let trades: ManualTrade[] = [];
    try {
      const txt = await getObjectText({ key: BLOB_PATH });
      if (txt) {
        const arr = JSON.parse(txt);
        if (Array.isArray(arr)) trades = arr as ManualTrade[];
      }
    } catch {}
    if (trades.length) {
      const tsFromDate = (d: string) => {
        const t = Date.parse(d);
        return Number.isFinite(t) ? t : Date.now();
      };
      const findRosterIdByTeam = (teamName: string | undefined): number | null => {
        if (!teamName) return null;
        for (const [rid, name] of nameMap.entries()) {
          if (name === teamName) return rid;
        }
        return null;
      };
      for (const mt of trades) {
        if (mt.active === false) continue;
        if (mt.status !== 'completed') continue;
        const timestamp = tsFromDate(mt.date);
        for (const team of (mt.teams || [])) {
          const toRosterId = findRosterIdByTeam(team.name);
          if (!toRosterId) continue;
          for (const a of (team.assets || [])) {
            if (a.type !== 'pick') continue;
            const yearStr = a.year ? String(a.year) : '';
            const rd = Number(a.round);
            if (!yearStr || yearStr !== targetSeasonStr) continue;
            if (!Number.isFinite(rd)) continue;
            const origRosterId = findRosterIdByTeam(a.originalOwner);
            if (!origRosterId) continue;
            const key = `${origRosterId}-${rd}`;
            const prevOwner = baseOwners.get(key);
            baseOwners.set(key, toRosterId);
            const fromTeam = prevOwner != null ? (nameMap.get(prevOwner) || `Roster ${prevOwner}`) : (a.originalOwner || 'Unknown');
            const toTeam = nameMap.get(toRosterId) || `Roster ${toRosterId}`;
            const event: DraftPickTransferEvent = {
              tradeId: mt.id,
              timestamp,
              fromRosterId: prevOwner ?? origRosterId,
              toRosterId: toRosterId,
              fromTeam,
              toTeam,
            };
            const arr = historyMap.get(key) || [];
            arr.push(event);
            historyMap.set(key, arr);
          }
        }
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
    season: targetSeason,
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

export async function loadNextDraftOwnership(args: LoadNextDraftArgs): Promise<NextDraftOwnership | null> {
  const league = args.league ?? (await getLeague(args.leagueId).catch(() => null));
  const rosters = args.rosters ?? (await getLeagueRosters(args.leagueId).catch(() => []));
  const nameMap = args.nameMap ?? (await getRosterIdToTeamNameMap(args.leagueId).catch(() => new Map<number, string>()));
  if (!league || !rosters.length) return null;
  const nextSeason = Number((league as unknown as { season?: string })?.season ?? new Date().getFullYear()) + 1;
  return loadDraftOwnershipForSeason({ leagueId: args.leagueId, league, rosters, nameMap, season: nextSeason });
}
