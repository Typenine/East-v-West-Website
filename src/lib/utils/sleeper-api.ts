/**
 * Sleeper API utility functions
 * 
 * This file contains utilities for fetching data from the Sleeper API
 * using the provided league IDs.
 */

import { LEAGUE_IDS, CHAMPIONS } from '../constants/league';
import { resolveCanonicalTeamName } from '../utils/team-utils';

// Base URL for Sleeper API
const SLEEPER_API_BASE = 'https://api.sleeper.app/v1';

// Types for Sleeper API responses
export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  settings: Record<string, unknown>;
  scoring_settings: Record<string, unknown>;
  roster_positions: string[];
  status: string;
  total_rosters: number;
  draft_id: string;
  metadata: Record<string, unknown>;
}

/**
 * Fetch NFL weekly stats from Sleeper and cache them briefly.
 * Example endpoint (pattern inferred from season stats):
 *   https://api.sleeper.app/v1/stats/nfl/regular/{season}/{week}
 */
export async function getNFLWeekStats(
  season: string | number,
  week: number,
  ttlMs: number = 15 * 60 * 1000
): Promise<Record<string, SleeperNFLSeasonPlayerStats>> {
  const key = `${season}-${week}`;
  const now = Date.now();
  const cached = weekStatsCache[key];
  if (cached && now - cached.ts < ttlMs) return cached.data;

  const url = `${SLEEPER_API_BASE}/stats/nfl/regular/${season}/${week}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch NFL week stats ${season} wk${week}: ${resp.status} ${resp.statusText}`);
  }
  const json = (await resp.json()) as Record<string, SleeperNFLSeasonPlayerStats>;
  weekStatsCache[key] = { ts: now, data: json };
  return json;
}

/**
 * Sleeper NFL state object (subset used)
 */
export interface SleeperNFLState {
  week?: number;
  season?: string;
  season_type?: string;
  display_week?: number;
  league_season?: string;
  previous_season?: string;
  season_start_date?: string; // ISO date string
  season_has_scores?: boolean;
}

let nflStateCache: { ts: number; data: SleeperNFLState } | null = null;
const NFL_STATE_TTL_DEFAULT = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch current NFL state from Sleeper (cached).
 */
export async function getNFLState(ttlMs: number = NFL_STATE_TTL_DEFAULT): Promise<SleeperNFLState> {
  const now = Date.now();
  if (nflStateCache && now - nflStateCache.ts < ttlMs) return nflStateCache.data;
  const resp = await fetch(`${SLEEPER_API_BASE}/state/nfl`);
  if (!resp.ok) throw new Error(`Failed to fetch NFL state: ${resp.status} ${resp.statusText}`);
  const data = (await resp.json()) as SleeperNFLState;
  nflStateCache = { ts: now, data };
  return data;
}

/**
 * Get all unique owner IDs that have participated across configured seasons
 */
export async function getAllOwnerIdsAcrossSeasons(): Promise<string[]> {
  const yearToLeague: Record<string, string> = {
    '2025': LEAGUE_IDS.CURRENT,
    ...LEAGUE_IDS.PREVIOUS,
  };
  const ownerSet = new Set<string>();
  for (const leagueId of Object.values(yearToLeague)) {
    if (!leagueId) continue;
    const rosters = await getLeagueRosters(leagueId);
    for (const r of rosters) ownerSet.add(r.owner_id);
  }
  return Array.from(ownerSet);
}

export interface FranchiseSummary {
  ownerId: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  totalPF: number;
  totalPA: number;
  avgPF: number;
  avgPA: number;
  championships: number;
}

/**
 * Compute franchise summaries (all-time) for every owner across seasons
 */
export async function getFranchisesAllTime(): Promise<FranchiseSummary[]> {
  const owners = await getAllOwnerIdsAcrossSeasons();
  const results: FranchiseSummary[] = [];
  for (const ownerId of owners) {
    const stats = await getTeamAllTimeStatsByOwner(ownerId);
    const teamName = resolveCanonicalTeamName({ ownerId });
    // Count championships by canonical team name
    let champs = 0;
    for (const year of Object.keys(CHAMPIONS)) {
      const champName = CHAMPIONS[year as keyof typeof CHAMPIONS]?.champion;
      if (champName && champName !== 'TBD' && champName === teamName) champs += 1;
    }
    results.push({
      ownerId,
      teamName,
      wins: stats.wins,
      losses: stats.losses,
      ties: stats.ties,
      totalPF: stats.totalPF,
      totalPA: stats.totalPA,
      avgPF: stats.avgPF,
      avgPA: stats.avgPA,
      championships: champs,
    });
  }
  // Sort alphabetically by team name for stable display
  results.sort((a, b) => a.teamName.localeCompare(b.teamName));
  return results;
}

