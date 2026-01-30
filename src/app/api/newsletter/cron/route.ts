/**
 * Newsletter Cron API Route
 * Called by scheduled jobs to generate newsletters in stages
 * 
 * Schedule:
 * - Tuesday 6 AM ET: Start staged generation (fetch data, begin sections)
 * - Tuesday 12 PM ET: Continue generation (more sections)
 * - Tuesday 6 PM ET: Continue generation (more sections)
 * - Wednesday 6 AM ET: Finalize and publish
 */

import { NextRequest, NextResponse } from 'next/server';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  loadBotMemory,
  saveBotMemory,
  loadForecastRecords,
  saveForecastRecords,
  loadPendingPicks,
  savePendingPicks,
  saveNewsletter,
  loadStagedNewsletter,
  createStagedNewsletter,
  updateStagedNewsletter,
  loadPreviousSeasonMemory,
  initializeSeasonMemory,
} from '@/server/db/newsletter-queries';
import { generateSection, SECTION_GENERATION_ORDER } from '@/lib/newsletter/llm/groq';
import { buildDerived } from '@/lib/newsletter/derive';
import { renderNewsletterData } from '@/lib/newsletter/template';
import type { Newsletter, BotMemory } from '@/lib/newsletter/types';

// ============ Auth ============

function isAuthorized(request: NextRequest): boolean {
  // Check for cron secret (set in environment)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.NEWSLETTER_CRON_SECRET || process.env.CRON_SECRET;
  
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Also allow admin cookie for manual triggers
  const adminCookie = request.cookies.get('evw_admin');
  return adminCookie?.value === process.env.EVW_ADMIN_SECRET;
}

// ============ Sleeper API ============

const SLEEPER_API = 'https://api.sleeper.app/v1';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  return res.json();
}

async function getSleeperState(): Promise<{ season: string; week: number; season_type: string }> {
  return fetchJson(`${SLEEPER_API}/state/nfl`);
}

async function getLeague(leagueId: string): Promise<{ name: string }> {
  return fetchJson(`${SLEEPER_API}/league/${leagueId}`);
}

async function getUsers(leagueId: string) {
  return fetchJson<Array<{
    user_id: string;
    display_name?: string;
    username?: string;
    metadata?: { team_name?: string };
  }>>(`${SLEEPER_API}/league/${leagueId}/users`);
}

async function getRosters(leagueId: string) {
  return fetchJson<Array<{
    roster_id: number;
    owner_id: string;
    players?: string[];
  }>>(`${SLEEPER_API}/league/${leagueId}/rosters`);
}

async function getMatchups(leagueId: string, week: number) {
  return fetchJson<Array<{
    roster_id: number;
    matchup_id: number | null;
    points?: number;
  }>>(`${SLEEPER_API}/league/${leagueId}/matchups/${week}`);
}

async function getTransactions(leagueId: string, week: number) {
  return fetchJson<Array<{
    transaction_id?: string;
    type: 'trade' | 'waiver' | 'free_agent';
    leg?: number;
    roster_ids?: number[];
    roster_id?: number;
    adds?: Record<string, number>;
    drops?: Record<string, number>;
    draft_picks?: unknown[];
    waiver_bid?: number;
  }>>(`${SLEEPER_API}/league/${leagueId}/transactions/${week}`);
}

// ============ Staged Generation ============

interface StageResult {
  action: 'started' | 'continued' | 'completed' | 'published' | 'skipped' | 'error';
  sectionsGenerated: string[];
  sectionsRemaining: string[];
  message: string;
}

