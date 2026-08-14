/**
 * Canonical server-side player profile data service.
 *
 * This is the single place that assembles a player's full East v. West profile:
 * identity, current roster status, NFL fantasy production (ownership-independent),
 * East v. West franchise-attributed production, draft history, and transaction
 * history. Other server-side code (the /players/[playerId] page today, and future
 * pages/APIs) should call `getPlayerProfile` rather than re-deriving any of this.
 *
 * Reuses existing Sleeper fetch/caching primitives from sleeper-api.ts and the
 * canonical franchise-name resolver from team-utils.ts instead of introducing a
 * competing data source.
 */

import {
  getAllPlayersCached,
  getTeamsData,
  getLeagueRosters,
  getLeagueDrafts,
  getDraftPicks,
  getLeagueTransactionsAllWeeks,
  computeSeasonTotalsCustomScoringFromStats,
  getNFLSeasonStats,
  buildSeasonPlayerWeeklyAttribution,
  type SleeperPlayer,
  type SleeperDraftPick,
  type SleeperTransaction,
  type TeamData,
} from '@/lib/utils/sleeper-api';
import { CURRENT_SEASON, LEAGUE_IDS, getLeagueIdForSeason } from '@/lib/constants/league';
import { resolveCanonicalTeamName } from '@/lib/utils/team-utils';
import { buildFranchiseCareers, buildSeasonHistory, buildWeeklyHistory, type SeasonWeeklyPlayerPoints } from './player-history';
import type {
  PlayerCurrentStatus,
  PlayerDraftHistoryEntry,
  PlayerIdentity,
  PlayerNFLSeasonStat,
  PlayerProfile,
  PlayerTransactionEntry,
} from '@/lib/types/player';

/** Extra Sleeper player fields not modeled on SleeperPlayer but present in the raw API payload. */
type ExtraSleeperPlayerFields = {
  number?: number | null;
  age?: number | null;
  birth_date?: string | null;
};

/** All seasons this site has a configured league for, oldest first. */
export function listAllSeasons(): string[] {
  const uniq = new Set<string>([CURRENT_SEASON, ...Object.keys(LEAGUE_IDS.PREVIOUS || {})]);
  return Array.from(uniq).sort((a, b) => a.localeCompare(b));
}

interface SeasonContext {
  season: string;
  leagueId: string;
  teams: TeamData[];
  weeklyAttribution: Record<string, Record<string, { points: number; rosterId: number; rostered: boolean; started: boolean }>>;
  nflTotals: Record<string, number>;
  draftPicks: SleeperDraftPick[];
  transactions: SleeperTransaction[];
}

/**
 * Per-season data needed to build ANY player's profile is identical (weekly matchup
 * attribution, teams, draft picks, transactions) — only the per-player filtering differs.
 * We cache it here, keyed by season, so viewing many different player profiles back-to-back
 * doesn't repeat the same ~20 season-wide Sleeper fetches for every single player.
 */
const SEASON_CONTEXT_TTL_MS = 5 * 60 * 1000;
const seasonContextCache = new Map<string, { ts: number; data: SeasonContext | null }>();

async function loadSeasonContext(season: string): Promise<SeasonContext | null> {
  const cached = seasonContextCache.get(season);
  if (cached && Date.now() - cached.ts < SEASON_CONTEXT_TTL_MS) return cached.data;

  const leagueId = getLeagueIdForSeason(season);
  if (!leagueId) {
    seasonContextCache.set(season, { ts: Date.now(), data: null });
    return null;
  }

  const [teams, weeklyAttribution, nflTotals, drafts, transactions] = await Promise.all([
    getTeamsData(leagueId).catch(() => [] as TeamData[]),
    buildSeasonPlayerWeeklyAttribution(leagueId, 17).catch(
      () => ({} as SeasonContext['weeklyAttribution']),
    ),
    // NFL regular season (Weeks 1-18) under league scoring — ownership-independent.
    computeSeasonTotalsCustomScoringFromStats(season, leagueId, 18).catch(() => ({} as Record<string, number>)),
    getLeagueDrafts(leagueId).catch(() => []),
    getLeagueTransactionsAllWeeks(leagueId).catch(() => [] as SleeperTransaction[]),
  ]);

  const draftsThisSeason = drafts.filter((d) => d.season === season);
  const draftPicksBySeason = await Promise.all(
    draftsThisSeason.map((d) => getDraftPicks(d.draft_id).catch(() => [] as SleeperDraftPick[])),
  );
  const draftPicks = draftPicksBySeason.flat();

  const data: SeasonContext = { season, leagueId, teams, weeklyAttribution, nflTotals, draftPicks, transactions };
  seasonContextCache.set(season, { ts: Date.now(), data });
  return data;
}

/**
 * Builds the full canonical player profile for a Sleeper player id. Returns null if the
 * player id is unknown to Sleeper (never shows a profile for a fabricated player).
 */
