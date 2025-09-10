import { NextRequest, NextResponse } from 'next/server';
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
    const cacheKey = `week:${week}`;

    const now = Date.now();
    const cached = cache[cacheKey];
    if (cached && now - cached.ts < TTL_MS) {
      return NextResponse.json(cached.data, { status: 200 });
    }

    const url = `https://site.api.espn.com/apis/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2`;
    const resp = await fetch(url, { next: { revalidate: 0 } });
    if (!resp.ok) throw new Error(`ESPN scoreboard fetch failed: ${resp.status}`);
    const json = await resp.json();
    const rawEvents: unknown[] = Array.isArray((json as { events?: unknown[] })?.events)
      ? (json as { events: unknown[] }).events
      : [];

    type Game = {
      id: string;
      startDate: string;
      state: 'pre' | 'in' | 'post';
      period?: number;
      displayClock?: string;
      home: { code?: string };
      away: { code?: string };
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
    }> = {};

    // Minimal ESPN types for parsing
    type ESPNTeam = { abbreviation?: string };
    type ESPNCompetitor = { homeAway?: 'home' | 'away'; team?: ESPNTeam };
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
        home: { code: homeCode },
        away: { code: awayCode },
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
