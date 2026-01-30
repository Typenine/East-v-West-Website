/**
 * Newsletter API Route
 * Handles newsletter generation and retrieval with database persistence
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { generateNewsletter } from '@/lib/newsletter';
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

// ============ Auth Helper ============

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get('evw_admin');
  return adminCookie?.value === process.env.EVW_ADMIN_SECRET;
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
