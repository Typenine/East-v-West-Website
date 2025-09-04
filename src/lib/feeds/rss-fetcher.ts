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
// Keep this list short to avoid over-filtering. We will tune over time.
const GLOBAL_EXCLUDE = ['betting'];

function decodeHtml(input: string): string {
  let s = input
    // Avoid ES2018 dotAll flag; use [\s\S]*? to match newlines
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    // common named entities
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
  // numeric entities (decimal and hex)
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
  // Remove noisy blocks entirely
  const withoutBlocks = input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '');

  // Convert common block/line-break tags to newlines before stripping
  const withBreaks = withoutBlocks
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<\s*p\b[^>]*>/gi, '')
    .replace(/<\s*li\b[^>]*>/gi, '- ')
    .replace(/<\s*\/li\s*>/gi, '\n')
    .replace(/<\s*div\b[^>]*>/gi, '')
    .replace(/<\s*\/div\s*>/gi, '\n');
  const noHtml = withBreaks.replace(/<[^>]*>/g, '');
  return noHtml;
}

function extractTag(xml: string, tag: string): string | null {
  // Match either <tag>...</tag> or <ns:tag>...</ns:tag>
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/[^>]*${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  return decodeHtml(m[1]).trim();
}

function parseRss(xml: string, source: RssSource): RssItem[] {
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?>[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks) {
    const title = extractTag(block, 'title') || '';
    const link = extractTag(block, 'link') || '';
    const pub = extractTag(block, 'pubDate') || extractTag(block, 'updated') || extractTag(block, 'dc:date');
    const contentEncoded = extractTag(block, 'content:encoded');
    const descTag = extractTag(block, 'description') || extractTag(block, 'summary');
    const descRaw = contentEncoded || descTag || '';
    const descriptionTextRaw = stripHtml(descRaw)
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+\n/g, '\n')
      .replace(/\n\s+/g, '\n')
      .trim();
    // Remove noisy disclaimer/json lines
    const descriptionText = descriptionTextRaw
      .split('\n')
      .filter((line) => {
        const l = line.trim();
        if (!l) return false;
        if (/unknownError|georestricted|This content is not yet available|expiredError/i.test(l)) return false;
        if (/^\{[\s\S]*\}$/.test(l)) return false; // drop pure JSON blocks
        return true;
      })
      .join('\n')
      .trim();
    const description = descriptionText.length > 1200 ? descriptionText.slice(0, 1200).trimEnd() + '…' : descriptionText;

    let publishedAt: string | null = null;
    if (pub) {
      const d = new Date(pub);
      if (!isNaN(d.getTime())) publishedAt = d.toISOString();
    }

    if (title || description) {
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

    // Global excludes (e.g., betting content)
    if (GLOBAL_EXCLUDE.length) {
      const exc = GLOBAL_EXCLUDE.map((k) => k.toLowerCase());
      items = items.filter((it) => {
        const hay = `${it.title} ${it.description}`.toLowerCase();
        return !exc.some((kw) => hay.includes(kw));
      });
    }

    // Optional keyword filtering
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

    // Sort by published desc if available
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
