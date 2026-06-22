'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel } from '@/components/ui/BroadcastPanel';
import { broadcastBodyTextStyle, broadcastMutedTextStyle, broadcastFaintTextStyle, PANEL } from '@/components/ui/BroadcastPanel';

type NewsMatch = { playerId: string; name: string; confidence?: string };
type NewsItem = {
  title: string;
  link: string;
  description: string;
  sourceName: string;
  publishedAt: string | null;
  matches: NewsMatch[];
  category?: string;
};

type NewsResponse = { count: number; items: NewsItem[] };

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

function NewsCard({ item }: { item: NewsItem }) {
  const playerNames = item.matches.map((m) => m.name).join(', ');
  return (
    <li
      className="rounded-xl p-3"
      style={{
        background: 'rgba(255,255,255,0.03)',
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
      {playerNames && (
        <div className="text-xs mb-1" style={broadcastMutedTextStyle}>
          {playerNames}
        </div>
      )}
      <div className="text-[10px]" style={broadcastFaintTextStyle}>
        {item.sourceName}
      </div>
    </li>
  );
}

type FilterKey = 'all' | 'injury' | 'transaction' | 'trade' | 'depth_chart_role' | 'rookie_development';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'injury', label: 'Injuries' },
  { key: 'transaction', label: 'Transactions' },
  { key: 'trade', label: 'Trades' },
  { key: 'depth_chart_role', label: 'Depth chart' },
  { key: 'rookie_development', label: 'Rookies' },
];

export default function AroundTheLeague({ playerIds }: { playerIds: string[] }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    if (playerIds.length === 0) { setLoading(false); return; }
    const ids = playerIds.slice(0, 200).join(','); // cap to avoid URL length issues
    fetch(`/api/roster-news?playerIds=${encodeURIComponent(ids)}&limit=30&sinceHours=168`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j: NewsResponse) => setItems(j.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [playerIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filter === 'all'
    ? items
    : filter === 'transaction'
      ? items.filter((it) => ['nfl_transaction', 'contract'].includes(it.category ?? ''))
      : filter === 'trade'
        ? items.filter((it) => ['trade', 'trade_rumor'].includes(it.category ?? ''))
        : items.filter((it) => it.category === filter);

  return (
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

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
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
        <ul className="space-y-3">
          {filtered.slice(0, 15).map((item, i) => (
            <NewsCard key={`${item.link}-${i}`} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
