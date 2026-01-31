/**
 * Data Integration Module
 * 
 * Pulls from ALL available database utilities to provide comprehensive context for newsletter bots.
 * This is the bridge between the website's data layer and the newsletter generation system.
 * 
 * Data Sources:
 * - sleeper-api.ts: League records, franchise stats, weekly highs, matchups, injuries
 * - headtohead.ts: All-time H2H records between teams
 * - trades.ts: Trade history, active traders
 * - team-utils.ts: Team colors, logos, canonical names
 * - league.ts: League constants, champions, important dates
 */

import { TEAM_NAMES, CHAMPIONS } from '@/lib/constants/league';
import { TEAM_COLORS } from '@/lib/constants/team-colors';
import { getTeamLogoPath } from '@/lib/utils/team-utils';
import { getHeadToHeadAllTime, type H2HResult } from '@/lib/utils/headtohead';
import { fetchTradesAllTime, type Trade } from '@/lib/utils/trades';
import {
  getLeagueRecordBook,
  getFranchisesAllTime,
  getWeeklyHighScoreTallyAcrossSeasons,
  getSplitRecordsAllTime,
  getTopScoringWeeksAllTime,
  type LeagueRecordBook,
  type FranchiseSummary,
  type TopScoringWeekEntry,
} from '@/lib/utils/sleeper-api';

// ============ Types ============

export interface TeamProfile {
  name: string;
  colors: { primary: string; secondary: string; tertiary?: string };
  logoPath: string;
  // Historical stats
  allTimeRecord: { wins: number; losses: number; ties: number; winPct: number };
  regularSeasonRecord: { wins: number; losses: number; ties: number };
  playoffRecord: { wins: number; losses: number; ties: number };
  toiletRecord: { wins: number; losses: number; ties: number };
  // Achievements
  championships: number;
  championshipAppearances: number;
  weeklyHighs: number;
  // Scoring
  totalPointsFor: number;
  avgPointsPerGame: number;
  highestSingleWeek: { points: number; week: number; season: number } | null;
  lowestSingleWeek: { points: number; week: number; season: number } | null;
  // Streaks
  longestWinStreak: number;
  longestLosingStreak: number;
  currentStreak: { type: 'W' | 'L'; count: number } | null;
  // Trading activity
  totalTrades: number;
  recentTrades: Trade[];
}

export interface LeagueRecords {
  highestScoringGame: LeagueRecordBook['highestScoringGame'];
  lowestScoringGame: LeagueRecordBook['lowestScoringGame'];
  biggestVictory: LeagueRecordBook['biggestVictory'];
  closestVictory: LeagueRecordBook['closestVictory'];
  highestCombined: LeagueRecordBook['highestCombined'];
  longestWinStreak: LeagueRecordBook['longestWinStreak'];
  longestLosingStreak: LeagueRecordBook['longestLosingStreak'];
}

// Split record type from getSplitRecordsAllTime
interface SplitRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface ComprehensiveLeagueData {
  // Team profiles with all stats
  teams: Record<string, TeamProfile>;
  // League-wide records
  records: LeagueRecords;
  // H2H matrix
  h2h: H2HResult;
  // Top scoring weeks all-time
  topScoringWeeks: TopScoringWeekEntry[];
  // Weekly high score leaders
  weeklyHighLeaders: Record<string, number>;
  // All trades
  allTrades: Trade[];
  // Metadata
  fetchedAt: string;
}

// ============ Data Fetching ============

/**
 * Fetch comprehensive league data from all sources
 * This is the main entry point for getting all data for newsletter generation
 */
