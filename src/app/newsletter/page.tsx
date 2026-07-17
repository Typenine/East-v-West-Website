'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface NewsletterData {
  id: string;
  title?: string | null;
  status?: 'draft' | 'published';
  episodeType?: string | null;
  week?: number;
  newsletter: {
    meta: {
      leagueName: string;
      week: number;
      date: string;
      season: number;
    };
    sections: Array<{ type: string; data: unknown }>;
  };
  html: string;
  generatedAt: string;
  fromCache: boolean;
}

interface NewsletterMeta {
  id: string;
  title: string | null;
  season: number;
  week: number;
  leagueName: string;
  episodeType: string | null;
  status: 'draft' | 'published';
  generatedAt: string;
  publishedAt: string | null;
}

interface NFLState {
  season: string;
  week: number;
  season_type: string;
}

const WEEKLESS_TYPES = new Set(['pre_draft', 'post_draft', 'preseason', 'offseason']);

const EPISODE_LABELS: Record<string, string> = {
  regular: 'Weekly Newsletter',
  trade_deadline: 'Trade Deadline Newsletter',
  playoffs_preview: 'Playoffs Preview',
  playoffs_round: 'Playoff Newsletter',
  championship: 'Championship Newsletter',
  season_finale: 'Season Finale',
  pre_draft: 'Pre-Draft Newsletter',
  post_draft: 'Post-Draft Grades',
  preseason: 'Preseason Preview',
  offseason: 'Offseason Update',
};

const RESPONSIVE_NEWSLETTER_CSS = `
  html {
    background: #ffffff !important;
    color-scheme: light;
    overflow-x: hidden;
  }

  body {
    width: 100% !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
    background: #ffffff !important;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  body > div[style*="max-width:1080px"] {
    width: 100% !important;
    max-width: 1080px !important;
    min-height: 0 !important;
    padding: 48px clamp(32px, 7vw, 80px) !important;
  }

  img {
    max-width: 100% !important;
  }

  p,
  h1,
  h2,
  h3,
  div,
  span {
    min-width: 0;
    overflow-wrap: break-word;
  }

  [style*="display:flex"],
  [style*="display:grid"] {
    min-width: 0;
  }

  @media (max-width: 760px) {
    body {
      font-size: 16px !important;
      line-height: 1.65 !important;
    }

    body > div[style*="max-width:1080px"] {
      max-width: none !important;
      padding: 12px !important;
    }

    header {
      margin-bottom: 34px !important;
      border-radius: 5px !important;
    }

    header > div:nth-child(2) {
      padding: 24px 18px 22px !important;
    }

    header [style*="justify-content:space-between"],
    [style*="display:flex"][style*="justify-content:space-between"] {
      flex-wrap: wrap !important;
      gap: 10px !important;
    }

    header [style*="gap:28px"] {
      align-items: flex-start !important;
      gap: 12px !important;
    }

    header h1 {
      font-size: clamp(30px, 10vw, 38px) !important;
      line-height: 1.08 !important;
      letter-spacing: -0.5px !important;
    }

    header img[style*="width:96px"] {
      display: none !important;
    }

    header [style*="letter-spacing:3px"] {
      letter-spacing: 1.5px !important;
    }

    article {
      margin-bottom: 44px !important;
    }

    article + article {
      padding-top: 0 !important;
    }

    article > div[style*="margin:80px"] {
      margin: 42px 0 22px !important;
    }

    article > div[style*="margin:80px"] > div:nth-child(2) {
      padding: 20px 16px !important;
      gap: 12px !important;
    }

    h2[style*="font-size:30px"] {
      font-size: 23px !important;
      line-height: 1.15 !important;
    }

    [style*="grid-template-columns:1fr 1fr"] {
      grid-template-columns: minmax(0, 1fr) !important;
    }

    [style*="border-right:1px solid"] {
      border-right: 0 !important;
      border-bottom: 1px solid #e5e7eb !important;
    }

    [style*="padding:32px 40px"],
    [style*="padding:28px 40px"],
    [style*="padding:28px 36px"],
    [style*="padding:28px 32px"] {
      padding: 20px 16px !important;
    }

    [style*="padding:24px 28px"],
    [style*="padding:22px 28px"] {
      padding: 18px 14px !important;
    }

    [style*="padding:18px 28px 0"] {
      padding: 16px 14px 0 !important;
    }

    [style*="padding:18px 22px"],
    [style*="padding:16px 20px"] {
      padding: 17px 14px !important;
    }

    [style*="padding:14px 22px"] {
      padding: 12px 14px !important;
      gap: 8px !important;
      flex-wrap: wrap !important;
    }

    [style*="display:flex"][style*="gap:8px"],
    [style*="display:flex"][style*="gap:10px"],
    [style*="display:flex"][style*="gap:14px"] {
      flex-wrap: wrap !important;
    }

    [style*="margin-left:auto"] {
      margin-left: 0 !important;
    }

    [style*="white-space:nowrap"] {
      white-space: normal !important;
    }

    [style*="min-width:48px"] {
      min-width: 0 !important;
    }

    p {
      font-size: 16px !important;
      line-height: 1.65 !important;
    }

    footer {
      margin-top: 42px !important;
    }
  }
`;

