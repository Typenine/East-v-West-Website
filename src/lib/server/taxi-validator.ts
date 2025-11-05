import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamsData, getLeagueRosters, getAllPlayersCached, getLeagueTransactionsAllWeeks, getLeagueMatchups, SleeperTransaction, getNFLState } from '@/lib/utils/sleeper-api';
import { resolveCanonicalTeamName } from '@/lib/utils/team-utils';
import { upsertTenure, deleteTenure, markTenureActive, bulkInsertTxnCacheWithPrune } from '@/server/db/queries';

export type Violation = { code: 'too_many_on_taxi' | 'too_many_qbs' | 'invalid_intake' | 'boomerang_active_player' | 'roster_inconsistent'; detail?: string; players?: string[] };

export type TaxiValidateResult = {
  team: { teamName: string; rosterId: number; selectedSeason: string };
  current: { taxi: Array<{ playerId: string; name: string | null; position: string | null }>; counts: { total: number; qbs: number } };
  compliant: boolean;
  violations: Violation[];
};

function getLeagueIdForSeason(season: string): string | null {
  if (season === '2025') return LEAGUE_IDS.CURRENT;
  const prev = (LEAGUE_IDS.PREVIOUS as Record<string, string | undefined>)[season];
  return prev || null;
}

function toVia(tx: SleeperTransaction['type'] | string): 'free_agent' | 'waiver' | 'trade' | 'draft' | 'other' {
  if (tx === 'free_agent') return 'free_agent';
  if (tx === 'waiver') return 'waiver';
  if (tx === 'trade') return 'trade';
  if (tx === 'draft') return 'draft';
  return 'other';
}