export interface LeagueRecordBook {
  highestScoringGame: {
    points: number;
    teamName: string;
    ownerId: string;
    week: number;
    year: string;
  } | null;
  lowestScoringGame: {
    points: number;
    teamName: string;
    ownerId: string;
    week: number;
    year: string;
  } | null;
  biggestVictory: {
    margin: number;
    winnerTeamName: string;
    winnerOwnerId: string;
    loserTeamName: string;
    loserOwnerId: string;
    week: number;
    year: string;
  } | null;
  closestVictory: {
    margin: number;
    winnerTeamName: string;
    winnerOwnerId: string;
    loserTeamName: string;
    loserOwnerId: string;
    week: number;
    year: string;
  } | null;
  highestCombined: {
    combined: number;
    teamAName: string;
    teamAOwnerId: string;
    teamAPoints: number;
    teamBName: string;
    teamBOwnerId: string;
    teamBPoints: number;
    week: number;
    year: string;
  } | null;
  longestWinStreak: {
    length: number;
    ownerId: string;
    teamName: string;
    start: { year: string; week: number };
    end: { year: string; week: number };
  } | null;
  longestLosingStreak: {
    length: number;
    ownerId: string;
    teamName: string;
    start: { year: string; week: number };
    end: { year: string; week: number };
  } | null;
}

/**
 * Compute league record book across all seasons using weekly matchups
 */
export async function getLeagueRecordBook(): Promise<LeagueRecordBook> {
  const yearToLeague: Record<string, string> = {
    '2025': LEAGUE_IDS.CURRENT,
    ...LEAGUE_IDS.PREVIOUS,
  };

  let highestScoringGame: LeagueRecordBook['highestScoringGame'] = null;
  let lowestScoringGame: LeagueRecordBook['lowestScoringGame'] = null;
  let biggestVictory: LeagueRecordBook['biggestVictory'] = null;
  let closestVictory: LeagueRecordBook['closestVictory'] = null;
  let highestCombined: LeagueRecordBook['highestCombined'] = null;
  let longestWinStreak: LeagueRecordBook['longestWinStreak'] = null;
  let longestLosingStreak: LeagueRecordBook['longestLosingStreak'] = null;

  // Track chronological results per owner across seasons
  const timelineByOwner = new Map<string, Array<{ year: string; week: number; result: 'W' | 'L' | 'T' }>>();

  // Iterate seasons in chronological order to support streak computation
  const sortedYears = Object.keys(yearToLeague).sort();
  for (const year of sortedYears) {
    const leagueId = yearToLeague[year];
    if (!leagueId) continue;
    const rosters = await getLeagueRosters(leagueId);
    const rosterOwner = new Map<number, string>();
    for (const r of rosters) rosterOwner.set(r.roster_id, r.owner_id);
    const rosterIdToName = await getRosterIdToTeamNameMap(leagueId);

    const weekPromises = Array.from({ length: 18 }, (_, i) => i + 1).map((w) => getLeagueMatchups(leagueId, w).catch(() => [] as SleeperMatchup[]));
    const allWeekMatchups = await Promise.all(weekPromises);

    for (const weekIdx in allWeekMatchups) {
      const week = Number(weekIdx) + 1;
      const matchups = allWeekMatchups[weekIdx as unknown as number] || [];
      if (matchups.length === 0) continue;

      // Group by matchup_id to ensure pairs
      const byId = new Map<number, SleeperMatchup[]>();
      for (const m of matchups) {
        const arr = byId.get(m.matchup_id) || [];
        arr.push(m);
        byId.set(m.matchup_id, arr);
      }

      for (const pair of byId.values()) {
        if (!pair || pair.length < 2) continue;
        const [a, b] = pair;
        const aPts = a.custom_points ?? a.points ?? 0;
        const bPts = b.custom_points ?? b.points ?? 0;
        // Skip unplayed 0-0
        if ((aPts ?? 0) === 0 && (bPts ?? 0) === 0) continue;

        const aOwner = rosterOwner.get(a.roster_id)!;
        const bOwner = rosterOwner.get(b.roster_id)!;
        const aName = rosterIdToName.get(a.roster_id) || resolveCanonicalTeamName({ ownerId: aOwner });
        const bName = rosterIdToName.get(b.roster_id) || resolveCanonicalTeamName({ ownerId: bOwner });

        // Highest and lowest single-team
        if (!highestScoringGame || aPts > highestScoringGame.points) {
          highestScoringGame = { points: aPts, teamName: aName, ownerId: aOwner, week, year };
        }
        if (!highestScoringGame || bPts > highestScoringGame.points) {
          highestScoringGame = { points: bPts, teamName: bName, ownerId: bOwner, week, year };
        }
        if (!lowestScoringGame || aPts < lowestScoringGame.points) {
          lowestScoringGame = { points: aPts, teamName: aName, ownerId: aOwner, week, year };
        }
        if (!lowestScoringGame || bPts < lowestScoringGame.points) {
          lowestScoringGame = { points: bPts, teamName: bName, ownerId: bOwner, week, year };
        }

        // Victory margins (ignore ties)
        const margin = Math.abs(aPts - bPts);
        if (margin > 0) {
          const winnerIsA = aPts > bPts;
          const winnerName = winnerIsA ? aName : bName;
          const winnerOwner = winnerIsA ? aOwner : bOwner;
          const loserName = winnerIsA ? bName : aName;
          const loserOwner = winnerIsA ? bOwner : aOwner;

          if (!biggestVictory || margin > biggestVictory.margin) {
            biggestVictory = { margin, winnerTeamName: winnerName, winnerOwnerId: winnerOwner, loserTeamName: loserName, loserOwnerId: loserOwner, week, year };
          }
          if (!closestVictory || margin < closestVictory.margin) {
            closestVictory = { margin, winnerTeamName: winnerName, winnerOwnerId: winnerOwner, loserTeamName: loserName, loserOwnerId: loserOwner, week, year };
          }
        }

        // Highest combined score
        const combined = aPts + bPts;
        if (!highestCombined || combined > highestCombined.combined) {
          highestCombined = {
            combined,
            teamAName: aName,
            teamAOwnerId: aOwner,
            teamAPoints: aPts,
            teamBName: bName,
            teamBOwnerId: bOwner,
            teamBPoints: bPts,
            week,
            year,
          };
        }

        // Append to chronological timelines for streak computation
        const resA: 'W' | 'L' | 'T' = aPts > bPts ? 'W' : aPts < bPts ? 'L' : 'T';
        const resB: 'W' | 'L' | 'T' = bPts > aPts ? 'W' : bPts < aPts ? 'L' : 'T';
        if (!timelineByOwner.has(aOwner)) timelineByOwner.set(aOwner, []);
        if (!timelineByOwner.has(bOwner)) timelineByOwner.set(bOwner, []);
        timelineByOwner.get(aOwner)!.push({ year, week, result: resA });
        timelineByOwner.get(bOwner)!.push({ year, week, result: resB });
      }
    }
  }

  // Compute win and losing streaks across entire timelines
  for (const [ownerId, timeline] of timelineByOwner.entries()) {
    // timeline already in chronological order (years asc, weeks asc)
    let curW = 0;
    let curL = 0;
    let curWStart: { year: string; week: number } | null = null;
    let curLStart: { year: string; week: number } | null = null;

    for (const node of timeline) {
      if (node.result === 'W') {
        // extend win streak, reset loss
        curW += 1;
        if (curW === 1) curWStart = { year: node.year, week: node.week };
        curL = 0;
        curLStart = null;
        if (!longestWinStreak || curW > longestWinStreak.length) {
          longestWinStreak = {
            length: curW,
            ownerId,
            teamName: resolveCanonicalTeamName({ ownerId }),
            start: curWStart!,
            end: { year: node.year, week: node.week },
          };
        }
      } else if (node.result === 'L') {
        // extend losing streak, reset win
        curL += 1;
        if (curL === 1) curLStart = { year: node.year, week: node.week };
        curW = 0;
        curWStart = null;
        if (!longestLosingStreak || curL > longestLosingStreak.length) {
          longestLosingStreak = {
            length: curL,
            ownerId,
            teamName: resolveCanonicalTeamName({ ownerId }),
            start: curLStart!,
            end: { year: node.year, week: node.week },
          };
        }
      } else {
        // Tie resets both streaks
        curW = 0;
        curL = 0;
        curWStart = null;
        curLStart = null;
      }
    }
  }

  return { highestScoringGame, lowestScoringGame, biggestVictory, closestVictory, highestCombined, longestWinStreak, longestLosingStreak };
}

