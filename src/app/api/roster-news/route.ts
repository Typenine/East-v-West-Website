import { NextRequest, NextResponse } from 'next/server';
import { fetchAllRss, RssItem } from '@/lib/feeds/rss-fetcher';
import { getAllPlayersCached, SleeperPlayer } from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type RosterNewsMatch = { playerId: string; name: string };
export type RosterNewsResponse = {
  generatedAt: string;
  count: number;
  sinceHours: number;
  items: Array<
    RssItem & {
      matches: RosterNewsMatch[];
    }
  >;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playersCsv = (searchParams.get('playerIds') || '').trim();
    if (!playersCsv) {
      return NextResponse.json({ error: 'Missing playerIds query param (comma-separated Sleeper IDs)' }, { status: 400 });
    }
    const limit = clamp(Math.floor(Number(searchParams.get('limit')) || 50), 1, 100);
    const sinceHours = clamp(Math.floor(Number(searchParams.get('sinceHours')) || 168), 1, 24 * 90); // up to 90 days

    const playerIds = Array.from(
      new Set(
        playersCsv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );

    // Load players index for name mapping
    const playersIndex = (await getAllPlayersCached()) as Record<string, SleeperPlayer>;
    const names = playerIds
      .map((id) => {
        const p = playersIndex[id];
        if (!p) return null;
        const full = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        return full ? ({ id, name: full }) : null;
      })
      .filter(Boolean) as Array<{ id: string; name: string }>;

    if (names.length === 0) {
      return NextResponse.json(
        { generatedAt: new Date().toISOString(), count: 0, sinceHours, items: [] } satisfies RosterNewsResponse,
        { status: 200 }
      );
    }

    // Precompile regexes for exact full-name matches with word boundaries
    const matchers = names.map(({ id, name }) => ({
      id,
      name,
      re: new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i'),
    }));

    const allItems = await fetchAllRss();
    const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;

    const matched = [] as RosterNewsResponse['items'];
    for (const it of allItems) {
      const hay = `${it.title} ${it.description}`;
      const matches: RosterNewsMatch[] = [];
      for (const m of matchers) {
        if (m.re.test(hay)) {
          matches.push({ playerId: m.id, name: m.name });
        }
      }
      if (matches.length > 0) {
        // date filter
        const ts = it.publishedAt ? new Date(it.publishedAt).getTime() : 0;
        if (ts === 0 || ts >= cutoff) {
          matched.push({ ...it, matches });
        }
      }
    }

    matched.sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    });

    const limited = matched.slice(0, limit);

    const resp: RosterNewsResponse = {
      generatedAt: new Date().toISOString(),
      count: limited.length,
      sinceHours,
      items: limited,
    };
    return NextResponse.json(resp, { status: 200 });
  } catch (err) {
    console.error('Roster News API error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
