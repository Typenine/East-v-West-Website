import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamsData, getLeagueMatchups, getLeagueTransactionsAllWeeks, getAllPlayersCached, SleeperTransaction, getLeagueRosters } from '@/lib/utils/sleeper-api';
import { resolveCanonicalTeamName } from '@/lib/utils/team-utils';

export type TaxiLimits = { maxSlots: number; maxQB: number };
export type TaxiPlayer = {
  playerId: string;
  name: string | null;
  position?: string | null;
  sinceTs?: string | null; // approx: last join date for this team when not activated since
  activatedSinceJoin: boolean; // after join AND week played
  potentialActivatedSinceJoin?: boolean; // after join but week not yet played
  activatedAt?: { year: string; week: number } | null;
};

export type TaxiAnalysis = {
  team: { ownerId: string; teamName: string; selectedSeason: string; rosterId: number };
  limits: TaxiLimits;
  current: { taxi: TaxiPlayer[]; counts: { total: number; qbs: number } };
  violations: { overSlots: boolean; overQB: boolean; ineligibleOnTaxi: string[] };
};

/**
 * Compute taxi analysis for a franchise across seasons and return status for the selected season's roster.
 * - A player is ineligible for taxi if they have appeared in any matchup for this franchise since their last join event
 *   and have not left the franchise in between (carries across seasons).
 */
