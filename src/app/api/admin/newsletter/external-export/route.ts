import { NextRequest } from 'next/server';
import * as core from './route-core';
import { listNewslettersMeta } from '@/server/db/newsletter-queries';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { LEAGUE_CALENDARS } from '@/lib/constants/league-calendar';
import { buildTradeDeadlineAudit } from '@/lib/newsletter/trade-deadline-export';
import { buildWeeklyRecapManifest } from '@/lib/newsletter/weekly-recap-export';
import { getLeagueMatchups, type SleeperMatchup } from '@/lib/utils/sleeper-api';
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
      const league = (payload.league ?? {}) as { leagueId?: string };
      const rosters = (payload.rosters ?? []) as Array<{ rosterId: number; team: string }>;
      const lineups = (payload.lineupReview ?? {}) as {
        teams?: Array<{ rosterId: number; team: string; matchupId: number | null; teamPoints: number | null }>;
      };
      const upcoming = league.leagueId
        ? await getLeagueMatchups(league.leagueId, 13, { forceFresh: true, timeoutMs: 20000 })
          .catch(() => [] as SleeperMatchup[])
        : [];
      const weeklyManifest = buildWeeklyRecapManifest({
        completedWeek: 12,
        upcomingWeek: 13,
        rosters,
        completedLineups: lineups.teams ?? [],
        upcomingSleeperMatchups: upcoming,
      });
      payload.tradeDeadlineAudit = audit;
      payload.weeklyRecapManifest = weeklyManifest;
      payload.generationDirective = {
        ...directive,
        editionType: 'ONE complete Week 12 Weekly Recap plus additional Trade Deadline Dossier in the SAME issue.',
        episodeTiming: 'Post-deadline combined Week 12 recap and trade retrospective. Freeze factual conclusions to the exported snapshot and verify final Week 12 scores.',
        requiredWeeklyRecap: 'Keep ALL nine usual weekly sections in order: Opening Exchange; Transactions Since the Last Issue; all six completed Week 12 matchup reviews; both complete, independently formed 1-12 power rankings interleaved by rank; League Pulse; Stock Watch; Clancy\'s Receipt Desk with verified scoreboard/receipts; all six Week 13 previews with each writer\'s pick; one Final Word. Insert the supplemental Trade Deadline Dossier after the six previews and before Final Word. Never shorten or omit weekly coverage in favor of deadline coverage.',
        transactionCutoff: 'The ordinary weekly Transactions Since the Last Issue section covers moves strictly after ' +
          (cutoff?.publishedAt ?? 'the latest available verified prior issue cutoff') +
          '. Separately, the ADDITIONAL Trade Deadline Dossier reviews the full chronological tradeDeadlineAudit of all completed 2026 in-season trades through Week 12, including older deals as strategic history. Do not duplicate detailed analysis or treat older deals as new.',
        length: 'ONE approximately 50-page combined publication: preserve the full roughly 30-page Week 12 recap and ADD approximately 15-20 pages of substantial trade-deadline analysis. Ideal total 45-55 pages without filler or shrinking weekly sections.',
        completeness: 'Before publication verify six finished Week 12 matchups, both full 1-12 rankings, all normal weekly recurring sections, six Week 13 previews and independently reasoned picks, and every completed trade ID in the deadline ledger. If weeklyRecapManifest validation is incomplete, obtain a verified league schedule before writing; never invent or silently skip matchups. Separate pending trade claims and flag uncertain transaction timings.',
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
