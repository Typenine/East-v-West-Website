'use client';

import { useEffect, useMemo, useState } from 'react';
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
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="League Newsletter" />

      {isOffseason && issues.length > 0 && (
        <div className="max-w-4xl mx-auto mb-4">
          <div className="p-3 bg-amber-900/30 border border-amber-600 rounded-lg text-center">
            <span className="text-amber-300 font-medium">Offseason edition</span>
            <span className="text-amber-200 ml-2">Special issues and the full archive remain available below.</span>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <Card>
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
          <CardContent>
            {loading || issueLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]" />
                <p className="mt-4 text-[var(--muted)]">Loading...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-[var(--danger)]">{error}</p>
              </div>
            ) : newsletterData ? (
              <div>
                <div className="mb-4 text-sm text-[var(--muted)] flex items-center justify-between gap-3 flex-wrap">
                  <span>{newsletterData.newsletter.meta.leagueName} • Season {newsletterData.newsletter.meta.season}</span>
                  <span>Generated {new Date(newsletterData.generatedAt).toLocaleString()}</span>
                </div>
                <div
                  className="newsletter-content"
                  dangerouslySetInnerHTML={{ __html: newsletterData.html }}
                  style={{ background: 'transparent' }}
                />
              </div>
            ) : (
              <div className="text-center py-12">
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