async function runStagedGeneration(
  season: number,
  week: number,
  leagueId: string,
  leagueName: string,
  publish: boolean
): Promise<StageResult> {
  // Load or create staged state
  let staged = await loadStagedNewsletter(season, week);

  // If already published, skip
  if (staged?.status === 'published') {
    return {
      action: 'skipped',
      sectionsGenerated: staged.sectionsCompleted,
      sectionsRemaining: [],
      message: 'Newsletter already published',
    };
  }

  // If no staged data, initialize
  if (!staged) {
    console.log(`[Cron] Initializing staged newsletter for S${season}W${week}`);

    // Fetch all data from Sleeper
    const [users, rosters, matchups, nextMatchups, transactions] = await Promise.all([
      getUsers(leagueId),
      getRosters(leagueId),
      getMatchups(leagueId, week),
      getMatchups(leagueId, week + 1).catch(() => []),
      getTransactions(leagueId, week),
    ]);

    // Build derived data
    const derived = buildDerived({ users, rosters, matchups, nextMatchups, transactions });

    // Create staged record
    await createStagedNewsletter(season, week, {
      leagueName,
      derived,
      users,
      rosters,
    });

    staged = await loadStagedNewsletter(season, week);
    if (!staged) throw new Error('Failed to create staged newsletter');
  }

  // Load bot memories (with cross-season support)
  let memEntertainer = await loadBotMemory('entertainer', season);
  let memAnalyst = await loadBotMemory('analyst', season);

  // If no memory for this season, initialize from previous season
  if (!memEntertainer) {
    const prevMem = await loadPreviousSeasonMemory('entertainer', season);
    memEntertainer = await initializeSeasonMemory('entertainer', season, prevMem);
    console.log(`[Cron] Initialized entertainer memory from ${prevMem ? 'previous season' : 'scratch'}`);
  }
  if (!memAnalyst) {
    const prevMem = await loadPreviousSeasonMemory('analyst', season);
    memAnalyst = await initializeSeasonMemory('analyst', season, prevMem);
    console.log(`[Cron] Initialized analyst memory from ${prevMem ? 'previous season' : 'scratch'}`);
  }

  // Determine which sections to generate this run
  const completedSections = staged.sectionsCompleted || [];
  const remainingSections = SECTION_GENERATION_ORDER.filter(s => !completedSections.includes(s));

  // Generate 2-3 sections per run to stay within rate limits
  const sectionsToGenerate = remainingSections.slice(0, 2);
  const generatedThisRun: string[] = [];

  if (sectionsToGenerate.length === 0 && !publish) {
    return {
      action: 'skipped',
      sectionsGenerated: completedSections,
      sectionsRemaining: [],
      message: 'All sections already generated, waiting for publish',
    };
  }

  // Update status to in_progress
  await updateStagedNewsletter(season, week, {
    status: 'in_progress',
    currentSection: sectionsToGenerate[0] || null,
  });

  const derivedData = staged.derivedData as { derived?: Record<string, unknown> } | null;
  const generatedContent = { ...staged.generatedContent };

  // Generate each section
  for (const sectionType of sectionsToGenerate) {
    try {
      console.log(`[Cron] Generating section: ${sectionType}`);

      await updateStagedNewsletter(season, week, { currentSection: sectionType });

      // Build context for this section
      const context = buildSectionContext(sectionType, derivedData?.derived || {}, memEntertainer, memAnalyst);

      // Generate for both personas
      const [entertainerContent, analystContent] = await Promise.all([
        generateSection({
          persona: 'entertainer',
          sectionType,
          context,
          maxTokens: getSectionMaxTokens(sectionType),
        }),
        generateSection({
          persona: 'analyst',
          sectionType,
          context,
          maxTokens: getSectionMaxTokens(sectionType),
        }),
      ]);

      generatedContent[sectionType] = {
        entertainer: entertainerContent,
        analyst: analystContent,
      };

      completedSections.push(sectionType);
      generatedThisRun.push(sectionType);

      console.log(`[Cron] Completed section: ${sectionType}`);

    } catch (error) {
      console.error(`[Cron] Error generating ${sectionType}:`, error);
      await updateStagedNewsletter(season, week, {
        status: 'failed',
        error: `Failed on ${sectionType}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      return {
        action: 'error',
        sectionsGenerated: generatedThisRun,
        sectionsRemaining: remainingSections.filter(s => !generatedThisRun.includes(s)),
        message: `Error generating ${sectionType}`,
      };
    }
  }

  // Update staged state
  const allComplete = completedSections.length >= SECTION_GENERATION_ORDER.length;
  await updateStagedNewsletter(season, week, {
    status: allComplete ? 'completed' : 'in_progress',
    sectionsCompleted: completedSections,
    generatedContent,
    currentSection: null,
  });

  // If publish flag is set and all sections complete, publish the newsletter
  if (publish && allComplete) {
    return await publishNewsletter(season, week, leagueName, generatedContent, memEntertainer, memAnalyst);
  }

  return {
    action: generatedThisRun.length > 0 ? 'continued' : 'skipped',
    sectionsGenerated: completedSections,
    sectionsRemaining: SECTION_GENERATION_ORDER.filter(s => !completedSections.includes(s)),
    message: allComplete ? 'All sections complete, ready to publish' : `Generated ${generatedThisRun.length} sections`,
  };
}

async function publishNewsletter(
  season: number,
  week: number,
  leagueName: string,
  generatedContent: Record<string, { entertainer: string; analyst: string }>,
  memEntertainer: BotMemory,
  memAnalyst: BotMemory
): Promise<StageResult> {
  console.log(`[Cron] Publishing newsletter for S${season}W${week}`);

  // Build newsletter structure from generated content
  // Use a simplified structure that matches what the template expects
  const newsletterData = {
    meta: {
      leagueName,
      week,
      date: new Date().toISOString().split('T')[0],
      season,
    },
    sections: SECTION_GENERATION_ORDER.map(sectionType => ({
      type: sectionType,
      data: generatedContent[sectionType] || { entertainer: '', analyst: '' },
    })),
  };

  // Render to simple HTML
  const html = buildNewsletterHtml(leagueName, week, season, generatedContent);

  // Save to database (use unknown to bypass strict typing)
  await saveNewsletter(
    season, 
    week, 
    leagueName, 
    newsletterData as unknown as { meta: { leagueName: string; week: number; date: string; season: number }; sections: Array<{ type: string; data: unknown }> }, 
    html
  );

  // Update staged status
  await updateStagedNewsletter(season, week, { status: 'published' });

  // Save updated bot memories
  await Promise.all([
    saveBotMemory('entertainer', season, memEntertainer),
    saveBotMemory('analyst', season, memAnalyst),
  ]);

  console.log(`[Cron] Newsletter published for S${season}W${week}`);

  return {
    action: 'published',
    sectionsGenerated: SECTION_GENERATION_ORDER,
    sectionsRemaining: [],
    message: 'Newsletter published successfully',
  };
}

// ============ HTML Renderer ============

function buildNewsletterHtml(
  leagueName: string,
  week: number,
  season: number,
  content: Record<string, { entertainer: string; analyst: string }>
): string {
  const sectionHtml = SECTION_GENERATION_ORDER.map(section => {
    const data = content[section];
    if (!data) return '';
    
    return `
      <div style="margin-bottom: 32px;">
        <h2 style="margin: 24px 0 16px; font-size: 20px; color: #0f172a; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">${section}</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div style="background: #fef3c7; padding: 16px; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <div style="font-weight: 600; color: #92400e; margin-bottom: 8px;">🎭 The Entertainer</div>
            <div style="color: #1f2937; line-height: 1.6;">${escapeHtml(data.entertainer)}</div>
          </div>
          <div style="background: #dbeafe; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <div style="font-weight: 600; color: #1e40af; margin-bottom: 8px;">📊 The Analyst</div>
            <div style="color: #1f2937; line-height: 1.6;">${escapeHtml(data.analyst)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(leagueName)} Newsletter - Week ${week}</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f8fafc;">
  <div style="background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
    <h1 style="text-align: center; color: #0f172a; margin-bottom: 8px;">${escapeHtml(leagueName)}</h1>
    <p style="text-align: center; color: #64748b; margin-bottom: 32px;">Week ${week} • ${season} Season</p>
    ${sectionHtml}
    <div style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
      Generated by East v. West AI Newsletter System
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ============ Context Builders ============

function buildSectionContext(
  sectionType: string,
  derived: Record<string, unknown>,
  memEntertainer: { teams: Record<string, { trust: number; frustration: number; mood: string }> },
  memAnalyst: { teams: Record<string, { trust: number; frustration: number; mood: string }> }
): string {
  const matchupPairs = derived.matchup_pairs as Array<{ winner: { name: string; points: number }; loser: { name: string; points: number }; margin: number }> || [];
  const upcomingPairs = derived.upcoming_pairs as Array<{ teams: string[] }> || [];
  const scoredEvents = derived.scored_events as Array<{ type: string; team: string; summary: string }> || [];

  switch (sectionType) {
    case 'Intro':
      return `Week ${derived.week || 'N/A'} just wrapped up.
Matchup results: ${matchupPairs.map(p => `${p.winner.name} beat ${p.loser.name} by ${p.margin.toFixed(1)}`).join('; ')}.
Notable events: ${scoredEvents.slice(0, 3).map(e => e.summary).join('; ') || 'None'}.
Write a brief, punchy intro (2-3 sentences) setting the tone for this week's newsletter.`;

    case 'MatchupRecaps':
      return `Matchup results to recap:
${matchupPairs.map(p => `- ${p.winner.name} (${p.winner.points.toFixed(1)}) def. ${p.loser.name} (${p.loser.points.toFixed(1)}) by ${p.margin.toFixed(1)}`).join('\n')}

Your memory of these teams:
${Object.entries(memEntertainer.teams).slice(0, 5).map(([team, data]) => `- ${team}: trust=${data.trust}, mood=${data.mood}`).join('\n') || 'No prior history'}

Write a recap for each matchup (1-2 sentences each). Reference your feelings about teams where relevant.`;

    case 'WaiversAndFA':
      const waiverEvents = scoredEvents.filter(e => e.type === 'waiver' || e.type === 'free_agent');
      return `Waiver/FA activity this week:
${waiverEvents.map(e => `- ${e.team}: ${e.summary}`).join('\n') || 'No significant waiver activity'}

Comment on the notable moves. Who made smart pickups? Who's sleeping?`;

    case 'Trades':
      const tradeEvents = scoredEvents.filter(e => e.type === 'trade');
      return `Trades this week:
${tradeEvents.map(e => `- ${e.summary}`).join('\n') || 'No trades this week'}

Analyze any trades. If none, briefly note the quiet trade market.`;

    case 'Spotlight':
      const topTeam = matchupPairs[0]?.winner;
      return `Spotlight team this week: ${topTeam?.name || 'Top performer'}
Score: ${topTeam?.points?.toFixed(1) || 'N/A'}

Write a brief spotlight (2-3 sentences) on this team's performance.`;

    case 'Forecast':
      return `Upcoming matchups to predict:
${upcomingPairs.map(p => `- ${p.teams[0]} vs ${p.teams[1]}`).join('\n') || 'No upcoming matchups available'}

Make predictions for each matchup. Be bold but explain your reasoning briefly.`;

    case 'FinalWord':
      return `Wrap up the newsletter with a final thought (1-2 sentences).
Reference the overall week vibe and tease next week.`;

    default:
      return `Generate content for the ${sectionType} section.`;
  }
}

function getSectionMaxTokens(sectionType: string): number {
  switch (sectionType) {
    case 'Intro': return 150;
    case 'MatchupRecaps': return 500;
    case 'WaiversAndFA': return 300;
    case 'Trades': return 300;
    case 'Spotlight': return 200;
    case 'Forecast': return 400;
    case 'FinalWord': return 100;
    default: return 300;
  }
}

// ============ Route Handler ============

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { week: weekOverride, season: seasonOverride, publish = false, mode } = body as {
      week?: number;
      season?: string;
      publish?: boolean;
      mode?: 'auto' | 'preseason' | 'offseason';
    };

    // Get current NFL state
    const state = await getSleeperState();
    const season = seasonOverride || state.season;
    const seasonNum = parseInt(season, 10);
    const week = weekOverride || state.week;

    // Season gating: only run during regular season and postseason by default
    // Allow explicit preseason/offseason runs via mode override
    const allowedTypes = (process.env.NEWSLETTER_SEASON_TYPES || 'regular,post')
      .split(',')
      .map(s => s.trim().toLowerCase());
    const seasonType = String(state.season_type || '').toLowerCase();

    const isOverride = mode === 'preseason' || mode === 'offseason';
    const isAllowed = allowedTypes.includes(seasonType) || isOverride;

    if (!isAllowed) {
      return NextResponse.json({
        success: true,
        action: 'skipped',
        reason: 'Out of season',
        season: seasonNum,
        week,
        season_type: state.season_type,
      });
    }

    // Get league ID
    let leagueId: string;
    if (season === '2025') {
      leagueId = LEAGUE_IDS.CURRENT;
    } else if (season === '2024' || season === '2023') {
      leagueId = LEAGUE_IDS.PREVIOUS[season];
    } else {
      return NextResponse.json({ error: `No league ID for season ${season}` }, { status: 400 });
    }

    const league = await getLeague(leagueId);

    // Run staged generation
    const result = await runStagedGeneration(seasonNum, week, leagueId, league.name || 'East v. West', publish);

    return NextResponse.json({
      success: true,
      season: seasonNum,
      week,
      ...result,
    });

  } catch (error) {
    console.error('[Cron] Newsletter generation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to run staged generation',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

// GET to check status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get('week');
  const seasonParam = searchParams.get('season');

  try {
    const state = await getSleeperState();
    const season = parseInt(seasonParam || state.season, 10);
    const week = weekParam ? parseInt(weekParam, 10) : state.week;

    const staged = await loadStagedNewsletter(season, week);

    return NextResponse.json({
      season,
      week,
      staged: staged ? {
        status: staged.status,
        sectionsCompleted: staged.sectionsCompleted,
        sectionsRemaining: SECTION_GENERATION_ORDER.filter(s => !staged.sectionsCompleted.includes(s)),
        startedAt: staged.startedAt,
        completedAt: staged.completedAt,
        publishedAt: staged.publishedAt,
        error: staged.error,
      } : null,
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Failed to get status',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
