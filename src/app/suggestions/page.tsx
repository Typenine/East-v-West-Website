'use client';

import { useEffect, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { getTeamColorStyle } from '@/lib/utils/team-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';

type Suggestion = {
  id: string;
  content: string;
  category?: string;
  createdAt: string; // ISO
  status?: 'draft' | 'open' | 'accepted' | 'rejected';
  resolvedAt?: string;
  sponsorTeam?: string;
  proposerTeam?: string;
  vague?: boolean;
  endorsers?: string[];
  voteTag?: 'voted_on' | 'vote_passed' | 'vote_failed';
};

type Tallies = Record<string, { up: number; down: number }>;

const CATEGORIES = ['Rules', 'Website', 'Discord', 'Location', 'Other'];

export default function SuggestionsPage() {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tallies, setTallies] = useState<Tallies>({});
  const [auth, setAuth] = useState(false);
  const [myTeam, setMyTeam] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminVotes, setAdminVotes] = useState<Record<string, { up: string[]; down: string[] }>>({});
  const [myVotes, setMyVotes] = useState<Record<string, 1 | -1>>({});
  const [endorse, setEndorse] = useState(false);
  const [endorseBusy, setEndorseBusy] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/suggestions', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load suggestions');
      const data = (await res.json()) as Suggestion[];
      setItems(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load suggestions';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetch('/api/suggestions/tallies', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => setTallies((j?.tallies as Tallies) || {}))
      .catch(() => setTallies({}));
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { setAuth(Boolean(j?.authenticated)); setMyTeam((j?.claims?.team as string) || null); })
      .catch(() => { setAuth(false); setMyTeam(null); });
    fetch('/api/admin-login', { cache: 'no-store', credentials: 'include' })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => setIsAdmin(Boolean(j?.isAdmin)))
      .catch(() => setIsAdmin(false));
    fetch('/api/me/suggestions/votes', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.resolve({ votes: {} }))
      .then((j) => setMyVotes(j?.votes || {}))
      .catch(() => setMyVotes({}));
  }, []);

  useEffect(() => {
    if (!isAdmin) { setAdminVotes({}); return; }
    fetch('/api/admin/suggestions/votes', { cache: 'no-store', credentials: 'include' })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => setAdminVotes((j?.votes as Record<string, { up: string[]; down: string[] }>) || {}))
      .catch(() => setAdminVotes({}));
  }, [isAdmin]);

  async function vote(suggestionId: string, value: 1 | -1 | 0) {
    if (!auth) return;
    // Optimistic update
    const prevVote = myVotes[suggestionId] || 0;
    const nextVote = value === 0 ? 0 : (prevVote === value ? 0 : value);
    const prevTallies = structuredClone(tallies) as Tallies;
    const cur = prevTallies[suggestionId] || { up: 0, down: 0 };
    // revert prev
    if (prevVote === 1) cur.up = Math.max(0, cur.up - 1);
    if (prevVote === -1) cur.down = Math.max(0, cur.down - 1);
    // apply next
    if (nextVote === 1) cur.up += 1;
    if (nextVote === -1) cur.down += 1;
    const optimisticTallies = { ...tallies, [suggestionId]: cur } as Tallies;
    setTallies(optimisticTallies);
    const prevMy = { ...myVotes };
    if (nextVote === 0) delete prevMy[suggestionId]; else prevMy[suggestionId] = nextVote as 1 | -1;
    setMyVotes(prevMy);
    try {
      const res = await fetch('/api/me/suggestions/vote', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId, value: nextVote })
      });
      if (!res.ok) throw new Error('vote failed');
      // Optionally refresh tallies in background for consistency
      fetch('/api/suggestions/tallies', { cache: 'no-store' })
        .then((r) => r.ok ? r.json() : Promise.reject())
        .then((j) => setTallies((j?.tallies as Tallies) || optimisticTallies))
        .catch(() => {});
    } catch {
      // Revert on failure
      setTallies(prevTallies);
      setMyVotes((m) => ({ ...m, [suggestionId]: (prevVote || undefined) as 1 | -1 }));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: content.trim(), category: category || undefined, endorse: endorse }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to submit');
      }
      setContent('');
      setCategory('');
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to submit suggestion';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="League Suggestions" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <Card>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="category" className="mb-1 block">
                    Category (optional)
                  </Label>
                  <Select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Select a category</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>

                {auth && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={endorse} onChange={(e) => setEndorse(e.target.checked)} />
                    <span>Publicly endorse as {myTeam ? myTeam : 'my team'}</span>
                  </label>
                )}

                <div>
                  <Label htmlFor="content" className="mb-1 block">
                    Your suggestion (anonymous)
                  </Label>
                  <Textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={6}
                    required
                    minLength={3}
                    maxLength={5000}
                    placeholder="Propose changes to rules, website, Discord, etc."
                  />
                </div>

                {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

                <Button
                  type="submit"
                  disabled={submitting || content.trim().length < 3}
                >
                  {submitting ? 'Submitting…' : 'Submit Suggestion'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Suggestions</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-[var(--muted)]">Loading…</p>
              ) : items.length === 0 ? (
                <p className="text-[var(--muted)]">No suggestions yet. Be the first to submit one!</p>
              ) : (
                <ul className="space-y-4">
                  {items.map((s) => {
                    const style = s.sponsorTeam ? getTeamColorStyle(s.sponsorTeam) : null;
                    const secondary = s.sponsorTeam ? getTeamColorStyle(s.sponsorTeam, 'secondary') : null;
                    const isAccepted = s.status === 'accepted';
                    const isVague = Boolean(s.vague);
                    const liStyle: React.CSSProperties | undefined = {
                      ...(style ? { borderLeftColor: (secondary?.backgroundColor as string), borderLeftWidth: 4, borderLeftStyle: 'solid' } : {}),
                      ...(isAccepted ? { boxShadow: 'inset 0 0 0 2px #16a34a33' } : {}),
                      ...(isVague ? { boxShadow: `${isAccepted ? 'inset 0 0 0 2px #16a34a33,' : ''} inset 0 0 0 2px #f59e0b55` } : {}),
                    };
                    const myEndorsed = !!(auth && myTeam && s.endorsers && s.endorsers.includes(myTeam));
                    return (
                    <li key={s.id} className="evw-surface border border-[var(--border)] rounded-[var(--radius-card)] p-4" style={liStyle}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--muted)]">
                          {new Date(s.createdAt).toLocaleString(undefined, {
                            year: 'numeric', month: 'short', day: 'numeric',
                            hour: 'numeric', minute: '2-digit'
                          })}
                        </span>
                        <div className="flex items-center gap-2">
                          {s.category && (
                            <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] evw-surface text-[var(--text)]">{s.category}</span>
                          )}
                          {isVague && (
                            <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>VAGUE</span>
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
                      <p className="whitespace-pre-wrap text-[var(--text)]">{isAccepted ? '✅ ' : ''}{s.content}</p>
                      {isAccepted && (
                        <div className="mt-1 text-xs text-[var(--muted)]">Marked added{s.resolvedAt ? ` on ${new Date(s.resolvedAt).toLocaleDateString()}` : ''}</div>
                      )}
                      {(s.proposerTeam || (s.endorsers && s.endorsers.length > 0) || s.sponsorTeam) && (
                        <div className="mt-2 flex flex-wrap gap-2 items-center">
                          {s.proposerTeam && (
                            <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: getTeamColorStyle(s.proposerTeam)?.backgroundColor as string, color: getTeamColorStyle(s.proposerTeam)?.backgroundColor as string }}>
                              Proposed by {s.proposerTeam}
                            </span>
                          )}
                          {s.endorsers && s.endorsers.length > 0 && (
                            <span className="text-xs text-[var(--muted)]">Endorsed by</span>
                          )}
                          {s.endorsers?.map((t) => (
                            <span key={t} className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: getTeamColorStyle(t)?.backgroundColor as string, color: getTeamColorStyle(t)?.backgroundColor as string }}>{t}</span>
                          ))}
                          {!s.endorsers?.length && s.sponsorTeam && (
                            <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: (style?.backgroundColor as string), color: (style?.backgroundColor as string) }}>
                              Endorsed by {s.sponsorTeam}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-sm text-[var(--muted)]">Up: {tallies[s.id]?.up || 0}</span>
                        <span className="text-sm text-[var(--muted)]">Down: {tallies[s.id]?.down || 0}</span>
                        {(auth || isAdmin) && (
                          <div className="ml-auto flex gap-2">
                            <Button
                              type="button"
                              onClick={() => auth ? vote(s.id, 1) : undefined}
                              aria-label="Thumbs up"
                              title={isAdmin && adminVotes[s.id]?.up?.length ? `Up votes: ${adminVotes[s.id].up.join(', ')}` : undefined}
                              disabled={!auth}
                              variant={myVotes[s.id] === 1 ? 'primary' : 'ghost'}
                            >👍</Button>
                            <Button
                              type="button"
                              onClick={() => auth ? vote(s.id, -1) : undefined}
                              aria-label="Thumbs down"
                              title={isAdmin && adminVotes[s.id]?.down?.length ? `Down votes: ${adminVotes[s.id].down.join(', ')}` : undefined}
                              disabled={!auth}
                              variant={myVotes[s.id] === -1 ? 'danger' : 'ghost'}
                            >👎</Button>
                            <Button
                              type="button"
                              onClick={async () => {
                                if (!auth || !myTeam) return;
                                setEndorseBusy(s.id);
                                try {
                                  const res = await fetch('/api/me/suggestions/endorse', {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    body: JSON.stringify({ suggestionId: s.id, endorse: !myEndorsed }),
                                  });
                                  if (res.ok) {
                                    setItems((prev) => prev.map((it) => {
                                      if (it.id !== s.id) return it;
                                      const arr = Array.isArray(it.endorsers) ? [...it.endorsers] : [];
                                      if (!myEndorsed) {
                                        if (!arr.includes(myTeam)) arr.push(myTeam);
                                      } else {
                                        const idx = arr.indexOf(myTeam);
                                        if (idx >= 0) arr.splice(idx, 1);
                                      }
                                      return { ...it, endorsers: arr } as Suggestion;
                                    }));
                                  }
                                } finally {
                                  setEndorseBusy(null);
                                }
                              }}
                              disabled={!auth || endorseBusy === s.id}
                              variant={myEndorsed ? 'primary' : 'ghost'}
                              aria-label={myEndorsed ? 'Unendorse' : 'Endorse'}
                              title={myEndorsed ? 'Unendorse this suggestion' : 'Endorse this suggestion'}
                            >⭐</Button>
                          </div>
                        )}
                      </div>
                    </li>
                  );})}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
