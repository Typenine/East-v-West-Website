/**
 * Sleeper API utility functions
 * 
 * This file contains utilities for fetching data from the Sleeper API
 * using the provided league IDs.
 */

import { LEAGUE_IDS } from '../constants/league';
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

          // Update aggregates
          games += 1;
          totalPF += myPts;
          totalPA += oppPts;
          if (myPts > oppPts) wins += 1;
          else if (myPts < oppPts) losses += 1;
          else ties += 1;

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
