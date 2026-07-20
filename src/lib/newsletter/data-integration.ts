/**
 * Data Integration Module
 * 
 * Pulls from ALL available database utilities to provide comprehensive context for newsletter bots.
 * This is the bridge between the website's data layer and the newsletter generation system.
 * 
 * Data Sources:
 * - sleeper-api.ts: League records, franchise stats, weekly highs, matchups, injuries, standings, streaks
 * - headtohead.ts: All-time H2H records between teams
 * - trades.ts: Trade history, active traders
 * - team-utils.ts: Team colors, logos, canonical names
 * - league.ts: League constants, champions, important dates
 * - transactions.ts: Waiver/FA activity
 * - taxi.ts: Taxi squad data
 * - rules.ts: League rulebook
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
  getTeamsData,
  getCurrentStreaksForLeague,
  getLeagueTransactions,
  getLeague,
  getLeagueMatchups,
  type LeagueRecordBook,
  type FranchiseSummary,
  type TopScoringWeekEntry,
  type TeamData,
  type SleeperTransaction,
  type SleeperMatchup,
} from '@/lib/utils/sleeper-api';
import { rulesHtmlSections } from '@/data/rules';
import { resolvePlayerName } from './derive';

// ============ Types ============

// Current season data for a team
export interface CurrentSeasonTeamData {
  teamName: string;
  rosterId: number;
  ownerId: string;
  // Current season record
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  // Standings position
  standingsPosition: number;
  playoffPosition: 'clinched' | 'in' | 'bubble' | 'out' | 'eliminated';
  // Current streak
  streak: { type: 'W' | 'L' | 'T' | null; length: number };
  // Recent results (last 5 weeks)
  recentResults: Array<{ week: number; result: 'W' | 'L' | 'T'; points: number; opponentPoints: number; opponent: string }>;
}

// Transaction/waiver activity
export interface RecentTransaction {
  type: 'waiver' | 'free_agent' | 'trade';
  teamName: string;
  week: number;
  adds: Array<{ playerName: string; playerId: string }>;
  drops: Array<{ playerName: string; playerId: string }>;
  faabSpent?: number;
}

// Playoff implications
export interface PlayoffImplications {
  clinched: string[];
  inPlayoffPosition: string[];
  onBubble: string[];
  eliminated: string[];
  magicNumbers: Record<string, number>; // Team -> games needed to clinch
}

// Full current week context
export interface CurrentWeekContext {
  season: number;
  week: number;
  // Current standings with all teams
  standings: CurrentSeasonTeamData[];
  // Recent transactions this week
  recentTransactions: RecentTransaction[];
  // Playoff picture
  playoffImplications: PlayoffImplications;
  // League settings from Sleeper
  playoffStartWeek: number;
  playoffTeams: number;
}

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

interface TeamStreakProfile {
  longestWinStreak: number;
  longestLosingStreak: number;
  currentStreak: { type: 'W' | 'L'; count: number } | null;
}

function calculateTeamStreaks(weeks: TopScoringWeekEntry[]): TeamStreakProfile {
  const chronological = [...weeks].sort((a, b) => {
    const seasonDelta = Number(a.year) - Number(b.year);
    return seasonDelta !== 0 ? seasonDelta : a.week - b.week;
  });
  let currentType: 'W' | 'L' | null = null;
  let currentCount = 0;
  let longestWinStreak = 0;
  let longestLosingStreak = 0;

  for (const game of chronological) {
    const result: 'W' | 'L' | 'T' = game.points > game.opponentPoints
      ? 'W'
      : game.points < game.opponentPoints ? 'L' : 'T';
    if (result === 'T') {
      currentType = null;
      currentCount = 0;
      continue;
    }
    if (currentType === result) currentCount += 1;
    else {
      currentType = result;
      currentCount = 1;
    }
    if (result === 'W') longestWinStreak = Math.max(longestWinStreak, currentCount);
    else longestLosingStreak = Math.max(longestLosingStreak, currentCount);
  }

  return {
    longestWinStreak,
    longestLosingStreak,
    currentStreak: currentType ? { type: currentType, count: currentCount } : null,
  };
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
    topScoringWeeks: allScoringWeeks.slice(0, 50),
    h2hData,
    allTrades,
  ] = await Promise.all([
    getLeagueRecordBook().catch(e => { console.warn('Failed to fetch record book:', e); return null; }),
    getFranchisesAllTime().catch(e => { console.warn('Failed to fetch franchises:', e); return [] as FranchiseSummary[]; }),
    getWeeklyHighScoreTallyAcrossSeasons().catch(e => { console.warn('Failed to fetch weekly highs:', e); return {} as Record<string, number>; }),
    getSplitRecordsAllTime().catch(e => { console.warn('Failed to fetch split records:', e); return {} as Record<string, { teamName: string; regular: SplitRecord; playoffs: SplitRecord; toilet: SplitRecord }>; }),
    getTopScoringWeeksAllTime({ category: 'all', top: 2000 }).catch(e => { console.warn('Failed to fetch scoring history:', e); return [] as TopScoringWeekEntry[]; }),
    getHeadToHeadAllTime().catch(e => { console.warn('Failed to fetch H2H:', e); return { teams: [], matrix: {}, neverBeaten: [] } as H2HResult; }),
    fetchTradesAllTime().catch(e => { console.warn('Failed to fetch trades:', e); return [] as Trade[]; }),
  ]);

  console.log(`[DataIntegration] Fetched: ${franchises.length} franchises, ${allTrades.length} trades, ${allScoringWeeks.length} scored team-weeks`);

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
    const teamWeeks = allScoringWeeks.filter(w => w.teamName === teamName);
    const highestWeek = teamWeeks.reduce<TopScoringWeekEntry | null>((best, entry) => !best || entry.points > best.points ? entry : best, null);
    const lowestWeek = teamWeeks.reduce<TopScoringWeekEntry | null>((best, entry) => !best || entry.points < best.points ? entry : best, null);
    const streaks = calculateTeamStreaks(teamWeeks);
    
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
      longestWinStreak: streaks.longestWinStreak,
      longestLosingStreak: streaks.longestLosingStreak,
      currentStreak: streaks.currentStreak,
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

/**
 * Fetch current season/week context - standings, streaks, transactions, playoff implications
 * This provides the "right now" context that complements the all-time historical data
 */