/**
 * Get a team's all-time aggregate stats across all configured league seasons by owner_id
 * Uses LEAGUE_IDS.CURRENT and LEAGUE_IDS.PREVIOUS years.
 */
export async function getTeamAllTimeStatsByOwner(ownerId: string): Promise<{
  wins: number;
  losses: number;
  ties: number;
  totalPF: number;
  totalPA: number;
  avgPF: number;
  avgPA: number;
  highestScore: number;
  lowestScore: number;
}> {
  try {
    const yearToLeague: Record<string, string> = {
      '2025': LEAGUE_IDS.CURRENT,
      ...LEAGUE_IDS.PREVIOUS,
    };

    let wins = 0;
    let losses = 0;
    let ties = 0;
    let totalPF = 0;
    let totalPA = 0;
    let highestScore = -Infinity;
    let lowestScore = Infinity;
    let games = 0;

    for (const leagueId of Object.values(yearToLeague)) {
      if (!leagueId) continue;

      // Build rosterId -> ownerId map for this league
      const rosters = await getLeagueRosters(leagueId);
      const rosterOwner = new Map<number, string>();
      for (const r of rosters) rosterOwner.set(r.roster_id, r.owner_id);

      // Add season totals directly from roster settings to match Sleeper
      const myRoster = rosters.find((r) => r.owner_id === ownerId);
      if (myRoster) {
        const seasonWins = myRoster.settings.wins || 0;
        const seasonLosses = myRoster.settings.losses || 0;
        const seasonTies = myRoster.settings.ties || 0;
        wins += seasonWins;
        losses += seasonLosses;
        ties += seasonTies;
        games += seasonWins + seasonLosses + seasonTies;

        const seasonPF = (myRoster.settings.fpts || 0) + ((myRoster.settings.fpts_decimal || 0) / 100);
        const seasonPA = (myRoster.settings.fpts_against || 0) + ((myRoster.settings.fpts_against_decimal || 0) / 100);
        totalPF += seasonPF;
        totalPA += seasonPA;
      }

      // Fetch all weeks' matchups in parallel
      const weekPromises = Array.from({ length: 18 }, (_, i) => i + 1).map((w) => getLeagueMatchups(leagueId, w).catch(() => [] as SleeperMatchup[]));
      const allWeekMatchups = await Promise.all(weekPromises);

      for (const weekMatchups of allWeekMatchups) {
        if (!weekMatchups || weekMatchups.length === 0) continue;

        for (const m of weekMatchups) {
          const mOwner = rosterOwner.get(m.roster_id);
          if (mOwner !== ownerId) continue;

          const opponent = weekMatchups.find((om) => om.matchup_id === m.matchup_id && om.roster_id !== m.roster_id);
          if (!opponent) continue;

          // Use custom_points when present, else points
          const myPts = m.custom_points ?? m.points ?? 0;
          const oppPts = opponent.custom_points ?? opponent.points ?? 0;

          // Skip unplayed scheduled matchups (0-0)
          if ((myPts ?? 0) === 0 && (oppPts ?? 0) === 0) continue;

          // Track weekly extremes only
          if (myPts > highestScore) highestScore = myPts;
          if (myPts < lowestScore) lowestScore = myPts;
        }
      }
    }

    if (games === 0) {
      return {
        wins: 0,
        losses: 0,
        ties: 0,
        totalPF: 0,
        totalPA: 0,
        avgPF: 0,
        avgPA: 0,
        highestScore: 0,
        lowestScore: 0,
      };
    }

    return {
      wins,
      losses,
      ties,
      totalPF,
      totalPA,
      avgPF: totalPF / games,
      avgPA: totalPA / games,
      highestScore: isFinite(highestScore) ? highestScore : 0,
      lowestScore: isFinite(lowestScore) ? lowestScore : 0,
    };
  } catch (error) {
    console.error('Error computing all-time stats:', error);
    throw error;
  }
}

