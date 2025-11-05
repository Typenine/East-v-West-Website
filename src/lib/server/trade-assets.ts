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

  const nextSeason = Number((league as unknown as { season?: string })?.season ?? new Date().getFullYear()) + 1;
  const nextSeasonStr = String(nextSeason);
  const rounds = Number(((league?.settings as unknown as { draft_rounds?: number })?.draft_rounds) ?? 3);

  // Build current ownership map for next-season picks keyed by `${origRosterId}-${round}`
  const baseOwners: Map<string, number> = new Map();
  for (const r of rosters) for (let rd = 1; rd <= Math.max(1, rounds); rd++) baseOwners.set(`${r.roster_id}-${rd}`, r.roster_id);

  // Prefer Sleeper traded_picks endpoint, then fallback to replaying trades
  try {
    const url = `https://api.sleeper.app/v1/league/${leagueId}/traded_picks`;
    const resp = await fetch(url, { cache: 'no-store' });
    if (resp.ok) {
      type TP = { season?: string; round?: number; roster_id?: number; owner_id?: number };
      const arr = (await resp.json()) as TP[];
      for (const tp of arr) {
        if (!tp || String(tp.season) !== nextSeasonStr) continue;
        // Sleeper traded_picks: roster_id = original owner roster_id, owner_id = current owner roster_id
        const key = `${Number(tp.roster_id)}-${Number(tp.round)}`;
        if (typeof tp.owner_id === 'number') baseOwners.set(key, tp.owner_id);
      }
    }
  } catch {}
  // Regardless of traded_picks success, replay chronological trades to guarantee final state
  try {
    const txns = await getLeagueTrades(leagueId);
    const sorted = [...txns]
      .filter((t) => t && t.status === 'complete')
      .sort((a: SleeperTransaction, b: SleeperTransaction) => {
        const aTs = Number(a.status_updated || a.created || 0);
        const bTs = Number(b.status_updated || b.created || 0);
        return aTs - bTs;
      });
    for (const t of sorted) {
      if (!Array.isArray(t.draft_picks)) continue;
      for (const p of t.draft_picks) {
        if (!p || String(p.season) !== nextSeasonStr) continue;
        const key = `${p.roster_id}-${p.round}`; // original roster id + round
        if (typeof p.owner_id === 'number') baseOwners.set(key, p.owner_id);
      }
    }
  } catch {}

  // Collect picks currently owned by this team (by roster id)
  const picks: Array<{ year: number; round: number; originalTeam: string }> = [];
  const teamRoster = rosters.find((r) => nameMap.get(r.roster_id) === canon);
  if (teamRoster) {
    for (let rd = 1; rd <= Math.max(1, rounds); rd++) {
      for (const r of rosters) {
        const key = `${r.roster_id}-${rd}`;
        const curOwner = baseOwners.get(key);
        if (curOwner === teamRoster.roster_id) {
          const origTeam = nameMap.get(r.roster_id) || canonicalizeTeamName(team);
          picks.push({ year: nextSeason, round: rd, originalTeam: origTeam });
        }
      }
    }
  }

  // FAAB available estimation
  const leagueWaiverBudget = Number(((league?.settings as unknown as { waiver_budget?: number })?.waiver_budget) ?? 100);
  const faabAvail = Math.max(0, leagueWaiverBudget - waiverBudgetUsed);

  return { players: rosterPlayers, picks, faab: faabAvail };
}