export async function fetchCurrentWeekContext(
  leagueId: string,
  season: number,
  week: number
): Promise<CurrentWeekContext> {
  console.log(`[DataIntegration] Fetching current week context for Season ${season} Week ${week}...`);

  // Fetch last 4 completed weeks of matchup data for recent-form tracking
  const recentWeekNums = Array.from({ length: Math.min(4, week - 1) }, (_, i) => week - 1 - i).filter(w => w >= 1);

  // Fetch all data in parallel — current season + historical matchups for form
  const [teamsData, streaks, league, transactions, ...historicalMatchupsByWeek] = await Promise.all([
    getTeamsData(leagueId).catch(e => { console.warn('Failed to fetch teams data:', e); return [] as TeamData[]; }),
    getCurrentStreaksForLeague(leagueId).catch(e => { console.warn('Failed to fetch streaks:', e); return {} as Record<number, { type: 'W' | 'L' | 'T' | null; length: number }>; }),
    getLeague(leagueId).catch(e => { console.warn('Failed to fetch league:', e); return null; }),
    getLeagueTransactions(leagueId, week).catch(e => { console.warn('Failed to fetch transactions:', e); return [] as SleeperTransaction[]; }),
    ...recentWeekNums.map(w => getLeagueMatchups(leagueId, w).catch(() => [] as SleeperMatchup[])),
  ]);

  // Get league settings
  const playoffStartWeek = Number(league?.settings?.playoff_week_start) || 15;
  const playoffTeams = Number(league?.settings?.playoff_teams) || 8;

  // Sort teams by wins (then points for as tiebreaker)
  const sortedTeams = [...teamsData].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.fpts - a.fpts;
  });

  // Build recent results (last 4 weeks) per team from historical matchup data
  const rosterToTeamName = new Map<number, string>(sortedTeams.map(t => [t.rosterId, t.teamName]));
  const teamRecentResults = new Map<string, CurrentSeasonTeamData['recentResults']>();

  for (let i = 0; i < recentWeekNums.length; i++) {
    const wk = recentWeekNums[i];
    const matchups = historicalMatchupsByWeek[i] as SleeperMatchup[];
    const groups = new Map<number, Array<{ name: string; points: number }>>();
    for (const m of matchups) {
      if (m.matchup_id == null) continue;
      const name = rosterToTeamName.get(m.roster_id) ?? `Roster ${m.roster_id}`;
      const pts = Number(m.points ?? 0);
      const grp = groups.get(m.matchup_id) ?? [];
      grp.push({ name, points: pts });
      groups.set(m.matchup_id, grp);
    }
    for (const [, grp] of groups) {
      if (grp.length < 2) continue;
      const [a, b] = grp;
      const aWin = a.points > b.points;
      const bWin = b.points > a.points;
      const aRes: 'W' | 'L' | 'T' = aWin ? 'W' : bWin ? 'L' : 'T';
      const bRes: 'W' | 'L' | 'T' = bWin ? 'W' : aWin ? 'L' : 'T';
      if (!teamRecentResults.has(a.name)) teamRecentResults.set(a.name, []);
      if (!teamRecentResults.has(b.name)) teamRecentResults.set(b.name, []);
      teamRecentResults.get(a.name)!.push({ week: wk, result: aRes, points: a.points, opponentPoints: b.points, opponent: b.name });
      teamRecentResults.get(b.name)!.push({ week: wk, result: bRes, points: b.points, opponentPoints: a.points, opponent: a.name });
    }
  }

  // Calculate playoff implications
  const weeksRemaining = Math.max(0, playoffStartWeek - 1 - week);
  const playoffImplications: PlayoffImplications = {
    clinched: [],
    inPlayoffPosition: [],
    onBubble: [],
    eliminated: [],
    magicNumbers: {},
  };

  // Build current season team data with playoff position
  const standings: CurrentSeasonTeamData[] = sortedTeams.map((team, idx) => {
    const position = idx + 1;
    let playoffPosition: CurrentSeasonTeamData['playoffPosition'] = 'out';
    
    if (week >= playoffStartWeek) {
      // Playoffs have started
      playoffPosition = position <= playoffTeams ? 'in' : 'eliminated';
    } else {
      // Regular season
      if (position <= playoffTeams - 2) {
        playoffPosition = 'in';
        playoffImplications.inPlayoffPosition.push(team.teamName);
      } else if (position <= playoffTeams) {
        playoffPosition = 'bubble';
        playoffImplications.onBubble.push(team.teamName);
      } else if (position <= playoffTeams + 2) {
        playoffPosition = 'bubble';
        playoffImplications.onBubble.push(team.teamName);
      } else {
        playoffPosition = 'out';
      }
      
      // Check if mathematically eliminated (simplified)
      const maxPossibleWins = team.wins + weeksRemaining;
      const teamsAhead = sortedTeams.filter(t => t.wins > maxPossibleWins).length;
      if (teamsAhead >= playoffTeams) {
        playoffPosition = 'eliminated';
        playoffImplications.eliminated.push(team.teamName);
      }
    }

    const streak = streaks[team.rosterId] || { type: null, length: 0 };

    return {
      teamName: team.teamName,
      rosterId: team.rosterId,
      ownerId: team.ownerId,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties || 0,
      pointsFor: team.fpts,
      pointsAgainst: team.fptsAgainst,
      standingsPosition: position,
      playoffPosition,
      streak,
      recentResults: teamRecentResults.get(team.teamName) ?? [],
    };
  });

  // Process transactions into readable format
  const recentTransactions: RecentTransaction[] = transactions
    .filter(t => t.type === 'waiver' || t.type === 'free_agent')
    .slice(0, 20)
    .map(t => {
      const teamName = sortedTeams.find(team => team.rosterId === t.roster_ids?.[0])?.teamName || 'Unknown';
      const faabBid = t.settings?.waiver_bid;
      return {
        type: t.type as 'waiver' | 'free_agent',
        teamName,
        week,
        adds: Object.keys(t.adds || {}).map(pid => ({ playerName: resolvePlayerName(pid), playerId: pid })),
        drops: Object.keys(t.drops || {}).map(pid => ({ playerName: resolvePlayerName(pid), playerId: pid })),
        faabSpent: typeof faabBid === 'number' ? faabBid : undefined,
      };
    });

  console.log(`[DataIntegration] Current week context: ${standings.length} teams, ${recentTransactions.length} transactions`);

  return {
    season,
    week,
    standings,
    recentTransactions,
    playoffImplications,
    playoffStartWeek,
    playoffTeams,
  };
}

