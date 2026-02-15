'use client';

import { useEffect, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { TEAM_NAMES } from '@/lib/constants/league';
import { getTeamColorStyle } from '@/lib/utils/team-utils';

type Suggestion = {
  id: string;
  title?: string;
  content: string;
  category?: string;
  createdAt: string; // ISO
  status?: 'draft' | 'open' | 'accepted' | 'rejected';
  resolvedAt?: string | null;
  sponsorTeam?: string | null;
  proposerTeam?: string | null;
  vague?: boolean;
  endorsers?: string[];
  voteTag?: 'voted_on' | 'vote_passed' | 'vote_failed';
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
                const sponsorStyle = s.sponsorTeam ? getTeamColorStyle(s.sponsorTeam) : null;
                const isVague = Boolean(s.vague);
                const liStyle: React.CSSProperties | undefined = {
                  ...(isAccepted ? { boxShadow: 'inset 0 0 0 2px #16a34a33' } : {}),
                  ...(isVague ? { boxShadow: `${isAccepted ? 'inset 0 0 0 2px #16a34a33,' : ''} inset 0 0 0 2px #f59e0b55` } : {}),
                };
                return (
                  <li key={s.id} className="evw-surface border border-[var(--border)] rounded-[var(--radius-card)] p-4" style={liStyle}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-[var(--muted)]">
                        {new Date(s.createdAt).toLocaleString(undefined, {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: 'numeric', minute: '2-digit'
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        {s.category && (
                          <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] evw-surface text-[var(--text)]">{s.category}</span>
                        )}
                        {isVague && (
                          <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>Needs Clarification</span>
                        )}
                        {s.voteTag === 'voted_on' && (
                          <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#0b5f98', color: '#0b5f98' }}>VOTED ON</span>
                        )}
                        {s.voteTag === 'vote_passed' && (
                          <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#16a34a', color: '#16a34a' }}>VOTE PASSED</span>
                        )}
                        {s.voteTag === 'vote_failed' && (
                          <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#be161e', color: '#be161e' }}>VOTE FAILED</span>
                        )}
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="text-xs flex flex-col gap-1">
                        <span className="uppercase tracking-wide text-[var(--muted)]">Title (for ballot)</span>
                        <input
                          type="text"
                          className="border border-[var(--border)] rounded px-2 py-1 text-sm bg-transparent"
                          value={s.title || ''}
                          disabled={busy === s.id}
                          placeholder="Enter title..."
                          onBlur={async (e) => {
                            const val = e.target.value.trim();
                            if (val === (s.title || '')) return; // No change
                            setBusy(s.id);
                            try {
                              const res = await fetch('/api/admin/suggestions', {
                                method: 'PUT',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: s.id, title: val || null }),
                              });
                              if (res.ok) {
                                const j = await res.json().catch(() => ({}));
                                setItems((prev) => prev.map((it) => it.id === s.id ? ({ ...it, title: (j?.title ?? (val || null)) || undefined }) : it));
                              }
                            } finally {
                              setBusy(null);
                            }
                          }}
                          onChange={(e) => {
                            // Optimistic update for typing
                            const val = e.target.value;
                            setItems((prev) => prev.map((it) => it.id === s.id ? ({ ...it, title: val || undefined }) : it));
                          }}
                        />
                      </label>
                    </div>
                    <p className="whitespace-pre-wrap mb-2">{isAccepted ? '✅ ' : ''}{s.content}</p>
                    {isAccepted && (
                      <div className="mb-3 text-xs text-[var(--muted)]">Marked added{ s.resolvedAt ? ` on ${new Date(s.resolvedAt).toLocaleDateString()}` : '' }</div>
                    )}
                    {(s.proposerTeam || (s.endorsers && s.endorsers.length > 0) || s.sponsorTeam) && (
                      <div className="mb-3 flex flex-wrap gap-2 items-center">
                        {s.proposerTeam && (
                          <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: getTeamColorStyle(s.proposerTeam)?.backgroundColor as string, color: getTeamColorStyle(s.proposerTeam)?.backgroundColor as string }}>
                            Proposed by {s.proposerTeam}
                          </span>
                        )}
                        {(s.endorsers && s.endorsers.length > 0) && (
                          <span className="text-xs text-[var(--muted)]">Endorsed by</span>
                        )}
                        {s.endorsers?.map((t) => (
                          <span key={t} className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: getTeamColorStyle(t)?.backgroundColor as string, color: getTeamColorStyle(t)?.backgroundColor as string }}>{t}</span>
                        ))}
                        {!s.endorsers?.length && s.sponsorTeam && (
                          <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: sponsorStyle?.backgroundColor as string, color: sponsorStyle?.backgroundColor as string }}>
                            Endorsed by {s.sponsorTeam}
                          </span>
                        )}
                      </div>
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
                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                      <label className="text-xs flex items-center gap-2">
                        <span className="uppercase tracking-wide">Proposed by</span>
                        <select
                          className="border border-[var(--border)] rounded px-2 py-1 text-sm"
                          value={s.proposerTeam || ''}
                          disabled={busy === s.id}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setBusy(s.id);
                            try {
                              const res = await fetch('/api/admin/suggestions', {
                                method: 'PUT',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: s.id, proposerTeam: val || null }),
                              });
                              if (res.ok) {
                                const j = await res.json().catch(() => ({}));
                                setItems((prev) => prev.map((it) => it.id === s.id ? ({ ...it, proposerTeam: (j?.proposerTeam ?? (val || null)) || null }) : it));
                              }
                            } finally {
                              setBusy(null);
                            }
                          }}
                        >
                          <option value="">— None —</option>
                          {TEAM_NAMES.map((team) => (
                            <option key={team} value={team}>{team}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs flex items-center gap-2">
                        <span className="uppercase tracking-wide">Sponsor</span>
                        <select
                          className="border border-[var(--border)] rounded px-2 py-1 text-sm"
                          value={s.sponsorTeam || ''}
                          disabled={busy === s.id}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setBusy(s.id);
                            try {
                              const res = await fetch('/api/admin/suggestions', {
                                method: 'PUT',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: s.id, sponsorTeam: val || null }),
                              });
                              if (res.ok) {
                                const j = await res.json().catch(() => ({}));
                                setItems((prev) => prev.map((it) => it.id === s.id ? ({ ...it, sponsorTeam: (j?.sponsorTeam ?? (val || null)) || null }) : it));
                              }
                            } finally {
                              setBusy(null);
                            }
                          }}
                        >
                          <option value="">— None —</option>
                          {TEAM_NAMES.map((team) => (
                            <option key={team} value={team}>{team}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs flex items-center gap-2">
                        <span className="uppercase tracking-wide">Vote Tag</span>
                        <select
                          className="border border-[var(--border)] rounded px-2 py-1 text-sm"
                          value={s.voteTag || ''}
                          disabled={busy === s.id}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setBusy(s.id);
                            try {
                              const res = await fetch('/api/admin/suggestions', {
                                method: 'PUT',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: s.id, voteTag: val || '' }),
                              });
                              if (res.ok) {
                                const j = await res.json().catch(() => ({}));
                                setItems((prev) => prev.map((it) => it.id === s.id ? ({ ...it, voteTag: (j?.voteTag ?? (val || undefined)) || undefined }) : it));
                              }
                            } finally {
                              setBusy(null);
                            }
                          }}
                        >
                          <option value="">— None —</option>
                          <option value="voted_on">Voted On</option>
                          <option value="vote_passed">Vote Passed</option>
                          <option value="vote_failed">Vote Failed</option>
                        </select>
                      </label>
                      <button
                        className="text-sm px-3 py-1 rounded border border-[var(--border)]"
                        disabled={busy === s.id}
                        onClick={async () => {
                          setBusy(s.id);
                          try {
                            const r = await fetch('/api/admin/suggestions', {
                              method: 'PUT',
                              credentials: 'include',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: s.id, vague: !s.vague })
                            });
                            if (r.ok) setItems((prev) => prev.map((it) => it.id === s.id ? ({ ...it, vague: !s.vague }) : it));
                          } finally { setBusy(null); }
                        }}
                        title={s.vague ? 'Clear Needs Clarification' : 'Mark Needs Clarification'}
                      >{s.vague ? 'Clear Needs Clarification' : 'Mark Needs Clarification'}</button>
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
