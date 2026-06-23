/**
 * Server-side league news endpoint.
 *
 * Unlike /api/roster-news (which accepts playerIds via URL), this endpoint
 * fetches league rosters itself so:
 *   - No 200-player URL-length cutoff
 *   - Every rostered player is always included
 *   - Each story includes the East v. West team that owns matched players
 *   - Roster and player metadata are cached server-side
 *
 * Query params:
 *   limit       (optional, default 30, max 100)
 *   sinceHours  (optional, default 168 = 7 days, max 90 days)
 *   hideLow     (optional, default true) — hide low-confidence broad-source matches
 *   teamFilter  (optional) — restrict to stories matching a specific EV team name
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchAllRss, RssItem } from '@/lib/feeds/rss-fetcher';
import { RSS_SOURCES, SourceProfile } from '@/lib/feeds/rss-sources';
import {
  getAllPlayersCached,
  getLeagueRosters,
  getRosterIdToTeamNameMap,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  classifyStory,
  isListicleOrRoundup,
  isWatchOrTVGuide,
  isBettingContent,
  normalizeText,
  type StoryCategory,
} from '@/lib/news/news-classifier';
import {
  escapeRegExp,
  canonicalizeUrl,
  containsPhrase,
  stripSuffixes,
  NICKNAMES,
} from '@/lib/news/news-matching';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ── Utility helpers ──────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export type { StoryCategory };

// ── Source profile index ─────────────────────────────────────────────────────

const SOURCE_PROFILE_MAP = new Map<string, SourceProfile>(
  RSS_SOURCES.map((s) => [s.id, s.profile])
);
const SOURCE_WEIGHT_MAP = new Map<string, number>(
  RSS_SOURCES.map((s) => [s.id, s.weight])
);

// ── Types ────────────────────────────────────────────────────────────────────

type MatchType = 'full' | 'alias' | 'initial';
type MatchConfidence = 'high' | 'medium' | 'low';

type LeagueNewsMatch = {
  playerId: string;
  name: string;
  position?: string;
  nflTeam?: string;
  evTeam?: string;
  evTeamSlug?: string;
  matchType?: MatchType;
  confidence?: MatchConfidence;
};

export type LeagueNewsItem = RssItem & {
  matches: LeagueNewsMatch[];
  category: StoryCategory;
  score?: number;
};

export type LeagueNewsResponse = {
  generatedAt: string;
  count: number;
  sinceHours: number;
  items: LeagueNewsItem[];
};

// ── Roster cache (5-minute TTL to avoid fanout on every request) ─────────────

type RosterCache = {
  ts: number;
  playerToTeam: Map<string, string>; // playerId → EV team name
  playerToTeamSlug: Map<string, string>;
  allPlayerIds: string[];
};
let rosterCache: RosterCache | null = null;
const ROSTER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getLeagueRosterMaps(): Promise<RosterCache> {
  if (rosterCache && Date.now() - rosterCache.ts < ROSTER_CACHE_TTL_MS) {
    return rosterCache;
  }

  const leagueId = LEAGUE_IDS.CURRENT;
  const [rosters, nameMap] = await Promise.all([
    getLeagueRosters(leagueId).catch(() => []),
    getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
  ]);

  const playerToTeam = new Map<string, string>();
  const playerToTeamSlug = new Map<string, string>();
  const playerIdSet = new Set<string>();

  for (const roster of rosters) {
    const teamName = nameMap.get(roster.roster_id) ?? `Roster ${roster.roster_id}`;
    const slug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    // players already includes taxi and reserve — deduplicate via Set
    const unique = new Set<string>(roster.players ?? []);
    for (const pid of [...(roster.taxi ?? []), ...(roster.reserve ?? [])]) unique.add(pid);
    for (const pid of unique) {
      playerToTeam.set(pid, teamName);
      playerToTeamSlug.set(pid, slug);
      playerIdSet.add(pid);
    }
  }

  const cache: RosterCache = {
    ts: Date.now(),
    playerToTeam,
    playerToTeamSlug,
    allPlayerIds: Array.from(playerIdSet),
  };
  rosterCache = cache;
  return cache;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = clamp(Math.floor(Number(searchParams.get('limit')) || 30), 1, 100);
    const sinceHours = clamp(Math.floor(Number(searchParams.get('sinceHours')) || 168), 1, 24 * 90);
    const hideLowConfidence = searchParams.get('hideLow') !== 'false';
    const teamFilter = searchParams.get('teamFilter') ?? null;

    // Load roster maps and player metadata in parallel
    const [{ playerToTeam, playerToTeamSlug, allPlayerIds }, playersIndex] = await Promise.all([
      getLeagueRosterMaps(),
      getAllPlayersCached(12 * 60 * 60 * 1000) as Promise<Record<string, SleeperPlayer>>,
    ]);

    // Apply team filter if requested (show only players on that team)
    const activePlayerIds = teamFilter
      ? allPlayerIds.filter((pid) => playerToTeam.get(pid) === teamFilter)
      : allPlayerIds;

    const selectedPlayers = activePlayerIds
      .map((id) => { const p = playersIndex[id]; return p ? { id, player: p } : null; })
      .filter(Boolean) as Array<{ id: string; player: SleeperPlayer }>;

    if (selectedPlayers.length === 0) {
      return NextResponse.json(
        { generatedAt: new Date().toISOString(), count: 0, sinceHours, items: [] } satisfies LeagueNewsResponse,
        { status: 200 }
      );
    }

    // Build per-player matchers
    const matchers = selectedPlayers.map(({ id, player }) => {
      const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
      const fullNoSuffix = stripSuffixes(fullName);
      const parts = fullNoSuffix.split(' ');
      const firstNorm = normalizeText(parts[0] || '');
      const lastNorm = normalizeText(parts.slice(1).join(' ') || '');

      const fullRe = new RegExp(`\\b${escapeRegExp(fullName)}\\b`, 'i');
      const nicknames = NICKNAMES[firstNorm] || [];
      const aliasNorms: string[] = [];
      for (const nick of nicknames) aliasNorms.push(`${normalizeText(nick)} ${lastNorm}`);
      const compactFirst = firstNorm.replace(/\s+/g, '');
      if (compactFirst.length >= 2 && compactFirst.length <= 3) {
        aliasNorms.push(`${compactFirst} ${lastNorm}`);
      }
      const initialLastNorm = firstNorm ? `${firstNorm[0]} ${lastNorm}` : '';
      const isDst = ['DST', 'DEF'].includes((player.position || '').toUpperCase());
      const lastTokenRe = lastNorm ? new RegExp(`\\b${escapeRegExp(lastNorm)}\\b`, 'i') : null;
      const firstTokenRe = firstNorm ? new RegExp(`\\b${escapeRegExp(firstNorm)}\\b`, 'i') : null;
      const teamCodeRe = player.team ? new RegExp(`\\b${escapeRegExp(player.team)}\\b`, 'i') : null;

      return {
        id, name: fullName,
        fullRe, aliasNorms, initialLastNorm, isDst,
        firstTokenRe, lastTokenRe, teamCodeRe,
        position: player.position,
        nflTeam: player.team,
        evTeam: playerToTeam.get(id),
        evTeamSlug: playerToTeamSlug.get(id),
      };
    });

    const allItems = await fetchAllRss();
    const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;

    type ScoredItem = LeagueNewsItem & { score: number };
    const byKey = new Map<string, ScoredItem>();
    const now = Date.now();

    for (const it of allItems) {
      const title = it.title || '';
      if (isWatchOrTVGuide(title, it.description) || isBettingContent(title, it.description)) continue;

      const profile = SOURCE_PROFILE_MAP.get(it.sourceId) ?? 'broad_news';
      const isBroadSource = profile === 'broad_news' || profile === 'major_news';
      if (isBroadSource && isListicleOrRoundup(title)) continue;

      const hay = `${title} ${it.description}`;
      const hayNorm = normalizeText(hay);
      const matches: LeagueNewsMatch[] = [];

      for (const m of matchers) {
        let matchedType: MatchType | null = null;
        let confidence: MatchConfidence = 'low';

        if (m.isDst) {
          if (m.fullRe.test(title) || m.lastTokenRe?.test(title) || m.firstTokenRe?.test(title) || m.teamCodeRe?.test(title)) {
            matchedType = 'full'; confidence = 'high';
          }
        } else if (profile === 'player_news' || profile === 'transaction_news' || profile === 'official_news') {
          if (m.fullRe.test(hay)) {
            matchedType = 'full'; confidence = m.fullRe.test(title) ? 'high' : 'medium';
          } else if (m.aliasNorms.some((al) => containsPhrase(hayNorm, al))) {
            if (m.lastTokenRe?.test(title)) { matchedType = 'alias'; confidence = 'medium'; }
          } else if (m.initialLastNorm && containsPhrase(hayNorm, m.initialLastNorm)) {
            if (m.lastTokenRe?.test(title)) { matchedType = 'initial'; confidence = 'low'; }
          }
        } else {
          if (m.fullRe.test(title)) {
            matchedType = 'full'; confidence = 'high';
          } else if (m.fullRe.test(hay) && m.lastTokenRe?.test(title)) {
            matchedType = 'full'; confidence = 'medium';
          } else if (m.aliasNorms.some((al) => containsPhrase(hayNorm, al)) && m.lastTokenRe?.test(title)) {
            matchedType = 'alias'; confidence = 'low';
          }
        }

        if (matchedType) {
          matches.push({
            playerId: m.id,
            name: m.name,
            position: m.position,
            nflTeam: m.nflTeam,
            evTeam: m.evTeam,
            evTeamSlug: m.evTeamSlug,
            matchType: matchedType,
            confidence,
          });
        }
      }

      if (matches.length === 0 || matches.length >= 5) continue;

      const ts = it.publishedAt ? new Date(it.publishedAt).getTime() : 0;
      if (!(ts === 0 || ts >= cutoff)) continue;

      const allLow = matches.every((m) => m.confidence === 'low');
      if (hideLowConfidence && isBroadSource && allLow) continue;

      const sourceWeight = SOURCE_WEIGHT_MAP.get(it.sourceId) ?? 1.0;
      const hours = ts > 0 ? (now - ts) / (60 * 60 * 1000) : 1e9;
      const recency = Math.max(0, 1.5 - hours / 48);
      let bestQuality = 0;
      for (const m of matches) {
        if (m.confidence === 'high') bestQuality = Math.max(bestQuality, 0.6);
        else if (m.confidence === 'medium') bestQuality = Math.max(bestQuality, 0.4);
        else bestQuality = Math.max(bestQuality, 0.2);
      }
      const headlineBoost = matches.some((m) => {
        const sp = selectedPlayers.find((sp) => sp.id === m.playerId);
        if (!sp) return false;
        return new RegExp(`\\b${escapeRegExp(`${sp.player.first_name} ${sp.player.last_name}`)}\\b`, 'i').test(title);
      }) ? 0.3 : 0;
      const score = sourceWeight + recency + bestQuality + headlineBoost;

      const category = classifyStory(title, it.description);
      const linkKey = canonicalizeUrl(it.link);
      const titleKey = `t:${normalizeText(it.title || '')}`;
      const key = linkKey || titleKey;

      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { ...it, matches: [...matches], category, score });
      } else {
        const mergedMap = new Map<string, LeagueNewsMatch>();
        for (const m of prev.matches) mergedMap.set(m.playerId, m);
        for (const m of matches) if (!mergedMap.has(m.playerId)) mergedMap.set(m.playerId, m);
        const mergedMatches = Array.from(mergedMap.values());
        const newerTs = (() => {
          const a = prev.publishedAt ? new Date(prev.publishedAt).getTime() : 0;
          const b = it.publishedAt ? new Date(it.publishedAt).getTime() : 0;
          return b > a ? it.publishedAt : prev.publishedAt;
        })();
        if (score >= prev.score) {
          byKey.set(key, { ...it, publishedAt: newerTs, matches: mergedMatches, category, score });
        } else {
          byKey.set(key, { ...prev, publishedAt: newerTs, matches: mergedMatches });
        }
      }
    }

    // Secondary dedup by normalized title
    const firstPass = Array.from(byKey.values());
    const byTitle = new Map<string, ScoredItem>();
    for (const item of firstPass) {
      const tkey = normalizeText(item.title || '');
      if (!tkey) {
        byTitle.set(`__notitle__:${Math.random().toString(36).slice(2)}`, item);
        continue;
      }
      const existing = byTitle.get(tkey);
      if (!existing) {
        byTitle.set(tkey, item);
      } else {
        const mergedMap = new Map<string, LeagueNewsMatch>();
        for (const m of existing.matches) mergedMap.set(m.playerId, m);
        for (const m of item.matches) if (!mergedMap.has(m.playerId)) mergedMap.set(m.playerId, m);
        const mergedMatches = Array.from(mergedMap.values());
        const newerTs = (() => {
          const a = existing.publishedAt ? new Date(existing.publishedAt).getTime() : 0;
          const b = item.publishedAt ? new Date(item.publishedAt).getTime() : 0;
          return b > a ? item.publishedAt : existing.publishedAt;
        })();
        const winner = item.score >= existing.score ? { ...item } : { ...existing };
        winner.matches = mergedMatches;
        winner.publishedAt = newerTs;
        byTitle.set(tkey, winner);
      }
    }

    const deduped = Array.from(byTitle.values());
    deduped.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    });

    const limited = deduped.slice(0, limit);
    const resp: LeagueNewsResponse = {
      generatedAt: new Date().toISOString(),
      count: limited.length,
      sinceHours,
      items: limited,
    };
    return NextResponse.json(resp, { status: 200, headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=300' } });
  } catch (err) {
    console.error('League News API error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