/**
 * Build a context string for current season standings
 */
export function buildCurrentStandingsContext(context: CurrentWeekContext): string {
  const lines: string[] = [];
  
  lines.push(`=== CURRENT SEASON STANDINGS (Week ${context.week}) ===`);
  lines.push('');
  
  for (const team of context.standings) {
    const streakStr = team.streak.type ? ` (${team.streak.type}${team.streak.length})` : '';
    const positionEmoji = team.standingsPosition <= context.playoffTeams ? '✅' : '❌';
    const bubbleNote = team.playoffPosition === 'bubble' ? ' [BUBBLE]' :
                       team.playoffPosition === 'eliminated' ? ' [ELIMINATED]' : '';
    const formStr = team.recentResults.length > 0
      ? ' | Last ' + team.recentResults.length + ': ' + team.recentResults.map(r => r.result).join('-')
      : '';
    lines.push(`${team.standingsPosition}. ${positionEmoji} ${team.teamName}: ${team.wins}-${team.losses} (${team.pointsFor.toFixed(1)} PF)${streakStr}${bubbleNote}${formStr}`);
  }
  
  lines.push('');
  lines.push(`Playoff spots: Top ${context.playoffTeams} teams`);
  lines.push(`Playoffs start: Week ${context.playoffStartWeek}`);
  
  if (context.playoffImplications.onBubble.length > 0) {
    lines.push('');
    lines.push('🔥 PLAYOFF BUBBLE: ' + context.playoffImplications.onBubble.join(', '));
  }
  
  if (context.playoffImplications.eliminated.length > 0) {
    lines.push('💀 ELIMINATED: ' + context.playoffImplications.eliminated.join(', '));
  }
  
  return lines.join('\n');
}

/**
 * Build context string for recent transactions
 */