export async function fetchComprehensiveLeagueData(): Promise<ComprehensiveLeagueData> {
  console.log('[DataIntegration] Fetching comprehensive league data...');
  
  // Fetch all data in parallel
  const [
    recordBook,
    franchises,
    weeklyHighTally,
    splitRecords,
    topScoringWeeks,
    h2hData,
    allTrades,
  ] = await Promise.all([
    getLeagueRecordBook().catch(e => { console.warn('Failed to fetch record book:', e); return null; }),
    getFranchisesAllTime().catch(e => { console.warn('Failed to fetch franchises:', e); return [] as FranchiseSummary[]; }),
    getWeeklyHighScoreTallyAcrossSeasons().catch(e => { console.warn('Failed to fetch weekly highs:', e); return {} as Record<string, number>; }),
    getSplitRecordsAllTime().catch(e => { console.warn('Failed to fetch split records:', e); return {} as Record<string, { teamName: string; regular: SplitRecord; playoffs: SplitRecord; toilet: SplitRecord }>; }),
    getTopScoringWeeksAllTime({ category: 'all', top: 50 }).catch(e => { console.warn('Failed to fetch top weeks:', e); return [] as TopScoringWeekEntry[]; }),
    getHeadToHeadAllTime().catch(e => { console.warn('Failed to fetch H2H:', e); return { teams: [], matrix: {}, neverBeaten: [] } as H2HResult; }),
    fetchTradesAllTime().catch(e => { console.warn('Failed to fetch trades:', e); return [] as Trade[]; }),
  ]);

  console.log(`[DataIntegration] Fetched: ${franchises.length} franchises, ${allTrades.length} trades, ${topScoringWeeks.length} top weeks`);

  // Build team profiles
  const teams: Record<string, TeamProfile> = {};
  
  for (const teamName of TEAM_NAMES) {
    const franchise = franchises.find(f => f.teamName === teamName);
    const split = splitRecords[teamName];
    const colors = TEAM_COLORS[teamName] || { primary: '#3b5b8b', secondary: '#ba1010' };
    
    // Count trades for this team
    const teamTrades = allTrades.filter(t => 
      t.teams?.some(tt => tt.name === teamName)
    );
    
    // Get championship info
    const champYears = Object.entries(CHAMPIONS)
      .filter(([, data]) => data.champion === teamName)
      .map(([year]) => parseInt(year));
    const runnerUpYears = Object.entries(CHAMPIONS)
      .filter(([, data]) => data.runnerUp === teamName)
      .map(([year]) => parseInt(year));
    
    // Find highest/lowest single week for this team
    const teamTopWeeks = topScoringWeeks.filter(w => w.teamName === teamName);
    const highestWeek = teamTopWeeks.length > 0 ? teamTopWeeks[0] : null;
    const lowestWeek = teamTopWeeks.length > 0 ? teamTopWeeks[teamTopWeeks.length - 1] : null;
    
    teams[teamName] = {
      name: teamName,
      colors: {
        primary: colors.primary,
        secondary: colors.secondary,
        tertiary: colors.tertiary,
      },
      logoPath: getTeamLogoPath(teamName),
      allTimeRecord: {
        wins: franchise?.wins || 0,
        losses: franchise?.losses || 0,
        ties: franchise?.ties || 0,
        winPct: franchise ? (franchise.wins / Math.max(1, franchise.wins + franchise.losses + franchise.ties)) : 0,
      },
      regularSeasonRecord: {
        wins: split?.regular?.wins || 0,
        losses: split?.regular?.losses || 0,
        ties: split?.regular?.ties || 0,
      },
      playoffRecord: {
        wins: split?.playoffs?.wins || 0,
        losses: split?.playoffs?.losses || 0,
        ties: split?.playoffs?.ties || 0,
      },
      toiletRecord: {
        wins: split?.toilet?.wins || 0,
        losses: split?.toilet?.losses || 0,
        ties: split?.toilet?.ties || 0,
      },
      championships: champYears.length,
      championshipAppearances: champYears.length + runnerUpYears.length,
      weeklyHighs: weeklyHighTally[teamName] || 0,
      totalPointsFor: franchise?.totalPF || 0,
      avgPointsPerGame: franchise?.avgPF || 0,
      highestSingleWeek: highestWeek ? { points: highestWeek.points, week: highestWeek.week, season: parseInt(highestWeek.year) } : null,
      lowestSingleWeek: lowestWeek ? { points: lowestWeek.points, week: lowestWeek.week, season: parseInt(lowestWeek.year) } : null,
      longestWinStreak: 0, // Would need to calculate from matchup history
      longestLosingStreak: 0,
      currentStreak: null,
      totalTrades: teamTrades.length,
      recentTrades: teamTrades.slice(0, 5),
    };
  }

  return {
    teams,
    records: {
      highestScoringGame: recordBook?.highestScoringGame || null,
      lowestScoringGame: recordBook?.lowestScoringGame || null,
      biggestVictory: recordBook?.biggestVictory || null,
      closestVictory: recordBook?.closestVictory || null,
      highestCombined: recordBook?.highestCombined || null,
      longestWinStreak: recordBook?.longestWinStreak || null,
      longestLosingStreak: recordBook?.longestLosingStreak || null,
    },
    h2h: h2hData,
    topScoringWeeks,
    weeklyHighLeaders: weeklyHighTally,
    allTrades,
    fetchedAt: new Date().toISOString(),
  };
}