function resolveType(item: NewsletterMeta): string {
  if (item.episodeType) return item.episodeType;
  if (item.week === 900) return 'preseason';
  if (item.week === 901) return 'pre_draft';
  if (item.week === 902) return 'post_draft';
  if (item.week === 903) return 'offseason';
  return 'regular';
}

function issueTitle(item: NewsletterMeta): string {
  const type = resolveType(item);
  const label = EPISODE_LABELS[type] ?? 'Newsletter';
  if (WEEKLESS_TYPES.has(type) || item.week >= 900) return `${item.season} ${label}`;
  if (type === 'regular') return `Week ${item.week} Newsletter`;
  return `${label} — Week ${item.week}`;
}

function archiveLabel(item: NewsletterMeta): string {
  const type = resolveType(item);
  if (WEEKLESS_TYPES.has(type) || item.week >= 900) return EPISODE_LABELS[type] ?? 'Special Issue';
  if (type === 'regular') return `Week ${item.week}`;
  return `${EPISODE_LABELS[type] ?? type} · Wk ${item.week}`;
}

function sortByPublished(a: NewsletterMeta, b: NewsletterMeta): number {
  const aTime = new Date(a.publishedAt || a.generatedAt).getTime();
  const bTime = new Date(b.publishedAt || b.generatedAt).getTime();
  return bTime - aTime;
}