export function buildTransactionsContext(context: CurrentWeekContext): string {
  if (context.recentTransactions.length === 0) return '';
  
  const lines: string[] = [];
  lines.push('=== RECENT TRANSACTIONS ===');
  
  for (const txn of context.recentTransactions.slice(0, 10)) {
    const adds = txn.adds.map(a => a.playerName).join(', ');
    const drops = txn.drops.map(d => d.playerName).join(', ');
    const faab = txn.faabSpent ? ` ($${txn.faabSpent} FAAB)` : '';
    
    if (adds && drops) {
      lines.push(`- ${txn.teamName}: Added ${adds}, Dropped ${drops}${faab}`);
    } else if (adds) {
      lines.push(`- ${txn.teamName}: Added ${adds}${faab}`);
    } else if (drops) {
      lines.push(`- ${txn.teamName}: Dropped ${drops}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Get league rules as a context string for the bots
 */
export function getLeagueRulesContext(): string {
  const lines: string[] = [];
  lines.push('=== LEAGUE RULES (from Rulebook) ===');
  
  // Extract key rules from the HTML sections
  for (const section of rulesHtmlSections) {
    // Strip HTML tags and get plain text
    const plainText = section.html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (plainText.length > 0) {
      lines.push(`\n--- ${section.title} ---`);
      lines.push(plainText.slice(0, 500)); // Limit each section
    }
  }
  
  return lines.join('\n');
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
  
  // Championship History — derived from CHAMPIONS constant so it stays current
  lines.push('--- CHAMPIONSHIP HISTORY ---');
  const champYears = Object.entries(CHAMPIONS)
    .filter(([, c]) => c.champion !== 'TBD')
    .sort((a, b) => Number(b[0]) - Number(a[0])); // newest first
  for (const [yr, c] of champYears) {
    const runnerUpStr = c.runnerUp !== 'TBD' ? `, runner-up: ${c.runnerUp}` : '';
    const thirdStr = c.thirdPlace !== 'TBD' ? `, 3rd: ${c.thirdPlace}` : '';
    lines.push(`${yr}: ${c.champion} (Champion)${runnerUpStr}${thirdStr}`);
  }
  const uniqueChamps = new Set(champYears.map(([, c]) => c.champion));
  lines.push(`${uniqueChamps.size} different champion${uniqueChamps.size === 1 ? '' : 's'} in ${champYears.length} year${champYears.length === 1 ? '' : 's'}`);
  lines.push('');
  
  return lines.join('\n');
}

export interface DynastyRankingsEntry {
  name: string;
  pos: string;
  nfl: string;
  rank: number;
}

/**
 * Load dynasty rankings — prefers stored R2 data (set via /admin/refresh-dynasty-rankings),
 * falls back to a live FantasyCalc fetch if R2 is empty. Returns [] on total failure.
 *
 * Callers should store the result in the staged job and reuse it — don't call this per-step.
 */
export async function loadDynastyRankings(): Promise<DynastyRankingsEntry[]> {
  // Try R2 first
  try {
    const { getObjectText } = await import('@/server/storage/r2');
    const raw = await getObjectText({ key: 'newsletter/dynasty-rankings.json' });
    if (raw) {
      const stored = JSON.parse(raw) as { rankings?: DynastyRankingsEntry[] };
      if (Array.isArray(stored.rankings) && stored.rankings.length > 0) {
        console.log(`[Dynasty] Loaded ${stored.rankings.length} rankings from R2`);
        return stored.rankings;
      }
    }
  } catch (e) {
    console.warn('[Dynasty] R2 read failed, trying live fetch:', e instanceof Error ? e.message : e);
  }

  // Fallback: live FantasyCalc fetch
  try {
    const res = await fetch(
      'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&ppr=0.5',
      { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } },
    );
    if (!res.ok) return [];
    const data = await res.json() as Array<{
      player?: { name?: string; position?: string; nflTeamAbbreviation?: string };
    }>;
    if (!Array.isArray(data)) return [];
    const rankings = data
      .map((entry, i) => ({
        name: entry.player?.name ?? '',
        pos:  entry.player?.position ?? 'UNK',
        nfl:  entry.player?.nflTeamAbbreviation ?? '',
        rank: i + 1,
      }))
      .filter(r => r.name);
    console.log(`[Dynasty] Loaded ${rankings.length} rankings from live FC (no R2 data — run /admin/refresh-dynasty-rankings)`);
    return rankings;
  } catch {
    return [];
  }
}

/**
 * Build a compact top-50 overview context string from stored dynasty rankings.
 * Used as a general "bot awareness" block — not a per-player lookup.
 */
export function buildDynastyOverviewContext(rankings: DynastyRankingsEntry[]): string {
  if (rankings.length === 0) return '';
  const lines = rankings.slice(0, 50).map(r =>
    `${r.rank}. ${r.name} (${r.pos}${r.nfl ? ', ' + r.nfl : ''})`
  );
  return `=== TOP 50 DYNASTY ASSETS (FantasyCalc 2QB/SF) ===\nRank 1 = most valuable. Use these ranks when discussing trade value, waiver stashes, and player upside.\n${lines.join('\n')}\n`;
}

/**
 * Build a name→rank lookup map from stored dynasty rankings for per-player annotation.
 * Returns two maps for O(1) lookup: exact full name and last name (for fuzzy matching).
 */
export function buildDynastyLookup(rankings: DynastyRankingsEntry[]): {
  byFullName: Map<string, number>;
  byLastName: Map<string, number>;
} {
  const byFullName = new Map<string, number>();
  const byLastName = new Map<string, number>();
  for (const r of rankings) {
    const full = r.name.toLowerCase().trim();
    byFullName.set(full, r.rank);
    const last = full.split(' ').pop() ?? '';
    if (last.length >= 4 && !byLastName.has(last)) byLastName.set(last, r.rank);
  }
  return { byFullName, byLastName };
}

/** Look up a player's dynasty rank by name. Returns null if not found. */
export function lookupDynastyRank(
  name: string,
  lookup: { byFullName: Map<string, number>; byLastName: Map<string, number> },
): number | null {
  const lower = name.toLowerCase().trim();
  if (lookup.byFullName.has(lower)) return lookup.byFullName.get(lower)!;
  const last = lower.split(' ').pop() ?? '';
  if (last.length >= 4 && lookup.byLastName.has(last)) return lookup.byLastName.get(last)!;
  return null;
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

// ============ Additional Data Source Connections ============

/**
 * Build context for team matchup history (recent results)
 */
export function buildTeamMatchupHistoryContext(
  teamName: string,
  results: Array<{ week: number; result: 'W' | 'L' | 'T'; points: number; opponentPoints: number; opponent: string }>
): string {
  if (results.length === 0) return '';
  
  const lines: string[] = [];
  lines.push(`=== ${teamName} RECENT RESULTS ===`);
  
  for (const r of results.slice(0, 5)) {
    const emoji = r.result === 'W' ? '✅' : r.result === 'L' ? '❌' : '➖';
    lines.push(`Week ${r.week}: ${emoji} ${r.result} vs ${r.opponent} (${r.points.toFixed(1)} - ${r.opponentPoints.toFixed(1)})`);
  }
  
  const wins = results.filter(r => r.result === 'W').length;
  const losses = results.filter(r => r.result === 'L').length;
  lines.push(`Last ${results.length} games: ${wins}-${losses}`);
  
  return lines.join('\n');
}

/**
 * Build context for draft history (who drafted whom)
 */
export function buildDraftHistoryContext(
  draftPicks: Array<{
    round: number;
    pick: number;
    teamName: string;
    playerName: string;
    position: string;
    season: string;
  }>
): string {
  if (draftPicks.length === 0) return '';
  
  const lines: string[] = [];
  lines.push('=== RECENT DRAFT PICKS ===');
  
  const bySeason = new Map<string, typeof draftPicks>();
  for (const pick of draftPicks) {
    if (!bySeason.has(pick.season)) bySeason.set(pick.season, []);
    bySeason.get(pick.season)!.push(pick);
  }
  
  for (const [season, picks] of Array.from(bySeason.entries()).slice(0, 2)) {
    lines.push(`\n--- ${season} Draft ---`);
    for (const pick of picks.slice(0, 12)) {
      lines.push(`${pick.round}.${String(pick.pick).padStart(2, '0')}: ${pick.teamName} - ${pick.playerName} (${pick.position})`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Build context for trade block (players being shopped)
 */
export function buildTradeBlockContext(
  tradeBlock: Array<{
    teamName: string;
    playerName: string;
    position: string;
  }>
): string {
  if (tradeBlock.length === 0) return '';
  
  const lines: string[] = [];
  lines.push('=== TRADE BLOCK ===');
  lines.push('Players currently being shopped:');
  
  const byTeam = new Map<string, string[]>();
  for (const item of tradeBlock) {
    if (!byTeam.has(item.teamName)) byTeam.set(item.teamName, []);
    byTeam.get(item.teamName)!.push(`${item.playerName} (${item.position})`);
  }
  
  for (const [team, players] of byTeam) {
    lines.push(`- ${team}: ${players.join(', ')}`);
  }
  
  return lines.join('\n');
}

/**
 * Build context for taxi squad moves
 */
export function buildTaxiSquadContext(
  taxiMoves: Array<{
    teamName: string;
    playerName: string;
    action: 'promoted' | 'added';
    week: number;
  }>
): string {
  if (taxiMoves.length === 0) return '';
  
  const lines: string[] = [];
  lines.push('=== TAXI SQUAD ACTIVITY ===');
  
  for (const move of taxiMoves.slice(0, 10)) {
    const actionStr = move.action === 'promoted' ? 'called up from taxi' : 'added to taxi';
    lines.push(`- ${move.teamName} ${actionStr} ${move.playerName} (Week ${move.week})`);
  }
  
  return lines.join('\n');
}

/**
 * Build context for roster news (injuries, breaking news)
 */
export function buildRosterNewsContext(
  news: Array<{
    playerName: string;
    teamName: string;
    headline: string;
  }>
): string {
  if (news.length === 0) return '';
  
  const lines: string[] = [];
  lines.push('=== ROSTER NEWS ===');
  
  for (const item of news.slice(0, 10)) {
    lines.push(`- ${item.playerName} (${item.teamName}): ${item.headline}`);
  }
  
  return lines.join('\n');
}

/**
 * Build context for defense strength (matchup analysis)
 */
export function buildDefenseStrengthContext(
  defenseRankings: Array<{
    nflTeam: string;
    vsQB: number;
    vsRB: number;
    vsWR: number;
    vsTE: number;
  }>
): string {
  if (defenseRankings.length === 0) return '';
  
  const lines: string[] = [];
  lines.push('=== NFL DEFENSE RANKINGS ===');
  
  const sortedVsQB = [...defenseRankings].sort((a, b) => a.vsQB - b.vsQB);
  const sortedVsRB = [...defenseRankings].sort((a, b) => a.vsRB - b.vsRB);
  const sortedVsWR = [...defenseRankings].sort((a, b) => a.vsWR - b.vsWR);
  
  lines.push('Toughest vs QB: ' + sortedVsQB.slice(0, 5).map(d => d.nflTeam).join(', '));
  lines.push('Toughest vs RB: ' + sortedVsRB.slice(0, 5).map(d => d.nflTeam).join(', '));
  lines.push('Toughest vs WR: ' + sortedVsWR.slice(0, 5).map(d => d.nflTeam).join(', '));
  
  return lines.join('\n');
}

/**
 * Build context for player game logs (performance trends)
 */
export function buildPlayerGameLogsContext(
  playerLogs: Array<{
    playerName: string;
    position: string;
    teamName: string;
    recentWeeks: Array<{ week: number; points: number }>;
  }>
): string {
  if (playerLogs.length === 0) return '';
  
  const lines: string[] = [];
  lines.push('=== TOP PERFORMER TRENDS ===');
  
  for (const player of playerLogs.slice(0, 15)) {
    const recent = player.recentWeeks.slice(0, 5);
    const avg = recent.reduce((sum, w) => sum + w.points, 0) / recent.length;
    const trend = recent.length >= 3 
      ? (recent[0].points > recent[2].points ? '📈' : recent[0].points < recent[2].points ? '📉' : '➡️')
      : '';
    
    const weekScores = recent.map(w => w.points.toFixed(1)).join(', ');
    lines.push(`- ${player.playerName} (${player.position}, ${player.teamName}): ${trend} [${weekScores}] Avg: ${avg.toFixed(1)}`);
  }
  
  return lines.join('\n');
}

// ============ EXTERNAL API INTEGRATION ============
// Free APIs for enhanced knowledge: ESPN, Sleeper trending, etc.

export interface ExternalNewsItem {
  source: string;
  headline: string;
  playerName?: string;
  nflTeam?: string;
  category: 'injury' | 'news' | 'transaction' | 'projection' | 'analysis';
  timestamp?: string;
  url?: string;
}

export interface ExternalInjuryReport {
  playerName: string;
  nflTeam: string;
  position: string;
  status: string; // 'Out', 'Doubtful', 'Questionable', 'Probable', 'IR'
  injury: string;
  lastUpdate?: string;
}

export interface ExternalProjection {
  playerName: string;
  position: string;
  nflTeam: string;
  projectedPoints: number;
  rank: number;
  notes?: string;
}

export interface TrendingPlayer {
  playerId: string;
  playerName: string;
  position: string;
  nflTeam: string;
  addCount: number;
  dropCount: number;
  trend: 'rising' | 'falling' | 'stable';
}

export interface ExternalDataBundle {
  news: ExternalNewsItem[];
  injuries: ExternalInjuryReport[];
  projections: ExternalProjection[];
  trending: TrendingPlayer[];
  fetchedAt: string;
}

// ============ Simple TTL Cache (in-memory) ============

const __ttlCache = new Map<string, { expires: number; value: unknown }>();

function makeCacheKey(parts: Array<string | number | boolean | undefined | null>): string {
  return parts.map((p) => (p === undefined || p === null ? '' : String(p))).join('|');
}

async function withTTL<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = __ttlCache.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const val = await fn();
  __ttlCache.set(key, { expires: now + ttlMs, value: val });
  return val;
}

/**
 * Fetch trending players from Sleeper (free, no auth required)
 * This shows who's being added/dropped across all Sleeper leagues
 */
export async function fetchSleeperTrending(sport: string = 'nfl', type: 'add' | 'drop' = 'add', lookbackHours: number = 24): Promise<TrendingPlayer[]> {
  try {
    const key = makeCacheKey(['sleeper-trending', sport, type, lookbackHours]);
    return await withTTL<TrendingPlayer[]>(key, 60 * 60 * 1000, async () => {
      const url = `https://api.sleeper.app/v1/players/${sport}/trending/${type}?lookback_hours=${lookbackHours}&limit=25`;
      const res = await fetch(url, { next: { revalidate: 3600 } }); // Cache for 1 hour
      if (!res.ok) throw new Error(`Sleeper trending API error: ${res.status}`);
      const data = await res.json() as Array<{ player_id: string; count: number }>;
      // Get player details from Sleeper
      const playersRes = await fetch('https://api.sleeper.app/v1/players/nfl', { next: { revalidate: 86400 } });
      const players = await playersRes.json() as Record<string, { full_name?: string; position?: string; team?: string }>;
      return data.map(item => {
        const player = players[item.player_id] || {};
        return {
          playerId: item.player_id,
          playerName: player.full_name || `Player ${item.player_id}`,
          position: player.position || 'Unknown',
          nflTeam: player.team || 'FA',
          addCount: type === 'add' ? item.count : 0,
          dropCount: type === 'drop' ? item.count : 0,
          trend: type === 'add' ? 'rising' : 'falling',
        };
      });
    });
  } catch (error) {
    console.warn('[ExternalAPI] Failed to fetch Sleeper trending:', error);
    return [];
  }
}