/**
 * Get a team's all-time head-to-head records across all configured league seasons by owner_id
 * Returns a map of opponentOwnerId -> record
 */
export async function getTeamH2HRecordsAllTimeByOwner(ownerId: string): Promise<Record<string, { wins: number; losses: number; ties: number }>> {
  try {
    const yearToLeague: Record<string, string> = {
      '2025': LEAGUE_IDS.CURRENT,
      ...LEAGUE_IDS.PREVIOUS,
    };

    const h2h: Record<string, { wins: number; losses: number; ties: number }> = {};

    for (const leagueId of Object.values(yearToLeague)) {
      if (!leagueId) continue;

      const rosters = await getLeagueRosters(leagueId);
      const rosterOwner = new Map<number, string>();
      for (const r of rosters) rosterOwner.set(r.roster_id, r.owner_id);

      const weekPromises = Array.from({ length: 18 }, (_, i) => i + 1).map((w) => getLeagueMatchups(leagueId, w).catch(() => [] as SleeperMatchup[]));
      const allWeekMatchups = await Promise.all(weekPromises);

      for (const weekMatchups of allWeekMatchups) {
        if (!weekMatchups || weekMatchups.length === 0) continue;

        for (const m of weekMatchups) {
          const mOwner = rosterOwner.get(m.roster_id);
          if (mOwner !== ownerId) continue;
          const opponent = weekMatchups.find((om) => om.matchup_id === m.matchup_id && om.roster_id !== m.roster_id);
          if (!opponent) continue;
          const opponentOwnerId = rosterOwner.get(opponent.roster_id);
          if (!opponentOwnerId) continue;

          const myPts = m.custom_points ?? m.points ?? 0;
          const oppPts = opponent.custom_points ?? opponent.points ?? 0;
          // Skip unplayed scheduled matchups (0-0)
          if ((myPts ?? 0) === 0 && (oppPts ?? 0) === 0) continue;

          if (!h2h[opponentOwnerId]) h2h[opponentOwnerId] = { wins: 0, losses: 0, ties: 0 };
          if (myPts > oppPts) h2h[opponentOwnerId].wins += 1;
          else if (myPts < oppPts) h2h[opponentOwnerId].losses += 1;
          else h2h[opponentOwnerId].ties += 1;
        }
      }
    }

    return h2h;
  } catch (error) {
    console.error('Error computing all-time H2H records:', error);
    throw error;
  }
}

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  league_id: string;
  players: string[];
  metadata?: Record<string, string> | null;
  settings: {
    wins: number;
    waiver_position: number;
    waiver_budget_used: number;
    total_moves: number;
    ties: number;
    losses: number;
    fpts: number;
    fpts_decimal: number;
    fpts_against: number;
    fpts_against_decimal: number;
  };
}

export interface SleeperMatchup {
  matchup_id: number;
  roster_id: number;
  points: number;
  custom_points?: number;
  players: string[];
  starters: string[];
  matchup_week: number;
}

export interface SleeperPlayer {
  player_id: string;
  first_name: string;
  last_name: string;
  position: string;
  team: string;
  status: string;
  injury_status: string;
  years_exp: number;
}

export interface TeamData {
  teamName: string;  // Canon team name
  rosterId: number;
  ownerId: string;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fptsAgainst: number;
  players: string[];
}

