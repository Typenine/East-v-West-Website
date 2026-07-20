'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel } from '@/components/ui/BroadcastPanel';
import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  PANEL,
} from '@/components/ui/BroadcastPanel';

type NewsMatch = {
  playerId: string;
  name: string;
  position?: string;
  nflTeam?: string;
  evTeam?: string;
  evTeamSlug?: string;
  confidence?: string;
};

type NewsItem = {
  title: string;
  link: string;
  description: string;
  sourceName: string;
  publishedAt: string | null;
  matches: NewsMatch[];
  category?: string;
  alsoReportedBy?: string[];
};

type NewsResponse = { count: number; items: NewsItem[] };

const INITIAL_STORY_COUNT = 5;
const STORY_INCREMENT = 5;

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const CATEGORY_LABELS: Record<string, string> = {
  injury: 'Injury',
  practice_availability: 'Practice',
  nfl_transaction: 'Transaction',
  contract: 'Contract',
  trade: 'Trade',
  trade_rumor: 'Rumor',
  suspension: 'Suspension',
  depth_chart_role: 'Depth chart',
  retirement: 'Retirement',
  rookie_development: 'Rookie',
  performance: 'Performance',
  general_analysis: 'News',
};

const CATEGORY_ACCENT: Record<string, string> = {
  injury: '#ef4444',
  suspension: '#ef4444',
  practice_availability: '#f59e0b',
  nfl_transaction: '#10b981',
  contract: '#10b981',
  trade: '#3b82f6',
  trade_rumor: '#6366f1',
  depth_chart_role: '#8b5cf6',
  retirement: '#6b7280',
  rookie_development: '#06b6d4',
  performance: '#f97316',
  general_analysis: '#9ca3af',
};

const DATA_EXPORTS = [
  {
    label: 'Complete league export',
    description: 'Rosters, rules, drafts, history, trades, and the league entity index in one file.',
    href: '/api/export/all',
    featured: true,
  },
  {
    label: 'Rosters & teams',
    description: 'Team rosters, player details, ownership, and season-by-season league membership.',
    href: '/api/export/rosters',
  },
  {
    label: 'Rules & settings',
    description: 'League rules, scoring, roster settings, and other competition settings.',
    href: '/api/export/rules',
  },
  {
    label: 'Drafts & picks',
    description: 'Historical drafts, selections, and current future-pick ownership.',
    href: '/api/export/drafts',
  },
  {
    label: 'History & records',
    description: 'League history, standings, matchup results, champions, and records.',
    href: '/api/export/history',
  },
  {
    label: 'Trades & transactions',
    description: 'Trade history and league transaction data across available seasons.',
    href: '/api/export/trades',
  },
] as const;

function CategoryBadge({ category }: { category?: string }) {
  const label = CATEGORY_LABELS[category ?? ''] ?? 'News';
  const color = CATEGORY_ACCENT[category ?? ''] ?? '#9ca3af';
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {label}
    </span>
  );
}

function EVOwnerBadge({ match }: { match: NewsMatch }) {
  if (!match.evTeam) return null;
  const ownershipLabel = `${match.name} is rostered by ${match.evTeam}`;
  return (
    <Link
      href={match.evTeamSlug ? `/teams/${match.evTeamSlug}` : '/teams'}
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold hover:underline"
      style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)' }}
      title={ownershipLabel}
      aria-label={ownershipLabel}
    >
      Rostered by {match.evTeam}
    </Link>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const evTeams = new Map<string, NewsMatch>();
  for (const m of item.matches) {
    if (m.evTeam && !evTeams.has(m.evTeam)) evTeams.set(m.evTeam, m);
  }

  return (
    <li
      className="rounded-xl p-3"
      style={{
        background: PANEL.tintSoft,
        boxShadow: `inset 0 0 0 1px ${PANEL.hairline}`,
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <CategoryBadge category={item.category} />
        <span className="text-[10px] shrink-0" style={broadcastFaintTextStyle}>
          {timeAgo(item.publishedAt)}
        </span>
      </div>
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-semibold leading-snug hover:underline block mb-1"
        style={broadcastBodyTextStyle}
      >
        {item.title}
      </a>
      {item.matches.length > 0 && (
        <div className="text-xs mb-1.5 flex flex-wrap gap-x-2 gap-y-0.5 items-center" style={broadcastMutedTextStyle}>
          {item.matches.slice(0, 3).map((m) => {
            const context = [m.position, m.nflTeam].filter(Boolean).join(' · ');
            return (
              <span key={m.playerId} className="whitespace-nowrap">
                {m.name}
                {context && <span style={broadcastFaintTextStyle}> · {context}</span>}
              </span>
            );
          })}
          {item.matches.length > 3 && (
            <span style={broadcastFaintTextStyle}>+{item.matches.length - 3} more</span>
          )}
        </div>
      )}
      {evTeams.size > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {Array.from(evTeams.values()).slice(0, 3).map((m) => (
            <EVOwnerBadge key={m.playerId} match={m} />
          ))}
        </div>
      )}
      <div className="text-[10px]" style={broadcastFaintTextStyle}>
        {item.sourceName}
        {item.alsoReportedBy && item.alsoReportedBy.length > 0 && (
          <span> · Also: {item.alsoReportedBy.slice(0, 3).join(', ')}</span>
        )}
      </div>
    </li>
  );
}

function LeagueDataPanel() {
  const accent = '#38bdf8';

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader
        title="League data"
        subtitle="Download current league records as JSON"
      />
      <BroadcastPanel accent={accent} title="Data exports" meta="6 downloads">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DATA_EXPORTS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              download
              className="group flex min-h-32 flex-col justify-between rounded-xl p-4 transition duration-200 hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                background: item.featured ? `${accent}16` : PANEL.tintSoft,
                boxShadow: `inset 0 0 0 1px ${item.featured ? `${accent}66` : PANEL.hairline}`,
              }}
              aria-label={`Download ${item.label} as JSON`}
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.18em]"
                      style={{ color: accent, background: `${accent}1f`, border: `1px solid ${accent}44` }}
                    >
                      JSON
                    </span>
                    {item.featured && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
                        Complete
                      </span>
                    )}
                  </div>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4 shrink-0 transition-transform group-hover:translate-y-0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    style={{ color: item.featured ? accent : PANEL.muted }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" />
                  </svg>
                </div>
                <div className="mt-3 text-sm font-semibold" style={broadcastBodyTextStyle}>
                  {item.label}
                </div>
                <p className="mt-1 text-xs leading-relaxed" style={broadcastMutedTextStyle}>
                  {item.description}
                </p>
              </div>
              <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: item.featured ? accent : PANEL.muted }}>
                Download file
              </div>
            </a>
          ))}
        </div>
      </BroadcastPanel>
    </section>
  );
}