/**
 * Fetch injury data from ESPN's public API (unofficial, no auth required)
 * Note: This is unofficial and may change without notice
 */
export async function fetchESPNInjuries(): Promise<ExternalInjuryReport[]> {
  try {
    return await withTTL<ExternalInjuryReport[]>('espn-injuries', 60 * 60 * 1000, async () => {
      // ESPN's public injuries endpoint
      const url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';
      const res = await fetch(url, { next: { revalidate: 3600 } }); // Cache for 1 hour
      if (!res.ok) throw new Error(`ESPN injuries API error: ${res.status}`);
      const data = await res.json();
      const injuries: ExternalInjuryReport[] = [];
      // Parse ESPN's injury format
      if (data.injuries && Array.isArray(data.injuries)) {
        for (const teamInjuries of data.injuries) {
          // teamName available if needed: teamInjuries.team?.displayName
          const teamAbbrev = teamInjuries.team?.abbreviation || 'UNK';
          if (teamInjuries.injuries && Array.isArray(teamInjuries.injuries)) {
            for (const injury of teamInjuries.injuries) {
              injuries.push({
                playerName: injury.athlete?.displayName || 'Unknown Player',
                nflTeam: teamAbbrev,
                position: injury.athlete?.position?.abbreviation || 'UNK',
                status: injury.status || 'Unknown',
                injury: injury.type?.description || injury.details?.type || 'Unknown injury',
                lastUpdate: injury.date || undefined,
              });
            }
          }
        }
      }
      console.log(`[ExternalAPI] Fetched ${injuries.length} injuries from ESPN`);
      return injuries;
    });
  } catch (error) {
    console.warn('[ExternalAPI] Failed to fetch ESPN injuries:', error);
    return [];
  }
}

