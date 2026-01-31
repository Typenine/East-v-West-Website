/**
 * Newsletter API Route
 * Handles newsletter generation and retrieval with database persistence
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { 
  generateNewsletter,
  buildH2HContext,
  buildTradeContext,
  calculatePlayoffImplications,
  checkForRecords,
  buildEnhancedContextString,
  type EnhancedContextData,
  type LeagueRecords,
} from '@/lib/newsletter';
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
} from '@/server/db/newsletter-queries';
import { getHeadToHeadAllTime } from '@/lib/utils/headtohead';
import { fetchTradesAllTime } from '@/lib/utils/trades';

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

    return { standings, byeTeams, enhancedContextString };
  } catch (error) {
    console.error('Failed to build enhanced context:', error);
    return {};
  }
}

// ============ Auth Helper ============

function getSecret(): string {
  return process.env.EVW_ADMIN_SECRET || '002023';
}

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get('evw_admin');
  const secret = getSecret();
  return adminCookie?.value === secret;
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
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { week: weekOverride, season: seasonOverride, forceRegenerate, preview } = body as {
      week?: number;
      season?: string;
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

    // Get league ID for the season
    let leagueId: string;
    if (season === '2025') {
      leagueId = LEAGUE_IDS.CURRENT;
    } else if (season === '2024' || season === '2023') {
      leagueId = LEAGUE_IDS.PREVIOUS[season];
    } else {
      return NextResponse.json({
        success: false,
        error: `No league ID found for season ${season}`,
      }, { status: 400 });
    }

    // Fetch all required data from Sleeper
    console.log(`Generating newsletter for Season ${season} Week ${week}...`);

    const [league, users, rosters, matchups, nextMatchups, transactions] = await Promise.all([
      getLeague(leagueId),
      getUsers(leagueId),
      getRosters(leagueId),
      getMatchups(leagueId, week),
      getMatchups(leagueId, week + 1).catch(() => []),
      getTransactions(leagueId, week),
    ]);

    // Load existing memory state from database (PERSISTENT!)
    const [existingMemoryEntertainer, existingMemoryAnalyst, existingRecords, existingPendingPicks] = await Promise.all([
      loadBotMemory('entertainer', seasonNum),
      loadBotMemory('analyst', seasonNum),
      loadForecastRecords(seasonNum),
      loadPendingPicks(seasonNum, week), // Load picks made for THIS week to grade
    ]);

    console.log(`Loaded bot memory - Entertainer: ${existingMemoryEntertainer ? 'found' : 'new'}, Analyst: ${existingMemoryAnalyst ? 'found' : 'new'}`);

    // Build enhanced context for richer LLM generation (all 8 improvements)
    const enhancedContext = await buildEnhancedContextFull(leagueId, week, seasonNum, users, matchups);
    console.log(`Enhanced context: standings=${enhancedContext.standings?.length || 0} teams, byes=${enhancedContext.byeTeams?.length || 0} NFL teams`);
    if (enhancedContext.enhancedContextString) {
      console.log(`Enhanced context includes: H2H, trades, records, playoff implications`);
    }

    // Generate the newsletter
    const result = await generateNewsletter({
      leagueName: league.name || 'East v. West',
      leagueId,
      season: seasonNum,
      week,
      users,
      rosters,
      matchups,
      nextMatchups,
      transactions,
      existingMemoryEntertainer,
      existingMemoryAnalyst,
      existingRecords,
      pendingPicks: existingPendingPicks,
      enhancedContext,
    });

    const generatedAt = new Date().toISOString();

    // In preview mode, don't save to database - just return the result for testing
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

    // Save everything to database for persistence
    // Save bot memories (this is crucial for personality continuity!)
    await Promise.all([
      saveBotMemory('entertainer', seasonNum, result.memoryEntertainer),
      saveBotMemory('analyst', seasonNum, result.memoryAnalyst),
      saveForecastRecords(seasonNum, result.records),
      savePendingPicks(seasonNum, result.pendingPicks),
      saveNewsletter(seasonNum, week, league.name || 'East v. West', result.newsletter as { meta: { leagueName: string; week: number; date: string; season: number }; sections: Array<{ type: string; data: unknown }> }, result.html),
    ]);

    console.log(`Newsletter generated and saved for Season ${season} Week ${week}`);
    console.log(`Bot memory persisted - Entertainer mood: ${result.memoryEntertainer.summaryMood}, Analyst mood: ${result.memoryAnalyst.summaryMood}`);

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