export async function validateTaxiForRoster(selectedSeason: string, selectedRosterId: number): Promise<TaxiValidateResult | null> {
  const leagueId = getLeagueIdForSeason(String(selectedSeason));
  if (!leagueId) return null;

  // Map rosterId -> team name (canonical)
  const teams = await getTeamsData(leagueId).catch(() => [] as Array<{ rosterId: number; ownerId: string; teamName: string }>
  );
  const thisTeam = teams.find((t) => t.rosterId === selectedRosterId) || null;
  const canonicalName = thisTeam ? resolveCanonicalTeamName({ ownerId: thisTeam.ownerId }) : `Roster ${selectedRosterId}`;

  // Current rosters to read taxi/reserve/players (treat missing as [])
  const rosters = await getLeagueRosters(leagueId).catch(() => [] as Array<{ roster_id: number; players?: string[]; starters?: string[]; reserve?: string[]; taxi?: string[] }>);
  const r = rosters.find((rr) => rr.roster_id === selectedRosterId) || { players: [], reserve: [], taxi: [] } as { players?: string[]; reserve?: string[]; taxi?: string[] };
  const taxiArr: string[] = Array.isArray(r.taxi) ? (r.taxi as string[]).filter(Boolean) : [];

  // Determine current week starters from matchups
  let startersArr: string[] = [];
  let currentWeek = 0;
  try {
    const st = await getNFLState();
    const wk = Number((st as { week?: number }).week || 0) || 0;
    currentWeek = wk;
    if (wk > 0) {
      const mus = await getLeagueMatchups(leagueId, wk).catch(() => [] as Array<{ roster_id?: number; starters?: string[] }>);
      const me = mus.find((m) => m && m.roster_id === selectedRosterId);
      if (me && Array.isArray(me.starters)) startersArr = (me.starters as string[]).filter(Boolean);
    }
  } catch {}

  // starters/reserve used only for same-week inconsistencies which we no longer flag

  // Seed txn_cache + tenures from transactions (current season weeks)
  const txnsRaw = await getLeagueTransactionsAllWeeks(leagueId).catch(() => [] as SleeperTransaction[]);
  const txns = [...txnsRaw].sort((a, b) => Number(a?.created || 0) - Number(b?.created || 0));
  const rowsForCache: Array<{ week: number; teamId: string; playerId: string; type: string; direction: string; ts: Date }> = [];
  const lastJoin = new Map<string, { ts: number; week: number; via: 'free_agent' | 'waiver' | 'trade' | 'draft' | 'other' }>();
  for (const tx of txns) {
    if (!tx || tx.status !== 'complete') continue;
    const weekRaw = Number(tx.leg || 0);
    const week = weekRaw > 0 ? weekRaw : (currentWeek || 0);
    const created = Number(tx.created || 0);
    if (tx.adds) {
      for (const [pid, rid] of Object.entries(tx.adds)) {
        if (rid === selectedRosterId) {
          const via = toVia(tx.type);
          rowsForCache.push({ week, teamId: canonicalName, playerId: pid, type: tx.type, direction: 'in', ts: new Date(created) });
          lastJoin.set(pid, { ts: created, week, via });
          try { await upsertTenure({ teamId: canonicalName, playerId: pid, acquiredAt: new Date(created), acquiredVia: via }); } catch {}
        }
      }
    }
    if (tx.drops) {
      for (const [pid, from] of Object.entries(tx.drops)) {
        if (from === selectedRosterId) {
          rowsForCache.push({ week, teamId: canonicalName, playerId: pid, type: tx.type, direction: 'out', ts: new Date(created) });
          lastJoin.delete(pid);
          try { await deleteTenure({ teamId: canonicalName, playerId: pid }); } catch {}
        }
      }
    }
  }
  await bulkInsertTxnCacheWithPrune(rowsForCache).catch(() => 0);

  // Check boomerang using only prior locked weeks (exclude current week)
  if (!currentWeek) {
    try {
      const st2 = await getNFLState();
      currentWeek = Number((st2 as { week?: number }).week || 0) || 0;
    } catch {}
  }
  const lastLockedWeek = currentWeek > 1 ? currentWeek - 1 : 0;
  const weeks = lastLockedWeek > 0 ? Array.from({ length: lastLockedWeek }, (_, i) => i + 1) : [];
  const weekly = await Promise.all(weeks.map((w) => getLeagueMatchups(leagueId, w).catch(() => [] as Array<{ roster_id?: number; starters?: string[]; players?: string[] }>)));
  const appearedSinceJoin = new Set<string>();
  for (let wi = 0; wi < weekly.length; wi++) {
    const matches = weekly[wi] || [];
    const matchupWeek = weeks[wi] || 0;
    const m = matches.find((mm) => mm && mm.roster_id === selectedRosterId);
    if (!m) continue;
    const starters = new Set<string>((m.starters || []).filter(Boolean) as string[]);
    const weeklyPlayers = new Set<string>((m.players || []).filter(Boolean) as string[]);
    const bench = new Set(Array.from(weeklyPlayers).filter((pid) => !starters.has(pid)));
    const nonTaxiSet = new Set<string>([...starters, ...bench]);
    for (const pid of nonTaxiSet) {
      const lj = lastJoin.get(pid);
      if (!lj) continue;
      const recentMs = 7 * 24 * 60 * 60 * 1000;
      const joinWeekEff = (Date.now() - lj.ts < recentMs && currentWeek) ? currentWeek : lj.week;
      if (matchupWeek >= joinWeekEff) appearedSinceJoin.add(pid);
      await markTenureActive({ teamId: canonicalName, playerId: pid }).catch(() => null);
    }
  }

  // Players meta for positions
  const playersMeta = await getAllPlayersCached().catch(() => ({} as Record<string, { first_name?: string; last_name?: string; position?: string }>));

  // Violations
  const violations: Violation[] = [];
  if (taxiArr.length > 3) violations.push({ code: 'too_many_on_taxi', detail: '>3 players on taxi' });
  const taxiQbIds = taxiArr.filter((pid) => (playersMeta[pid]?.position || '').toUpperCase() === 'QB');
  const taxiQbs = taxiQbIds.length;
  if (taxiQbs > 1) violations.push({ code: 'too_many_qbs', detail: '2+ QBs on taxi (limit 1)', players: taxiQbIds });

  // Do not compute roster_inconsistent; Sleeper ensures a player is only in one bucket at a time

  const invalidIntake: string[] = [];
  const boomerang: string[] = [];
  for (const pid of taxiArr) {
    const lj = lastJoin.get(pid);
    if (lj && !['free_agent', 'waiver', 'trade', 'draft'].includes(lj.via)) invalidIntake.push(pid);
    if (appearedSinceJoin.has(pid)) boomerang.push(pid);
  }
  if (invalidIntake.length > 0) violations.push({ code: 'invalid_intake', detail: 'Taxi intake must be FA/Trade/Draft', players: invalidIntake });
  if (boomerang.length > 0) violations.push({ code: 'boomerang_active_player', detail: 'Previously active this tenure on taxi', players: boomerang });

  const items = taxiArr.map((pid) => ({
    playerId: pid,
    name: playersMeta[pid] ? `${playersMeta[pid].first_name || ''} ${playersMeta[pid].last_name || ''}`.trim() : null,
    position: playersMeta[pid]?.position || null,
  }));

  const teamLabel = thisTeam?.teamName || canonicalName;
  const hardCodes = new Set<Violation['code']>(['too_many_on_taxi','too_many_qbs','invalid_intake','roster_inconsistent']);
  const hardViolationCount = violations.filter(v => hardCodes.has(v.code)).length;
  const out: TaxiValidateResult = {
    team: { teamName: teamLabel, rosterId: selectedRosterId, selectedSeason: String(selectedSeason) },
    current: { taxi: items, counts: { total: items.length, qbs: taxiQbs } },
    compliant: hardViolationCount === 0,
    violations,
  };
  return out;
}