/**
 * Fetch NFL news from ESPN's public API
 */
export async function fetchESPNNews(): Promise<ExternalNewsItem[]> {
  try {
    const url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=25';
    const res = await fetch(url, { next: { revalidate: 1800 } }); // Cache for 30 min
    if (!res.ok) throw new Error(`ESPN news API error: ${res.status}`);
    
    const data = await res.json();
    const news: ExternalNewsItem[] = [];
    
    if (data.articles && Array.isArray(data.articles)) {
      for (const article of data.articles) {
        news.push({
          source: 'ESPN',
          headline: article.headline || article.title || '',
          category: categorizeNews(article.headline || ''),
          timestamp: article.published || undefined,
          url: article.links?.web?.href || undefined,
        });
      }
    }
    
    console.log(`[ExternalAPI] Fetched ${news.length} news items from ESPN`);
    return news;
  } catch (error) {
    console.warn('[ExternalAPI] Failed to fetch ESPN news:', error);
    return [];
  }
}

/**
 * Fetch NFL scoreboard/schedule from ESPN (for upcoming matchups context)
 */
export async function fetchESPNScoreboard(): Promise<Array<{ homeTeam: string; awayTeam: string; date: string; status: string }>> {
  try {
    const url = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`ESPN scoreboard API error: ${res.status}`);
    
    const data = await res.json();
    const games: Array<{ homeTeam: string; awayTeam: string; date: string; status: string }> = [];
    
    if (data.events && Array.isArray(data.events)) {
      for (const event of data.events) {
        const competition = event.competitions?.[0];
        if (competition) {
          const homeTeam = competition.competitors?.find((c: { homeAway: string }) => c.homeAway === 'home');
          const awayTeam = competition.competitors?.find((c: { homeAway: string }) => c.homeAway === 'away');
          
          games.push({
            homeTeam: homeTeam?.team?.abbreviation || 'UNK',
            awayTeam: awayTeam?.team?.abbreviation || 'UNK',
            date: event.date || '',
            status: competition.status?.type?.description || 'Unknown',
          });
        }
      }
    }
    
    console.log(`[ExternalAPI] Fetched ${games.length} games from ESPN scoreboard`);
    return games;
  } catch (error) {
    console.warn('[ExternalAPI] Failed to fetch ESPN scoreboard:', error);
    return [];
  }
}

