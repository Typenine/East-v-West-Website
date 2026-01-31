/**
 * Newsletter Database Queries
 * Handles persistence of bot memory, forecast records, and newsletters
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from './client';
import {
  botMemory,
  forecastRecords,
  pendingPicks,
  newsletters,
  newsletterStaged,
} from './schema';
import type { BotMemory, BotName } from '@/lib/newsletter/types';

// ============ Bot Memory ============

export async function loadBotMemory(
  bot: BotName,
  season: number
): Promise<BotMemory | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(botMemory)
    .where(and(eq(botMemory.bot, bot), eq(botMemory.season, season)))
    .limit(1);

  if (!rows.length) return null;

  const row = rows[0];
  return {
    bot,
    updated_at: row.updatedAt.toISOString(),
    summaryMood: row.summaryMood as BotMemory['summaryMood'],
    teams: (row.teams || {}) as BotMemory['teams'],
  };
}

export async function saveBotMemory(
  bot: BotName,
  season: number,
  memory: BotMemory
): Promise<void> {
  const db = getDb();

  // Check if exists
  const existing = await db
    .select({ id: botMemory.id })
    .from(botMemory)
    .where(and(eq(botMemory.bot, bot), eq(botMemory.season, season)))
    .limit(1);

  if (existing.length) {
    // Update
    await db
      .update(botMemory)
      .set({
        summaryMood: memory.summaryMood,
        teams: memory.teams,
        updatedAt: new Date(),
      })
      .where(eq(botMemory.id, existing[0].id));
  } else {
    // Insert
    await db.insert(botMemory).values({
      bot,
      season,
      summaryMood: memory.summaryMood,
      teams: memory.teams,
    });
  }
}

// ============ Forecast Records ============

export interface ForecastRecordsData {
  entertainer: { w: number; l: number };
  analyst: { w: number; l: number };
}

export async function loadForecastRecords(
  season: number
): Promise<ForecastRecordsData> {
  const db = getDb();
  const rows = await db
    .select()
    .from(forecastRecords)
    .where(eq(forecastRecords.season, season));

  const result: ForecastRecordsData = {
    entertainer: { w: 0, l: 0 },
    analyst: { w: 0, l: 0 },
  };

  for (const row of rows) {
    if (row.bot === 'entertainer') {
      result.entertainer = { w: row.wins, l: row.losses };
    } else if (row.bot === 'analyst') {
      result.analyst = { w: row.wins, l: row.losses };
    }
  }

  return result;
}

export async function saveForecastRecords(
  season: number,
  records: ForecastRecordsData
): Promise<void> {
  const db = getDb();

  for (const bot of ['entertainer', 'analyst'] as const) {
    const data = records[bot];
    const existing = await db
      .select({ id: forecastRecords.id })
      .from(forecastRecords)
      .where(and(eq(forecastRecords.season, season), eq(forecastRecords.bot, bot)))
      .limit(1);

    if (existing.length) {
      await db
        .update(forecastRecords)
        .set({ wins: data.w, losses: data.l, updatedAt: new Date() })
        .where(eq(forecastRecords.id, existing[0].id));
    } else {
      await db.insert(forecastRecords).values({
        season,
        bot,
        wins: data.w,
        losses: data.l,
      });
    }
  }
}

// ============ Pending Picks ============

export interface PendingPicksData {
  week: number;
  picks: Array<{
    matchup_id: string | number;
    team1?: string;
    team2?: string;
    entertainer_pick: string;
    analyst_pick: string;
  }>;
}

export async function loadPendingPicks(
  season: number,
  week: number
): Promise<PendingPicksData | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(pendingPicks)
    .where(and(eq(pendingPicks.season, season), eq(pendingPicks.week, week)));

  if (!rows.length) return null;

  return {
    week,
    picks: rows.map(r => ({
      matchup_id: r.matchupId,
      team1: r.team1 || undefined,
      team2: r.team2 || undefined,
      entertainer_pick: r.entertainerPick || '',
      analyst_pick: r.analystPick || '',
    })),
  };
}

export async function savePendingPicks(
  season: number,
  data: PendingPicksData
): Promise<void> {
  const db = getDb();

  // Delete old picks for this week
  await db
    .delete(pendingPicks)
    .where(and(eq(pendingPicks.season, season), eq(pendingPicks.week, data.week)));

  // Insert new picks
  if (data.picks.length) {
    await db.insert(pendingPicks).values(
      data.picks.map(p => ({
        season,
        week: data.week,
        matchupId: String(p.matchup_id),
        team1: p.team1 || null,
        team2: p.team2 || null,
        entertainerPick: p.entertainer_pick || null,
        analystPick: p.analyst_pick || null,
      }))
    );
  }
}

// ============ Newsletters ============

export interface NewsletterData {
  newsletter: {
    meta: { leagueName: string; week: number; date: string; season: number };
    sections: Array<{ type: string; data: unknown }>;
  };
  html: string;
  generatedAt: string;
}

export async function loadNewsletter(
  season: number,
  week: number
): Promise<NewsletterData | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(newsletters)
    .where(and(eq(newsletters.season, season), eq(newsletters.week, week)))
    .limit(1);

  if (!rows.length) return null;

  const row = rows[0];
  return {
    newsletter: row.content as NewsletterData['newsletter'],
    html: row.html,
    generatedAt: row.generatedAt.toISOString(),
  };
}

export async function saveNewsletter(
  season: number,
  week: number,
  leagueName: string,
  content: NewsletterData['newsletter'],
  html: string
): Promise<void> {
  const db = getDb();

  // Delete existing newsletter for this week (if regenerating)
  await db
    .delete(newsletters)
    .where(and(eq(newsletters.season, season), eq(newsletters.week, week)));

  // Insert new newsletter
  await db.insert(newsletters).values({
    season,
    week,
    leagueName,
    content,
    html,
  });
}

export async function listNewsletterWeeks(season: number): Promise<number[]> {
  const db = getDb();
  const rows = await db
    .select({ week: newsletters.week })
    .from(newsletters)
    .where(eq(newsletters.season, season));

  return rows.map(r => r.week).sort((a, b) => a - b);
}

/**
 * Load previous newsletter for callbacks/references
 * Returns the newsletter from the previous week if it exists
 */
