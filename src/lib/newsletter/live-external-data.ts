/**
 * Newsletter live-data adapter.
 *
 * Reuses the site's free RSS/news infrastructure so newsletter generation sees
 * the same current fantasy-relevant headlines as the public league news feed.
 * The base ESPN + Sleeper bundle remains intact; this module augments it with
 * roster-aware RSS matches and puts the freshest evidence first in prompts.
 */

import { fetchAllRss } from '@/lib/feeds/rss-fetcher';
import { RSS_SOURCES, type SourceProfile } from '@/lib/feeds/rss-sources';
import {
  classifyStory,
  isBettingContent,
  isListicleOrRoundup,
  isWatchOrTVGuide,
  normalizeText,
  type StoryCategory,
} from '@/lib/news/news-classifier';
import { canonicalizeUrl, containsPhrase, stripSuffixes } from '@/lib/news/news-matching';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  getAllPlayersCached,
  getLeagueRosters,
  getRosterIdToTeamNameMap,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';
import {
  fetchAllExternalData as fetchBaseExternalData,
  buildExternalDataContext as buildBaseExternalDataContext,
  buildCurrentStandingsContext as buildBaseCurrentStandingsContext,
  type CurrentWeekContext,
  type ExternalDataBundle,
  type ExternalNewsItem,
} from './data-integration';

export type NewsletterLiveNewsItem = ExternalNewsItem & {
  playerId: string;
  playerName: string;
  fantasyTeam: string;
  description?: string;
  sourceProfile: SourceProfile;
  confidence: 'high' | 'medium';
  storyCategory: StoryCategory;
};

export type NewsletterExternalDataBundle = ExternalDataBundle & {
  liveRosterNews: NewsletterLiveNewsItem[];
};

const SOURCE_BY_ID = new Map(RSS_SOURCES.map(source => [source.id, source]));
const LIVE_NEWS_TTL_MS = 10 * 60 * 1000;
const MAX_NEWS_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let liveNewsCache: { expiresAt: number; items: NewsletterLiveNewsItem[] } | null = null;
let latestBundle: NewsletterExternalDataBundle | null = null;

function mapStoryCategory(category: StoryCategory): ExternalNewsItem['category'] {
  if (category === 'injury' || category === 'practice_availability') return 'injury';
  if (category === 'trade' || category === 'nfl_transaction' || category === 'contract' || category === 'retirement') {
    return 'transaction';
  }
  if (category === 'performance' || category === 'depth_chart_role' || category === 'rookie_development') {
    return 'analysis';
  }
  return 'news';
}

function cleanSummary(value: string | undefined): string {
  return (value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360);
}

function buildPlayerAliases(player: SleeperPlayer): string[] {
  const fullName = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
  const normalized = stripSuffixes(fullName);
  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length < 2) return fullName ? [normalizeText(fullName)] : [];

  const first = parts[0];
  const last = parts.slice(1).join(' ');
  const aliases = new Set<string>([
    normalizeText(fullName),
    normalizeText(normalized),
    normalizeText(`${first[0]} ${last}`),
  ]);
  return [...aliases].filter(alias => alias.length >= 5);
}

function sourceAllowsBodyMatch(profile: SourceProfile): boolean {
  return profile === 'player_news' || profile === 'transaction_news' || profile === 'official_news';
}

