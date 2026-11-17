/**
 * Admin-only visibility and safe replay of the published newsletter memory.
 * No AI inference, personality grading, or external API calls are performed.
 */
import { NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { listNewslettersMeta, loadBotMemory, saveBotMemory } from '@/server/db/newsletter-queries';
import { loadPublishedTakeLedgerState } from '@/lib/newsletter/published-take-store';
import { hydratePublishedRelationships } from '@/lib/newsletter/published-memory-hydration';
import type { BotName } from '@/lib/newsletter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  return isAdminCookieValue(req.cookies.get('evw_admin')?.value);
}

function readSeason(raw: unknown): number | null {
  const season = Number(raw);
  return Number.isInteger(season) && season >= 2020 && season <= 2100 ? season : null;
}

async function getHealth(season: number) {
  const [mason, westy, masonLedger, westyLedger, allIssues] = await Promise.all([
    loadBotMemory('entertainer', season),
    loadBotMemory('analyst', season),
    loadPublishedTakeLedgerState('entertainer', season),
    loadPublishedTakeLedgerState('analyst', season),
    listNewslettersMeta(season),
  ]);
  const issues = allIssues.filter(issue => issue.status === 'published');
  const publishedIds = new Set(issues.map(issue => issue.id));
  const healthFor = (memory: typeof mason, ledger: typeof masonLedger) => ({
    lastUpdated: memory?.updated_at ?? null,
    takeCount: ledger.entries.length,
    processedIssues: ledger.processedNewsletterIds.filter(id => publishedIds.has(id)).length,
    deepTeamCount: Object.keys(memory?.deepTeamRelationships ?? {}).length,
    deepPlayerCount: Object.keys(memory?.deepPlayerRelationships ?? {}).length,
    growthLessons: memory?.personalGrowth?.hardLessons.length ?? 0,
    predictionResults: {
      correct: memory?.predictionStats?.correct ?? 0,
      wrong: memory?.predictionStats?.wrong ?? 0,
    },
  });
  return {
    season,
    publishedIssues: issues.length,
    bots: {
      mason: healthFor(mason, masonLedger),
      westy: healthFor(westy, westyLedger),
    },
    missingContinuity: issues
      .filter(issue => !masonLedger.processedNewsletterIds.includes(issue.id) || !westyLedger.processedNewsletterIds.includes(issue.id))
      .map(issue => ({ id: issue.id, title: issue.title, week: issue.week })),
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const season = readSeason(req.nextUrl.searchParams.get('season') ?? 2026);
  if (!season) return Response.json({ error: 'Invalid season' }, { status: 400 });
  try { return Response.json(await getHealth(season)); }
  catch (error) { return Response.json({ error: String(error) }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body?.action !== 'rehydrate') return Response.json({ error: 'Invalid action' }, { status: 400 });
  const season = readSeason(body.season);
  if (!season) return Response.json({ error: 'Invalid season' }, { status: 400 });

  const botNames: BotName[] = ['entertainer', 'analyst'];
  const result: Record<string, unknown> = {};
  try {
    // Dry-run these deterministic transformations against both copies before
    // persisting either. The published ledger is the source of truth.
    const planned = await Promise.all(botNames.map(async bot => {
      const [memory, ledger] = await Promise.all([
        loadBotMemory(bot, season),
        loadPublishedTakeLedgerState(bot, season),
      ]);
      if (!memory || !ledger.entries.length || !ledger.processedNewsletterIds.length) {
        throw new Error(`Cannot rehydrate ${bot}: no saved character memory or published take ledger`);
      }
      const before = {
        teams: Object.keys(memory.deepTeamRelationships ?? {}).length,
        players: Object.keys(memory.deepPlayerRelationships ?? {}).length,
      };
      const after = hydratePublishedRelationships(memory, ledger.entries);
      return { bot, memory, before, after };
    }));
    for (const row of planned) {
      await saveBotMemory(row.bot, season, row.memory);
      result[row.bot] = { before: row.before, after: row.after };
    }
    return Response.json({ success: true, season, results: result, health: await getHealth(season) });
  } catch (error) {
    return Response.json({ error: String(error), partialResults: result }, { status: 500 });
  }
}