export interface SleeperTransaction {
  type: 'trade' | 'free_agent' | 'waiver';
  transaction_id: string;
  status_updated: number;
  status: 'complete' | 'pending' | 'vetoed';
  settings: Record<string, unknown> | null;
  roster_ids: number[];
  metadata: Record<string, unknown> | null;
  leg: number;
  drops: Record<string, number> | null;
  draft_picks: {
    season: string;
    round: number;
    roster_id: number;
    previous_owner_id: number;
    owner_id: number;
  }[];
  creator: string;
  created: number;
  consenter_ids: number[];
  adds: Record<string, number> | null;
  waiver_budget: {
    sender: number;
    receiver: number;
    amount: number;
  }[];
}

// Draft types
export interface SleeperDraft {
  draft_id: string;
  league_id: string;
  season: string;
  status: string;
  type: string;
  metadata?: Record<string, unknown> | null;
  settings?: Record<string, unknown> | null;
}

export interface SleeperDraftPick {
  pick_no: number; // overall pick number
  round: number;
  roster_id: number; // current owner roster id
  player_id: string;
  picked_by: string;
  draft_slot: number;
}

// Draft details (includes draft_order mapping roster_id -> draft slot)
export interface SleeperDraftDetails extends SleeperDraft {
  // Sleeper API returns a mapping of roster_id to draft position slot
  // Keys may be strings; we'll normalize to numbers when consuming
  draft_order?: Record<string, number> | null;
}

/**
 * Fetch league information from Sleeper API
 * @param leagueId The Sleeper league ID
 * @returns Promise with league data
 */