export async function loadPreviousNewsletter(
  season: number,
  currentWeek: number
): Promise<NewsletterData | null> {
  if (currentWeek <= 1) return null;
  return loadNewsletter(season, currentWeek - 1);
}

/**
 * Extract predictions from a previous newsletter for grading
 */
export function extractPredictionsFromNewsletter(
  newsletter: NewsletterData
): Array<{
  matchupId: string | number;
  team1: string;
  team2: string;
  entertainerPick: string;
  analystPick: string;
}> {
  const predictions: Array<{
    matchupId: string | number;
    team1: string;
    team2: string;
    entertainerPick: string;
    analystPick: string;
  }> = [];
  
  // Find the Forecast section
  const forecastSection = newsletter.newsletter.sections.find(s => s.type === 'Forecast');
  if (!forecastSection || !forecastSection.data) return predictions;
  
  const data = forecastSection.data as {
    picks?: Array<{
      matchup_id: string | number;
      team1: string;
      team2: string;
      bot1_pick: string;
      bot2_pick: string;
    }>;
  };
  
  if (!data.picks) return predictions;
  
  for (const pick of data.picks) {
    predictions.push({
      matchupId: pick.matchup_id,
      team1: pick.team1,
      team2: pick.team2,
      entertainerPick: pick.bot1_pick,
      analystPick: pick.bot2_pick,
    });
  }
  
  return predictions;
}

/**
 * Extract hot takes from a previous newsletter for revisiting
 */
export function extractHotTakesFromNewsletter(
  newsletter: NewsletterData
): Array<{
  bot: 'entertainer' | 'analyst';
  take: string;
  subject: string;
}> {
  const hotTakes: Array<{
    bot: 'entertainer' | 'analyst';
    take: string;
    subject: string;
  }> = [];
  
  // Look through intro and other sections for bold statements
  for (const section of newsletter.newsletter.sections) {
    const data = section.data as { bot1_text?: string; bot2_text?: string };
    
    // Simple heuristic: look for strong language patterns
    const patterns = [
      /I('m| am) calling it/i,
      /mark my words/i,
      /guarantee/i,
      /no way/i,
      /will (definitely|absolutely|certainly)/i,
      /fraud/i,
      /pretender/i,
      /contender/i,
    ];
    
    if (data.bot1_text) {
      for (const pattern of patterns) {
        if (pattern.test(data.bot1_text)) {
          hotTakes.push({
            bot: 'entertainer',
            take: data.bot1_text.slice(0, 200),
            subject: section.type,
          });
          break;
        }
      }
    }
    
    if (data.bot2_text) {
      for (const pattern of patterns) {
        if (pattern.test(data.bot2_text)) {
          hotTakes.push({
            bot: 'analyst',
            take: data.bot2_text.slice(0, 200),
            subject: section.type,
          });
          break;
        }
      }
    }
  }
  
  return hotTakes;
}

export async function deleteNewsletter(season: number, week: number): Promise<boolean> {
  const db = getDb();
  const result = await db
    .delete(newsletters)
    .where(and(eq(newsletters.season, season), eq(newsletters.week, week)));
  
  // Also delete any staged data
  await db
    .delete(newsletterStaged)
    .where(and(eq(newsletterStaged.season, season), eq(newsletterStaged.week, week)));

  return true;
}

// ============ Staged Generation ============

export interface StagedNewsletterData {
  id: string;
  season: number;
  week: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'published';
  startedAt: string | null;
  completedAt: string | null;
  publishedAt: string | null;
  sectionsCompleted: string[];
  currentSection: string | null;
  error: string | null;
  generatedContent: Record<string, { entertainer: string; analyst: string }>;
  derivedData: Record<string, unknown> | null;
}

export async function loadStagedNewsletter(
  season: number,
  week: number
): Promise<StagedNewsletterData | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(newsletterStaged)
    .where(and(eq(newsletterStaged.season, season), eq(newsletterStaged.week, week)))
    .limit(1);

  if (!rows.length) return null;

  const row = rows[0];
  return {
    id: row.id,
    season: row.season,
    week: row.week,
    status: row.status as StagedNewsletterData['status'],
    startedAt: row.startedAt?.toISOString() || null,
    completedAt: row.completedAt?.toISOString() || null,
    publishedAt: row.publishedAt?.toISOString() || null,
    sectionsCompleted: row.sectionsCompleted || [],
    currentSection: row.currentSection || null,
    error: row.error || null,
    generatedContent: (row.generatedContent || {}) as Record<string, { entertainer: string; analyst: string }>,
    derivedData: (row.derivedData || null) as Record<string, unknown> | null,
  };
}

