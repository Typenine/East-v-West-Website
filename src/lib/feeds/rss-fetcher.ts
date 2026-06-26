import { isPromotionalOrPoll } from '@/lib/news/news-classifier';
import { RSS_SOURCES, RssSource } from './rss-sources';

export type RssItem = {
  sourceId: string;
  sourceName: string;
  title: string;
  link: string;
  description: string;
  publishedAt: string | null; // ISO string or null
};

// Simple per-source in-memory cache
const sourceCache: Record<string, { ts: number; items: RssItem[] }> = {};

// Global keyword exclusions across all sources (conservative)
const GLOBAL_EXCLUDE = ['betting'];

function decodeHtml(input: string): string {
  let s = input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”');

  s = s.replace(/&#(x?[0-9a-fA-F]+);/g, (_m, code) => {
    try {
      const val = String(code).toLowerCase().startsWith('x')
        ? parseInt(code.slice(1), 16)
        : parseInt(code, 10);
      if (!isFinite(val) || val <= 0) return '';
      return String.fromCodePoint(val);
    } catch {
      return '';
    }
  });
  return s;
}

function stripHtml(input: string): string {
  const withoutBlocks = input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '');

  const withBreaks = withoutBlocks
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<\s*p\b[^>]*>/gi, '')
    .replace(/<\s*li\b[^>]*>/gi, '- ')
    .replace(/<\s*\/li\s*>/gi, '\n')
    .replace(/<\s*div\b[^>]*>/gi, '')
    .replace(/<\s*\/div\s*>/gi, '\n');
  return withBreaks.replace(/<[^>]*>/g, '');
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  return decodeHtml(m[1]).trim();
}

function cleanFeedTitle(input: string): string {
  return (input || '')
    .replace(/^(?:copy|duplicate)\s+of\s*:\s*/i, '')
    .replace(/^(?:copy|duplicate)\s+of\s+/i, '')
    .trim();
}

function cleanDescription(input: string): string {
  const descriptionTextRaw = stripHtml(input)
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .trim();

  const descriptionText = descriptionTextRaw
    .split('\n')
    .filter((line) => {
      const l = line.trim();
      if (!l) return false;
      if (/unknownError|georestricted|This content is not yet available|expiredError/i.test(l)) return false;
      if (/^\{[\s\S]*\}$/.test(l)) return false;
      return true;
    })
    .join('\n')
    .trim();

  // Matching and classification only need the actual summary. Long article bodies
  // frequently include related-link text that creates false player/category tags.
  return descriptionText.length > 700
    ? `${descriptionText.slice(0, 700).trimEnd()}…`
    : descriptionText;
}

function parseRss(xml: string, source: RssSource): RssItem[] {
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?>[\s\S]*?<\/item>/gi) || [];

  for (const block of itemBlocks) {
    const title = cleanFeedTitle(extractTag(block, 'title') || '');
    const link = extractTag(block, 'link') || '';
    const pub = extractTag(block, 'pubDate') || extractTag(block, 'updated') || extractTag(block, 'dc:date');
    const contentEncoded = extractTag(block, 'content:encoded');
    const descTag = extractTag(block, 'description') || extractTag(block, 'summary');

    // Prefer the short RSS summary. Full content often includes navigation,
    // recommendations, and unrelated links that poison matching.
    const description = cleanDescription(descTag || contentEncoded || '');

    let publishedAt: string | null = null;
    if (pub) {
      const d = new Date(pub);
      if (!isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    if ((title || description) && !isPromotionalOrPoll(title, description)) {
      items.push({
        sourceId: source.id,
        sourceName: source.name,
        title,
        link,
        description,
        publishedAt,
      });
    }
  }
  return items;
}

export async function fetchRssFromSource(source: RssSource, ttlMs = 10 * 60 * 1000): Promise<RssItem[]> {
  const now = Date.now();
  const cached = sourceCache[source.id];
  if (cached && now - cached.ts < ttlMs) return cached.items;

  try {
    const resp = await fetch(source.url, { next: { revalidate: 0 } });
    if (!resp.ok) throw new Error(`RSS ${source.id} ${resp.status}`);
    const xml = await resp.text();
    let items = parseRss(xml, source);

    if (GLOBAL_EXCLUDE.length) {
      const exc = GLOBAL_EXCLUDE.map((k) => k.toLowerCase());
      items = items.filter((it) => {
        const hay = `${it.title} ${it.description}`.toLowerCase();
        return !exc.some((kw) => hay.includes(kw));
      });
    }

    if (source.includeKeywords && source.includeKeywords.length) {
      const inc = source.includeKeywords.map((k) => k.toLowerCase());
      items = items.filter((it) => {
        const hay = `${it.title} ${it.description}`.toLowerCase();
        return inc.some((kw) => hay.includes(kw));
      });
    }

    if (source.excludeKeywords && source.excludeKeywords.length) {
      const exc = source.excludeKeywords.map((k) => k.toLowerCase());
      items = items.filter((it) => {
        const hay = `${it.title} ${it.description}`.toLowerCase();
        return !exc.some((kw) => hay.includes(kw));
      });
    }

    items.sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    });

    sourceCache[source.id] = { ts: now, items };
    return items;
  } catch (err) {
    console.error('RSS fetch failed', source.id, err);
    return cached ? cached.items : [];
  }
}

export async function fetchAllRss(ttlMs = 10 * 60 * 1000): Promise<RssItem[]> {
  const lists = await Promise.all(RSS_SOURCES.map((s) => fetchRssFromSource(s, ttlMs)));
  return lists.flat();
}