export async function getLeague(leagueId: string): Promise<SleeperLeague> {
  const response = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch league: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch users in a league from Sleeper API
 * @param leagueId The Sleeper league ID
 * @returns Promise with array of users
 */
export async function getLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
  const response = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/users`);
  if (!response.ok) {
    throw new Error(`Failed to fetch league users: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch rosters in a league from Sleeper API
 * @param leagueId The Sleeper league ID
 * @returns Promise with array of rosters
 */
export async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
  const response = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/rosters`);
  if (!response.ok) {
    throw new Error(`Failed to fetch league rosters: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch matchups for a specific week from Sleeper API
 * @param leagueId The Sleeper league ID
 * @param week The week number
 * @returns Promise with array of matchups
 */
export async function getLeagueMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
  const response = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/matchups/${week}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch league matchups: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch player information from Sleeper API
 * @param playerId The Sleeper player ID
 * @returns Promise with player data
 */
export async function getPlayer(playerId: string): Promise<SleeperPlayer> {
  const response = await fetch(`${SLEEPER_API_BASE}/players/nfl/${playerId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch player: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch all players from Sleeper API
 * This is a large request, so use sparingly
 * @returns Promise with object of all players
 */
export async function getAllPlayers(): Promise<Record<string, SleeperPlayer>> {
  const response = await fetch(`${SLEEPER_API_BASE}/players/nfl`);
  if (!response.ok) {
    throw new Error(`Failed to fetch all players: ${response.statusText}`);
  }
  return response.json();
}

// Lightweight in-memory cache for all players to avoid repeated large downloads
let allPlayersCache: { ts: number; data: Record<string, SleeperPlayer> } | null = null;
const ALL_PLAYERS_TTL_DEFAULT = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Cached wrapper for getAllPlayers with a TTL to reduce repeated network calls.
 */
export async function getAllPlayersCached(ttlMs: number = ALL_PLAYERS_TTL_DEFAULT): Promise<Record<string, SleeperPlayer>> {
  const now = Date.now();
  if (allPlayersCache && now - allPlayersCache.ts < ttlMs) {
    return allPlayersCache.data;
  }
  const data = await getAllPlayers();
  allPlayersCache = { ts: now, data };
  return data;
}

/**
 * Get teams data with canon team names for a specific league
 * @param leagueId The Sleeper league ID
 * @returns Promise with array of team data
 */
export async function getTeamsData(leagueId: string): Promise<TeamData[]> {
  try {
    const [rosters, usersData] = await Promise.all([
      getLeagueRosters(leagueId),
      getLeagueUsers(leagueId)
    ]);
    
    // Map user ids
    const usersById: Record<string, SleeperUser | undefined> = {};
    for (const u of usersData) usersById[u.user_id] = u;

    // Build team objects with canonical names resolved via owner_id and aliases
    const teams: TeamData[] = rosters.map((roster) => {
      const user = usersById[roster.owner_id];
      const rosterTeamName = roster.metadata?.team_name ?? null;
      const teamName = resolveCanonicalTeamName({
        ownerId: roster.owner_id,
        rosterTeamName,
        userDisplayName: user?.display_name ?? null,
        username: user?.username ?? null,
      });

      return {
        teamName,
        rosterId: roster.roster_id,
        ownerId: roster.owner_id,
        wins: roster.settings.wins,
        losses: roster.settings.losses,
        ties: roster.settings.ties,
        fpts: roster.settings.fpts + (roster.settings.fpts_decimal || 0) / 100,
        fptsAgainst: roster.settings.fpts_against + (roster.settings.fpts_against_decimal || 0) / 100,
        players: roster.players || [],
      };
    });

    return teams;
  } catch (error) {
    console.error('Error fetching teams data:', error);
    throw error;
  }
}

/**
 * Build a quick lookup Map from rosterId to canonical team name for a league.
 */
export async function getRosterIdToTeamNameMap(leagueId: string): Promise<Map<number, string>> {
  const teams = await getTeamsData(leagueId);
  return new Map(teams.map((t) => [t.rosterId, t.teamName]));
}

/**
 * Sleeper playoff bracket game shape (minimal fields used)
 */
export interface SleeperBracketGame {
  r: number; // round number (1 = first round)
  m: number; // match number within the round
  t1?: number | null; // roster_id for team 1 (may be null for bye)
  t2?: number | null; // roster_id for team 2 (may be null for bye)
  w?: number | null;  // winner roster_id (if known)
  l?: number | null;  // loser roster_id (if known)
  // Other fields from Sleeper are ignored for this UI
}

/**
 * Bracket game with optional score fields attached from weekly matchups
 */
export interface SleeperBracketGameWithScore extends SleeperBracketGame {
  t1_points?: number | null;
  t2_points?: number | null;
}

/**
 * Fetch winners bracket for a league. Returns empty array if unavailable.
 */
export async function getLeagueWinnersBracket(leagueId: string): Promise<SleeperBracketGame[]> {
  const resp = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/winners_bracket`);
  if (!resp.ok) {
    // Some seasons may not have a bracket yet; treat as empty.
    return [];
  }
  return resp.json();
}

/**
 * Fetch losers bracket for a league. Returns empty array if unavailable.
 */
export async function getLeagueLosersBracket(leagueId: string): Promise<SleeperBracketGame[]> {
  const resp = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/losers_bracket`);
  if (!resp.ok) {
    return [];
  }
  return resp.json();
}

/**
 * Convenience wrapper to fetch both winners and losers brackets in parallel.
 */
export async function getLeaguePlayoffBrackets(leagueId: string): Promise<{ winners: SleeperBracketGame[]; losers: SleeperBracketGame[] }> {
  const [winners, losers] = await Promise.all([
    getLeagueWinnersBracket(leagueId).catch(() => [] as SleeperBracketGame[]),
    getLeagueLosersBracket(leagueId).catch(() => [] as SleeperBracketGame[]),
  ]);
  return { winners, losers };
}

/**
 * Fetch playoff brackets and attach scores for each game by correlating rounds
 * to league playoff weeks from league settings. If scores are 0-0 (unplayed),
 * they will be omitted (left as null).
 */
export async function getLeaguePlayoffBracketsWithScores(
  leagueId: string
): Promise<{ winners: SleeperBracketGameWithScore[]; losers: SleeperBracketGameWithScore[] }> {
  const [league, { winners, losers }] = await Promise.all([
    getLeague(leagueId),
    getLeaguePlayoffBrackets(leagueId),
  ]);

  const settings = (league?.settings || {}) as {
    playoff_week_start?: number;
    playoff_start_week?: number;
  };
  const startWeek = Number(
    settings.playoff_week_start ?? settings.playoff_start_week ?? 15
  );

  // Collect unique rounds across both brackets and compute their weeks
  const rounds = new Set<number>();
  for (const g of winners) if (typeof g.r === 'number') rounds.add(g.r);
  for (const g of losers) if (typeof g.r === 'number') rounds.add(g.r);
  const roundWeeks = new Map<number, number>();
  for (const r of rounds) roundWeeks.set(r, startWeek + (r - 1));

  // Fetch matchups for relevant weeks in parallel
  const weeksToFetch = Array.from(new Set(Array.from(roundWeeks.values())));
  const weekMatchupsMap = new Map<number, SleeperMatchup[]>();
  await Promise.all(
    weeksToFetch.map(async (week) => {
      const mus = await getLeagueMatchups(leagueId, week).catch(() => [] as SleeperMatchup[]);
      weekMatchupsMap.set(week, mus);
    })
  );

  const attachScores = (games: SleeperBracketGame[]): SleeperBracketGameWithScore[] => {
    return games.map((g) => {
      const res: SleeperBracketGameWithScore = { ...g, t1_points: null, t2_points: null };
      const r = g.r ?? 0;
      const week = roundWeeks.get(r);
      if (!week || !g.t1 || !g.t2) return res;
      const matchups = weekMatchupsMap.get(week) || [];
      // Try to locate the specific head-to-head between t1 and t2
      for (const m of matchups) {
        if (m.roster_id !== g.t1 && m.roster_id !== g.t2) continue;
        const opp = matchups.find((x) => x.matchup_id === m.matchup_id && x.roster_id !== m.roster_id);
        if (!opp) continue;
        const myPts = (m.custom_points ?? m.points ?? 0);
        const oppPts = (opp.custom_points ?? opp.points ?? 0);
        // Skip scheduled/unplayed
        if ((myPts ?? 0) === 0 && (oppPts ?? 0) === 0) break;
        if (m.roster_id === g.t1) {
          res.t1_points = myPts;
          res.t2_points = oppPts;
        } else {
          res.t2_points = myPts;
          res.t1_points = oppPts;
        }
        break;
      }
      return res;
    });
  };

  return {
    winners: attachScores(winners),
    losers: attachScores(losers),
  };
}

/**
 * Get all teams data across multiple seasons
 * @returns Promise with object of team data by year
 */
export async function getAllTeamsData(): Promise<Record<string, TeamData[]>> {
  try {
    const currentYearTeams = getTeamsData(LEAGUE_IDS.CURRENT);
    const year2024Teams = getTeamsData(LEAGUE_IDS.PREVIOUS['2024']);
    const year2023Teams = getTeamsData(LEAGUE_IDS.PREVIOUS['2023']);
    
    const [current, y2024, y2023] = await Promise.all([
      currentYearTeams,
      year2024Teams,
      year2023Teams
    ]);
    
    return {
      '2025': current,
      '2024': y2024,
      '2023': y2023
    };
  } catch (error) {
    console.error('Error fetching all teams data:', error);
    throw error;
  }
}

/**
 * Get a team's weekly matchup results for a season
 * @param leagueId The Sleeper league ID
 * @param rosterId The team's roster ID
 * @returns Promise with array of weekly results
 */
export async function getTeamWeeklyResults(leagueId: string, rosterId: number): Promise<{
  week: number;
  points: number;
  opponent: number;
  opponentPoints: number;
  result: 'W' | 'L' | 'T';
  opponentRosterId: number;
}[]> {
  try {
    // Assuming 18 weeks in a season
    const weekPromises = Array.from({ length: 18 }, (_, i) => i + 1).map(week => 
      getLeagueMatchups(leagueId, week)
    );
    
    const allWeekMatchups = await Promise.all(weekPromises);
    const teamResults = [];
    
    for (let week = 0; week < allWeekMatchups.length; week++) {
      const weekMatchups = allWeekMatchups[week];
      const teamMatchup = weekMatchups.find(m => m.roster_id === rosterId);
      
      if (teamMatchup) {
        // Find opponent
        const matchupId = teamMatchup.matchup_id;
        const opponent = weekMatchups.find(m => m.matchup_id === matchupId && m.roster_id !== rosterId);
        
        if (opponent) {
          const teamPts = teamMatchup.custom_points ?? teamMatchup.points ?? 0;
          const oppPts = opponent.custom_points ?? opponent.points ?? 0;
          // Skip unplayed scheduled matchups (0-0)
          if ((teamPts ?? 0) === 0 && (oppPts ?? 0) === 0) continue;
          const result: {
            week: number;
            points: number;
            opponent: number;
            opponentPoints: number;
            opponentRosterId: number;
            result: 'W' | 'L' | 'T';
          } = {
            week: week + 1,
            points: teamPts,
            opponent: opponent.roster_id,
            opponentPoints: oppPts,
            opponentRosterId: opponent.roster_id,
            result: teamPts > oppPts ? 'W' : 
                   teamPts < oppPts ? 'L' : 'T'
          };
          
          teamResults.push(result);
        }
      }
    }
    
    return teamResults;
  } catch (error) {
    console.error('Error fetching team weekly results:', error);
    throw error;
  }
}

/**
 * Get head-to-head records for a team against all other teams
 * @param leagueId The Sleeper league ID
 * @param rosterId The team's roster ID
 * @returns Promise with object of H2H records
 */
export async function getTeamH2HRecords(leagueId: string, rosterId: number): Promise<Record<number, { wins: number, losses: number, ties: number }>> {
  try {
    // Assuming 18 weeks in a season
    const weekPromises = Array.from({ length: 18 }, (_, i) => i + 1).map(week => 
      getLeagueMatchups(leagueId, week)
    );
    
    const allWeekMatchups = await Promise.all(weekPromises);
    const h2hRecords: Record<number, { wins: number, losses: number, ties: number }> = {};
    
    for (const weekMatchups of allWeekMatchups) {
      const teamMatchup = weekMatchups.find(m => m.roster_id === rosterId);
      
      if (teamMatchup) {
        // Find opponent
        const matchupId = teamMatchup.matchup_id;
        const opponent = weekMatchups.find(m => m.matchup_id === matchupId && m.roster_id !== rosterId);
        
        if (opponent) {
          const opponentId = opponent.roster_id;
          
          if (!h2hRecords[opponentId]) {
            h2hRecords[opponentId] = { wins: 0, losses: 0, ties: 0 };
          }
          
          if (teamMatchup.points > opponent.points) {
            h2hRecords[opponentId].wins++;
          } else if (teamMatchup.points < opponent.points) {
            h2hRecords[opponentId].losses++;
          } else {
            h2hRecords[opponentId].ties++;
          }
        }
      }
    }
    
    return h2hRecords;
  } catch (error) {
    console.error('Error fetching team H2H records:', error);
    throw error;
  }
}

/**
 * Fetch transactions for a specific league and week
 * @param leagueId The Sleeper league ID
 * @param week The week number (optional)
 * @returns Promise with array of transactions
 */
export async function getLeagueTransactions(leagueId: string, week?: number): Promise<SleeperTransaction[]> {
  try {
    const weekParam = week !== undefined ? `/${week}` : '';
    const response = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/transactions${weekParam}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch transactions: ${response.statusText}`);
    }
    
    return response.json();
  } catch (error) {
    console.error('Error fetching league transactions:', error);
    throw error;
  }
}