/**
 * Helper to categorize news headlines
 */
function categorizeNews(headline: string): ExternalNewsItem['category'] {
  const lower = headline.toLowerCase();
  if (lower.includes('injur') || lower.includes('out') || lower.includes('questionable') || lower.includes('doubtful')) {
    return 'injury';
  }
  if (lower.includes('trade') || lower.includes('sign') || lower.includes('release') || lower.includes('waive')) {
    return 'transaction';
  }
  if (lower.includes('project') || lower.includes('expect') || lower.includes('predict') || lower.includes('rank')) {
    return 'projection';
  }
  if (lower.includes('analysis') || lower.includes('breakdown') || lower.includes('scout')) {
    return 'analysis';
  }
  return 'news';
}

/**
 * Fetch all external data in parallel
 * This is the main entry point for getting enhanced external context
 */
export async function fetchAllExternalData(): Promise<ExternalDataBundle> {
  console.log('[ExternalAPI] Fetching all external data sources...');
  
  const [
    trendingAdds,
    trendingDrops,
    injuries,
    news,
  ] = await Promise.all([
    fetchSleeperTrending('nfl', 'add', 24),
    fetchSleeperTrending('nfl', 'drop', 24),
    fetchESPNInjuries(),
    fetchESPNNews(),
  ]);
  
  // Merge trending adds and drops
  const trendingMap = new Map<string, TrendingPlayer>();
  for (const player of trendingAdds) {
    trendingMap.set(player.playerId, player);
  }
  for (const player of trendingDrops) {
    const existing = trendingMap.get(player.playerId);
    if (existing) {
      existing.dropCount = player.dropCount;
      existing.trend = existing.addCount > player.dropCount ? 'rising' : 
                       existing.addCount < player.dropCount ? 'falling' : 'stable';
    } else {
      trendingMap.set(player.playerId, player);
    }
  }
  
  const result: ExternalDataBundle = {
    news,
    injuries,
    projections: [], // Could add FantasyPros or similar in future
    trending: Array.from(trendingMap.values()),
    fetchedAt: new Date().toISOString(),
  };
  
  console.log(`[ExternalAPI] Fetched: ${news.length} news, ${injuries.length} injuries, ${result.trending.length} trending players`);
  return result;
}

