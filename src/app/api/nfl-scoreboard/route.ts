import { NextRequest, NextResponse } from 'next/server';
import { getNFLState } from '@/lib/utils/sleeper-api';
import { normalizeTeamCode } from '@/lib/constants/nfl-teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Simple in-memory cache keyed by week to reduce upstream calls
const TTL_MS = 15_000;
const cache: Record<string, { ts: number; data: unknown }> = {};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const weekParam = Number(searchParams.get('week'));
    const week = clamp(Number.isFinite(weekParam) ? weekParam : 1, 1, 23);
    const seasonParam = searchParams.get('season');
    let season: string | undefined = seasonParam || undefined;
    if (!season) {
      try {
        const s = await getNFLState();
        season = String((s as { season?: string }).season || new Date().getFullYear());
      } catch {
        season = String(new Date().getFullYear());
      }
    }
    const cacheKey = `season:${season}-week:${week}`;

    const now = Date.now();
    const cached = cache[cacheKey];
    if (cached && now - cached.ts < TTL_MS) {
      return NextResponse.json(cached.data, { status: 200 });
    }

    const common = `week=${week}&seasontype=2&year=${encodeURIComponent(season!)}`;
    const url1 = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?${common}`;
    const url2 = `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?${common}`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      'Accept': 'application/json,text/plain,*/*',
      'Referer': 'https://www.espn.com/nfl/scoreboard'
    } as const;

    async function fetchScoreboard(url: string) {
      const r = await fetch(url, { next: { revalidate: 0 }, headers });
      if (!r.ok) throw new Error(`ESPN scoreboard fetch failed: ${r.status}`);
      const j = await r.json();
      const evs: unknown[] = Array.isArray((j as { events?: unknown[] })?.events)
        ? (j as { events: unknown[] }).events
        : [];
      return { json: j, events: evs };
    }

    let rawEvents: unknown[] = [];
    try {
      const { events: e1 } = await fetchScoreboard(url1);
      rawEvents = e1;
      if (!rawEvents || rawEvents.length === 0) throw new Error('empty events from espn primary');
    } catch {
      const { events: e2 } = await fetchScoreboard(url2);
      rawEvents = e2;
    }

    type Game = {
      id: string;
      startDate: string;
      state: 'pre' | 'in' | 'post';
      period?: number;
      displayClock?: string;
      home: { code?: string; score?: number };
      away: { code?: string; score?: number };
      possessionTeam?: string; // Sleeper code
    };

    const games: Game[] = [];
    const teamStatuses: Record<string, {
      gameId: string;
      opponent?: string;
      isHome: boolean;
      startDate: string;
      state: 'pre' | 'in' | 'post';
      period?: number;
      displayClock?: string;
      possessionTeam?: string;
      scoreFor?: number;
      scoreAgainst?: number;
    }> = {};

    // Minimal ESPN types for parsing
    type ESPNTeam = { abbreviation?: string };
    type ESPNCompetitor = { homeAway?: 'home' | 'away'; team?: ESPNTeam; score?: string };
    type ESPNCompetition = {
      competitors?: ESPNCompetitor[];
      status?: { period?: number; displayClock?: string; type?: { state?: 'pre' | 'in' | 'post' } };
      situation?: { possession?: string };
      id?: string;
      date?: string;
    };
    type ESPNStatus = { type?: { state?: 'pre' | 'in' | 'post' }; period?: number; displayClock?: string };
    type ESPNEvent = { id?: string; date?: string; status?: ESPNStatus; competitions?: ESPNCompetition[] };

    for (const raw of rawEvents) {
      const ev = raw as ESPNEvent;
      const comp = Array.isArray(ev?.competitions) ? (ev.competitions as ESPNCompetition[])[0] : undefined;
      if (!comp) continue;
      const comps = Array.isArray(comp?.competitors) ? (comp.competitors as ESPNCompetitor[]) : [];
      const home = comps.find((c) => c?.homeAway === 'home');
      const away = comps.find((c) => c?.homeAway === 'away');
      const homeCodeESPN = home?.team?.abbreviation;
      const awayCodeESPN = away?.team?.abbreviation;
      const homeScore = home?.score != null ? Number(home.score) : undefined;
      const awayScore = away?.score != null ? Number(away.score) : undefined;
      const homeCode = normalizeTeamCode(homeCodeESPN);
      const awayCode = normalizeTeamCode(awayCodeESPN);

      const statusType = (ev?.status?.type?.state || comp?.status?.type?.state || 'pre') as 'pre' | 'in' | 'post';
      const period = Number(comp?.status?.period || ev?.status?.period || 0) || undefined;
      const displayClock = comp?.status?.displayClock || ev?.status?.displayClock || undefined;
      const possessionAbbrev = comp?.situation?.possession;
      const possessionTeam = normalizeTeamCode(possessionAbbrev);
      const gameId = String(ev?.id ?? comp?.id ?? cryptoRandomId());
      const startDate = String(ev?.date ?? comp?.date ?? new Date().toISOString());

      games.push({
        id: gameId,
        startDate,
        state: statusType,
        period,
        displayClock,
        home: { code: homeCode, score: homeScore },
        away: { code: awayCode, score: awayScore },
        possessionTeam,
      });

      if (homeCode) {
        teamStatuses[homeCode] = {
          gameId,
          opponent: awayCode,
          isHome: true,
          startDate,
          state: statusType,
          period,
          displayClock,
          possessionTeam,
          scoreFor: homeScore,
          scoreAgainst: awayScore,
        };
      }
      if (awayCode) {
        teamStatuses[awayCode] = {
          gameId,
          opponent: homeCode,
          isHome: false,
          startDate,
          state: statusType,
          period,
          displayClock,
          possessionTeam,
          scoreFor: awayScore,
          scoreAgainst: homeScore,
        };
      }
    }

    const payload = {
      week,
      generatedAt: new Date().toISOString(),
      teamStatuses,
      games,
    };

    cache[cacheKey] = { ts: now, data: payload };
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error('nfl-scoreboard API error', err);
    return NextResponse.json({ error: 'Failed to load scoreboard' }, { status: 500 });
  }
}

function cryptoRandomId() {
  try {
    const g: unknown = globalThis as unknown;
    // Narrow global crypto safely
    if (g && typeof g === 'object' && 'crypto' in g) {
      const c = (g as { crypto?: { randomUUID?: () => string } }).crypto;
      if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    }
  } catch {
    // ignore
  }
  return Math.random().toString(36).slice(2);
}