// ============ Context Builders ============

/**
 * Build a comprehensive context string for LLM consumption
 * This is the main function that converts raw data into bot-readable context
 */
export function buildComprehensiveContextString(data: ComprehensiveLeagueData): string {
  const lines: string[] = [];
  
  lines.push('=== COMPREHENSIVE LEAGUE DATA ===');
  lines.push(`Data fetched at: ${data.fetchedAt}`);
  lines.push('');
  
  // League Records
  lines.push('--- LEAGUE RECORDS (ALL-TIME) ---');
  if (data.records.highestScoringGame) {
    const r = data.records.highestScoringGame;
    lines.push(`Highest Single-Game Score: ${r.teamName} with ${r.points.toFixed(1)} pts (Week ${r.week}, ${r.year})`);
  }
  if (data.records.lowestScoringGame) {
    const r = data.records.lowestScoringGame;
    lines.push(`Lowest Single-Game Score: ${r.teamName} with ${r.points.toFixed(1)} pts (Week ${r.week}, ${r.year})`);
  }
  if (data.records.biggestVictory) {
    const r = data.records.biggestVictory;
    lines.push(`Biggest Blowout: ${r.winnerTeamName} beat ${r.loserTeamName} by ${r.margin.toFixed(1)} pts (Week ${r.week}, ${r.year})`);
  }
  if (data.records.closestVictory) {
    const r = data.records.closestVictory;
    lines.push(`Closest Game: ${r.winnerTeamName} beat ${r.loserTeamName} by ${r.margin.toFixed(1)} pts (Week ${r.week}, ${r.year})`);
  }
  if (data.records.longestWinStreak) {
    const r = data.records.longestWinStreak;
    lines.push(`Longest Win Streak: ${r.teamName} with ${r.length} consecutive wins (${r.start.year}-${r.end.year})`);
  }
  lines.push('');
  
  // Team Rankings by Win %
  const sortedTeams = Object.values(data.teams).sort((a, b) => b.allTimeRecord.winPct - a.allTimeRecord.winPct);
  lines.push('--- ALL-TIME TEAM RANKINGS (by Win %) ---');
  sortedTeams.forEach((team, idx) => {
    const { wins, losses, ties, winPct } = team.allTimeRecord;
    const champStr = team.championships > 0 ? ` [${team.championships}x Champion]` : '';
    lines.push(`${idx + 1}. ${team.name}: ${wins}-${losses}${ties > 0 ? `-${ties}` : ''} (${(winPct * 100).toFixed(1)}%)${champStr}`);
  });
  lines.push('');
  
  // Weekly High Score Leaders
  const highLeaders = Object.entries(data.weeklyHighLeaders)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (highLeaders.length > 0) {
    lines.push('--- WEEKLY HIGH SCORE LEADERS (ALL-TIME) ---');
    highLeaders.forEach(([team, count], idx) => {
      lines.push(`${idx + 1}. ${team}: ${count} weekly highs`);
    });
    lines.push('');
  }
  
  // Top Scoring Weeks
  if (data.topScoringWeeks.length > 0) {
    lines.push('--- TOP 10 SCORING WEEKS (ALL-TIME) ---');
    data.topScoringWeeks.slice(0, 10).forEach((w, idx) => {
      lines.push(`${idx + 1}. ${w.teamName}: ${w.points.toFixed(1)} pts (Week ${w.week}, ${w.year})`);
    });
    lines.push('');
  }
  
  // Most Active Traders
  const traderCounts = new Map<string, number>();
  for (const trade of data.allTrades) {
    for (const team of trade.teams || []) {
      traderCounts.set(team.name, (traderCounts.get(team.name) || 0) + 1);
    }
  }
  const topTraders = [...traderCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topTraders.length > 0) {
    lines.push('--- MOST ACTIVE TRADERS (ALL-TIME) ---');
    topTraders.forEach(([team, count], idx) => {
      lines.push(`${idx + 1}. ${team}: ${count} trades`);
    });
    lines.push(`Total trades in league history: ${data.allTrades.length}`);
    lines.push('');
  }
  
  // H2H Notable Matchups (teams that have never beaten each other)
  if (data.h2h.neverBeaten.length > 0) {
    lines.push('--- NOTABLE H2H FACTS ---');
    lines.push('Teams that have NEVER beaten certain opponents:');
    for (const nb of data.h2h.neverBeaten.slice(0, 10)) {
      lines.push(`- ${nb.team} is 0-${nb.meetings} all-time vs ${nb.vs}`);
    }
    lines.push('');
  }
  
  // Championship History
  lines.push('--- CHAMPIONSHIP HISTORY ---');
  lines.push('2023: Double Trouble (Champion) def. Belltown Raptors');
  lines.push('2024: Belltown Raptors (Champion) def. Double Trouble');
  lines.push('2025: BeerNeverBrokeMyHeart (Champion) def. bop pop');
  lines.push('Three different champions in three years - dynasty parity!');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Build context for a specific team
 */
export function buildTeamContextString(data: ComprehensiveLeagueData, teamName: string): string {
  const team = data.teams[teamName];
  if (!team) return `No data found for team: ${teamName}`;
  
  const lines: string[] = [];
  lines.push(`=== ${teamName.toUpperCase()} TEAM PROFILE ===`);
  lines.push('');
  
  // Record
  lines.push('--- RECORD ---');
  lines.push(`All-Time: ${team.allTimeRecord.wins}-${team.allTimeRecord.losses} (${(team.allTimeRecord.winPct * 100).toFixed(1)}%)`);
  lines.push(`Regular Season: ${team.regularSeasonRecord.wins}-${team.regularSeasonRecord.losses}`);
  lines.push(`Playoffs: ${team.playoffRecord.wins}-${team.playoffRecord.losses}`);
  lines.push('');
  
  // Achievements
  lines.push('--- ACHIEVEMENTS ---');
  lines.push(`Championships: ${team.championships}`);
  lines.push(`Championship Appearances: ${team.championshipAppearances}`);
  lines.push(`Weekly High Scores: ${team.weeklyHighs}`);
  lines.push('');
  
  // Scoring
  lines.push('--- SCORING ---');
  lines.push(`Total Points For: ${team.totalPointsFor.toFixed(1)}`);
  lines.push(`Avg Points/Game: ${team.avgPointsPerGame.toFixed(1)}`);
  if (team.highestSingleWeek) {
    lines.push(`Best Week: ${team.highestSingleWeek.points.toFixed(1)} pts (Week ${team.highestSingleWeek.week}, ${team.highestSingleWeek.season})`);
  }
  lines.push('');
  
  // H2H
  const h2hRow = data.h2h.matrix[teamName];
  if (h2hRow) {
    lines.push('--- HEAD-TO-HEAD ---');
    const h2hEntries = Object.entries(h2hRow)
      .filter(([opp]) => opp !== teamName)
      .map(([opp, cell]) => ({ opp, ...cell }))
      .sort((a, b) => b.wins.total - a.wins.total);
    
    for (const entry of h2hEntries.slice(0, 5)) {
      lines.push(`vs ${entry.opp}: ${entry.wins.total}-${entry.losses.total}`);
    }
    lines.push('');
  }
  
  // Recent Trades
  if (team.recentTrades.length > 0) {
    lines.push('--- RECENT TRADES ---');
    lines.push(`Total trades: ${team.totalTrades}`);
    for (const trade of team.recentTrades.slice(0, 3)) {
      lines.push(`- ${trade.date}: ${trade.teams?.map(t => t.name).join(' ↔ ')}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Build H2H context for a specific matchup
 */
export function buildMatchupH2HContext(data: ComprehensiveLeagueData, team1: string, team2: string): string {
  const cell = data.h2h.matrix[team1]?.[team2];
  if (!cell) return `No H2H data for ${team1} vs ${team2}`;
  
  const lines: string[] = [];
  lines.push(`=== ${team1} vs ${team2} (ALL-TIME) ===`);
  lines.push(`Meetings: ${cell.meetings}`);
  lines.push(`${team1}: ${cell.wins.total} wins (${cell.wins.regular} regular, ${cell.wins.playoffs} playoffs)`);
  lines.push(`${team2}: ${cell.losses.total} wins`);
  
  if (cell.lastMeeting) {
    lines.push(`Last meeting: ${cell.lastMeeting.year} Week ${cell.lastMeeting.week}`);
  }
  
  // Check for dominance
  if (cell.wins.total > 0 && cell.losses.total === 0) {
    lines.push(`⚠️ ${team1} has NEVER lost to ${team2}!`);
  } else if (cell.losses.total > 0 && cell.wins.total === 0) {
    lines.push(`⚠️ ${team1} has NEVER beaten ${team2}!`);
  }
  
  return lines.join('\n');
}
