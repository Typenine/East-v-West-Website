'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel } from '@/components/ui/BroadcastPanel';
import { CURRENT_SEASON } from '@/lib/constants/league';
import { broadcastBodyTextStyle, broadcastMutedTextStyle, broadcastFaintTextStyle } from '@/lib/ui/broadcast-styles';

type RecentTransaction = {
  id: string;
  type: 'waiver' | 'free_agent' | 'trade';
  team: string;
  week: number;
  created: number;
  faab: number;
  added: string[];
  dropped: string[];
};

function summary(item: RecentTransaction): string {
  if (item.type === 'trade') {
    const assets = item.added.slice(0, 2).join(', ');
    return assets ? `Trade involving ${assets}` : 'Completed trade';
  }
  const add = item.added[0];
  const drop = item.dropped[0];
  if (add && drop) return `Added ${add} · Dropped ${drop}`;
  if (add) return `Added ${add}`;
  return 'Roster transaction';
}

export default function RecentTransactions() {
  const [items, setItems] = useState<RecentTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/home/recent-transactions', { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { items?: RecentTransaction[] }) => setItems(data.items || []))
      .catch((error) => {
        if (error?.name !== 'AbortError') setItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader
        title="Recent transactions"
        subtitle="Latest East v. West roster movement"
        actions={<Link href={`/transactions?season=${CURRENT_SEASON}&type=all`} className="text-sm text-[var(--muted)] hover:text-[var(--text)]">All transactions →</Link>}
      />
      <BroadcastPanel accent="#8b5cf6" title="Transaction wire" meta={loading ? 'Loading' : `${items.length} recent`}>
        {loading ? (
          <div className="space-y-2 py-1">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-white/5" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="py-3 text-sm" style={broadcastMutedTextStyle}>No recent transactions are available yet.</div>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'rgba(148,163,184,0.14)' }}>
            {items.slice(0, 5).map((item) => (
              <li key={`${item.id}-${item.team}`} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold" style={broadcastBodyTextStyle}>{item.team}</span>
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-violet-400 bg-violet-500/10">
                      {item.type === 'free_agent' ? 'FA' : item.type}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs" style={broadcastMutedTextStyle}>{summary(item)}</div>
                </div>
                <div className="shrink-0 text-[10px] tabular-nums" style={broadcastFaintTextStyle}>
                  {item.faab > 0 ? `${item.faab} FAAB · ` : ''}{item.week > 0 ? `Week ${item.week}` : 'Offseason'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </BroadcastPanel>
    </section>
  );
}