/**
 * Fetch all trades for a specific league
 * @param leagueId The Sleeper league ID
 * @returns Promise with array of trade transactions
 */
export async function getLeagueTrades(leagueId: string): Promise<SleeperTransaction[]> {
  try {
    // Fetch transactions for all weeks in parallel (weeks 1-18)
    const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
    const weeklyTransactions = await Promise.all(
      weeks.map(week =>
        getLeagueTransactions(leagueId, week).catch(() => [] as SleeperTransaction[])
      )
    );
    const allTransactions = weeklyTransactions.flat();
    // Only include completed trades
    return allTransactions.filter(
      (transaction) => transaction.type === 'trade' && transaction.status === 'complete'
    );
  } catch (error) {
    console.error('Error fetching league trades:', error);
    throw error;
  }
}

/**
 * Fetch all trades across all league years
 * @returns Promise with object of trades by year
 */
export async function getAllLeagueTrades(): Promise<Record<string, SleeperTransaction[]>> {
  try {
    const tradesByYear: Record<string, SleeperTransaction[]> = {};
    
    // Build a map of year -> leagueId across current and previous seasons
    const yearToLeague: Record<string, string> = {
      '2025': LEAGUE_IDS.CURRENT,
      ...LEAGUE_IDS.PREVIOUS,
    };
    // Process each league year
    for (const [year, leagueId] of Object.entries(yearToLeague)) {
      const trades = await getLeagueTrades(leagueId);
      tradesByYear[year] = trades;
    }
    
    return tradesByYear;
  } catch (error) {
    console.error('Error fetching all league trades:', error);
    throw error;
  }
}