export async function computeTaxiAnalysisForRoster(selectedSeason: string, selectedRosterId: number): Promise<TaxiAnalysis | null> {
  const leagueId = selectedSeason === '2025' ? LEAGUE_IDS.CURRENT : LEAGUE_IDS.PREVIOUS[selectedSeason as keyof typeof LEAGUE_IDS.PREVIOUS];
  if (!leagueId) return null;

  // Resolve the franchise owner and canonical team name from selected season
  const teams = await getTeamsData(leagueId).catch(() => []);
  const thisTeam = teams.find((t) => t.rosterId === selectedRosterId);
  if (!thisTeam) return null;
  const ownerId = thisTeam.ownerId;
  const canonicalName = resolveCanonicalTeamName({ ownerId });

  // Build mapping of season -> rosterId for this franchise using canonical name
  const yearToLeague: Record<string, string> = { '2025': LEAGUE_IDS.CURRENT, ...LEAGUE_IDS.PREVIOUS } as const;
  const seasons: string[] = Object.keys(yearToLeague).sort();
  const rosterIdBySeason = new Map<string, number>();
  for (const year of seasons) {
    const lid = yearToLeague[year];
    if (!lid) continue;
    try {
      const ts = await getTeamsData(lid);
      const seasonTeam = ts.find((t) => t.teamName === canonicalName) || ts.find((t) => t.ownerId === ownerId);
      if (seasonTeam) rosterIdBySeason.set(year, seasonTeam.rosterId);
    } catch {}
  }

  // Build per-season appearances: player -> { [yearWeek]: true }
  const appearedSinceJoin = new Map<string, { activated: boolean; when?: { year: string; week: number } }>();
  const potentialSinceJoin = new Map<string, { pending: boolean; when?: { year: string; week: number } }>();
  // Build last join (timestamp + season/week) per player across seasons for this franchise
  const lastJoin = new Map<string, { ts: number; year: string; week: number }>();

  for (const year of seasons) {
    const lid = yearToLeague[year];
    const rid = rosterIdBySeason.get(year);
    if (!lid || !rid) continue;

    // Transactions -> join/leave timestamps (track latest join; remove if a later drop occurs)
    try {
      const txns = await getLeagueTransactionsAllWeeks(lid);
      for (const txn of txns as SleeperTransaction[]) {
        if (!txn || txn.status !== 'complete') continue;
        const created = Number(txn.created || 0) || 0;
        const legWeek = Number(txn.leg || 0) || 0;
        // joins: adds[playerId] === rid
        if (txn.adds) {
          for (const [pid, recv] of Object.entries(txn.adds)) {
            if (recv === rid) {
              const prev = lastJoin.get(pid);
              if (!prev || created > prev.ts) {
                lastJoin.set(pid, { ts: created, year, week: legWeek });
              }
            }
          }
        }
        // leaves: drops[playerId] === rid
        if (txn.drops) {
          for (const [pid, from] of Object.entries(txn.drops)) {
            if (from === rid) {
              const prev = lastJoin.get(pid);
              if (!prev || created >= prev.ts) {
                // Leaving after the last join resets eligibility until a future join
                lastJoin.delete(pid);
                appearedSinceJoin.delete(pid);
              }
            }
          }
        }
      }
    } catch {}

    // Weekly matchups -> appearance markers for this roster
    try {
      const weeks = Array.from({ length: 17 }, (_, i) => i + 1);
      const weekly = await Promise.all(weeks.map((w) => getLeagueMatchups(lid, w).catch(() => [] as Array<{ matchup_id?: number; roster_id?: number; players?: string[]; starters?: string[]; points?: number; custom_points?: number }>)));
      for (let wi = 0; wi < weekly.length; wi++) {
        const week = wi + 1;
        const mus = weekly[wi] as Array<{ matchup_id?: number; roster_id?: number; players?: string[]; starters?: string[]; points?: number; custom_points?: number }>;
        const m = mus.find((mm) => mm.roster_id === rid);
        if (!m) continue;
        const ids = new Set<string>([...(m.players || []), ...(m.starters || [])].filter(Boolean) as string[]);
        if (ids.size === 0) continue;
        // Determine if this matchup was played (either side scored > 0)
        const opp = mus.find((x) => x.matchup_id === m.matchup_id && x.roster_id !== m.roster_id);
        const myPts = Number((m.custom_points ?? m.points ?? 0) || 0);
        const oppPts = Number((opp?.custom_points ?? opp?.points ?? 0) || 0);
        const played = (myPts > 0) || (oppPts > 0);
        for (const pid of ids) {
          const lj = lastJoin.get(pid);
          if (!lj) continue;
          // Only consider appearances on/after the join point
          const isAfterJoin = (year > lj.year) || (year === lj.year && week >= (lj.week || 0));
          if (!isAfterJoin) continue;
          if (played) {
            const prev = appearedSinceJoin.get(pid);
            if (!prev || !prev.activated) {
              appearedSinceJoin.set(pid, { activated: true, when: { year, week } });
            }
            // Clear any pending potential flag since it's now actual
            potentialSinceJoin.delete(pid);
          } else {
            const prevP = potentialSinceJoin.get(pid);
            if (!prevP || !prevP.pending) potentialSinceJoin.set(pid, { pending: true, when: { year, week } });
          }
        }
      }
    } catch {}
  }

  // Current season roster taxi list
  const selectedSeasonRosterId = rosterIdBySeason.get(selectedSeason) || selectedRosterId;
  let taxiIds: string[] = [];
  try {
    const rosters = await getLeagueRosters(leagueId);
    const cur = rosters.find((r) => r.roster_id === selectedSeasonRosterId) as unknown as { taxi?: unknown } | undefined;
    const rawTaxi = Array.isArray(cur?.taxi) ? (cur?.taxi as unknown[]) : [];
    taxiIds = (rawTaxi as string[]).filter((v): v is string => typeof v === 'string' && v.length > 0);
  } catch {}

  // Enrich with player meta
  const players = await getAllPlayersCached().catch(() => ({} as Record<string, { first_name?: string; last_name?: string; position?: string }>));

  // Build taxi players list with eligibility and approximate sinceTs
  const items: TaxiPlayer[] = taxiIds.map((pid) => {
    const name = players[pid] ? `${players[pid].first_name || ''} ${players[pid].last_name || ''}`.trim() : null;
    const position = players[pid]?.position || null;
    const activated = appearedSinceJoin.get(pid);
    const lj = lastJoin.get(pid);
    return {
      playerId: pid,
      name,
      position,
      sinceTs: lj ? new Date(lj.ts).toISOString() : null,
      activatedSinceJoin: Boolean(activated?.activated),
      potentialActivatedSinceJoin: potentialSinceJoin.has(pid),
      activatedAt: activated?.when || null,
    };
  });

  // Limits per your rules
  const limits: TaxiLimits = { maxSlots: 3, maxQB: 1 };
  const counts = {
    total: items.length,
    qbs: items.filter((p) => (p.position || '').toUpperCase() === 'QB').length,
  };

  const violations = {
    overSlots: counts.total > limits.maxSlots,
    overQB: counts.qbs > limits.maxQB,
    ineligibleOnTaxi: items.filter((p) => p.activatedSinceJoin).map((p) => p.playerId),
  };

  return {
    team: { ownerId, teamName: canonicalName, selectedSeason, rosterId: selectedSeasonRosterId },
    limits,
    current: { taxi: items, counts },
    violations,
  };
}
