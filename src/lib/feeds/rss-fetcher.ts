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

function decodeHtml(input: string): string {
  return input
    // Avoid ES2018 dotAll flag; use [\s\S]*? to match newlines
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
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
    const descRaw = extractTag(block, 'description') || extractTag(block, 'content:encoded') || '';
    const description = stripHtml(descRaw).replace(/\s+/g, ' ').trim();

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
