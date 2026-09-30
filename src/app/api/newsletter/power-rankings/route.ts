import { NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import {
  extractUploadedPdfPowerRankings,
  type UploadedPdfPowerRankings,
  type UploadedPdfRankingItem,
} from '@/lib/newsletter/uploaded-pdf-continuity';
import type {
  IndependentPowerRankingsSection,
  IndependentRankingItem,
} from '@/lib/newsletter/weekly-recap-types';
import { listNewslettersMeta, loadNewsletterById } from '@/server/db/newsletter-queries';
import { presignGet } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type DisplayRankingItem = {
  rank: number;
  team: string;
  blurb: string;
  movementLabel?: string;
  movementDirection?: 'up' | 'down' | 'neutral';
  movementDescription?: string;
  record?: string;
  pointsFor?: number;
};

type DisplayPowerRankings = {
  masonRankings: DisplayRankingItem[];
  westyRankings: DisplayRankingItem[];
  bot1_intro?: string;
  bot2_intro?: string;
  source: 'structured' | 'uploaded-pdf';
};

function structuredMovement(item: IndependentRankingItem) {
  if (item.movement === 'new') {
    return {
      movementLabel: '→',
      movementDirection: 'neutral' as const,
      movementDescription: 'No prior ranking comparison available',
    };
  }
  if (item.movement === 'same') {
    return {
      movementLabel: '→',
      movementDirection: 'neutral' as const,
      movementDescription: 'No change from the previous ranking',
    };
  }
  return {
    movementLabel: (item.movement === 'up' ? '↑' : '↓') + String(item.movementAmount),
    movementDirection: item.movement,
    movementDescription:
      'Moved ' + item.movement + ' ' + String(item.movementAmount) + ' spot' +
      (item.movementAmount === 1 ? '' : 's'),
  };
}

function displayStructured(data: IndependentPowerRankingsSection): DisplayPowerRankings {
  const convert = (items: IndependentRankingItem[]): DisplayRankingItem[] => items.map((item) => ({
    rank: item.rank,
    team: item.team,
    blurb: item.blurb,
    record: item.record,
    pointsFor: item.pointsFor,
    ...structuredMovement(item),
  }));

  return {
    masonRankings: convert(data.masonRankings),
    westyRankings: convert(data.westyRankings),
    bot1_intro: data.bot1_intro,
    bot2_intro: data.bot2_intro,
    source: 'structured',
  };
}

function pdfMovement(item: UploadedPdfRankingItem): Pick<
  DisplayRankingItem,
  'movementLabel' | 'movementDirection' | 'movementDescription'
> {
  if (item.movement === 'up') {
    return {
      movementLabel: '↑' + String(item.movementAmount),
      movementDirection: 'up',
      movementDescription:
        'Moved up ' + String(item.movementAmount) + ' spot' +
        (item.movementAmount === 1 ? '' : 's') +
        (item.previousRank ? ' from No. ' + String(item.previousRank) : ''),
    };
  }
  if (item.movement === 'down') {
    return {
      movementLabel: '↓' + String(item.movementAmount),
      movementDirection: 'down',
      movementDescription:
        'Moved down ' + String(item.movementAmount) + ' spot' +
        (item.movementAmount === 1 ? '' : 's') +
        (item.previousRank ? ' from No. ' + String(item.previousRank) : ''),
    };
  }
  if (item.movement === 'same') {
    return {
      movementLabel: '→',
      movementDirection: 'neutral',
      movementDescription: item.previousRank
        ? 'No change from No. ' + String(item.previousRank)
        : 'No change',
    };
  }
  if (item.movement === 'new') {
    return {
      movementLabel: '→',
      movementDirection: 'neutral',
      movementDescription: 'No prior ranking comparison available',
    };
  }
  return {};
}

function displayPdf(data: UploadedPdfPowerRankings): DisplayPowerRankings {
  const convert = (items: UploadedPdfRankingItem[]): DisplayRankingItem[] => items.map((item) => ({
    rank: item.rank,
    team: item.team,
    blurb: item.blurb,
    ...pdfMovement(item),
  }));

  return {
    masonRankings: convert(data.masonRankings),
    westyRankings: convert(data.westyRankings),
    source: 'uploaded-pdf',
  };
}

function isStoredPdfRankings(value: unknown): value is UploadedPdfPowerRankings {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<UploadedPdfPowerRankings>;
  return Array.isArray(data.masonRankings)
    && data.masonRankings.length === 12
    && Array.isArray(data.westyRankings)
    && data.westyRankings.length === 12;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')?.trim();

  if (!id) {
    const seasonValue = req.nextUrl.searchParams.get('season')?.trim();
    const season = Number(seasonValue);
    if (!seasonValue || !Number.isFinite(season)) {
      return Response.json({ error: 'Newsletter id or season is required.' }, { status: 400 });
    }

    const items = (await listNewslettersMeta(season, { includeDrafts: true }))
      .filter((item) => item.status === 'published')
      .sort((a, b) => {
        const aTime = Date.parse(a.publishedAt || a.generatedAt) || 0;
        const bTime = Date.parse(b.publishedAt || b.generatedAt) || 0;
        return bTime - aTime;
      });

    return Response.json(
      { success: true, season, items },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600' } },
    );
  }

  const item = await loadNewsletterById(id);
  if (!item) return Response.json({ error: 'Newsletter not found.' }, { status: 404 });

  const admin = isAdminCookieValue(req.cookies.get('evw_admin')?.value);
  if (item.status !== 'published' && !admin) {
    return Response.json({ error: 'Newsletter not found.' }, { status: 404 });
  }

  const structuredSection = item.newsletter.sections.find((section) => section.type === 'PowerRankings');
  if (structuredSection?.data) {
    const rankings = structuredSection.data as IndependentPowerRankingsSection;
    if (
      Array.isArray(rankings.masonRankings)
      && rankings.masonRankings.length === 12
      && Array.isArray(rankings.westyRankings)
      && rankings.westyRankings.length === 12
    ) {
      return Response.json(
        { success: true, rankings: displayStructured(rankings) },
        { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' } },
      );
    }
  }

  const pdfSection = item.newsletter.sections.find((section) => section.type === 'UploadedPdf');
  const pdfData = (pdfSection?.data ?? null) as {
    key?: string;
    powerRankings?: unknown;
  } | null;

  if (isStoredPdfRankings(pdfData?.powerRankings)) {
    return Response.json(
      { success: true, rankings: displayPdf(pdfData.powerRankings) },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  }

  const key = pdfData?.key?.trim();
  if (!key || !key.startsWith('newsletter/uploads/')) {
    return Response.json({ error: 'This issue does not contain complete Power Rankings.' }, { status: 404 });
  }

  try {
    const signedUrl = await presignGet({ key, expiresSec: 90 });
    const upstream = await fetch(signedUrl, { cache: 'no-store' });
    if (!upstream.ok) throw new Error('storage returned ' + String(upstream.status));

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    const rankings = await extractUploadedPdfPowerRankings(
      bytes,
      item.title || 'East v. West Newsletter',
    );
    if (!rankings || rankings.masonRankings.length !== 12 || rankings.westyRankings.length !== 12) {
      return Response.json(
        { error: 'Could not recover all 12 Mason and Westy rankings from this PDF.' },
        { status: 422 },
      );
    }

    return Response.json(
      { success: true, rankings: displayPdf(rankings) },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (error) {
    console.error(
      '[newsletter/power-rankings] failed:',
      error instanceof Error ? error.message : String(error),
    );
    return Response.json(
      { error: 'Power Rankings could not be extracted from this issue.' },
      { status: 502 },
    );
  }
}