export async function getPlayerProfile(playerId: string): Promise<PlayerProfile | null> {
  const allPlayers = await getAllPlayersCached();
  const meta: SleeperPlayer | undefined = allPlayers[playerId];
  if (!meta) return null;

  const seasons = listAllSeasons();
  // Seasons are loaded one at a time (each already cached — see loadSeasonContext) rather than
  // all in parallel. Each season alone fans out ~20 Sleeper requests; firing every configured
  // season's fetches simultaneously multiplies that burst and risks Sleeper's rate limiting,
  // which is far more costly than the small amount of sequential wall-clock time this adds.
  const validSeasons: SeasonContext[] = [];
  for (const season of seasons) {
    const ctx = await loadSeasonContext(season);
    if (ctx) validSeasons.push(ctx);
  }

  const rosterNameBySeason = new Map<string, Map<number, string>>();
  for (const s of validSeasons) {
    rosterNameBySeason.set(s.season, new Map(s.teams.map((t) => [t.rosterId, t.teamName] as const)));
  }

  // --- East v. West franchise-attributed production (weekly, ownership-based) ---
  const seasonWeeklyData: SeasonWeeklyPlayerPoints[] = validSeasons.map((s) => {
    const rosterNameMap = rosterNameBySeason.get(s.season)!;
    const weeks: SeasonWeeklyPlayerPoints['weeks'] = [];
    for (let w = 1; w <= 17; w++) {
      const stat = s.weeklyAttribution[String(w)]?.[playerId];
      if (!stat) continue;
      weeks.push({
        week: w,
        franchiseName: rosterNameMap.get(stat.rosterId) ?? null,
        rosterId: stat.rosterId,
        points: Number(stat.points.toFixed(2)),
        rostered: stat.rostered,
        started: stat.started,
      });
    }
    return { season: s.season, weeks };
  });

  const weeklyHistory = buildWeeklyHistory(seasonWeeklyData);
  const seasonHistory = buildSeasonHistory(weeklyHistory);
  const franchiseCareers = buildFranchiseCareers(seasonHistory);

  const evwCareer = {
    seasonsRepresented: seasonHistory.map((s) => s.season),
    totalPoints: Number(seasonHistory.reduce((sum, s) => sum + s.totalPoints, 0).toFixed(2)),
    rosteredWeeks: seasonHistory.reduce((sum, s) => sum + s.rosteredWeeks, 0),
    starts: seasonHistory.reduce((sum, s) => sum + s.starts, 0),
    franchiseCount: franchiseCareers.length,
    franchises: franchiseCareers,
  };

  // --- NFL fantasy production (ownership-independent) ---
  const nflSeasons: PlayerNFLSeasonStat[] = [];
  for (const s of validSeasons) {
    const total = Number(s.nflTotals[playerId] || 0);
    if (total <= 0) continue;
    nflSeasons.push({ season: s.season, totalPoints: Number(total.toFixed(2)), gamesPlayed: null, ppg: null });
  }
  await Promise.all(
    nflSeasons.map(async (row) => {
      try {
        const statsForSeason = await getNFLSeasonStats(row.season);
        const stat = statsForSeason[playerId];
        const gp = (stat?.gp ?? stat?.gms_active ?? 0) || 0;
        row.gamesPlayed = gp || null;
        row.ppg = gp > 0 ? Number((row.totalPoints / gp).toFixed(2)) : null;
      } catch {
        /* leave gamesPlayed/ppg null */
      }
    }),
  );
  nflSeasons.sort((a, b) => a.season.localeCompare(b.season));

  // --- Current East v. West status ---
  const currentSeasonContext =
    validSeasons.find((s) => s.season === CURRENT_SEASON) ?? validSeasons[validSeasons.length - 1];
  let currentStatus: PlayerCurrentStatus = {
    isRostered: false,
    franchiseName: null,
    rosterId: null,
    ownerId: null,
    rosterStatus: null,
    season: currentSeasonContext?.season ?? CURRENT_SEASON,
  };
  if (currentSeasonContext) {
    try {
      const rosters = await getLeagueRosters(currentSeasonContext.leagueId);
      const roster = rosters.find((r) => (r.players || []).includes(playerId));
      if (roster) {
        const rosterNameMap = rosterNameBySeason.get(currentSeasonContext.season);
        const franchiseName =
          resolveCanonicalTeamName({ ownerId: roster.owner_id }) ??
          rosterNameMap?.get(roster.roster_id) ??
          null;
        const onTaxi = (roster.taxi || []).includes(playerId);
        const onIR = (roster.reserve || []).includes(playerId);
        currentStatus = {
          isRostered: true,
          franchiseName,
          rosterId: roster.roster_id,
          ownerId: roster.owner_id,
          rosterStatus: onTaxi ? 'taxi' : onIR ? 'ir' : 'active',
          season: currentSeasonContext.season,
        };
      }
    } catch {
      /* leave default unrostered status */
    }
  }

  // --- Draft history (uses the season-cached draft picks; no extra Sleeper calls here) ---
  const draftHistory: PlayerDraftHistoryEntry[] = [];
  for (const s of validSeasons) {
    const rosterNameMap = rosterNameBySeason.get(s.season)!;
    const rosterCount = s.teams.length || 12;
    for (const pick of s.draftPicks) {
      if (pick.player_id !== playerId) continue;
      const pickInRound = rosterCount > 0 ? ((pick.pick_no - 1) % rosterCount) + 1 : pick.pick_no;
      draftHistory.push({
        year: s.season,
        franchiseName: rosterNameMap.get(pick.roster_id) ?? null,
        round: pick.round,
        pick: pickInRound,
        overall: pick.pick_no,
      });
    }
  }
  draftHistory.sort((a, b) => a.year.localeCompare(b.year));

  // --- Transaction history (trades, waivers, free-agent adds/drops) — also uses the
  // season-cached transaction list, filtered in memory per player. ---
  const transactions: PlayerTransactionEntry[] = [];
  for (const s of validSeasons) {
    const rosterNameMap = rosterNameBySeason.get(s.season)!;
    for (const txn of s.transactions) {
      const statusNorm = String((txn as unknown as { status?: unknown }).status ?? '').toLowerCase();
      if (statusNorm !== 'complete' && statusNorm !== 'completed') continue;
      const adds = txn.adds || {};
      const drops = txn.drops || {};
      const touchesAdd = Object.prototype.hasOwnProperty.call(adds, playerId);
      const touchesDrop = Object.prototype.hasOwnProperty.call(drops, playerId);
      if (!touchesAdd && !touchesDrop) continue;

      const week = Number(txn.leg ?? 0) || null;
      const created = Number(txn.status_updated ?? txn.created ?? 0) || null;
      const date = created ? new Date(created).toISOString() : null;
      const toRosterId = touchesAdd ? adds[playerId] : null;
      const fromRosterId = touchesDrop ? drops[playerId] : null;
      const toFranchise = toRosterId != null ? rosterNameMap.get(toRosterId) ?? null : null;
      const fromFranchise = fromRosterId != null ? rosterNameMap.get(fromRosterId) ?? null : null;

      const type: PlayerTransactionEntry['type'] =
        txn.type === 'trade'
          ? 'traded'
          : touchesAdd && txn.type === 'waiver'
            ? 'waiver'
            : touchesAdd
              ? 'free_agent'
              : 'dropped';

      transactions.push({
        id: txn.transaction_id,
        type,
        season: s.season,
        week,
        date,
        fromFranchise,
        toFranchise,
      });
    }
  }
  transactions.sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.season.localeCompare(b.season)));

  // Reclassify a later add/waiver/free-agent pickup by a franchise that previously held this
  // player (via trade-in or earlier add) as a "reacquired" event rather than a fresh add.
  const franchisesSeenSoFar = new Set<string>();
  for (const t of transactions) {
    if ((t.type === 'added' || t.type === 'free_agent' || t.type === 'waiver') && t.toFranchise) {
      if (franchisesSeenSoFar.has(t.toFranchise)) t.type = 'reacquired';
      franchisesSeenSoFar.add(t.toFranchise);
    }
    if (t.type === 'traded' && t.toFranchise) franchisesSeenSoFar.add(t.toFranchise);
  }

  // Draft picks are also "acquisitions" for the transaction timeline.
  for (const d of draftHistory) {
    transactions.push({
      id: `draft-${d.year}-${d.round}-${d.overall}`,
      type: 'drafted',
      season: d.year,
      week: null,
      date: null,
      fromFranchise: null,
      toFranchise: d.franchiseName,
      details: `Round ${d.round}, Pick ${d.pick} (#${d.overall} overall)`,
    });
  }
  transactions.sort((a, b) => {
    if (a.season !== b.season) return a.season.localeCompare(b.season);
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.type === 'drafted') return -1;
    if (b.type === 'drafted') return 1;
    return 0;
  });

  const extra = meta as unknown as ExtraSleeperPlayerFields;
  const identity: PlayerIdentity = {
    playerId,
    firstName: meta.first_name || '',
    lastName: meta.last_name || '',
    fullName: `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || playerId,
    position: meta.position || null,
    nflTeam: meta.team || null,
    jerseyNumber: extra.number ?? null,
    status: meta.status || null,
    age: extra.age ?? null,
    birthDate: extra.birth_date ?? null,
    yearsExp: meta.years_exp ?? null,
    college: meta.college ?? null,
    headshotUrl: `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`,
  };

  return {
    identity,
    currentStatus,
    nflSeasons,
    evwCareer,
    seasonHistory,
    weeklyHistory,
    draftHistory,
    transactions,
    dataCoverage: {
      seasonsAvailable: validSeasons.map((s) => s.season),
      // We cover every transaction type Sleeper exposes for every configured season, so
      // coverage is complete for those seasons — but seasons before the earliest configured
      // league are not represented, and this must stay explicit rather than implying "no
      // transactions happened".
      transactionsComplete: true,
      notes: [
        'Draft, trade, waiver, and free-agent history reflects Sleeper transaction data for seasons configured in LEAGUE_IDS only.',
        'Seasons before the earliest configured East v. West league are not represented in this profile.',
      ],
    },
  };
}
