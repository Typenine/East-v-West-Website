'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { getTeamColorStyle } from '@/lib/utils/team-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import { rulesHtmlSections } from '@/data/rules';

const ENDORSEMENT_THRESHOLD = 3;

type Suggestion = {
  id: string;
  title?: string;
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
  displayNumber?: number;
  ballotForced?: boolean;
};

type Tallies = Record<string, { up: number; down: number }>;

const CATEGORIES = ['Rules', 'Website', 'Discord', 'Location', 'Other'];

type SortOption = 'newest' | 'oldest' | 'closest_to_ballot';

// Helper to format suggestion display label
function getSuggestionLabel(s: Suggestion): string {
  if (s.title && s.title.trim()) return s.title;
  if (s.displayNumber) return `Suggestion ${String(s.displayNumber).padStart(4, '0')}`;
  return `Suggestion #${s.id.slice(0, 8)}`;
}

export default function SuggestionsPage() {
  type Draft = {
    category: string;
    content: string;
    title?: string;
    endorse?: boolean;
    rules?: { title: string; proposal: string; issue: string; fix: string; conclusion: string; sectionId?: string; refTitle?: string; refCode?: string; effective?: string } | null;
  };
  const [drafts, setDrafts] = useState<Draft[]>([
    { category: '', content: '', title: '', rules: null },
  ]);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
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
  const [endorseBusy, setEndorseBusy] = useState<string | null>(null);
  const EFFECTIVE_OPTS = ['Immediately', 'Next season', 'After draft', 'Two seasons from now', 'Other'];

  // Build section options and precomputed item options from the rulebook HTML
  type RuleItem = { code: string; title: string; label: string };
  const ruleSections = useMemo(() => rulesHtmlSections.map((s) => ({ id: s.id, title: s.title, html: s.html })), []);
  const ruleSectionOptions = useMemo(() => ruleSections.map((s) => {
    const m = s.title.match(/^(\d+)\.\s*(.*)$/);
    return { id: s.id, num: m ? m[1] : s.title, label: s.title } as { id: string; num: string; label: string };
  }), [ruleSections]);
  const itemsBySection: Record<string, RuleItem[]> = useMemo(() => {
    const map: Record<string, RuleItem[]> = {};
    for (const s of ruleSections) {
      const html = s.html;
      const list: RuleItem[] = [];
      const seen = new Set<string>();
      const headingByCode: Record<string, string> = {};
      // Strong headings like 2.3 - Bench:
      const strongRe = /<strong>\s*([0-9]+(?:\.[0-9]+)+)\s*[–-]?\s*([^:<]+?)(?::|<\/strong>)/gi;
      let m: RegExpExecArray | null;
      while ((m = strongRe.exec(html)) !== null) {
        const code = m[1].trim();
        const title = m[2].trim();
        const label = `${code} ${title}`;
        if (!seen.has(label)) { list.push({ code, title, label }); seen.add(label); }
        // store parent heading for sub-items
        headingByCode[code] = title;
      }
      // List items like 2.5(a) Taxi ...
      const liRe = /<li>\s*([0-9]+(?:\.[0-9]+)+)\s*\(([a-z0-9]+)\)\s*([^<]+)<\/li>/gi;
      while ((m = liRe.exec(html)) !== null) {
        const base = m[1].trim();
        const sub = m[2].trim();
        const tail = m[3].trim().replace(/\s+/g, ' ');
        const code = `${base}(${sub})`;
        const titleBase = (headingByCode[base] || tail.replace(/^[–-]\s*/, ''));
        // summarize tail: drop parentheticals and shorten
        let summary = tail.replace(/\([^)]*\)/g, '').trim().replace(/\s+/g, ' ');
        if (!summary) summary = titleBase;
        const MAX_SUMMARY = 60;
        if (summary.length > MAX_SUMMARY) summary = summary.slice(0, MAX_SUMMARY - 1) + '…';
        const title = `${titleBase} - ${summary}`;
        const label = `${code} ${title}`;
        if (!seen.has(label)) { list.push({ code, title, label }); seen.add(label); }
      }
      map[s.id] = list;
    }
    return map;
  }, [ruleSections]);

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
    const payload: Array<{ content?: string; category?: string; endorse?: boolean; rules?: { title: string; proposal: string; issue: string; fix: string; conclusion: string; reference?: { title?: string; code?: string }; effective?: string } }> = [];
    for (const d of drafts) {
      const cat = (d.category || '').trim();
      if (!cat) {
        setError('Category is required for each suggestion.');
        return;
      }
      if (cat.toLowerCase() === 'rules') {
        if (!auth) {
          setError('You must be logged in to submit Rules suggestions.');
          return;
        }
        const r = d.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' };
        const ruleTitle = (r.title || '').trim();
        if (!ruleTitle) {
          setError('Title is required for Rules suggestions.');
          return;
        }
        const proposal = (r.proposal || '').trim();
        const issue = (r.issue || '').trim();
        const fix = (r.fix || '').trim();
        const conclusion = (r.conclusion || '').trim();
        if (!proposal || !issue || !fix || !conclusion) {
          setError('Rules items require proposal, issue, fix, and conclusion.');
          return;
        }
        if (!r.sectionId) {
          setError('Select a Rule Section.');
          return;
        }
        if (!r.refTitle) {
          setError('Select a Rule Item.');
          return;
        }
        payload.push({ category: 'Rules', endorse: Boolean(d.endorse), rules: { title: ruleTitle, proposal, issue, fix, conclusion, reference: { title: (r.refTitle || '').trim(), code: '' }, effective: (r.effective || '').trim() } });
      } else {
        const text = (d.content || '').trim();
        const itemTitle = (d.title || '').trim();
        // Title is required for all suggestions
        if (!itemTitle) {
          setError('Title is required for each suggestion.');
          return;
        }
        if (text.length < 3) {
          setError('Each suggestion must be at least 3 characters.');
          return;
        }
        if (text.length > 5000) {
          setError('Suggestion too long (max 5000 chars).');
          return;
        }
        payload.push({ category: cat || undefined, content: text, title: itemTitle, endorse: Boolean(d.endorse) } as typeof payload[number]);
      }
    }
    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items: payload }),
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
                        <Label className="mb-1 block">Category</Label>
                        <Select
                          value={d.category}
                          required
                          onChange={(e) => {
                            const v = e.target.value;
                            setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, category: v, rules: v.toLowerCase() === 'rules' ? { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' } : null }) : it));
                          }}
                        >
                          <option value="">Select a category</option>
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </Select>
                      </div>
                      {auth && (
                        <label className="flex items-center gap-2 text-sm mb-2">
                          <input type="checkbox" checked={Boolean(d.endorse)} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, endorse: e.target.checked }) : it))} />
                          <span>Endorse this suggestion as {myTeam ? myTeam : 'my team'}</span>
                        </label>
                      )}
                      {isRules ? (
                        <div className="grid grid-cols-1 gap-3">
                          {!auth && (
                            <div className="p-2 rounded border border-[var(--warning)] bg-[var(--warning)]/10 text-sm text-[var(--warning)]">
                              You must be logged in to submit Rules suggestions.
                            </div>
                          )}
                          <div>
                            <Label className="mb-1 block">Title (for ballot)</Label>
                            <input
                              className="w-full border border-[var(--border)] rounded px-2 py-1.5 text-sm bg-transparent"
                              value={d.rules?.title || ''}
                              onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({
                                ...it,
                                rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), title: e.target.value }
                              }) : it))}
                              placeholder="e.g., Expand Taxi Squad"
                              required
                            />
                          </div>
                          <div>
                            <Label className="mb-1 block">Rule Section</Label>
                            <Select
                              value={d.rules?.sectionId || ''}
                              onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({
                                ...it,
                                rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), sectionId: e.target.value, refTitle: '' }
                              }) : it))}
                              required
                            >
                              <option value="">Select a section (1–13)</option>
                              {ruleSectionOptions.map((opt) => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <Label className="mb-1 block">Rule Item</Label>
                            <Select
                              value={d.rules?.refTitle || ''}
                              onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({
                                ...it,
                                rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), refTitle: e.target.value }
                              }) : it))}
                              required
                              disabled={!d.rules?.sectionId}
                            >
                              <option value="">{d.rules?.sectionId ? 'Select rule item' : 'Select a section first'}</option>
                              {(d.rules?.sectionId ? itemsBySection[d.rules.sectionId] || [] : []).map((it) => (
                                <option key={it.label} value={it.label}>{it.label}</option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <Label className="mb-1 block">Effective</Label>
                            <Select value={d.rules?.effective || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), effective: e.target.value } }) : it))}>
                              <option value="">Select when it would take effect</option>
                              {EFFECTIVE_OPTS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <Label className="mb-1 block">Proposal</Label>
                            <Textarea rows={3} value={d.rules?.proposal || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), proposal: e.target.value } }) : it))} required />
                          </div>
                          <div>
                            <Label className="mb-1 block">Issue</Label>
                            <Textarea rows={3} value={d.rules?.issue || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), issue: e.target.value } }) : it))} required />
                          </div>
                          <div>
                            <Label className="mb-1 block">How it fixes</Label>
                            <Textarea rows={3} value={d.rules?.fix || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), fix: e.target.value } }) : it))} required />
                          </div>
                          <div>
                            <Label className="mb-1 block">Conclusion</Label>
                            <Textarea rows={3} value={d.rules?.conclusion || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), conclusion: e.target.value } }) : it))} required />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <Label className="mb-1 block">Title (required)</Label>
                            <input
                              className="w-full border border-[var(--border)] rounded px-2 py-1.5 text-sm bg-transparent"
                              value={d.title || ''}
                              onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, title: e.target.value }) : it))}
                              placeholder="e.g., Add Flex Spot to Roster"
                              required
                            />
                          </div>
                          <div>
                            <Label className="mb-1 block">Description</Label>
                            <Textarea
                              rows={6}
                              value={d.content}
                              onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, content: e.target.value }) : it))}
                              minLength={3}
                              maxLength={5000}
                              placeholder="Describe your suggestion in detail..."
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex items-center gap-2">
                  <Button type="button" className="border border-[var(--border)]" variant="primary" onClick={() => setDrafts((prev) => [...prev, { category: '', content: '', rules: null }])}>Add another suggestion</Button>
                </div>

                {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Submitting…' : drafts.length > 1 ? 'Submit Suggestions' : 'Submit Suggestion'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Ballot Queue Section */}
          {(() => {
            // Helper to compute eligible endorsement count (excludes proposer)
            const getEligibleCount = (s: Suggestion) => {
              const endorsers = s.endorsers || [];
              return endorsers.filter((t) => t !== s.proposerTeam).length;
            };

            // Ballot-eligible items: >= 3 eligible endorsements OR ballotForced, not finalized (no voteTag or voteTag === 'voted_on')
            const ballotQueue = items.filter((s) => {
              const eligibleCount = getEligibleCount(s);
              const isFinalized = s.voteTag === 'vote_passed' || s.voteTag === 'vote_failed';
              const isBallotEligible = eligibleCount >= ENDORSEMENT_THRESHOLD || s.ballotForced;
              return isBallotEligible && !isFinalized && !s.vague;
            });

            if (ballotQueue.length === 0) return null;

            return (
              <Card>
                <CardHeader>
                  <CardTitle>🗳️ Ballot Queue</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--muted)] mb-3">
                    These suggestions have reached {ENDORSEMENT_THRESHOLD} endorsements and are eligible for voting.
                  </p>
                  <ul className="space-y-2">
                    {ballotQueue.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/suggestions/${s.id}`}
                          className="block p-3 rounded-lg border border-[var(--border)] evw-surface hover:border-[var(--accent)] transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{getSuggestionLabel(s)}</span>
                            {s.voteTag === 'voted_on' && (
                              <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#0b5f98', color: '#0b5f98' }}>
                                VOTING
                              </span>
                            )}
                          </div>
                          {s.content && (
                            <p className="text-sm text-[var(--muted)] mt-1 line-clamp-2">
                              {s.content.slice(0, 120)}{s.content.length > 120 ? '…' : ''}
                            </p>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })()}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle>Recent Suggestions</CardTitle>
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Sort:</Label>
                  <Select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="text-sm py-1"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="closest_to_ballot">Closest to ballot</option>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-[var(--muted)]">Loading…</p>
              ) : items.length === 0 ? (
                <p className="text-[var(--muted)]">No suggestions yet. Be the first to submit one!</p>
              ) : (
                <ul className="space-y-4">
                  {(() => {
                    // Helper to compute eligible endorsement count (excludes proposer)
                    const getEligibleCount = (s: Suggestion) => {
                      const endorsers = s.endorsers || [];
                      return endorsers.filter((t) => t !== s.proposerTeam).length;
                    };

                    // Group items by groupId (or single)
                    const groups = new Map<string, Suggestion[]>();
                    for (const s of items) {
                      const key = s.groupId ? `g:${s.groupId}` : `s:${s.id}`;
                      if (!groups.has(key)) groups.set(key, []);
                      groups.get(key)!.push(s);
                    }
                    const ordered = Array.from(groups.values()).map((arr) => arr.sort((a, b) => (a.groupPos || 0) - (b.groupPos || 0)));

                    // Apply sorting
                    if (sortBy === 'newest') {
                      ordered.sort((a, b) => Date.parse(b[0].createdAt) - Date.parse(a[0].createdAt));
                    } else if (sortBy === 'oldest') {
                      ordered.sort((a, b) => Date.parse(a[0].createdAt) - Date.parse(b[0].createdAt));
                    } else if (sortBy === 'closest_to_ballot') {
                      // Sort by fewest endorsements needed (closest to threshold first)
                      ordered.sort((a, b) => {
                        const aNeeds = Math.max(0, ENDORSEMENT_THRESHOLD - getEligibleCount(a[0]));
                        const bNeeds = Math.max(0, ENDORSEMENT_THRESHOLD - getEligibleCount(b[0]));
                        return aNeeds - bNeeds;
                      });
                    }
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
                              // Compute eligible endorsement count (excludes proposer)
                              const eligibleCount = getEligibleCount(s);
                              const needsMore = Math.max(0, ENDORSEMENT_THRESHOLD - eligibleCount);
                              const isBallotEligible = eligibleCount >= ENDORSEMENT_THRESHOLD;
                              return (
                                <div id={s.id} key={s.id} className="p-3 rounded-[var(--radius-card)] border border-[var(--border)]" style={{ ...(isAccepted ? { boxShadow: 'inset 0 0 0 2px #16a34a33' } : {}), ...(isVague ? { boxShadow: `${isAccepted ? 'inset 0 0 0 2px #16a34a33,' : ''} inset 0 0 0 2px #f59e0b55` } : {}) }}>
                                  <div className="flex items-center justify-between mb-1 gap-2">
                                    <Link href={`/suggestions/${s.id}`} className="font-medium hover:underline">
                                      {s.title ? s.title : `Suggestion ${idx + 1}`}
                                    </Link>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {/* Endorsement counter */}
                                      <span
                                        className="text-xs px-2 py-0.5 rounded-full border font-medium"
                                        style={{
                                          borderColor: isBallotEligible ? '#16a34a' : 'var(--border)',
                                          color: isBallotEligible ? '#16a34a' : 'var(--muted)',
                                          backgroundColor: isBallotEligible ? '#16a34a10' : 'transparent',
                                        }}
                                        title={needsMore > 0 ? `Needs ${needsMore} more endorsement${needsMore > 1 ? 's' : ''}` : 'Ballot eligible'}
                                      >
                                        {eligibleCount}/{ENDORSEMENT_THRESHOLD}
                                      </span>
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
                                        <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>Needs Clarification</span>
                                      )}
                                    </div>
                                  </div>
                                  {/* Needs X more indicator */}
                                  {needsMore > 0 && !s.voteTag && (
                                    <div className="text-xs text-[var(--muted)] mb-2">
                                      Needs {needsMore} more endorsement{needsMore > 1 ? 's' : ''}
                                    </div>
                                  )}
                                  {(() => {
                                    const lines = String(s.content || '').split('\n');
                                    const renderLine = (ln: string, key: number) => {
                                      const m = ln.match(/^(Rule|Effective|Proposal|Issue|How it fixes|Conclusion):\s*(.*)$/i);
                                      if (m) {
                                        return (
                                          <div key={key} className="text-[var(--text)]">
                                            <strong>{m[1]}:</strong> {m[2]}
                                          </div>
                                        );
                                      }
                                      return <div key={key} className="text-[var(--text)]">{ln}</div>;
                                    };
                                    return <div>{isAccepted ? <div>✅</div> : null}{lines.map((ln, i) => renderLine(ln, i))}</div>;
                                  })()}
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
                                        {(() => {
                                          const canEndorse = !isVague && !s.voteTag && !(s.proposerTeam === myTeam);
                                          return (
                                            <Button
                                              type="button"
                                              onClick={async () => {
                                                if (!auth || !myTeam || !canEndorse) return;
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
                                                        const idx2 = arr.indexOf(myTeam);
                                                        if (idx2 >= 0) arr.splice(idx2, 1);
                                                      }
                                                      return { ...it, endorsers: arr } as Suggestion;
                                                    }));
                                                  }
                                                } finally {
                                                  setEndorseBusy(null);
                                                }
                                              }}
                                              disabled={!auth || endorseBusy === s.id || !canEndorse}
                                              variant={myEndorsed ? 'primary' : 'ghost'}
                                              aria-label={myEndorsed ? 'Unendorse' : 'Endorse'}
                                              title={
                                                !canEndorse
                                                  ? (s.proposerTeam === myTeam ? 'Cannot endorse your own proposal' : 'Cannot endorse (voted on or needs clarification)')
                                                  : (myEndorsed ? 'Unendorse this suggestion' : 'Endorse this suggestion')
                                              }
                                            >⭐</Button>
                                          );
                                        })()}
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