type FilterKey = 'all' | 'my_team' | 'injury' | 'transaction' | 'trade' | 'depth_chart_role' | 'rookie_development';

type Props = {
  myTeam?: string | null;
};

export default function AroundTheLeague({ myTeam }: Props) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [visibleCount, setVisibleCount] = useState(INITIAL_STORY_COUNT);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: '40', sinceHours: '168' });

    if (filter === 'my_team' && myTeam) {
      params.set('teamFilter', myTeam);
    }

    setLoading(true);
    setVisibleCount(INITIAL_STORY_COUNT);

    fetch(`/api/league-news?${params}`, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j: NewsResponse) => setItems(j.items || []))
      .catch((error) => {
        if (error?.name !== 'AbortError') setItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [filter, myTeam]);

  const FILTERS: Array<{ key: FilterKey; label: string }> = [
    { key: 'all', label: 'All' },
    ...(myTeam ? [{ key: 'my_team' as FilterKey, label: 'My team' }] : []),
    { key: 'injury', label: 'Injuries' },
    { key: 'transaction', label: 'Transactions' },
    { key: 'trade', label: 'Trades' },
    { key: 'depth_chart_role', label: 'Depth chart' },
    { key: 'rookie_development', label: 'Rookies' },
  ];

  const filtered = (() => {
    if (filter === 'all' || filter === 'my_team') return items;
    if (filter === 'transaction') return items.filter((it) => ['nfl_transaction', 'contract'].includes(it.category ?? ''));
    if (filter === 'trade') return items.filter((it) => ['trade', 'trade_rumor'].includes(it.category ?? ''));
    return items.filter((it) => it.category === filter);
  })();

  const visibleItems = filtered.slice(0, visibleCount);
  const remainingCount = Math.max(0, filtered.length - visibleCount);

  return (
    <>
      <section className="mb-10 sm:mb-12">
        <SectionHeader
          title="Around the league"
          subtitle="News for rostered East v. West players"
          actions={
            <Link href="/trade-block" className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              Trade block →
            </Link>
          }
        />

        <div className="flex flex-wrap gap-2 mb-4">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setFilter(key);
                setVisibleCount(INITIAL_STORY_COUNT);
              }}
              className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                filter === key
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <BroadcastPanel accent="#9ca3af" title="">
            <div className="text-sm text-center py-4" style={broadcastMutedTextStyle}>
              Loading news…
            </div>
          </BroadcastPanel>
        ) : filtered.length === 0 ? (
          <BroadcastPanel accent="#9ca3af" title="">
            <div className="text-sm text-center py-4" style={broadcastMutedTextStyle}>
              {items.length === 0
                ? 'No recent news found for rostered players.'
                : 'No stories match this filter.'}
            </div>
          </BroadcastPanel>
        ) : (
          <>
            <ul className="space-y-3">
              {visibleItems.map((item, i) => (
                <NewsCard key={`${item.link}-${i}`} item={item} />
              ))}
            </ul>

            {filtered.length > INITIAL_STORY_COUNT && (
              <div className="mt-4 flex justify-center">
                {remainingCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + STORY_INCREMENT)}
                    className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:opacity-80 transition-opacity"
                    aria-expanded={visibleCount > INITIAL_STORY_COUNT}
                  >
                    Show {Math.min(STORY_INCREMENT, remainingCount)} more
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(INITIAL_STORY_COUNT)}
                    className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:opacity-80 transition-opacity"
                  >
                    Show fewer
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <LeagueDataPanel />
    </>
  );
}