async function fetchRosterAwareLiveNews(): Promise<NewsletterLiveNewsItem[]> {
  const now = Date.now();
  if (liveNewsCache && liveNewsCache.expiresAt > now) return liveNewsCache.items;

  const [rssItems, rosters, rosterNames, allPlayers] = await Promise.all([
    fetchAllRss(LIVE_NEWS_TTL_MS).catch(() => []),
    getLeagueRosters(LEAGUE_IDS.CURRENT).catch(() => []),
    getRosterIdToTeamNameMap(LEAGUE_IDS.CURRENT).catch(() => new Map<number, string>()),
    getAllPlayersCached(12 * 60 * 60 * 1000).catch(() => ({} as Record<string, SleeperPlayer>)),
  ]);

  const rosteredPlayers: Array<{
    id: string;
    player: SleeperPlayer;
    fantasyTeam: string;
    aliases: string[];
  }> = [];

  for (const roster of rosters) {
    const fantasyTeam = rosterNames.get(roster.roster_id) ?? `Roster ${roster.roster_id}`;
    const playerIds = new Set<string>([
      ...(roster.players ?? []),
      ...(roster.taxi ?? []),
      ...(roster.reserve ?? []),
    ]);
    for (const id of playerIds) {
      const player = allPlayers[id];
      if (!player) continue;
      const aliases = buildPlayerAliases(player);
      if (aliases.length === 0) continue;
      rosteredPlayers.push({ id, player, fantasyTeam, aliases });
    }
  }

  const deduped = new Map<string, NewsletterLiveNewsItem & { score: number }>();

  for (const item of rssItems) {
    const source = SOURCE_BY_ID.get(item.sourceId);
    if (!source) continue;

    const title = item.title ?? '';
    const description = item.description ?? '';
    if (isWatchOrTVGuide(title, description) || isBettingContent(title, description)) continue;
    if ((source.profile === 'major_news' || source.profile === 'broad_news') && isListicleOrRoundup(title)) continue;

    const publishedMs = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
    if (!Number.isFinite(publishedMs) || now - publishedMs < 0 || now - publishedMs > MAX_NEWS_AGE_MS) continue;

    const titleNorm = normalizeText(title);
    const bodyNorm = normalizeText(`${title} ${description}`);
    const matches: Array<{ entry: typeof rosteredPlayers[number]; confidence: 'high' | 'medium' }> = [];

    for (const entry of rosteredPlayers) {
      const titleMatch = entry.aliases.some(alias => containsPhrase(titleNorm, alias));
      const bodyMatch = sourceAllowsBodyMatch(source.profile)
        && entry.aliases.some(alias => containsPhrase(bodyNorm, alias));
      if (!titleMatch && !bodyMatch) continue;
      matches.push({ entry, confidence: titleMatch ? 'high' : 'medium' });
    }

    // Broad roundup stories that happen to mention many players are poor evidence.
    if (matches.length === 0 || matches.length > 4) continue;

    const storyCategory = classifyStory(title, description);
    const recencyHours = Math.max(0, (now - publishedMs) / 3_600_000);
    const recencyScore = Math.max(0, 2 - recencyHours / 48);

    for (const match of matches) {
      const player = match.entry.player;
      const playerName = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim();
      const key = `${match.entry.id}:${canonicalizeUrl(item.link) ?? normalizeText(title)}`;
      const score = source.weight + recencyScore + (match.confidence === 'high' ? 0.75 : 0.35);
      const candidate: NewsletterLiveNewsItem & { score: number } = {
        source: item.sourceName,
        headline: title,
        playerId: match.entry.id,
        playerName,
        fantasyTeam: match.entry.fantasyTeam,
        nflTeam: player.team ?? undefined,
        category: mapStoryCategory(storyCategory),
        storyCategory,
        timestamp: item.publishedAt ?? undefined,
        url: item.link || undefined,
        description: cleanSummary(description),
        sourceProfile: source.profile,
        confidence: match.confidence,
        score,
      };
      const previous = deduped.get(key);
      if (!previous || candidate.score > previous.score) deduped.set(key, candidate);
    }
  }

  const items = [...deduped.values()]
    .sort((a, b) => b.score - a.score || Date.parse(b.timestamp ?? '') - Date.parse(a.timestamp ?? ''))
    .slice(0, 30)
    .map(({ score: _score, ...item }) => item);

  liveNewsCache = { expiresAt: now + LIVE_NEWS_TTL_MS, items };
  console.log(`[NewsletterNews] Loaded ${items.length} roster-aware RSS stories from free feeds`);
  return items;
}

/**
 * Same public contract as data-integration.fetchAllExternalData(), augmented with
 * the league's roster-aware RSS news feed.
 */
