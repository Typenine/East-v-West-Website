/**
 * Admin-only visibility and safe replay of the published newsletter memory.
 * No AI inference, personality grading, or external API calls are performed.
 */
import { NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { listNewslettersMeta, loadBotMemory, loadNewsletterById, saveBotMemory } from '@/server/db/newsletter-queries';
import { TEAM_NAMES } from '@/lib/constants/league';
import { synthesizePublishedIntelligence } from '@/lib/newsletter/editorial-memory';
import { reconcilePublishedClaim } from '@/lib/newsletter/published-claim-quality';
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
    claimQuality: {
      predictions: ledger.entries.filter(item => item.claimType === 'prediction').length,
      needsReview: ledger.entries.filter(item => reconcilePublishedClaim(item).qualityReviewRequired).length,
      staleClassifications: ledger.entries.filter(item => {
        const corrected = reconcilePublishedClaim(item);
        return corrected.claimType !== item.claimType || corrected.claim !== item.claim;
      }).length,
    },
  });
  return {
    season,
    publishedIssues: issues.length,
    latestPublishedIssue: issues.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0] ?? null,
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
  if (body?.action === 'dry-run') {
    const season = readSeason(body.season);
    const issueId = typeof body.issueId === 'string' ? body.issueId : '';
    if (!season || !/^[0-9a-f-]{36}$/i.test(issueId)) return Response.json({ error: 'Invalid issue or season' }, { status: 400 });
    try {
      const issue = await loadNewsletterById(issueId);
      if (!issue || issue.season !== season || issue.status !== 'published') {
        return Response.json({ error: 'The specified issue is not published for this season' }, { status: 404 });
      }
      const sections = issue.newsletter?.sections ?? [];
      // PDFs have already been extracted at upload/publish time. For this
      // diagnostic use the STORED dialogue, never R2 or external AI calls.
      const getHostText = (value: unknown, keys: readonly string[]): string[] => {
        const out: string[] = [];
        function walk(node: unknown) {
          if (Array.isArray(node)) { for (const child of node) walk(child); return; }
          if (!node || typeof node !== 'object') return;
          const obj = node as Record<string, unknown>;
          for (const [key, child] of Object.entries(obj)) {
            if (keys.includes(key) && typeof child === 'string' && child.trim().length >= 12) out.push(child);
            else if (child && typeof child === 'object') walk(child);
          }
        }
        walk(value);
        return [...new Set(out)];
      };
      const masonText = getHostText(sections, ['bot1_text', 'entertainer', 'entertainer_paragraph']).join('\n');
      const westyText = getHostText(sections, ['bot2_text', 'analyst', 'analyst_paragraph']).join('\n');
      if (!masonText.trim() || !westyText.trim()) {
        return Response.json({
          issueId, title: issue.title, noWrites: true,
          error: 'Stored issue does not contain both attributable host transcripts; requires extraction review',
        }, { status: 422 });
      }
      const [masonMem, westyMem, masonLedger, westyLedger] = await Promise.all([
        loadBotMemory('entertainer', season),
        loadBotMemory('analyst', season),
        loadPublishedTakeLedgerState('entertainer', season),
        loadPublishedTakeLedgerState('analyst', season),
      ]);
      if (!masonMem || !westyMem) throw new Error('Cannot preview missing character memory');
      const knownPlayers = [...new Set([
        ...masonLedger.entries,
        ...westyLedger.entries,
      ].filter(x => x.subjectType === 'player').map(x => x.subject))];
      const digest = await synthesizePublishedIntelligence({
        season, week: issue.week, teamNames: TEAM_NAMES, playerNames: knownPlayers,
        entertainerText: masonText, analystText: westyText,
      });
      const checks = (bot: BotName, mem: typeof masonMem, entries: typeof masonLedger.entries, text: string) => {
        const clone = JSON.parse(JSON.stringify(mem)) as typeof masonMem;
        const before = JSON.stringify(clone);
        const normalizedText = text.toLowerCase().replace(/\[\[(?:TEAM|SECTION):[^\]]+\]\]/gi, ' ').replace(/\s+/g, ' ');
        const ownIssue = entries.filter(e => e.sourceNewsletterId === issueId);
        const missingQuotes = ownIssue.filter(e => {
          const normalizedClaim = reconcilePublishedClaim(e).claim.toLowerCase().replace(/\s+/g, ' ');
          return !normalizedText.includes(normalizedClaim.slice(0, Math.min(45, normalizedClaim.length)));
        });
        hydratePublishedRelationships(clone, entries);
        const firstReplay = JSON.stringify(clone);
        hydratePublishedRelationships(clone, entries);
        return {
          existingIssueTakes: ownIssue.length,
          independentlyExtractedClaims: digest.claims.filter(c => c.bot === bot).length,
          unmatchedQuoteCount: missingQuotes.length,
          unmatchedQuoteSamples: missingQuotes.slice(0, 4).map(e => e.id),
          replayIdempotent: firstReplay === JSON.stringify(clone),
          wouldChangeCharacterMemory: firstReplay !== before,
        };
      };
      return Response.json({
        issueId, title: issue.title, season, week: issue.week,
        noWrites: true, newsletterPublished: false, discordSent: false,
        mason: checks('entertainer', masonMem, masonLedger.entries, masonText),
        westy: checks('analyst', westyMem, westyLedger.entries, westyText),
      });
    } catch (error) {
      return Response.json({ error: String(error), noWrites: true }, { status: 500 });
    }
  }
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