export async function createStagedNewsletter(
  season: number,
  week: number,
  derivedData: Record<string, unknown>
): Promise<string> {
  const db = getDb();

  // Delete existing if any
  await db
    .delete(newsletterStaged)
    .where(and(eq(newsletterStaged.season, season), eq(newsletterStaged.week, week)));

  const result = await db.insert(newsletterStaged).values({
    season,
    week,
    status: 'pending',
    derivedData,
  }).returning({ id: newsletterStaged.id });

  return result[0].id;
}

export async function updateStagedNewsletter(
  season: number,
  week: number,
  updates: {
    status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'published';
    currentSection?: string | null;
    sectionsCompleted?: string[];
    generatedContent?: Record<string, { entertainer: string; analyst: string }>;
    error?: string | null;
  }
): Promise<void> {
  const db = getDb();

  const setData: Record<string, unknown> = {};
  
  if (updates.status !== undefined) {
    setData.status = updates.status;
    if (updates.status === 'in_progress' && !updates.currentSection) {
      setData.startedAt = new Date();
    }
    if (updates.status === 'completed') {
      setData.completedAt = new Date();
    }
    if (updates.status === 'published') {
      setData.publishedAt = new Date();
    }
  }
  if (updates.currentSection !== undefined) setData.currentSection = updates.currentSection;
  if (updates.sectionsCompleted !== undefined) setData.sectionsCompleted = updates.sectionsCompleted;
  if (updates.generatedContent !== undefined) setData.generatedContent = updates.generatedContent;
  if (updates.error !== undefined) setData.error = updates.error;

  await db
    .update(newsletterStaged)
    .set(setData)
    .where(and(eq(newsletterStaged.season, season), eq(newsletterStaged.week, week)));
}

// ============ Cross-Season Memory ============

export async function loadPreviousSeasonMemory(
  bot: BotName,
  currentSeason: number
): Promise<BotMemory | null> {
  // Load memory from previous season to carry forward
  return loadBotMemory(bot, currentSeason - 1);
}

export async function initializeSeasonMemory(
  bot: BotName,
  season: number,
  previousMemory: BotMemory | null
): Promise<BotMemory> {
  // If no previous memory, create fresh
  if (!previousMemory) {
    const fresh: BotMemory = {
      bot,
      updated_at: new Date().toISOString(),
      summaryMood: 'Focused',
      teams: {},
    };
    await saveBotMemory(bot, season, fresh);
    return fresh;
  }

  // Decay previous season's memory (reduce extremes, but keep general sentiment)
  const decayedTeams: BotMemory['teams'] = {};
  for (const [teamName, teamData] of Object.entries(previousMemory.teams)) {
    decayedTeams[teamName] = {
      // Decay trust/frustration toward neutral (0) by 50%
      trust: Math.round(teamData.trust * 0.5),
      frustration: Math.round(teamData.frustration * 0.5),
      // Reset mood to Neutral for new season
      mood: 'Neutral',
    };
  }

  const newMemory: BotMemory = {
    bot,
    updated_at: new Date().toISOString(),
    summaryMood: 'Focused', // Fresh start each season
    teams: decayedTeams,
  };

  await saveBotMemory(bot, season, newMemory);
  return newMemory;
}
