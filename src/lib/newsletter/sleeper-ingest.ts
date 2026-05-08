/**
 * Newsletter Sleeper Ingest
 * Single-call data layer for newsletter generation.
 * Wraps the general sleeper-api.ts utility with newsletter-specific typing
 * and returns everything GenerateNewsletterInput needs in one await.
 */

import {
  getNFLState,
  getLeague,
  getLeagueUsers,
  getLeagueRosters,
  getLeagueMatchups,
  getAllPlayersCached,
  getSleeperInjuriesCached,
  getLeagueDrafts,
  getDraftById,
  getDraftPicks,
  type SleeperUser,
  type SleeperRoster,
  type SleeperMatchup,
  type SleeperTransaction,
  type SleeperPlayer,
  type SleeperLeague,
  type SleeperDraftPick,
} from '../utils/sleeper-api';
import { setPlayerNameCache } from './derive';

// Re-export the types callers need so they don't have to import from two places
export type { SleeperUser, SleeperRoster, SleeperMatchup, SleeperTransaction, SleeperPlayer, SleeperLeague };

// ============ Draft Data Types ============

export interface DraftPickWithPlayer extends SleeperDraftPick {
  playerName: string;
  position: string;
  nflTeam: string;
  teamName?: string; // the fantasy team that made the pick
}

export interface LeagueDraftData {
  draftId: string;
  status: string; // 'pre_draft' | 'drafting' | 'complete'
  type: string; // 'snake' | 'auction' | 'linear'
  /** Ordered array: index = draft slot (0-based), value = fantasy team name */
  draftOrder: string[];
  /** All picks with player info — empty if draft hasn't happened */
  picks: DraftPickWithPlayer[];
  totalRounds: number;
  totalTeams: number;
}

// ============ Output type ============

export interface NewsletterIngestData {
  leagueName: string;
  season: number;
  week: number;
  seasonType: string;
  users: SleeperUser[];
  rosters: SleeperRoster[];
  matchups: SleeperMatchup[];
  nextMatchups: SleeperMatchup[];
  transactions: SleeperTransaction[];
  /** Full player map keyed by Sleeper player_id — populated in the player cache */
  playerMap: Record<string, SleeperPlayer>;
  /** Injuries filtered to only players on league rosters */
  injuries: Array<{
    playerId: string;
    playerName: string;
    nflTeam: string;
    status: string;
    injuryStatus: string;
    bodyPart?: string;
  }>;
  /** Draft data for the current season — always fetched, used for draft episode types */
  draftData: LeagueDraftData | null;
}

// ============ Main fetch function ============

/**
 * Fetch all data needed to generate a newsletter for a given league and week.
 * If weekOverride is not provided, uses the current NFL state week.
 *
 * Also seeds the player name cache in derive.ts so that buildDerived()
 * can resolve player IDs to human-readable names.
 */
export async function fetchNewsletterData(
  leagueId: string,
  weekOverride?: number,
): Promise<NewsletterIngestData> {
  // Parallel: state + league info (no inter-dependency)
  const [state, league] = await Promise.all([
    getNFLState(),
    getLeague(leagueId),
  ]);

  const season = Number(state.season ?? new Date().getFullYear());
  const week = weekOverride ?? (
    state.season_type === 'regular' && Number(state.week ?? 0) > 0 ? Number(state.week) : 1
  );
  const nextWeek = week + 1;

  // Parallel: users, rosters, current matchups, next week matchups, transactions, players, injuries, drafts
  const [users, rosters, matchups, nextMatchups, transactions, allPlayers, injuries, draftData] =
    await Promise.all([
      getLeagueUsers(leagueId),
      getLeagueRosters(leagueId),
      getLeagueMatchups(leagueId, week),
      getLeagueMatchups(leagueId, nextWeek).catch(() => [] as SleeperMatchup[]),
      fetchTransactions(leagueId, week),
      getAllPlayersCached(),
      getSleeperInjuriesCached().catch(() => []),
      fetchDraftData(leagueId).catch(() => null),
    ]);

  // Seed the player name cache so derive.ts can resolve IDs
  setPlayerNameCache(allPlayers);

  // Build the set of player IDs that are on any roster in this league
  const rosterPlayerIds = new Set<string>();
  for (const roster of rosters) {
    for (const pid of roster.players ?? []) rosterPlayerIds.add(pid);
  }

  // Build injury list from:
  // 1. SleeperInjury endpoint — gives a list of player_ids with active injury reports
  // 2. SleeperPlayer records — carry the full injury_status / injury_body_part fields
  // Combine both sources, scoped to players actually on league rosters.
  const injuryPlayerIds = new Set(injuries.map(i => i.player_id));

  const filteredInjuries = Array.from(rosterPlayerIds)
    .map(pid => allPlayers[pid])
    .filter((player): player is SleeperPlayer => {
      if (!player) return false;
      const hasInjuryReport = injuryPlayerIds.has(player.player_id);
      const isQuestionable = player.injury_status && player.injury_status !== '';
      return hasInjuryReport || Boolean(isQuestionable);
    })
    .map(player => ({
      playerId: player.player_id,
      playerName: `${player.first_name} ${player.last_name}`.trim(),
      nflTeam: player.team ?? '',
      status: player.status ?? '',
      injuryStatus: player.injury_status ?? '',
      bodyPart: player.injury_body_part ?? undefined,
    }));

  return {
    leagueName: league.name || 'Your League',
    season,
    week,
    seasonType: state.season_type ?? 'regular',
    users,
    rosters,
    matchups,
    nextMatchups,
    transactions,
    playerMap: allPlayers,
    injuries: filteredInjuries,
    draftData,
  };
}

