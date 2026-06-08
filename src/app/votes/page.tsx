'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import type { PollListItem } from '@/lib/votes/types';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  open: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[status] ?? STATUS_COLORS.draft}`}>
      {status}
    </span>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-[var(--muted)]">
        <span>{value}/{max} voted</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-strong)] overflow-hidden">
        <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PollCard({ item }: { item: PollListItem }) {
  const { poll, currentRound, roundCount } = item;
  return (
    <Link href={`/votes/${poll.id}`} className="block group">
      <Card className="transition-colors hover:border-[var(--accent)]/50">
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold group-hover:text-[var(--accent)] transition-colors">{poll.title}</p>
            <StatusBadge status={poll.status} />
          </div>
          {poll.description && (
            <p className="text-sm text-[var(--muted)] line-clamp-2">{poll.description}</p>
          )}
          {currentRound && poll.status === 'open' && (
            <ProgressBar value={currentRound.voteCount} max={currentRound.totalEligible} />
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-[var(--muted)]">{roundCount} round{roundCount !== 1 ? 's' : ''}</span>
            <span className="text-xs text-[var(--muted)]">·</span>
            <span className="text-xs text-[var(--muted)]">{poll.eligibilityType === 'team' ? '12 teams' : '14 members'}</span>
            {poll.deadline && poll.status === 'open' && (
              <>
                <span className="text-xs text-[var(--muted)]">·</span>
                <span className="text-xs text-[var(--muted)]">Deadline: {new Date(poll.deadline).toLocaleDateString()}</span>
              </>
            )}
            {poll.linkedSuggestionIds?.length ? (
              <>
                <span className="text-xs text-[var(--muted)]">·</span>
                <span className="text-xs text-[var(--muted)]">{poll.linkedSuggestionIds.length} linked suggestion{poll.linkedSuggestionIds.length !== 1 ? 's' : ''}</span>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function VotesPage() {
  const [items, setItems] = useState<PollListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/votes')
      .then((r) => r.json())
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const active = items.filter((i) => i.poll.status === 'open');
  const past = items.filter((i) => i.poll.status === 'closed');

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader
        title="League Votes"
        subtitle="Official polls and voting — log in to cast your ballot"
      />
      {loading ? (
        <p className="text-[var(--muted)]">Loading votes…</p>
      ) : items.length === 0 ? (
        <p className="text-[var(--muted)]">No votes yet. Check back when the commissioner opens one.</p>
      ) : (
        <Tabs
          tabs={[
            {
              id: 'active',
              label: `Active${active.length ? ` (${active.length})` : ''}`,
              content: active.length === 0
                ? <p className="text-[var(--muted)] py-4">No active votes right now.</p>
                : <div className="space-y-4 pt-4">{active.map((i) => <PollCard key={i.poll.id} item={i} />)}</div>,
            },
            {
              id: 'past',
              label: `Past${past.length ? ` (${past.length})` : ''}`,
              content: past.length === 0
                ? <p className="text-[var(--muted)] py-4">No past votes.</p>
                : <div className="space-y-4 pt-4">{past.map((i) => <PollCard key={i.poll.id} item={i} />)}</div>,
            },
          ]}
          initialId="active"
        />
      )}
    </div>
  );
}
