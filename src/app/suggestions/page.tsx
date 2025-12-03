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
  groupId?: string;
  groupPos?: number;
};

type Tallies = Record<string, { up: number; down: number }>;

const CATEGORIES = ['Rules', 'Website', 'Discord', 'Location', 'Other'];

export default function SuggestionsPage() {
  type Draft = {
    category: string;
    content: string;
    rules?: { proposal: string; issue: string; fix: string; conclusion: string } | null;
  };
  const [drafts, setDrafts] = useState<Draft[]>([
    { category: '', content: '', rules: null },
  ]);
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
    // Build items payload from drafts; validate each
    const payload: Array<{ content?: string; category?: string; rules?: { proposal: string; issue: string; fix: string; conclusion: string } }> = [];
    for (const d of drafts) {
      const cat = (d.category || '').trim();
      if (cat.toLowerCase() === 'rules') {
        const r = d.rules || { proposal: '', issue: '', fix: '', conclusion: '' };
        const proposal = (r.proposal || '').trim();
        const issue = (r.issue || '').trim();
        const fix = (r.fix || '').trim();
        const conclusion = (r.conclusion || '').trim();
        if (!proposal || !issue || !fix || !conclusion) {
          setError('Rules items require proposal, issue, fix, and conclusion.');
          return;
        }
        payload.push({ category: 'Rules', rules: { proposal, issue, fix, conclusion } });
      } else {
        const text = (d.content || '').trim();
        if (text.length < 3) {
          setError('Each suggestion must be at least 3 characters.');
          return;
        }
        if (text.length > 5000) {
          setError('Suggestion too long (max 5000 chars).');
          return;
        }
        payload.push({ category: cat || undefined, content: text });
      }
    }
    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: payload, endorse: endorse }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to submit');
      }
      setDrafts([{ category: '', content: '', rules: null }]);
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
                {drafts.map((d, idx) => {
                  const isRules = (d.category || '').toLowerCase() === 'rules';
                  return (
                    <div key={idx} className="p-3 border border-[var(--border)] rounded-[var(--radius-card)]">
                      <div className="flex items-center justify-between mb-2">
                        <Label>Suggestion {idx + 1}</Label>
                        {drafts.length > 1 && (
                          <Button type="button" variant="ghost" onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
                        )}
                      </div>
                      <div className="mb-2">
                        <Label className="mb-1 block">Category (optional)</Label>
                        <Select
                          value={d.category}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, category: v, rules: v.toLowerCase() === 'rules' ? { proposal: '', issue: '', fix: '', conclusion: '' } : null }) : it));
                          }}
                        >
                          <option value="">Select a category</option>
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </Select>
                      </div>
                      {isRules ? (
                        <div className="grid grid-cols-1 gap-3">
                          <div>
                            <Label className="mb-1 block">Proposal</Label>
                            <Textarea rows={3} value={d.rules?.proposal || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { proposal: '', issue: '', fix: '', conclusion: '' }), proposal: e.target.value } }) : it))} required />
                          </div>
                          <div>
                            <Label className="mb-1 block">Issue</Label>
                            <Textarea rows={3} value={d.rules?.issue || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { proposal: '', issue: '', fix: '', conclusion: '' }), issue: e.target.value } }) : it))} required />
                          </div>
                          <div>
                            <Label className="mb-1 block">How it fixes</Label>
                            <Textarea rows={3} value={d.rules?.fix || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { proposal: '', issue: '', fix: '', conclusion: '' }), fix: e.target.value } }) : it))} required />
                          </div>
                          <div>
                            <Label className="mb-1 block">Conclusion</Label>
                            <Textarea rows={3} value={d.rules?.conclusion || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { proposal: '', issue: '', fix: '', conclusion: '' }), conclusion: e.target.value } }) : it))} required />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <Label className="mb-1 block">Your suggestion (anonymous)</Label>
                          <Textarea
                            rows={6}
                            value={d.content}
                            onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, content: e.target.value }) : it))}
                            minLength={3}
                            maxLength={5000}
                            placeholder="Propose changes to rules, website, Discord, etc."
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" onClick={() => setDrafts((prev) => [...prev, { category: '', content: '', rules: null }])}>Add another suggestion</Button>
                </div>

                {auth && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={endorse} onChange={(e) => setEndorse(e.target.checked)} />
                    <span>Publicly endorse as {myTeam ? myTeam : 'my team'}</span>
                  </label>
                )}

                {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting…' : drafts.length > 1 ? 'Submit Suggestions' : 'Submit Suggestion'}
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
                  {(() => {
                    // Group items by groupId (or single)
                    const groups = new Map<string, Suggestion[]>();
                    for (const s of items) {
                      const key = s.groupId ? `g:${s.groupId}` : `s:${s.id}`;
                      if (!groups.has(key)) groups.set(key, []);
                      groups.get(key)!.push(s);
                    }
                    const ordered = Array.from(groups.values()).map((arr) => arr.sort((a, b) => (a.groupPos || 0) - (b.groupPos || 0)));
                    ordered.sort((a, b) => Date.parse(b[0].createdAt) - Date.parse(a[0].createdAt));
                    return ordered.map((arr, gi) => {
                      // Group container uses first item sponsor styling
                      const first = arr[0];
                      const style = first.sponsorTeam ? getTeamColorStyle(first.sponsorTeam) : null;
                      const secondary = first.sponsorTeam ? getTeamColorStyle(first.sponsorTeam, 'secondary') : null;
                      const groupStyle: React.CSSProperties | undefined = style ? { borderLeftColor: (secondary?.backgroundColor as string), borderLeftWidth: 4, borderLeftStyle: 'solid' } : undefined;
                      return (
                        <li key={`grp-${gi}`} className="evw-surface border border-[var(--border)] rounded-[var(--radius-card)] p-3" style={groupStyle}>
                          <div className="mb-2 text-sm text-[var(--muted)]">{new Date(first.createdAt).toLocaleString()}</div>
                          <div className="space-y-4">
                            {arr.map((s, idx) => {
                              const isAccepted = s.status === 'accepted';
                              const isVague = Boolean(s.vague);
                              const myEndorsed = !!(auth && myTeam && s.endorsers && s.endorsers.includes(myTeam));
                              return (
                                <div key={s.id} className="p-3 rounded-[var(--radius-card)] border border-[var(--border)]" style={{ ...(isAccepted ? { boxShadow: 'inset 0 0 0 2px #16a34a33' } : {}), ...(isVague ? { boxShadow: `${isAccepted ? 'inset 0 0 0 2px #16a34a33,' : ''} inset 0 0 0 2px #f59e0b55` } : {}) }}>
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="font-medium">Suggestion {idx + 1}</div>
                                    <div className="flex items-center gap-2">
                                      {s.category && (
                                        <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] evw-surface text-[var(--text)]">{s.category}</span>
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
                                      {isVague && (
                                        <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>VAGUE</span>
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
                                        <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: (getTeamColorStyle(first.sponsorTeam || '')?.backgroundColor as string), color: (getTeamColorStyle(first.sponsorTeam || '')?.backgroundColor as string) }}>
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
                                </div>
                              );
                            })}
                          </div>
                        </li>
                      );
                    });
                  })()}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
