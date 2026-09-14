import { NextRequest } from 'next/server';
import * as core from './route-core';
import { listNewslettersMeta } from '@/server/db/newsletter-queries';

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
    payload.generationDirective = {
      ...directive,
      transactionCutoff: cutoff
        ? `For a Weekly Recap, cover transactions strictly after ${cutoff.publishedAt}, the previous published issue cutoff (${cutoff.issueTitle ?? cutoff.issueId}). Do not repeat transactions from that issue.`
        : 'No previous published issue was found. Cover meaningful current-season transactions and establish the first durable cutoff.',
    };
    payload.botContinuity = {
      ...continuity,
      previousPublishedIssueCutoff: cutoff,
    };

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(payload, null, 2), { status: response.status, headers });
  } catch {
    return response;
  }
}