// ============ Draft Data Fetching ============

/**
 * Fetch draft data for a league — draft order + picks (if draft has happened).
 * Returns null if no draft exists or on any error.
 */
async function fetchDraftData(leagueId: string): Promise<LeagueDraftData | null> {
  try {
    const drafts = await getLeagueDrafts(leagueId);
    if (!drafts || drafts.length === 0) return null;

    // Take the most recent draft
    const draft = drafts[drafts.length - 1];
    const draftId = draft.draft_id;

    // Fetch draft details (has draft_order mapping) and picks in parallel
    const [details, rawPicks, allPlayers] = await Promise.all([
      getDraftById(draftId),
      draft.status === 'complete' || draft.status === 'drafting'
        ? getDraftPicks(draftId).catch(() => [] as SleeperDraftPick[])
        : Promise.resolve([] as SleeperDraftPick[]),
      getAllPlayersCached(),
    ]);

    // draft_order maps roster_id (as string) → draft slot (1-based)
    // We need to build: slot → team name
    // We'll need users and rosters to resolve roster_id → team name
    const draftOrderMap = details.draft_order ?? {};

    // Build slot → roster_id reverse mapping
    const slotToRosterId = new Map<number, string>();
    for (const [rosterId, slot] of Object.entries(draftOrderMap)) {
      slotToRosterId.set(Number(slot), rosterId);
    }

    // totalTeams from the number of slots
    const totalTeams = Object.keys(draftOrderMap).length || 12;
    const settings = details.settings as Record<string, unknown> | null | undefined;
    const totalRounds = typeof settings?.rounds === 'number' ? settings.rounds : 4;

    // Build ordered draft slots (1..totalTeams) → team name placeholder (will be resolved later)
    // For now, use "Slot N" — the caller can enrich with team names using users/rosters
    const draftOrder: string[] = [];
    for (let slot = 1; slot <= totalTeams; slot++) {
      const rosterId = slotToRosterId.get(slot);
      draftOrder.push(rosterId ? `RosterId:${rosterId}` : `Slot ${slot}`);
    }

    // Enrich picks with player info
    const picks: DraftPickWithPlayer[] = rawPicks.map(pick => {
      const player = allPlayers[pick.player_id];
      return {
        ...pick,
        playerName: player ? `${player.first_name} ${player.last_name}`.trim() : `Player ${pick.player_id}`,
        position: player?.position ?? 'UNK',
        nflTeam: player?.team ?? '',
        teamName: `RosterId:${pick.roster_id}`,
      };
    });

    return {
      draftId,
      status: draft.status,
      type: draft.type,
      draftOrder,
      picks,
      totalRounds,
      totalTeams,
    };
  } catch {
    return null;
  }
}

// ============ Transactions ============

/**
 * Fetch transactions for a given week, with a best-effort retry on the previous
 * week if the current week returns an empty result (common early in the week
 * before Sleeper processes all moves).
 */
async function fetchTransactions(
  leagueId: string,
  week: number,
): Promise<SleeperTransaction[]> {
  const current = await fetchWeekTransactions(leagueId, week);
  if (current.length > 0) return current;
  if (week <= 1) return [];
  // Try prior week as fallback (Sleeper sometimes delays transaction posting)
  return fetchWeekTransactions(leagueId, week - 1).catch(() => []);
}

async function fetchWeekTransactions(
  leagueId: string,
  week: number,
): Promise<SleeperTransaction[]> {
  try {
    const res = await fetch(
      `https://api.sleeper.app/v1/league/${leagueId}/transactions/${week}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as SleeperTransaction[]) : [];
  } catch {
    return [];
  }
}
