'use client';

import { useEffect, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

type Suggestion = {
  id: string;
  content: string;
  category?: string;
  createdAt: string; // ISO
  status?: 'draft' | 'open' | 'accepted' | 'rejected';
  resolvedAt?: string | null;
};

type VotesMap = Record<string, { up: string[]; down: string[] }>; // suggestionId -> { up, down }

export default function AdminSuggestionsPage() {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [votes, setVotes] = useState<VotesMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [sugRes, votesRes] = await Promise.all([
          fetch('/api/suggestions', { cache: 'no-store' }),
          fetch('/api/admin/suggestions/votes', { cache: 'no-store' }),
        ]);
        if (!sugRes.ok) throw new Error('Failed to load suggestions');
        if (!votesRes.ok) {
          if (votesRes.status === 403) throw new Error('Admin access required');
          throw new Error('Failed to load votes');
        }
        const sugs = (await sugRes.json()) as Suggestion[];
        const vm = (await votesRes.json()) as { votes: VotesMap };
        if (!mounted) return;
        setItems(sugs);
        setVotes(vm?.votes || {});
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Admin • Suggestions Votes" />

      <Card>
        <CardHeader>
          <CardTitle>Suggestion Votes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-[var(--muted)]">Loading…</p>
          ) : error ? (
            <p className="text-[var(--danger)]">{error}</p>
          ) : items.length === 0 ? (
            <p className="text-[var(--muted)]">No suggestions.</p>
          ) : (
            <ul className="space-y-4">
              {items.map((s) => {
                const v = votes[s.id] || { up: [], down: [] };
                const isAccepted = s.status === 'accepted';
                return (
                  <li key={s.id} className="evw-surface border border-[var(--border)] rounded-[var(--radius-card)] p-4" style={isAccepted ? { boxShadow: 'inset 0 0 0 2px #16a34a33' } : undefined}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-[var(--muted)]">
                        {new Date(s.createdAt).toLocaleString(undefined, {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit'
                        })}
                      </div>
                      {s.category && (
                        <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] evw-surface text-[var(--text)]">{s.category}</span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap mb-2">{isAccepted ? '✅ ' : ''}{s.content}</p>
                    {isAccepted && (
                      <div className="mb-3 text-xs text-[var(--muted)]">Marked added{ s.resolvedAt ? ` on ${new Date(s.resolvedAt).toLocaleDateString()}` : '' }</div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="font-semibold mb-1">👍 Up votes ({v.up.length})</div>
                        {v.up.length === 0 ? (
                          <div className="text-sm text-[var(--muted)]">None</div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {v.up.map((t) => (
                              <span key={t} className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] evw-surface">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold mb-1">👎 Down votes ({v.down.length})</div>
                        {v.down.length === 0 ? (
                          <div className="text-sm text-[var(--muted)]">None</div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {v.down.map((t) => (
                              <span key={t} className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] evw-surface">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      {isAccepted ? (
                        <button
                          className="text-sm px-3 py-1 rounded border border-[var(--border)]"
                          disabled={busy === s.id}
                          onClick={async () => {
                            setBusy(s.id);
                            try {
                              const r = await fetch('/api/admin/suggestions', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, status: 'open' }) });
                              if (r.ok) setItems((prev) => prev.map((it) => it.id === s.id ? ({ ...it, status: 'open', resolvedAt: null }) : it));
                            } finally { setBusy(null); }
                          }}
                          title="Reopen"
                        >Reopen</button>
                      ) : (
                        <button
                          className="text-sm px-3 py-1 rounded border border-[var(--border)] bg-green-600 text-white"
                          disabled={busy === s.id}
                          onClick={async () => {
                            setBusy(s.id);
                            try {
                              const r = await fetch('/api/admin/suggestions', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, status: 'accepted' }) });
                              if (r.ok) setItems((prev) => prev.map((it) => it.id === s.id ? ({ ...it, status: 'accepted', resolvedAt: new Date().toISOString() }) : it));
                            } finally { setBusy(null); }
                          }}
                          title="Mark as added"
                        >✔ Added</button>
                      )}
                      <button
                        className="text-sm px-3 py-1 rounded border border-[var(--border)] text-[var(--danger)]"
                        disabled={busy === s.id}
                        onClick={async () => {
                          if (!confirm('Delete this suggestion?')) return;
                          setBusy(s.id);
                          try {
                            const r = await fetch('/api/admin/suggestions', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) });
                            if (r.ok) setItems((prev) => prev.filter((it) => it.id !== s.id));
                          } finally { setBusy(null); }
                        }}
                        title="Delete suggestion"
                      >Delete</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
