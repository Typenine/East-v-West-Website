/**
 * Newsletter API Route
 * Handles newsletter generation and retrieval with database persistence
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getLeagueIdForSeason } from '@/lib/constants/league';
import { getConfiguredAdminSecret, isAdminCookieValue } from '@/lib/auth/admin';
import { 
  generateNewsletter,
  buildH2HContext,
  buildTradeContext,
  calculatePlayoffImplications,
  checkForRecords,
  buildEnhancedContextString,
  fetchComprehensiveLeagueData,
  buildComprehensiveContextString,
  fetchCurrentWeekContext,
  buildCurrentStandingsContext,
  buildTransactionsContext,
  getLeagueRulesContext,
  setPlayerNameCache,
  scanForUnresolvedPlayerIds,
  fetchAllExternalData,
  buildExternalDataContext,
  type EnhancedContextData,
  type LeagueRecords,
} from '@/lib/newsletter';
import { getAllPlayersCached, getSleeperInjuriesCached } from '@/lib/utils/sleeper-api';
import {
  loadBotMemory,
  saveBotMemory,
  loadForecastRecords,
  saveForecastRecords,
  loadPendingPicks,
  savePendingPicks,
  loadNewsletter,
  saveNewsletter,
  listNewsletterWeeks,
  deleteNewsletter,
  loadPreviousNewsletter,
  extractPredictionsFromNewsletter,
  updateStagedNewsletter,
  loadRelationshipMemory,
  saveRelationshipMemory,
} from '@/server/db/newsletter-queries';
import { fetchNewsletterData } from '@/lib/newsletter';
import { getHeadToHeadAllTime } from '@/lib/utils/headtohead';
import { fetchTradesAllTime } from '@/lib/utils/trades';
import { postToDiscordWebhook, buildNewsletterEmbed } from '@/lib/utils/discord';
import { getDb } from '@/server/db/client';
import { discordNotifications } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============ Sleeper API Helpers ============

const SLEEPER_API = 'https://api.sleeper.app/v1';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  return res.json();
}

async function getSleeperState(): Promise<{ season: string; week: number; season_type: string }> {
  return fetchJson(`${SLEEPER_API}/state/nfl`);
}

async function getLeague(leagueId: string): Promise<{ name: string }> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}`);
}

async function getUsers(leagueId: string): Promise<Array<{
  user_id: string;
  display_name?: string;
  username?: string;
  metadata?: { team_name?: string };
}>> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}/users`);
}

async function getRosters(leagueId: string): Promise<Array<{
  roster_id: number;
  owner_id: string;
  players?: string[];
}>> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}/rosters`);
}

async function getMatchups(leagueId: string, week: number): Promise<Array<{
  roster_id: number;
  matchup_id: number | null;
  points?: number;
}>> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}/matchups/${week}`);
}

async function getTransactions(leagueId: string, week: number): Promise<Array<{
  transaction_id?: string;
  type: 'trade' | 'waiver' | 'free_agent';
  leg?: number;
  roster_ids?: number[];
  roster_id?: number;
  adds?: Record<string, number>;
  drops?: Record<string, number>;
  draft_picks?: unknown[];
  waiver_bid?: number;
}>> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}/transactions/${week}`);
}

// Extended roster type for standings
interface ExtendedRoster {
  roster_id: number;
  owner_id: string;
  players?: string[];
  settings?: {
    wins?: number;
    losses?: number;
    fpts?: number;
    fpts_decimal?: number;
  };
  metadata?: {
    division?: string;
  };
}

async function getExtendedRosters(leagueId: string): Promise<ExtendedRoster[]> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}/rosters`);
}

// NFL bye weeks by week number (2025 season - update annually)
const NFL_BYE_WEEKS: Record<number, string[]> = {
  5: ['DET', 'LAC'],
  6: ['KC', 'LAR', 'MIA', 'MIN'],
  7: ['CHI', 'DAL'],
  8: [],
  9: ['CLE', 'GB', 'LV', 'SEA'],
  10: ['ARI', 'CAR', 'NYG', 'TB'],
  11: ['ATL', 'IND', 'NE', 'NO'],
  12: ['BAL', 'CIN', 'JAX', 'NYJ'],
  13: ['BUF', 'PIT', 'SF', 'WAS'],
  14: ['DEN', 'HOU', 'PHI', 'TEN'],
};

function getByeTeamsForWeek(week: number): string[] {
  return NFL_BYE_WEEKS[week] || [];
}

// Build enhanced context for LLM - integrates all 8 improvements
async function buildEnhancedContextFull(
  leagueId: string,
  week: number,
  season: number,
  users: Array<{ user_id: string; display_name?: string; username?: string; metadata?: { team_name?: string } }>,
  matchups: Array<{ roster_id: number; matchup_id: number | null; points?: number }>,
): Promise<{
  standings?: Array<{ name: string; wins: number; losses: number; pointsFor: number }>;
  byeTeams?: string[];
  enhancedContextString?: string;
  // For LLM features
  h2hData?: Record<string, Record<string, { wins: number; losses: number }>>;
  injuries?: Array<{ playerId: string; playerName: string; team: string; status: string }>;
}> {
  try {
    const extendedRosters = await getExtendedRosters(leagueId);
    
    // Build user map (roster_id -> team name)
    const userMap = new Map<string, string>();
    const rosterToTeam = new Map<number, string>();
    for (const u of users) {
      const name = u.metadata?.team_name || u.display_name || u.username || `User ${u.user_id}`;
      userMap.set(u.user_id, name);
    }
    for (const r of extendedRosters) {
      const name = userMap.get(r.owner_id) || `Roster ${r.roster_id}`;
      rosterToTeam.set(r.roster_id, name);
    }

    // Build standings (no divisions in this league)
    const standings = extendedRosters.map(r => {
      const name = userMap.get(r.owner_id) || `Roster ${r.roster_id}`;
      const wins = r.settings?.wins || 0;
      const losses = r.settings?.losses || 0;
      const fpts = (r.settings?.fpts || 0) + (r.settings?.fpts_decimal || 0) / 100;
      return { name, wins, losses, pointsFor: fpts };
    });

    const byeTeams = getByeTeamsForWeek(week);

    // ============ IMPROVEMENT 2: H2H Data Integration ============
    let h2hContext: { notableH2H: string[] } = { notableH2H: [] };
    const h2hDataSimplified: Record<string, Record<string, { wins: number; losses: number }>> = {};
    try {
      const h2hData = await getHeadToHeadAllTime();
      // Build this week's matchups for H2H lookup
      const matchupPairs: Array<{ team1: string; team2: string }> = [];
      const matchupGroups = new Map<number, string[]>();
      for (const m of matchups) {
        if (m.matchup_id === null) continue;
        const team = rosterToTeam.get(m.roster_id) || `Roster ${m.roster_id}`;
        const group = matchupGroups.get(m.matchup_id) || [];
        group.push(team);
        matchupGroups.set(m.matchup_id, group);
      }
      for (const [, teams] of matchupGroups) {
        if (teams.length === 2) {
          matchupPairs.push({ team1: teams[0], team2: teams[1] });
        }
      }
      
      // Convert H2H data format
      const h2hFormatted: Record<string, Record<string, { meetings: number; wins: { total: number; playoffs: number }; losses: { total: number }; lastMeeting?: { year: string; week: number } }>> = {};
      for (const team1 of h2hData.teams) {
        h2hFormatted[team1] = {};
        h2hDataSimplified[team1] = {};
        for (const team2 of h2hData.teams) {
          if (team1 === team2) continue;
          const cell = h2hData.matrix[team1]?.[team2];
          if (cell) {
            h2hFormatted[team1][team2] = {
              meetings: cell.meetings,
              wins: { total: cell.wins.total, playoffs: cell.wins.playoffs },
              losses: { total: cell.losses.total },
              lastMeeting: cell.lastMeeting,
            };
            // Simplified format for LLM features
            h2hDataSimplified[team1][team2] = {
              wins: cell.wins.total,
              losses: cell.losses.total,
            };
          }
        }
      }
      h2hContext = buildH2HContext(h2hFormatted, matchupPairs);
    } catch (e) {
      console.warn('Failed to fetch H2H data:', e);
    }

    // ============ IMPROVEMENT 3: Trade History Context ============
    let tradeContext: ReturnType<typeof buildTradeContext> = {
      recentTrades: [],
      buyerTeams: [],
      sellerTeams: [],
      mostActiveTrader: null,
      biggestTrade: null,
    };
    try {
      const allTrades = await fetchTradesAllTime();
      // Filter to current season and format for buildTradeContext
      const seasonTrades = allTrades
        .filter(t => t.date && new Date(t.date).getFullYear() === season)
        .map(t => ({
          id: t.id,
          date: t.date,
          week: t.week ?? undefined,
          teams: t.teams.map(tm => ({
            name: tm.name,
            assets: { gets: tm.assets.map(a => a.name), gives: [] as string[] },
          })),
        }));
      tradeContext = buildTradeContext(seasonTrades, week);
    } catch (e) {
      console.warn('Failed to fetch trade data:', e);
    }

    // ============ IMPROVEMENT 4: Weekly High Scores / Records ============
    let recordsContext: LeagueRecords = {
      highestWeeklyScore: null,
      lowestWinningScore: null,
      biggestBlowout: null,
      closestGame: null,
      longestWinStreak: null,
      currentWeekNotable: [],
    };
    try {
      // Build this week's results for record checking
      const thisWeekResults: Array<{ team: string; points: number; opponent: string; opponentPoints: number }> = [];
      const matchupGroups = new Map<number, Array<{ team: string; points: number }>>();
      for (const m of matchups) {
        if (m.matchup_id === null) continue;
        const team = rosterToTeam.get(m.roster_id) || `Roster ${m.roster_id}`;
        const group = matchupGroups.get(m.matchup_id) || [];
        group.push({ team, points: m.points || 0 });
        matchupGroups.set(m.matchup_id, group);
      }
      for (const [, teams] of matchupGroups) {
        if (teams.length === 2) {
          thisWeekResults.push({
            team: teams[0].team,
            points: teams[0].points,
            opponent: teams[1].team,
            opponentPoints: teams[1].points,
          });
        }
      }
      const { updatedRecords } = checkForRecords(thisWeekResults, recordsContext, week, season);
      recordsContext = updatedRecords;
    } catch (e) {
      console.warn('Failed to check records:', e);
    }

    // ============ IMPROVEMENT 5: Playoff Implications ============
    let playoffImplications: ReturnType<typeof calculatePlayoffImplications> = null;
    try {
      // Convert standings format for playoff implications (name -> team)
      const standingsForPlayoffs = standings.map(s => ({ team: s.name, wins: s.wins, losses: s.losses, pointsFor: s.pointsFor }));
      playoffImplications = calculatePlayoffImplications(standingsForPlayoffs, week, 6, 14);
    } catch (e) {
      console.warn('Failed to calculate playoff implications:', e);
    }

    // ============ Build the enhanced context string ============
    const enhancedData: EnhancedContextData = {
      week,
      season,
      entertainerMemory: null, // Will be loaded separately
      analystMemory: null,
      h2hForThisWeek: [],
      notableH2H: h2hContext.notableH2H,
      tradeContext,
      leagueRecords: recordsContext,
      playoffImplications,
      activeDisagreements: [],
      recentResolutions: [],
      predictionRecords: {
        entertainer: { correct: 0, wrong: 0, rate: 0 },
        analyst: { correct: 0, wrong: 0, rate: 0 },
      },
      breakoutPerformances: [], // Would need player stats
      injuryImpacts: [],
      predictionsToGrade: [],
      hotTakesToRevisit: [],
    };

    const enhancedContextString = buildEnhancedContextString(enhancedData);

    return { standings, byeTeams, enhancedContextString, h2hData: h2hDataSimplified };
  } catch (error) {
    console.error('Failed to build enhanced context:', error);
    return {};
  }
}

// ============ Build Historical Context for Preseason ============

async function buildPreseasonHistoricalContext(
  currentSeason: number,
  users: Array<{ user_id: string; display_name?: string; username?: string; metadata?: { team_name?: string } }>
): Promise<string> {
  try {
    // Build user map for team names
    const userMap = new Map<string, string>();
    for (const u of users) {
      const name = u.metadata?.team_name || u.display_name || u.username || `User ${u.user_id}`;
      userMap.set(u.user_id, name);
    }

    // Fetch all-time H2H data (includes all previous seasons)
    const h2hData = await getHeadToHeadAllTime();
    
    // Fetch all-time trade history
    const allTrades = await fetchTradesAllTime();
    
    // Build historical standings summary
    let historicalContext = `
=== HISTORICAL LEAGUE DATA (FOR PRESEASON ${currentSeason} PREVIEW) ===

IMPORTANT: This is a PRESEASON preview. The ${currentSeason} season has NOT started yet.
Base all analysis on PREVIOUS seasons' performance, NOT current season data.

`;

    // Add all-time records from H2H data
    if (h2hData.teams.length > 0) {
      historicalContext += `\n--- ALL-TIME TEAM PERFORMANCE ---\n`;
      
      // Calculate all-time records for each team
      const teamRecords: Array<{ team: string; wins: number; losses: number; playoffWins: number }> = [];
      
      for (const team of h2hData.teams) {
        let totalWins = 0;
        let totalLosses = 0;
        let playoffWins = 0;
        
        for (const opponent of h2hData.teams) {
          if (team === opponent) continue;
          const cell = h2hData.matrix[team]?.[opponent];
          if (cell) {
            totalWins += cell.wins.total;
            totalLosses += cell.losses.total;
            playoffWins += cell.wins.playoffs;
          }
        }
        
        teamRecords.push({ team, wins: totalWins, losses: totalLosses, playoffWins });
      }
      
      // Sort by wins
      teamRecords.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
      
      historicalContext += `All-Time Records (sorted by wins):\n`;
      for (const r of teamRecords) {
        const winPct = r.wins + r.losses > 0 ? (r.wins / (r.wins + r.losses) * 100).toFixed(1) : '0.0';
        historicalContext += `- ${r.team}: ${r.wins}-${r.losses} (${winPct}%)${r.playoffWins > 0 ? ` [${r.playoffWins} playoff wins]` : ''}\n`;
      }
    }

    // Add championship history
    historicalContext += `\n--- CHAMPIONSHIP HISTORY ---\n`;
    historicalContext += `- 2024: Belltown Raptors (Champion)\n`;
    historicalContext += `- 2023: Double Trouble (Inaugural Champion)\n`;

    // Add recent trade activity summary
    if (allTrades.length > 0) {
      historicalContext += `\n--- RECENT OFFSEASON TRADE ACTIVITY ---\n`;
      historicalContext += `Total trades in league history: ${allTrades.length}\n`;
      
      // Group trades by team to show who's been active
      const tradesByTeam = new Map<string, number>();
      for (const trade of allTrades) {
        // Trade type has 'teams' array of TradeTeam objects with 'name' property
        for (const tradeTeam of trade.teams || []) {
          tradesByTeam.set(tradeTeam.name, (tradesByTeam.get(tradeTeam.name) || 0) + 1);
        }
      }
      
      const sortedTraders = [...tradesByTeam.entries()].sort((a, b) => b[1] - a[1]);
      historicalContext += `Most active traders all-time:\n`;
      for (const [team, count] of sortedTraders.slice(0, 5)) {
        historicalContext += `- ${team}: ${count} trades\n`;
      }
    }

    historicalContext += `
--- PRESEASON ANALYSIS GUIDELINES ---
When creating the preseason preview:
1. Reference HISTORICAL performance (all-time records, championships, playoff appearances)
2. Consider offseason moves and trades
3. Evaluate roster strength based on player acquisitions
4. Make predictions for the UPCOMING ${currentSeason} season
5. DO NOT reference any ${currentSeason} season games or matchups (they haven't happened)
6. DO NOT say "Week X" - this is a preseason preview, not a weekly recap
`;

    return historicalContext;
  } catch (error) {
    console.error('Failed to build preseason historical context:', error);
    return `PRESEASON PREVIEW for ${currentSeason} season. Base analysis on historical performance.`;
  }
}

// ============ Auth Helper ============

async function isAdmin(req?: NextRequest): Promise<boolean> {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get('evw_admin');
  const secret = getConfiguredAdminSecret();
  if (!secret) return false;
  // Allow header or query param for cron invocations
  const headerSecret = req?.headers.get('x-admin-secret');
  const urlSecret = req ? new URL(req.url).searchParams.get('secret') : null;
  return (
    isAdminCookieValue(adminCookie?.value) ||
    headerSecret === secret ||
    urlSecret === secret
  );
}

// ============ GET: Retrieve newsletter ============

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get('week');
  const seasonParam = searchParams.get('season');
  const listParam = searchParams.get('list');

  try {
    // Get current NFL state
    const state = await getSleeperState();
    const season = seasonParam || state.season;
    const seasonNum = parseInt(season, 10);

    // If list=true, just return available weeks
    if (listParam === 'true') {
      const weeks = await listNewsletterWeeks(seasonNum);
      return NextResponse.json({
        success: true,
        season: seasonNum,
        weeks,
      });
    }

    const week = weekParam ? parseInt(weekParam, 10) : state.week;

    // Load from database
    const stored = await loadNewsletter(seasonNum, week);

    if (stored) {
      return NextResponse.json({
        success: true,
        newsletter: stored.newsletter,
        html: stored.html,
        generatedAt: stored.generatedAt,
        fromCache: true,
      });
    }

    // Get available weeks for this season
    const availableWeeks = await listNewsletterWeeks(seasonNum);

    return NextResponse.json({
      success: false,
      error: 'Newsletter not found',
      message: `No newsletter generated for Season ${season} Week ${week}. Use POST to generate.`,
      availableWeeks,
    }, { status: 404 });

  } catch (error) {
    console.error('Newsletter GET error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve newsletter',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// ============ POST: Generate newsletter ============

export async function POST(request: NextRequest) {
  // Check admin auth
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { week: weekOverride, season: seasonOverride, episodeType, forceRegenerate, preview } = body as {
      week?: number;
      season?: string;
      episodeType?: string; // Episode type for special newsletters (pre_draft, post_draft, preseason, etc.)
      forceRegenerate?: boolean;
      preview?: boolean; // Preview mode - generates but doesn't save to DB or show on public page
    };

    // Get current NFL state
    const state = await getSleeperState();
    const season = seasonOverride || state.season;
    const seasonNum = parseInt(season, 10);
    const week = weekOverride || state.week;

    // Check database unless force regenerate
    if (!forceRegenerate) {
      const existing = await loadNewsletter(seasonNum, week);
      if (existing) {
        return NextResponse.json({
          success: true,
          newsletter: existing.newsletter,
          html: existing.html,
          generatedAt: existing.generatedAt,
          fromCache: true,
          message: 'Newsletter already exists. Use forceRegenerate: true to regenerate.',
        });
      }
    }

    const leagueId = getLeagueIdForSeason(String(season));
    if (!leagueId) {
      return NextResponse.json({
        success: false,
        error: `No league ID found for season ${season}`,
      }, { status: 400 });
    }

    // Mark generation as in-progress in the staged tracker (best-effort)
    void updateStagedNewsletter(seasonNum, week, { status: 'in_progress' }).catch(() => {});

    // Fetch all required data from Sleeper via single-call ingest layer
    console.log(`Generating newsletter for Season ${season} Week ${week}...`);

    const [ingestData, existingMemoryEntertainer, existingMemoryAnalyst, existingRecords, existingPendingPicks, previousNewsletter, relationshipMem] = await Promise.all([
      fetchNewsletterData(leagueId, week), // fetches league/users/rosters/matchups/transactions/players/injuries + seeds player cache
      loadBotMemory('entertainer', seasonNum),
      loadBotMemory('analyst', seasonNum),
      loadForecastRecords(seasonNum),
      loadPendingPicks(seasonNum, week),
      loadPreviousNewsletter(seasonNum, week),
      loadRelationshipMemory(seasonNum),
    ]);

    const { leagueName: leagueNameFromIngest, users, rosters, matchups, nextMatchups, transactions, playerMap: allPlayers, injuries: rawInjuries } = ingestData;

    console.log(`Loaded bot memory - Entertainer: ${existingMemoryEntertainer ? 'found' : 'new'}, Analyst: ${existingMemoryAnalyst ? 'found' : 'new'}`);
    console.log(`[Newsletter] Player cache loaded: ${Object.keys(allPlayers).length} players, ${rawInjuries.length} injuries`);

    // Extract predictions from previous newsletter for grading/callbacks
    const previousPredictions = previousNewsletter ? extractPredictionsFromNewsletter(previousNewsletter) : [];
    if (previousPredictions.length > 0) {
      console.log(`[Newsletter] Found ${previousPredictions.length} predictions from previous newsletter to reference`);
    }

    // Build CallbacksSection from previous newsletter's Forecast picks so compose can render it
    const lastCallbacks = previousNewsletter && previousPredictions.length > 0
      ? {
          saved_at: previousNewsletter.generatedAt,
          spotlight_team: '',
          forecast_picks: previousPredictions.map(p => ({
            matchup_id: p.matchupId,
            team1: p.team1,
            team2: p.team2,
            entertainer_pick: p.entertainerPick,
            analyst_pick: p.analystPick,
          })),
          trade_grades: [],
        }
      : null;

    // Build playerId -> fantasy team map for injury context
    const userNameById = new Map<string, string>();
    for (const u of users) {
      const meta = (u as unknown as { metadata?: { team_name?: string } }).metadata;
      const display = meta?.team_name || u.display_name || u.username || `User ${u.user_id}`;
      userNameById.set(u.user_id, display);
    }
    const rosterNameById = new Map<number, string>();
    for (const r of rosters) {
      const name = userNameById.get(r.owner_id) || `Roster ${r.roster_id}`;
      rosterNameById.set(r.roster_id, name);
    }
    const playerToFantasyTeam = new Map<string, string>();
    for (const r of rosters) {
      for (const pid of r.players || []) {
        if (!playerToFantasyTeam.has(pid)) playerToFantasyTeam.set(pid, rosterNameById.get(r.roster_id) || `Roster ${r.roster_id}`);
      }
    }

    // Convert ingest injuries to the format expected by downstream context builders
    const formattedInjuries = rawInjuries
      .filter(inj => inj.status && inj.status !== 'Healthy' && inj.status !== 'Active')
      .slice(0, 30)
      .map(inj => ({
        playerId: inj.playerId,
        playerName: inj.playerName,
        team: inj.nflTeam,
        status: inj.status,
        fantasyTeam: playerToFantasyTeam.get(inj.playerId) || 'FA',
      }));

    // Fetch comprehensive league data from all sources (records, H2H, trades, etc.)
    console.log('[Newsletter] Fetching comprehensive league data...');
    const comprehensiveData = await fetchComprehensiveLeagueData();
    const comprehensiveContextString = buildComprehensiveContextString(comprehensiveData);
    console.log(`[Newsletter] Comprehensive data: ${Object.keys(comprehensiveData.teams).length} teams, ${comprehensiveData.allTrades.length} trades, ${comprehensiveData.topScoringWeeks.length} top weeks`);

    // Fetch CURRENT SEASON context (standings, streaks, transactions, playoff implications)
    console.log('[Newsletter] Fetching current week context...');
    const currentWeekContext = await fetchCurrentWeekContext(leagueId, seasonNum, week);
    const currentStandingsString = buildCurrentStandingsContext(currentWeekContext);
    const transactionsString = buildTransactionsContext(currentWeekContext);
    const rulesString = getLeagueRulesContext();
    console.log(`[Newsletter] Current week: ${currentWeekContext.standings.length} teams, ${currentWeekContext.recentTransactions.length} transactions`);

    // Build enhanced context for richer LLM generation
    // For preseason episodes, use historical data instead of current season data
    const isPreseasonEpisode = episodeType === 'preseason' || episodeType === 'pre_draft' || episodeType === 'post_draft' || episodeType === 'offseason';
    
    let enhancedContext: Awaited<ReturnType<typeof buildEnhancedContextFull>>;
    
    if (isPreseasonEpisode) {
      console.log(`[${episodeType}] Building historical context for special episode...`);
      const historicalContext = await buildPreseasonHistoricalContext(seasonNum, users);
      // Combine historical context with comprehensive league data and rules
      enhancedContext = {
        standings: [], // No current standings for preseason
        byeTeams: [],
        enhancedContextString: `${rulesString}\n\n${comprehensiveContextString}\n\n${historicalContext}`,
      };
      console.log(`Historical context built for ${episodeType} episode`);
    } else {
      enhancedContext = await buildEnhancedContextFull(leagueId, week, seasonNum, users, matchups);
      
      // Fetch external data (ESPN injuries/news, Sleeper trending) for enhanced knowledge
      console.log('[Newsletter] Fetching external data sources (ESPN, Sleeper trending)...');
      const externalData = await fetchAllExternalData();
      const externalDataString = buildExternalDataContext(externalData);
      console.log(`[Newsletter] External data: ${externalData.news.length} news, ${externalData.injuries.length} injuries, ${externalData.trending.length} trending`);
      
      // Build relationship memory context (cross-bot debate history and tendencies)
      const relMemContext = (() => {
        const pred = relationshipMem.prediction_records;
        const dynamic = relationshipMem.dynamic;
        const themes = relationshipMem.themes;
        const lines = [
          `=== BOT RELATIONSHIP MEMORY ===`,
          `Season prediction records — Entertainer: ${pred.entertainer.w}W-${pred.entertainer.l}L, Analyst: ${pred.analyst.w}W-${pred.analyst.l}L`,
          dynamic.total_pushbacks > 0 ? `Total disagreements this season: ${dynamic.total_pushbacks}${dynamic.last_pushback_week ? ` (last: Week ${dynamic.last_pushback_week})` : ''}` : '',
          dynamic.agreements_this_season > 0 ? `Agreements this season: ${dynamic.agreements_this_season}` : '',
          themes.entertainer_tendencies.length > 0 ? `Entertainer tendencies: ${themes.entertainer_tendencies.join('; ')}` : '',
          themes.analyst_tendencies.length > 0 ? `Analyst tendencies: ${themes.analyst_tendencies.join('; ')}` : '',
          themes.persistent_disagreements.length > 0 ? `Recurring disagreements: ${themes.persistent_disagreements.join('; ')}` : '',
        ].filter(Boolean);
        return lines.length > 1 ? lines.join('\n') : '';
      })();

      // Combine ALL context: rules + comprehensive data + current standings + transactions + external data + relationship memory + enhanced context
      enhancedContext.enhancedContextString = `${rulesString}\n\n${comprehensiveContextString}\n\n${currentStandingsString}\n\n${transactionsString}\n\n${externalDataString}\n\n${relMemContext ? relMemContext + '\n\n' : ''}${enhancedContext.enhancedContextString || ''}`;
      // Add injuries to enhanced context
      enhancedContext.injuries = formattedInjuries;
      console.log(`Enhanced context: standings=${enhancedContext.standings?.length || 0} teams, byes=${enhancedContext.byeTeams?.length || 0} NFL teams`);
      console.log(`Enhanced context includes: league rules, comprehensive data, current standings, transactions, external APIs (ESPN/Sleeper), H2H, trades, records, playoff implications`);
    }

    // Generate the newsletter
    // Memory is ALWAYS persisted even if compose partially fails (composeFailed flag)
    const result = await generateNewsletter({
      leagueName: leagueNameFromIngest || 'East v. West',
      leagueId,
      season: seasonNum,
      week,
      episodeType: episodeType || 'regular', // Pass episode type for special newsletters
      users,
      rosters,
      matchups,
      nextMatchups,
      transactions: transactions.map(t => ({
        ...t,
        adds: t.adds ?? undefined,
        drops: t.drops ?? undefined,
      })),
      existingMemoryEntertainer,
      existingMemoryAnalyst,
      existingRecords,
      pendingPicks: existingPendingPicks,
      enhancedContext,
      lastCallbacks, // Previous week's forecast picks for the Callbacks section
      previousNewsletter: previousNewsletter as { newsletter: { sections: Array<{ type: string; data: unknown }> } } | null,
      previousPredictions, // Pass previous predictions for narrative callbacks
      existingRelationshipMemory: relationshipMem,
    });

    const generatedAt = new Date().toISOString();

    // ALWAYS persist bot memories first - this is critical for personality continuity
    // Even if newsletter save fails or composeFailed is true, memory must be preserved
    try {
      // In preview mode, allow gating persistence via env (free-tier safety)
      const allowPreviewPersist = process.env.NEWSLETTER_PERSIST_IN_PREVIEW === 'true';
      if (!preview || allowPreviewPersist) {
        await Promise.all([
          saveBotMemory('entertainer', seasonNum, result.memoryEntertainer),
          saveBotMemory('analyst', seasonNum, result.memoryAnalyst),
          saveForecastRecords(seasonNum, result.records),
          savePendingPicks(seasonNum, result.pendingPicks),
          saveRelationshipMemory(seasonNum, relationshipMem),
        ]);
        console.log(`[Newsletter] Bot memory persisted - Entertainer: ${result.memoryEntertainer.summaryMood}, Analyst: ${result.memoryAnalyst.summaryMood}`);
      } else {
        console.log('[PREVIEW] Skipping DB persistence for bot memory/records (NEWSLETTER_PERSIST_IN_PREVIEW != true)');
      }
    } catch (memoryError) {
      console.error('[Newsletter] CRITICAL: Failed to persist bot memory:', memoryError);
      // Continue - we still want to return the result even if persistence failed
    }

    // Log if compose had issues but still produced a result
    if (result.composeFailed) {
      console.warn(`[Newsletter] Compose had errors but memory was preserved. Newsletter may have fallback content.`);
    }

    // In preview mode, don't save newsletter to database - just return the result for testing
    if (preview) {
      console.log(`[PREVIEW] Newsletter generated for Season ${season} Week ${week} (not saved)`);
      
      // Type-safe section access
      type NewsletterSection = { type: string; data: unknown };
      const sections = result.newsletter.sections as NewsletterSection[];

      return NextResponse.json({
        success: true,
        preview: true,
        newsletter: result.newsletter,
        html: result.html,
        generatedAt,
        fromCache: false,
        stats: {
          matchups: (sections.find(s => s.type === 'MatchupRecaps')?.data as unknown[] | undefined)?.length || 0,
          trades: (sections.find(s => s.type === 'Trades')?.data as unknown[] | undefined)?.length || 0,
          waivers: (sections.find(s => s.type === 'WaiversAndFA')?.data as unknown[] | undefined)?.length || 0,
        },
        memory: {
          entertainer: { 
            mood: result.memoryEntertainer.summaryMood, 
            teamsTracked: Object.keys(result.memoryEntertainer.teams).length,
            teams: result.memoryEntertainer.teams, // Include full team data in preview
          },
          analyst: { 
            mood: result.memoryAnalyst.summaryMood, 
            teamsTracked: Object.keys(result.memoryAnalyst.teams).length,
            teams: result.memoryAnalyst.teams,
          },
        },
        message: 'PREVIEW MODE: Newsletter generated but NOT saved. Users cannot see this.',
      });
    }

    // Quality gate: scan for unresolved Sleeper player IDs before publishing
    const playerIdWarnings = scanForUnresolvedPlayerIds(result.html);
    if (playerIdWarnings.length > 0) {
      console.warn(`[Newsletter] Quality gate: ${playerIdWarnings.length} unresolved player ID(s) found in HTML:`, playerIdWarnings);
    }

    // Save newsletter to database (memory was already persisted above)
    await saveNewsletter(seasonNum, week, leagueNameFromIngest || 'East v. West', result.newsletter as { meta: { leagueName: string; week: number; date: string; season: number }; sections: Array<{ type: string; data: unknown }> }, result.html);

    // Mark staged generation as completed (best-effort)
    void updateStagedNewsletter(seasonNum, week, { status: 'completed' }).catch(() => {});

    console.log(`Newsletter generated and saved for Season ${season} Week ${week}${result.composeFailed ? ' (with fallback content)' : ''}`);

    // Post to Discord if webhook is configured and not already posted
    const discordWebhookUrl = process.env.DISCORD_NEWSLETTER_WEBHOOK_URL;
    const siteUrl = process.env.SITE_URL || 'https://eastvswest.football';
    if (discordWebhookUrl) {
      try {
        const db = getDb();
        const dedupeKey = `${seasonNum}-${week}`;
        
        // Check if already posted
        const existing = await db
          .select()
          .from(discordNotifications)
          .where(and(
            eq(discordNotifications.notificationType, 'newsletter_published'),
            eq(discordNotifications.dedupeKey, dedupeKey)
          ))
          .limit(1)
          .catch(() => []);
        
        if (existing.length === 0) {
          const embed = buildNewsletterEmbed({
            season: seasonNum,
            week,
            siteUrl,
          });
          
          const discordResult = await postToDiscordWebhook(discordWebhookUrl, { embeds: [embed] });
          if (discordResult.success) {
            await db.insert(discordNotifications).values({
              notificationType: 'newsletter_published',
              dedupeKey,
              meta: { season: seasonNum, week },
            }).catch(() => {});
            console.log(`[Newsletter] Posted to Discord for Season ${seasonNum} Week ${week}`);
          } else {
            console.warn(`[Newsletter] Discord post failed: ${discordResult.error}`);
          }
        } else {
          console.log(`[Newsletter] Already posted to Discord for Season ${seasonNum} Week ${week}`);
        }
      } catch (discordErr) {
        console.warn('[Newsletter] Discord notification error (non-fatal):', discordErr);
      }
    }

    // Type-safe section access
    type NewsletterSection = { type: string; data: unknown };
    const sections = result.newsletter.sections as NewsletterSection[];

    return NextResponse.json({
      success: true,
      newsletter: result.newsletter,
      html: result.html,
      generatedAt,
      fromCache: false,
      stats: {
        matchups: (sections.find(s => s.type === 'MatchupRecaps')?.data as unknown[] | undefined)?.length || 0,
        trades: (sections.find(s => s.type === 'Trades')?.data as unknown[] | undefined)?.length || 0,
        waivers: (sections.find(s => s.type === 'WaiversAndFA')?.data as unknown[] | undefined)?.length || 0,
      },
      memory: {
        entertainer: { mood: result.memoryEntertainer.summaryMood, teamsTracked: Object.keys(result.memoryEntertainer.teams).length },
        analyst: { mood: result.memoryAnalyst.summaryMood, teamsTracked: Object.keys(result.memoryAnalyst.teams).length },
      },
    });

  } catch (error) {
    console.error('Newsletter generation error:', error);
    // Mark staged generation as failed (best-effort — we may not have seasonNum/week in scope yet)
    try {
      const body2 = await request.json().catch(() => ({})) as { week?: number; season?: string };
      const state2 = await getSleeperState().catch(() => ({ season: String(new Date().getFullYear()), week: 1 }));
      const s2 = parseInt(body2.season || state2.season, 10);
      const w2 = body2.week || state2.week;
      void updateStagedNewsletter(s2, w2, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      }).catch(() => {});
    } catch { /* best-effort */ }
    return NextResponse.json({
      success: false,
      error: 'Failed to generate newsletter',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// ============ DELETE: Admin can delete newsletters ============

export async function DELETE(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get('week');
  const seasonParam = searchParams.get('season');

  if (!weekParam || !seasonParam) {
    return NextResponse.json({
      success: false,
      error: 'Both week and season parameters are required',
    }, { status: 400 });
  }

  const week = parseInt(weekParam, 10);
  const season = parseInt(seasonParam, 10);

  try {
    await deleteNewsletter(season, week);
    return NextResponse.json({
      success: true,
      message: `Deleted newsletter for Season ${season} Week ${week}`,
    });
  } catch (error) {
    console.error('Newsletter delete error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete newsletter',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