function buildResponsiveNewsletterDocument(html: string): string {
  const styleTag = `<style id="evw-responsive-newsletter">${RESPONSIVE_NEWSLETTER_CSS}</style>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${styleTag}</head>`);
  }

  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />${styleTag}</head><body>${html}</body></html>`;
}

function NewsletterFrame({ html, title }: { html: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const imageCleanupRef = useRef<Array<() => void>>([]);
  const [height, setHeight] = useState(900);

  const srcDoc = useMemo(() => buildResponsiveNewsletterDocument(html), [html]);

  const clearObservers = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    imageCleanupRef.current.forEach(cleanup => cleanup());
    imageCleanupRef.current = [];
  }, []);

  const resizeFrame = useCallback(() => {
    const document = iframeRef.current?.contentDocument;
    if (!document) return;

    const bodyHeight = document.body?.scrollHeight ?? 0;
    const documentHeight = document.documentElement?.scrollHeight ?? 0;
    const nextHeight = Math.max(480, bodyHeight, documentHeight);
    setHeight(current => Math.abs(current - nextHeight) > 1 ? nextHeight : current);
  }, []);

  const handleLoad = useCallback(() => {
    clearObservers();

    const document = iframeRef.current?.contentDocument;
    if (!document) return;

    resizeFrame();
    window.requestAnimationFrame(resizeFrame);
    window.setTimeout(resizeFrame, 150);
    window.setTimeout(resizeFrame, 600);

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(resizeFrame);
      if (document.documentElement) observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
      observerRef.current = observer;
    }

    imageCleanupRef.current = Array.from(document.images).map(image => {
      const handleImageLoad = () => resizeFrame();
      image.addEventListener('load', handleImageLoad);
      image.addEventListener('error', handleImageLoad);
      return () => {
        image.removeEventListener('load', handleImageLoad);
        image.removeEventListener('error', handleImageLoad);
      };
    });

    void document.fonts?.ready.then(resizeFrame).catch(() => {});
  }, [clearObservers, resizeFrame]);

  useEffect(() => {
    setHeight(900);
  }, [srcDoc]);

  useEffect(() => {
    window.addEventListener('resize', resizeFrame);
    return () => window.removeEventListener('resize', resizeFrame);
  }, [resizeFrame]);

  useEffect(() => clearObservers, [clearObservers]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-same-origin"
      onLoad={handleLoad}
      className="block w-full border-0 bg-white"
      style={{ height: `${height}px` }}
    />
  );
}

export default function NewsletterPage() {
  const [loading, setLoading] = useState(true);
  const [issueLoading, setIssueLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newsletterData, setNewsletterData] = useState<NewsletterData | null>(null);
  const [currentSeason, setCurrentSeason] = useState('2026');
  const [seasonType, setSeasonType] = useState('off');
  const [issues, setIssues] = useState<NewsletterMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedMeta = useMemo(
    () => issues.find(issue => issue.id === selectedId) ?? issues[0] ?? null,
    [issues, selectedId],
  );

  const isOffseason = seasonType !== 'regular' && seasonType !== 'post';

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setLoading(true);
      setError(null);

      try {
        const stateRes = await fetch('https://api.sleeper.app/v1/state/nfl', { cache: 'no-store' });
        const state = stateRes.ok
          ? await stateRes.json() as NFLState
          : { season: '2026', week: 0, season_type: 'off' };
        const season = state.season || '2026';

        const listRes = await fetch(`/api/newsletter?list=true&season=${season}`, { cache: 'no-store' });
        const listData = await listRes.json() as { items?: NewsletterMeta[]; error?: string };
        if (!listRes.ok) throw new Error(listData.error || 'Failed to load newsletter archive');

        const published = (listData.items ?? [])
          .filter(item => item.status === 'published')
          .sort(sortByPublished);

        if (!cancelled) {
          setCurrentSeason(season);
          setSeasonType(state.season_type || 'off');
          setIssues(published);
          setSelectedId(current => published.some(item => item.id === current) ? current : published[0]?.id ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setIssues([]);
          setSelectedId(null);
          setNewsletterData(null);
          setError(err instanceof Error ? err.message : 'Failed to load newsletter archive');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCatalog();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setNewsletterData(null);
      return;
    }

    let cancelled = false;
    setIssueLoading(true);
    setError(null);

    fetch(`/api/newsletter?id=${encodeURIComponent(selectedId)}`, { cache: 'no-store' })
      .then(async response => {
        const data = await response.json() as NewsletterData & { success?: boolean; error?: string };
        if (!response.ok || data.success === false) throw new Error(data.error || 'Failed to load newsletter');
        return data;
      })
      .then(data => {
        if (!cancelled) setNewsletterData(data);
      })
      .catch(err => {
        if (!cancelled) {
          setNewsletterData(null);
          setError(err instanceof Error ? err.message : 'Failed to load newsletter');
        }
      })
      .finally(() => {
        if (!cancelled) setIssueLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedId]);

  return (
    <div className="container mx-auto px-2 py-8 sm:px-4">
      <SectionHeader title="League Newsletter" />

      {isOffseason && issues.length > 0 && (
        <div className="max-w-6xl mx-auto mb-4">
          <div className="p-3 bg-amber-900/30 border border-amber-600 rounded-lg text-center">
            <span className="text-amber-300 font-medium">Offseason edition</span>
            <span className="text-amber-200 ml-2">Special issues and the full archive remain available below.</span>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>{selectedMeta ? issueTitle(selectedMeta) : 'East v. West Newsletter'}</CardTitle>
                {selectedMeta && (
                  <p className="text-xs text-[var(--muted)] mt-1">
                    Published {new Date(selectedMeta.publishedAt || selectedMeta.generatedAt).toLocaleString()}
                  </p>
                )}
              </div>
              {selectedMeta && issues.length > 1 && selectedMeta.id !== issues[0]?.id && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedId(issues[0].id)}>
                  Back to Latest
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading || issueLoading ? (
              <div className="text-center py-12 px-4">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]" />
                <p className="mt-4 text-[var(--muted)]">Loading...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12 px-4">
                <p className="text-[var(--danger)]">{error}</p>
              </div>
            ) : newsletterData ? (
              <div>
                <div className="px-4 py-3 text-sm text-[var(--muted)] flex items-center justify-between gap-3 flex-wrap border-b border-[var(--border)]">
                  <span>{newsletterData.newsletter.meta.leagueName} • Season {newsletterData.newsletter.meta.season}</span>
                  <span>Generated {new Date(newsletterData.generatedAt).toLocaleString()}</span>
                </div>
                <NewsletterFrame
                  html={newsletterData.html}
                  title={selectedMeta ? issueTitle(selectedMeta) : 'East v. West Newsletter'}
                />
              </div>
            ) : (
              <div className="text-center py-12 px-4">
                <div className="text-6xl mb-4">📰</div>
                <p className="text-lg font-medium mb-2">No published newsletter yet</p>
                <p className="text-[var(--muted)]">
                  The first {currentSeason} issue will appear here when it is released.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Archive</CardTitle>
          </CardHeader>
          <CardContent>
            {issues.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {issues.map(issue => (
                  <Button
                    key={issue.id}
                    variant={selectedMeta?.id === issue.id ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setSelectedId(issue.id)}
                    className="justify-start text-left h-auto py-2"
                    title={issueTitle(issue)}
                  >
                    <span className="truncate">{archiveLabel(issue)}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-center text-[var(--muted)] text-sm">No newsletters have been published yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>About the Newsletter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-[var(--foreground)]">
              <p>
                East v. West newsletters cover weekly results, trades, power rankings, predictions, draft analysis, and special league events.
              </p>
              <p className="mt-4">
                Each issue features dueling perspectives from the league&apos;s two resident commentators:
              </p>
              <ul className="mt-4 space-y-2">
                <li><strong>The Entertainer</strong> brings the reactions, rivalries, and bold takes.</li>
                <li><strong>The Analyst</strong> breaks down the numbers, trends, and practical implications.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