export async function fetchAllExternalData(): Promise<NewsletterExternalDataBundle> {
  const [base, liveRosterNews] = await Promise.all([
    fetchBaseExternalData(),
    fetchRosterAwareLiveNews().catch(error => {
      console.warn('[NewsletterNews] RSS integration failed; using base external data:', error);
      return [] as NewsletterLiveNewsItem[];
    }),
  ]);

  const newsByKey = new Map<string, ExternalNewsItem>();
  for (const item of [...liveRosterNews, ...base.news]) {
    const key = canonicalizeUrl(item.url) ?? normalizeText(item.headline);
    if (!key || newsByKey.has(key)) continue;
    newsByKey.set(key, item);
  }

  latestBundle = {
    ...base,
    news: [...newsByKey.values()],
    liveRosterNews,
    fetchedAt: new Date().toISOString(),
  };
  return latestBundle;
}

/**
 * Current standings plus the freshest roster news. The staged route builds this
 * block only after fetchAllExternalData resolves, so current news is placed near
 * the front of the shared context and survives bounded-prefix section prompts.
 */
export function buildCurrentStandingsContext(context: CurrentWeekContext): string {
  const standings = buildBaseCurrentStandingsContext(context);
  if (!latestBundle?.liveRosterNews?.length) return standings;
  const news = latestBundle.liveRosterNews.slice(0, 10).map(item =>
    `- [${formatDate(item.timestamp)}] ${item.playerName} (${item.fantasyTeam}): ${item.headline} [${item.source}]`,
  );
  return [
    standings,
    '=== CURRENT ROSTER NEWS — READ BEFORE ANALYSIS ===',
    'These are current reports from the league news feed. Reported facts may be cited; any interpretation must be labeled as analysis. Do not invent usage statistics.',
    ...news,
  ].join('\n');
}

function formatDate(iso: string | undefined): string {
  if (!iso) return 'date unavailable';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'date unavailable';
  return date.toISOString().slice(0, 10);
}

/**
 * Places live roster news and analytical signals before the legacy bundle. This
 * is intentional: some section generators take a bounded prefix of the shared
 * context, so the newest evidence must be in that prefix.
 */
export function buildExternalDataContext(
  data: ExternalDataBundle | NewsletterExternalDataBundle,
  rosterPlayerNames?: { full: Set<string>; last: Set<string> },
): string {
  const enhanced = data as NewsletterExternalDataBundle;
  const liveNews = enhanced.liveRosterNews ?? [];
  const priority: string[] = [];

  if (liveNews.length > 0) {
    priority.push('=== LIVE FANTASY NEWS FOR EAST v. WEST ROSTERS (FREE RSS FEEDS) ===');
    priority.push(`Fetched ${data.fetchedAt}. Treat the dated headline/summary as current evidence. Distinguish a reported fact from your own inference; never invent usage, snap, target, carry, projection, or depth-chart numbers that are not stated.`);
    for (const item of liveNews.slice(0, 16)) {
      const summary = item.description ? ` — ${item.description}` : '';
      priority.push(
        `- [${formatDate(item.timestamp)}] ${item.playerName} (${item.nflTeam ?? 'FA'}, owned by ${item.fantasyTeam}) `
        + `[${item.storyCategory}; ${item.confidence}; ${item.source}]: ${item.headline}${summary}`,
      );
    }
    priority.push('');

    const roleSignals = liveNews.filter(item =>
      item.storyCategory === 'depth_chart_role'
      || item.storyCategory === 'rookie_development'
      || item.storyCategory === 'performance'
      || item.storyCategory === 'practice_availability'
      || item.storyCategory === 'injury'
    );
    if (roleSignals.length > 0) {
      priority.push('=== CURRENT OPPORTUNITY / BREAKOUT / INJURY SIGNALS ===');
      for (const item of roleSignals.slice(0, 10)) {
        priority.push(`- ${item.playerName} (${item.fantasyTeam}): ${item.headline} [${item.source}, ${formatDate(item.timestamp)}]`);
      }
      priority.push('Use these as signals to investigate in the analysis, not as permission to claim unstated statistics.');
      priority.push('');
    }
  }

  const baseContext = buildBaseExternalDataContext(data, rosterPlayerNames);
  return [...priority, baseContext].filter(Boolean).join('\n');
}
