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

// Normalize text for fuzzy matching: lowercase, strip punctuation to spaces, collapse whitespace
function normalizeText(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// Filter out generic broadcast/TV/stream guides
function isWatchOrTVGuide(title: string, description: string): boolean {
  const hay = `${normalizeText(title)} ${normalizeText(description)}`;
  const phrases = [
    'how to watch',
    'what channel',
    'tv channel',
    'watch live',
    'live stream',
    'streaming info',
    'stream info',
    'tv info',
    'time tv streaming',
    'broadcast info',
    'radio broadcast',
    'start time and tv',
    'where to watch',
  ];
  return phrases.some((p) => hay.includes(p));
}

function containsPhrase(hayNorm: string, phraseNorm: string): boolean {
  if (!hayNorm || !phraseNorm) return false;
  const re = new RegExp(`(^|\\s)${escapeRegExp(phraseNorm)}(\\s|$)`);
  return re.test(hayNorm);
}

function stripSuffixes(name: string): string {
  const parts = normalizeText(name).split(' ');
  const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
  const filtered = parts.filter((p) => !suffixes.has(p));
  return filtered.join(' ').trim();
}

// Minimal nickname mapping for common first names
const NICKNAMES: Record<string, string[]> = {
  william: ['bill', 'will', 'billy'],
  robert: ['rob', 'bob', 'bobby', 'robbie'],
  richard: ['rich', 'rick', 'ricky'],
  edward: ['ed', 'eddie'],
  james: ['jim', 'jimmy', 'jamie'],
  john: ['jack', 'johnny'],
  matthew: ['matt'],
  michael: ['mike', 'mikey'],
  joseph: ['joe', 'joey'],
  daniel: ['dan', 'danny'],
  andrew: ['andy', 'drew'],
  anthony: ['tony'],
  nicholas: ['nick', 'nico'],
  thomas: ['tom', 'tommy'],
  patrick: ['pat'],
  steven: ['steve', 'stevie'],
  alexander: ['alex'],
  samuel: ['sam', 'sammy'],
  benjamin: ['ben', 'benny'],
  christopher: ['chris'],
  nathaniel: ['nate', 'nathan'],
  philip: ['phil'],
  gregory: ['greg'],
  kenneth: ['ken', 'kenny'],
  ronald: ['ron', 'ronnie'],
  timothy: ['tim', 'timmy'],
};

type MatchType = 'full' | 'alias' | 'initial';

export type RosterNewsMatch = { playerId: string; name: string; matchType?: MatchType };
export type RosterNewsResponse = {
  generatedAt: string;
  count: number;
  sinceHours: number;
  items: Array<
    RssItem & {
      matches: RosterNewsMatch[];
      // optional score used for ordering in the API; UI can ignore
      score?: number;
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

    // Load players index for name/alias mapping
    const playersIndex = (await getAllPlayersCached()) as Record<string, SleeperPlayer>;
    const selectedPlayers = playerIds
      .map((id) => {
        const p = playersIndex[id];
        if (!p) return null;
        return { id, player: p };
      })
      .filter(Boolean) as Array<{ id: string; player: SleeperPlayer }>;

    if (selectedPlayers.length === 0) {
      return NextResponse.json(
        { generatedAt: new Date().toISOString(), count: 0, sinceHours, items: [] } satisfies RosterNewsResponse,
        { status: 200 }
      );
    }

    // Build matchers per player: full name regex + alias variants (nickname, initials)
    const matchers = selectedPlayers.map(({ id, player }) => {
      const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
      const fullNoSuffix = stripSuffixes(fullName);
      const [firstNorm, lastNorm] = (() => {
        const parts = fullNoSuffix.split(' ');
        const first = parts[0] || '';
        const last = parts.slice(1).join(' ') || '';
        return [normalizeText(first), normalizeText(last)];
      })();

      const fullRe = new RegExp(`\\b${escapeRegExp(fullName)}\\b`, 'i');

      // Nickname variants for first name
      const nicknames = NICKNAMES[firstNorm] || [];
      const aliasNorms: string[] = [];
      for (const nick of nicknames) aliasNorms.push(`${normalizeText(nick)} ${lastNorm}`);

      // If first is initials-like (e.g., d k), also try compact form (dk last)
      const compactFirst = firstNorm.replace(/\s+/g, '');
      if (compactFirst.length <= 3 && compactFirst.length >= 2) {
        aliasNorms.push(`${compactFirst} ${lastNorm}`);
      }

      // Initial + last (e.g., t hill)
      const initialLastNorm = firstNorm ? `${firstNorm[0]} ${lastNorm}` : '';

      // Team defense indicator
      const isDst = ((player.position || '').toUpperCase() === 'DST') || ((player.position || '').toUpperCase() === 'DEF');
      // Simple title token regexes for team defenses
      const firstTokenRe = firstNorm ? new RegExp(`\\b${escapeRegExp(firstNorm)}\\b`, 'i') : null;
      const lastTokenRe = lastNorm ? new RegExp(`\\b${escapeRegExp(lastNorm)}\\b`, 'i') : null;
      const teamCodeRe = player.team ? new RegExp(`\\b${escapeRegExp(player.team)}\\b`, 'i') : null;

      return {
        id,
        name: fullName || `${player.first_name || ''} ${player.last_name || ''}`.trim(),
        fullRe,
        aliasNorms,
        initialLastNorm,
        isDst,
        firstTokenRe,
        lastTokenRe,
        teamCodeRe,
      } as {
        id: string;
        name: string;
        fullRe: RegExp;
        aliasNorms: string[];
        initialLastNorm: string;
        isDst: boolean;
        firstTokenRe: RegExp | null;
        lastTokenRe: RegExp | null;
        teamCodeRe: RegExp | null;
      };
    });

    const allItems = await fetchAllRss();
    const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;

    // Source reputation weights (tunable)
    const SOURCE_WEIGHTS: Record<string, number> = {
      'rotowire-news': 1.4,
      'espn-nfl': 1.4,
      'pft': 1.3,
      'cbs-nfl': 1.2,
      'fantasypros-nfl': 1.2,
      'pfrumors': 1.1,
      'yahoo-nfl': 1.1,
      'nfltraderumors': 1.0,
    };

    type ScoredItem = RssItem & { matches: RosterNewsMatch[]; score: number };
    const byKey = new Map<string, ScoredItem>();
    const now = Date.now();
    for (const it of allItems) {
      const title = it.title || '';
      if (isWatchOrTVGuide(title, it.description)) {
        // Skip generic how-to-watch/TV/streaming guide posts
        continue;
      }
      const hay = `${title} ${it.description}`;
      const hayNorm = normalizeText(hay);
      const matches: RosterNewsMatch[] = [];
      for (const m of matchers) {
        let matchedType: MatchType | null = null;
        if (m.isDst) {
          // For team defenses: only match if the TEAM is mentioned in the TITLE to avoid noisy body mentions/lists
          if (m.fullRe.test(title) || (m.lastTokenRe?.test(title)) || (m.firstTokenRe?.test(title)) || (m.teamCodeRe?.test(title))) {
            matchedType = 'full';
          }
        } else {
          if (m.fullRe.test(hay)) {
            matchedType = 'full';
          } else if (m.aliasNorms.some((al) => containsPhrase(hayNorm, al))) {
            // For alias matches, also require last name in the TITLE to prevent broad team-only posts
            if (m.lastTokenRe?.test(title)) matchedType = 'alias';
          } else if (m.initialLastNorm && containsPhrase(hayNorm, m.initialLastNorm)) {
            // For initial+last, require last name in the TITLE
            if (m.lastTokenRe?.test(title)) matchedType = 'initial';
          }
        }
        if (matchedType) {
          matches.push({ playerId: m.id, name: m.name, matchType: matchedType });
        }
      }
      if (matches.length === 0) continue;

      // date filter
      const ts = it.publishedAt ? new Date(it.publishedAt).getTime() : 0;
      if (!(ts === 0 || ts >= cutoff)) continue;

      // Scoring
      const sourceWeight = SOURCE_WEIGHTS[it.sourceId] || 1.0;
      const hours = ts > 0 ? (now - ts) / (60 * 60 * 1000) : 1e9;
      const recency = Math.max(0, 1.5 - hours / 48); // decays over ~2 days
      let bestQuality = 0;
      for (const m of matches) {
        if (m.matchType === 'full') bestQuality = Math.max(bestQuality, 0.6);
        else if (m.matchType === 'alias') bestQuality = Math.max(bestQuality, 0.4);
        else if (m.matchType === 'initial') bestQuality = Math.max(bestQuality, 0.3);
      }
      const multiBoost = matches.length >= 2 ? 0.2 : 0;
      const score = sourceWeight + recency + bestQuality + multiBoost;

      // Dedup key by link or normalized title
      const key = (it.link && it.link.trim().length > 0)
        ? it.link.trim().toLowerCase()
        : `t:${normalizeText(it.title || '')}`;

      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, { ...it, matches: [...matches], score });
      } else {
        // Merge matches (unique by playerId)
        const mergedMatchMap = new Map<string, RosterNewsMatch>();
        for (const m of prev.matches) mergedMatchMap.set(m.playerId, m);
        for (const m of matches) if (!mergedMatchMap.has(m.playerId)) mergedMatchMap.set(m.playerId, m);
        const mergedMatches = Array.from(mergedMatchMap.values());

        // Choose better item by score; keep latest publishedAt
        const newerTs = (() => {
          const a = prev.publishedAt ? new Date(prev.publishedAt).getTime() : 0;
          const b = it.publishedAt ? new Date(it.publishedAt).getTime() : 0;
          return b > a ? it.publishedAt : prev.publishedAt;
        })();

        if (score >= prev.score) {
          byKey.set(key, { ...it, publishedAt: newerTs, matches: mergedMatches, score });
        } else {
          byKey.set(key, { ...prev, publishedAt: newerTs, matches: mergedMatches });
        }
      }
    }

    const deduped = Array.from(byKey.values());
    deduped.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    });

    const limited = deduped.slice(0, limit);

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

