import { NextRequest } from 'next/server';
import * as core from './route-core';
import { listNewslettersMeta } from '@/server/db/newsletter-queries';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { LEAGUE_CALENDARS } from '@/lib/constants/league-calendar';
import { buildTradeDeadlineAudit } from '@/lib/newsletter/trade-deadline-export';
import type { Trade } from '@/lib/utils/trades';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function previousPublishedCutoff(season: number) {
  const current = await listNewslettersMeta(season).catch(() => []);
  const priorSeason = current.some(item => item.status === 'published') || season <= 2023
    ? []
    : await listNewslettersMeta(season - 1).catch(() => []);
  const latest = [...current, ...priorSeason]
    .filter(item => item.status === 'published')
    .sort((a, b) => String(b.publishedAt ?? b.generatedAt).localeCompare(String(a.publishedAt ?? a.generatedAt)))[0] ?? null;
  if (!latest) return null;
  return {
    issueId: latest.id,
    issueTitle: latest.title,
    season: latest.season,
    week: latest.week,
    publishedAt: latest.publishedAt ?? latest.generatedAt,
  };
}

export async function GET(req: NextRequest): Promise<Response> {
  const kind = req.nextUrl.searchParams.get('kind') || 'source-pack';
  const episodeType = req.nextUrl.searchParams.get('episodeType') || 'regular';
  if (kind === 'source-pack' && episodeType === 'trade_deadline') {
    if (!isAdminCookieValue(req.cookies.get('evw_admin')?.value)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    const season = Number(req.nextUrl.searchParams.get('season') || new Date().getFullYear());
    const week = Number(req.nextUrl.searchParams.get('week') || 0);
    const calendar = LEAGUE_CALENDARS.find(value => value.season === season);
    if (!calendar) {
      return Response.json({ error: 'No configured trade deadline date for this season.' }, { status: 422 });
    }
    if (week !== 12) {
      return Response.json({ error: 'The post-deadline special must use completed Week 12. Select Week 12.' }, { status: 422 });
    }
    if (Date.now() < calendar.tradeDeadline.getTime()) {
      return Response.json({
        error: 'The Trade Deadline Source Pack is a post-deadline retrospective. It is available after the Week 12 deadline closes on ' +
          calendar.tradeDeadline.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' }) + ' Eastern.',
      }, { status: 409 });
    }
  }

  const response = await core.GET(req);
  if (!response.ok || (req.nextUrl.searchParams.get('kind') || 'source-pack') !== 'source-pack') return response;

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return response;

  try {
    const payload = await response.json() as Record<string, unknown>;
    const request = (payload.request ?? {}) as Record<string, unknown>;
    const season = Number(request.season ?? req.nextUrl.searchParams.get('season') ?? new Date().getFullYear());
    const cutoff = await previousPublishedCutoff(Number.isFinite(season) ? season : new Date().getFullYear());
    const directive = (payload.generationDirective ?? {}) as Record<string, unknown>;
    const continuity = (payload.botContinuity ?? {}) as Record<string, unknown>;
    if (request.episodeType === 'trade_deadline') {
      const calendar = LEAGUE_CALENDARS.find(value => value.season === season);
      if (!calendar) throw new Error('Missing calendar for trade deadline export.');
      const history = (payload.historyAndTransactions ?? {}) as { allTrades?: Trade[] };
      const priorIssues = ((continuity.recentPublishedIssues ?? []) as Array<{
        id: string; title?: string | null; sections?: unknown;
      }>);
      const audit = buildTradeDeadlineAudit({
        season,
        regularSeasonStartAt: calendar.regularSeasonStart.toISOString(),
        deadlineAt: calendar.tradeDeadline.toISOString(),
        exportedAt: String(payload.exportedAt ?? new Date().toISOString()),
        previousPublishedIssueCutoff: cutoff?.publishedAt ?? null,
        trades: Array.isArray(history.allTrades) ? history.allTrades : [],
        recentPublishedIssues: priorIssues,
      });
      if (calendar.estimatedFields?.includes('tradeDeadline')) {
        audit.warnings.push('This season\'s deadline date is estimated in the league calendar; confirm it against the rulebook and Sleeper before publishing.');
      }
      payload.tradeDeadlineAudit = audit;
      payload.generationDirective = {
        ...directive,
        episodeTiming: 'Post-deadline retrospective only; freeze league analysis at the exported source-pack snapshot after Week 12 completes.',
        transactionCutoff: 'For this special, use the complete, chronological tradeDeadlineAudit for ALL completed regular-season trades through the end-of-Week-12 deadline. The previous published issue cutoff (' +
          (cutoff?.publishedAt ?? 'not available') +
          ') is a prior-coverage reference, NOT a filter excluding earlier transactions. Verify prior published coverage; do not assume any older deal was already discussed.',
        length: 'Aim for a substantial 45-55-page, approximately 50-page magazine issue. Every trade and all 12 franchise strategies deserve real analysis; no filler or artificial page inflation.',
        completeness: 'Reconcile every completed trade ID in the ledger against the finished issue. Evaluate pending trades only as unresolved. Flag data-quality failures and date-only ambiguities rather than guessing.',
      };
    } else {
      payload.generationDirective = {
        ...directive,
        transactionCutoff: cutoff
          ? `For a Weekly Recap, cover transactions strictly after ${cutoff.publishedAt}, the previous published issue cutoff (${cutoff.issueTitle ?? cutoff.issueId}). Do not repeat transactions from that issue.`
          : 'No previous published issue was found. Cover meaningful current-season transactions and establish the first durable cutoff.',
      };
    }
    payload.botContinuity = {
      ...continuity,
      previousPublishedIssueCutoff: cutoff,
    };

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(payload, null, 2), { status: response.status, headers });
  } catch (error) {
    if (episodeType === 'trade_deadline') {
      return Response.json({
        error: 'Trade Deadline audit failed. Export withheld to avoid an incomplete episode pack.',
        details: error instanceof Error ? error.message : String(error),
      }, { status: 503 });
    }
    return response;
  }
}
