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
  type SleeperUser,
  type SleeperRoster,
  type SleeperMatchup,
  type SleeperTransaction,
  type SleeperPlayer,
  type SleeperLeague,
} from '../utils/sleeper-api';
import { setPlayerNameCache } from './derive';

// Re-export the types callers need so they don't have to import from two places
export type { SleeperUser, SleeperRoster, SleeperMatchup, SleeperTransaction, SleeperPlayer, SleeperLeague };

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

  // Parallel: users, rosters, current matchups, next week matchups, transactions, players, injuries
  const [users, rosters, matchups, nextMatchups, transactions, allPlayers, injuries] =
    await Promise.all([
      getLeagueUsers(leagueId),
      getLeagueRosters(leagueId),
      getLeagueMatchups(leagueId, week),
      getLeagueMatchups(leagueId, nextWeek).catch(() => [] as SleeperMatchup[]),
      fetchTransactions(leagueId, week),
      getAllPlayersCached(),
      getSleeperInjuriesCached().catch(() => []),
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
  };
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