/**
 * Build context string from external data for LLM prompts.
 * Pass rosterPlayerNames (lowercase full names + last names) to scope injuries
 * to only players on this league's rosters.
 */
export function buildExternalDataContext(
  data: ExternalDataBundle,
  rosterPlayerNames?: { full: Set<string>; last: Set<string> },
): string {
  const lines: string[] = [];
  const now = Date.now();
  const recentNews = data.news.filter(item => {
    if (item.category === 'projection' || item.category === 'analysis') return false;
    const ts = item.timestamp ? Date.parse(item.timestamp) : NaN;
    if (!Number.isFinite(ts)) return false;
    const ageMs = now - ts;
    return ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000;
  });
  
  // Trending players section
  if (data.trending.length > 0) {
    lines.push('=== TRENDING PLAYERS (ACROSS ALL SLEEPER LEAGUES) ===');
    const rising = data.trending.filter(p => p.trend === 'rising').slice(0, 10);
    const falling = data.trending.filter(p => p.trend === 'falling').slice(0, 10);
    
    if (rising.length > 0) {
      lines.push('🔥 HOT PICKUPS:');
      for (const p of rising) {
        lines.push(`  - ${p.playerName} (${p.position}, ${p.nflTeam}): +${p.addCount} adds in 24h`);
      }
    }
    if (falling.length > 0) {
      lines.push('❄️ BEING DROPPED:');
      for (const p of falling) {
        lines.push(`  - ${p.playerName} (${p.position}, ${p.nflTeam}): -${p.dropCount} drops in 24h`);
      }
    }
    lines.push('');
  }
  
  // Injury report section — scoped to league roster players when rosterPlayerNames provided
  const relevantInjuries = rosterPlayerNames
    ? data.injuries.filter(inj => {
        const name = inj.playerName.toLowerCase().trim();
        if (rosterPlayerNames.full.has(name)) return true;
        const last = name.split(' ').pop() ?? '';
        return last.length >= 4 && rosterPlayerNames.last.has(last);
      })
    : data.injuries;
  if (relevantInjuries.length > 0) {
    lines.push(rosterPlayerNames ? '=== EXTERNAL INJURY REPORT (roster players) ===' : '=== NFL INJURY REPORT ===');
    const byStatus = {
      out: relevantInjuries.filter(i => i.status.toLowerCase() === 'out'),
      doubtful: relevantInjuries.filter(i => i.status.toLowerCase() === 'doubtful'),
      questionable: relevantInjuries.filter(i => i.status.toLowerCase() === 'questionable'),
    };
    
    if (byStatus.out.length > 0) {
      lines.push('OUT:');
      for (const i of byStatus.out.slice(0, 15)) {
        lines.push(`  - ${i.playerName} (${i.position}, ${i.nflTeam}): ${i.injury}`);
      }
    }
    if (byStatus.doubtful.length > 0) {
      lines.push('DOUBTFUL:');
      for (const i of byStatus.doubtful.slice(0, 10)) {
        lines.push(`  - ${i.playerName} (${i.position}, ${i.nflTeam}): ${i.injury}`);
      }
    }
    if (byStatus.questionable.length > 0) {
      lines.push('QUESTIONABLE:');
      for (const i of byStatus.questionable.slice(0, 10)) {
        lines.push(`  - ${i.playerName} (${i.position}, ${i.nflTeam}): ${i.injury}`);
      }
    }
    lines.push('');
  }
  
  // News section
  if (recentNews.length > 0) {
    lines.push('=== LATEST NFL NEWS (fresh factual items from last 7 days) ===');
    for (const item of recentNews.slice(0, 10)) {
      const emoji = item.category === 'injury' ? '🏥' :
                    item.category === 'transaction' ? '📝' :
                    item.category === 'projection' ? '📊' : '📰';
      lines.push(`${emoji} ${item.headline}`);
    }
  }
  
  return lines.join('\n');
}
