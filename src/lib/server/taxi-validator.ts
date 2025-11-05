import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamsData, getLeagueRosters, getAllPlayersCached, getLeagueTransactionsAllWeeks, getLeagueMatchups, SleeperTransaction, getNFLState, getLeagueDrafts, getDraftPicks } from '@/lib/utils/sleeper-api';
import { resolveCanonicalTeamName } from '@/lib/utils/team-utils';
import { upsertTenure, deleteTenure, markTenureActive, bulkInsertTxnCacheWithPrune, getFirstTaxiSeenForPlayer, getTaxiObservation, setTaxiObservation } from '@/server/db/queries';
import { getObjectText } from '@/server/storage/r2';

export type Violation = { code: 'too_many_on_taxi' | 'too_many_qbs' | 'invalid_intake' | 'boomerang_active_player' | 'roster_inconsistent'; detail?: string; players?: string[] };

export type TaxiValidateResult = {
  team: { teamName: string; rosterId: number; selectedSeason: string };
  current: { taxi: Array<{ playerId: string; name: string | null; position: string | null; joinedAt?: string | null; joinedWeek?: number | null; firstTaxiAt?: string | null; firstTaxiWeek?: number | null }>; counts: { total: number; qbs: number } };
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
  // Default to free_agent for any unknown type to avoid 'unknown' intakes in our logic
  return 'free_agent';
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

  // Establish current NFL week for transaction fallback
  let currentWeek = 0;
  try {
    const st = await getNFLState();
    const wk = Number((st as { week?: number }).week || 0) || 0;
    currentWeek = wk;
  } catch {}

  // starters/reserve used only for same-week inconsistencies which we no longer flag

  // Seed txn_cache + tenures from transactions across seasons for this franchise
  const yearToLeague: Record<string, string> = { '2025': LEAGUE_IDS.CURRENT, ...(LEAGUE_IDS.PREVIOUS as Record<string, string>) };
  const seasons = Object.keys(yearToLeague).sort();
  const rosterIdBySeason = new Map<string, number>();
  for (const y of seasons) {
    const lid = yearToLeague[y];
    try {
      const ts = await getTeamsData(lid).catch(() => [] as Array<{ rosterId: number; ownerId: string; teamName: string }>);
      const row = ts.find((t) => t.teamName === canonicalName) || (thisTeam ? ts.find((t) => t.ownerId === thisTeam.ownerId) : undefined);
      if (row) rosterIdBySeason.set(y, row.rosterId);
    } catch {}
  }

  const rowsForCache: Array<{ week: number; teamId: string; playerId: string; type: string; direction: string; ts: Date }> = [];
  const lastJoin = new Map<string, { ts: number; week: number; via: 'free_agent' | 'waiver' | 'trade' | 'draft' | 'other' }>();
  for (const y of seasons) {
    const lid = yearToLeague[y];
    const rid = rosterIdBySeason.get(y);
    if (!lid || !rid) continue;
    const txnsRaw = await getLeagueTransactionsAllWeeks(lid).catch(() => [] as SleeperTransaction[]);
    const txns = [...txnsRaw].sort((a, b) => Number(a?.created || 0) - Number(b?.created || 0));
    for (const tx of txns) {
      if (!tx || tx.status !== 'complete') continue;
      const weekRaw = Number(tx.leg || 0);
      const week = weekRaw > 0 ? weekRaw : (currentWeek || 0);
      const created = Number(tx.created || 0);
      if (tx.adds) {
        for (const [pid, recv] of Object.entries(tx.adds)) {
          if (recv === rid) {
            const via = toVia(tx.type);
            rowsForCache.push({ week, teamId: canonicalName, playerId: pid, type: tx.type, direction: 'in', ts: new Date(created) });
            const prev = lastJoin.get(pid);
            if (!prev || created > prev.ts) lastJoin.set(pid, { ts: created, week, via });
            try { await upsertTenure({ teamId: canonicalName, playerId: pid, acquiredAt: new Date(created), acquiredVia: via }); } catch {}
          }
        }
      }
      if (tx.drops) {
        for (const [pid, from] of Object.entries(tx.drops)) {
          if (from === rid) {
            rowsForCache.push({ week, teamId: canonicalName, playerId: pid, type: tx.type, direction: 'out', ts: new Date(created) });
            // Drop resets tenure until next join
            const prev = lastJoin.get(pid);
            if (!prev || created >= prev.ts) lastJoin.delete(pid);
            try { await deleteTenure({ teamId: canonicalName, playerId: pid }); } catch {}
          }
        }
      }
    }
    // Also consider draft picks as acquisition events to avoid unknown intake
    try {
      const drafts = await getLeagueDrafts(lid).catch(() => []);
      for (const d of drafts) {
        const picks = await getDraftPicks(d.draft_id).catch(() => []);
        for (const p of picks) {
          const pid = p.player_id;
          if (!pid) continue;
          if (p.roster_id === rid) {
            // Approximate draft timestamp early May of season; week as 1
            const created = Date.parse(`${y}-05-01T00:00:00Z`);
            const week = 1;
            rowsForCache.push({ week, teamId: canonicalName, playerId: pid, type: 'draft', direction: 'in', ts: new Date(created) });
            const prev = lastJoin.get(pid);
            if (!prev || created > prev.ts) lastJoin.set(pid, { ts: created, week, via: 'draft' });
            try { await upsertTenure({ teamId: canonicalName, playerId: pid, acquiredAt: new Date(created), acquiredVia: 'draft' }); } catch {}
          }
        }
      }
    } catch {}
  }
  await bulkInsertTxnCacheWithPrune(rowsForCache).catch(() => 0);

  // Check boomerang using prior locked weeks (exclude current week)
  if (!currentWeek) {
    try {
      const st2 = await getNFLState();
      currentWeek = Number((st2 as { week?: number }).week || 0) || 0;
    } catch {}
  }
  const lastLockedWeek = currentWeek > 1 ? currentWeek - 1 : 0;
  const weeks = lastLockedWeek > 0 ? Array.from({ length: lastLockedWeek }, (_, i) => i + 1) : [];
  const weekly = await Promise.all(weeks.map((w) => getLeagueMatchups(leagueId, w).catch(() => [] as Array<{ matchup_id?: number; roster_id?: number; starters?: string[]; players?: string[]; points?: number; custom_points?: number }>)));
  const appearedSinceJoin = new Set<string>();
  for (let wi = 0; wi < weekly.length; wi++) {
    const matches = weekly[wi] || [] as Array<{ matchup_id?: number; roster_id?: number; starters?: string[]; players?: string[]; points?: number; custom_points?: number }>;
    const matchupWeek = weeks[wi] || 0;
    const m = matches.find((mm) => mm && mm.roster_id === selectedRosterId);
    if (!m) continue;
    const startersRaw = Array.isArray(m.starters) ? (m.starters as string[]) : [];
    const starters = new Set<string>(startersRaw.filter(Boolean));
    // Prefer snapshot for full breakdown (starters/bench/reserve). If missing, only trust starters.
    let ids = new Set<string>(Array.from(starters));
    try {
      const key = `logs/lineups/snapshots/${String(selectedSeason)}-W${matchupWeek}.json`;
      const txt = await getObjectText({ key });
      if (txt) {
        const j = JSON.parse(txt) as { teams?: Array<{ rosterId: number; starters?: string[]; bench?: string[]; reserve?: string[] }> };
        const row = (j.teams || []).find((t) => t.rosterId === selectedRosterId);
        if (row) {
          const st = Array.isArray(row.starters) ? row.starters.filter(Boolean) : [];
          const bn = Array.isArray(row.bench) ? row.bench.filter(Boolean) : [];
          const ir = Array.isArray(row.reserve) ? row.reserve.filter(Boolean) : [];
          if (st.length + bn.length + ir.length > 0) ids = new Set<string>([...st, ...bn, ...ir]);
        }
      }
    } catch {}
    // Only consider appearances if the matchup was played (points recorded)
    const opp = matches.find((x) => x.matchup_id === m.matchup_id && x.roster_id !== m.roster_id);
    const myPts = Number((m.custom_points ?? m.points ?? 0) || 0);
    const oppPts = Number((opp?.custom_points ?? opp?.points ?? 0) || 0);
    const played = (myPts > 0) || (oppPts > 0);
    if (!played) continue;
    const nonTaxiSet = ids;
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

  const seasonNum = Number(selectedSeason) || new Date().getFullYear();
  // Update taxi observations for this team (throttled)
  let obsPlayers: Record<string, { firstSeen: string; lastSeen: string; seenCount: number }> = {};
  try {
    const existing = await getTaxiObservation(canonicalName).catch(() => null as (null | { updatedAt?: Date | string; players?: Record<string, { firstSeen: string; lastSeen: string; seenCount: number }> }));
    obsPlayers = (existing?.players as typeof obsPlayers) || {};
    const prevUpdated = existing?.updatedAt ? (typeof existing.updatedAt === 'string' ? Date.parse(existing.updatedAt) : (existing.updatedAt as Date).getTime()) : 0;
    const now = new Date();
    const nowIso = now.toISOString();
    const twelveHoursMs = 12 * 60 * 60 * 1000;
    const stale = !prevUpdated || (now.getTime() - prevUpdated) > twelveHoursMs;
    const prevSet = new Set(Object.keys(obsPlayers));
    const curSet = new Set(taxiArr);
    let changed = false;
    for (const id of curSet) if (!prevSet.has(id)) { changed = true; break; }
    if (!changed) {
      for (const id of prevSet) if (!curSet.has(id)) { changed = true; break; }
    }
    if (changed || stale) {
      for (const pid of taxiArr) {
        const prev = obsPlayers[pid];
        if (prev) {
          obsPlayers[pid] = { firstSeen: prev.firstSeen, lastSeen: nowIso, seenCount: (prev.seenCount || 0) + 1 };
        } else {
          obsPlayers[pid] = { firstSeen: nowIso, lastSeen: nowIso, seenCount: 1 };
        }
      }
      await setTaxiObservation(canonicalName, { updatedAt: now, players: obsPlayers }).catch(() => null);
    }
  } catch {}
  const items = [] as Array<{ playerId: string; name: string | null; position: string | null; joinedAt?: string | null; joinedWeek?: number | null; firstTaxiAt?: string | null; firstTaxiWeek?: number | null }>;
  for (const pid of taxiArr) {
    const name = playersMeta[pid] ? `${playersMeta[pid].first_name || ''} ${playersMeta[pid].last_name || ''}`.trim() : null;
    const position = playersMeta[pid]?.position || null;
    const lj = lastJoin.get(pid);
    let firstTaxiAt: string | null = null;
    let firstTaxiWeek: number | null = null;
    try {
      const first = await getFirstTaxiSeenForPlayer({ season: seasonNum, teamId: canonicalName, playerId: pid });
      if (first) {
        firstTaxiAt = new Date(first.runTs).toISOString();
        firstTaxiWeek = first.week;
      }
    } catch {}
    if (!firstTaxiAt) {
      const obs = obsPlayers[pid];
      if (obs?.firstSeen) firstTaxiAt = obs.firstSeen;
    }
    if (!firstTaxiAt) {
      firstTaxiAt = new Date().toISOString();
    }
    items.push({
      playerId: pid,
      name,
      position,
      joinedAt: lj ? new Date(lj.ts).toISOString() : null,
      joinedWeek: lj?.week ?? null,
      firstTaxiAt,
      firstTaxiWeek,
    });
  }

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