/**
 * Fetch all drafts for a league
 * @param leagueId The Sleeper league ID
 * @returns Promise with array of drafts
 */
export async function getLeagueDrafts(leagueId: string): Promise<SleeperDraft[]> {
  const response = await fetch(`${SLEEPER_API_BASE}/league/${leagueId}/drafts`);
  if (!response.ok) {
    throw new Error(`Failed to fetch league drafts: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch a single draft by ID (to get draft_order mapping)
 * @param draftId The Sleeper draft ID
 */
export async function getDraftById(draftId: string): Promise<SleeperDraftDetails> {
  const response = await fetch(`${SLEEPER_API_BASE}/draft/${draftId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch draft by id: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch all picks for a draft
 * @param draftId The Sleeper draft ID
 * @returns Promise with array of draft picks
 */
export async function getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
  const response = await fetch(`${SLEEPER_API_BASE}/draft/${draftId}/picks`);
  if (!response.ok) {
    throw new Error(`Failed to fetch draft picks: ${response.statusText}`);
  }
  return response.json();
}

/**
 * NFL season aggregate player stats (subset of fields we use)
 * Keys are Sleeper player IDs (stringified numbers).
 * Example endpoint: https://api.sleeper.app/v1/stats/nfl/regular/2024
 */
export interface SleeperNFLSeasonPlayerStats {
  gp?: number;             // games played
  gms_active?: number;     // games active (fallback)
  pts_ppr?: number;        // total PPR fantasy points
  pts_std?: number;        // total standard points (not used here)
  // ... many other fields exist; we only type what's needed
}

// Simple in-memory cache for season stats within a single runtime
const seasonStatsCache: Record<string, { ts: number; data: Record<string, SleeperNFLSeasonPlayerStats> }> = {};

// In-memory cache for weekly stats
const weekStatsCache: Record<string, { ts: number; data: Record<string, SleeperNFLSeasonPlayerStats> }> = {};

/**
 * Fetch NFL season stats from Sleeper and cache them briefly to avoid repeated large downloads.
 * @param season Year as string or number (e.g., '2024')
 * @param ttlMs Cache TTL in milliseconds (default 15 minutes)
 */
export async function getNFLSeasonStats(
  season: string | number,
  ttlMs: number = 15 * 60 * 1000
): Promise<Record<string, SleeperNFLSeasonPlayerStats>> {
  const key = String(season);
  const now = Date.now();
  const cached = seasonStatsCache[key];
  if (cached && now - cached.ts < ttlMs) return cached.data;

  const url = `${SLEEPER_API_BASE}/stats/nfl/regular/${key}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch NFL season stats ${key}: ${resp.status} ${resp.statusText}`);
  }
  const json = (await resp.json()) as Record<string, SleeperNFLSeasonPlayerStats>;
  seasonStatsCache[key] = { ts: now, data: json };
  return json;
}

/**
 * Compute total PPR and PPG for a set of players for a given season.
 * @param season Season year (e.g., '2024')
 * @param playerIds Array of Sleeper player IDs
 */
export async function getPlayersPPRAndPPG(
  season: string | number,
  playerIds: string[]
): Promise<Record<string, { totalPPR: number; gp: number; ppg: number }>> {
  const stats = await getNFLSeasonStats(season);
  const result: Record<string, { totalPPR: number; gp: number; ppg: number }> = {};
  for (const pid of playerIds) {
    const s = stats[pid];
    const gp = (s?.gp ?? s?.gms_active ?? 0) || 0;
    const total = s?.pts_ppr ?? 0;
    const ppg = gp > 0 ? total / gp : 0;
    result[pid] = { totalPPR: total, gp, ppg };
  }
  return result;
}
