'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import {
  BroadcastPanel,
  BroadcastSubmitButton,
  broadcastFieldClass,
  broadcastFieldStyle,
  broadcastLabelClass,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  broadcastScrollBoxStyle,
} from '@/components/ui/BroadcastPanel';
import SuggestionItemCard from '@/components/suggestions/SuggestionItemCard';
import { SuggestionStatusBadge } from '@/components/suggestions/SuggestionStatusBadge';
import { categoryAccent } from '@/lib/suggestions/category-accents';
import { rulesHtmlSections } from '@/data/rules';

const ENDORSEMENT_THRESHOLD = 3;

type Suggestion = {
  id: string;
  title?: string;
  content: string;
  category?: string;
  createdAt: string; // ISO
  ballotAddedAt?: string; // ISO - when it reached ballot threshold
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

type SortOption = 'newest' | 'oldest' | 'closest_to_ballot';

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

  async function handleEndorse(suggestionId: string, endorse: boolean) {
    if (!auth || !myTeam) return;
    setEndorseBusy(suggestionId);
    try {
      const res = await fetch('/api/me/suggestions/endorse', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ suggestionId, endorse }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== suggestionId) return it;
            const arr = Array.isArray(it.endorsers) ? [...it.endorsers] : [];
            if (endorse) {
              if (!arr.includes(myTeam)) arr.push(myTeam);
            } else {
              const idx2 = arr.indexOf(myTeam);
              if (idx2 >= 0) arr.splice(idx2, 1);
            }
            return { ...it, endorsers: arr };
          })
        );
      }
    } finally {
      setEndorseBusy(null);
    }
  }

  const darkFieldClass = `${broadcastFieldClass} !shadow-none`;
  const darkFieldStyle = broadcastFieldStyle;
  const darkSelectClass = `${darkFieldClass} !bg-[rgba(255,255,255,0.06)] !border-[rgba(255,255,255,0.07)] !text-[#F4F6FB]`;
  const darkTextareaClass = `${darkFieldClass} !bg-[rgba(255,255,255,0.06)] !border-[rgba(255,255,255,0.07)] !text-[#F4F6FB] placeholder:!text-[rgba(233,237,245,0.40)]`;

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="League Suggestions" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <BroadcastPanel title="Submit" accent={categoryAccent('Other')} bodyClassName="!px-4 !py-4 sm:!px-5">
              <form onSubmit={onSubmit} className="space-y-4">
                {drafts.map((d, idx) => {
                  const isRules = (d.category || '').toLowerCase() === 'rules';
                  return (
                    <div
                      key={idx}
                      className="rounded-xl p-3"
                      style={{
                        ...broadcastScrollBoxStyle,
                        borderLeft: `3px solid ${categoryAccent(d.category)}`,
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={broadcastLabelClass} style={broadcastFaintTextStyle}>
                          Suggestion {idx + 1}
                        </span>
                        {drafts.length > 1 && (
                          <Button type="button" variant="ghost" onClick={() => setDrafts((prev) => prev.filter((_, i) => i !== idx))}>Remove</Button>
                        )}
                      </div>
                      <div className="mb-2">
                        <span className={`${broadcastLabelClass} block`} style={broadcastFaintTextStyle}>Category</span>
                        <Select
                          value={d.category}
                          required
                          className={darkSelectClass}
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
                        <label className="flex items-center gap-2 text-sm mb-2" style={broadcastMutedTextStyle}>
                          <input type="checkbox" checked={Boolean(d.endorse)} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, endorse: e.target.checked }) : it))} className="rounded accent-white" />
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
                            <span className={`${broadcastLabelClass} block`} style={broadcastFaintTextStyle}>Title (for ballot)</span>
                            <input
                              className={darkFieldClass}
                              style={darkFieldStyle}
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
                            <span className={`${broadcastLabelClass} block`} style={broadcastFaintTextStyle}>Rule Section</span>
                            <Select
                              value={d.rules?.sectionId || ''}
                              className={darkSelectClass}
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
                            <span className={`${broadcastLabelClass} block`} style={broadcastFaintTextStyle}>Rule Item</span>
                            <Select
                              value={d.rules?.refTitle || ''}
                              className={`${darkSelectClass} font-mono text-sm`}
                              onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({
                                ...it,
                                rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), refTitle: e.target.value }
                              }) : it))}
                              required
                              disabled={!d.rules?.sectionId}
                            >
                              <option value="">{d.rules?.sectionId ? 'Select rule item' : 'Select a section first'}</option>
                              {(d.rules?.sectionId ? itemsBySection[d.rules.sectionId] || [] : []).map((it) => (
                                <option key={it.label} value={it.label}>
                                  {it.code} — {it.title}
                                </option>
                              ))}
                            </Select>
                            {d.rules?.refTitle && (
                              <p className="text-xs mt-1" style={broadcastMutedTextStyle}>
                                Selected: {d.rules.refTitle}
                              </p>
                            )}
                          </div>
                          <div>
                            <span className={`${broadcastLabelClass} block`} style={broadcastFaintTextStyle}>Effective</span>
                            <Select value={d.rules?.effective || ''} className={darkSelectClass} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), effective: e.target.value } }) : it))}>
                              <option value="">Select when it would take effect</option>
                              {EFFECTIVE_OPTS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </Select>
                          </div>
                          <div>
                            <span className={`${broadcastLabelClass} block`} style={broadcastFaintTextStyle}>Proposal</span>
                            <Textarea rows={3} className={darkTextareaClass} value={d.rules?.proposal || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), proposal: e.target.value } }) : it))} required />
                          </div>
                          <div>
                            <span className={`${broadcastLabelClass} block`} style={broadcastFaintTextStyle}>Issue</span>
                            <Textarea rows={3} className={darkTextareaClass} value={d.rules?.issue || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), issue: e.target.value } }) : it))} required />
                          </div>
                          <div>
                            <span className={`${broadcastLabelClass} block`} style={broadcastFaintTextStyle}>How it fixes</span>
                            <Textarea rows={3} className={darkTextareaClass} value={d.rules?.fix || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), fix: e.target.value } }) : it))} required />
                          </div>
                          <div>
                            <span className={`${broadcastLabelClass} block`} style={broadcastFaintTextStyle}>Conclusion</span>
                            <Textarea rows={3} className={darkTextareaClass} value={d.rules?.conclusion || ''} onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, rules: { ...(it.rules || { title: '', proposal: '', issue: '', fix: '', conclusion: '', sectionId: '', refTitle: '', refCode: '', effective: '' }), conclusion: e.target.value } }) : it))} required />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <span className={`${broadcastLabelClass} block`} style={broadcastFaintTextStyle}>Title (required)</span>
                            <input
                              className={darkFieldClass}
                              style={darkFieldStyle}
                              value={d.title || ''}
                              onChange={(e) => setDrafts((prev) => prev.map((it, i) => i === idx ? ({ ...it, title: e.target.value }) : it))}
                              placeholder="e.g., Add Flex Spot to Roster"
                              required
                            />
                          </div>
                          <div>
                            <span className={`${broadcastLabelClass} block`} style={broadcastFaintTextStyle}>Description</span>
                            <Textarea
                              rows={6}
                              className={darkTextareaClass}
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

                <BroadcastSubmitButton accent={categoryAccent('Other')} disabled={submitting}>
                  {submitting ? 'Submitting…' : drafts.length > 1 ? 'Submit Suggestions' : 'Submit Suggestion'}
                </BroadcastSubmitButton>
              </form>
          </BroadcastPanel>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Ballot Queue Section */}
          {(() => {
            // Helper to compute eligible endorsement count (excludes proposer)
            const getEligibleCount = (s: Suggestion) => {
              const endorsers = s.endorsers || [];
              return endorsers.filter((t) => t !== s.proposerTeam).length;
            };

            // Ballot-eligible items: >= 3 eligible endorsements, not finalized (no voteTag or voteTag === 'voted_on')
            const ballotQueue = items.filter((s) => {
              const eligibleCount = getEligibleCount(s);
              const isFinalized = s.voteTag === 'vote_passed' || s.voteTag === 'vote_failed';
              return eligibleCount >= ENDORSEMENT_THRESHOLD && !isFinalized && !s.vague;
            }).sort((a, b) => {
              // Sort by ballotAddedAt (oldest first in queue)
              const aTime = a.ballotAddedAt ? Date.parse(a.ballotAddedAt) : Date.parse(a.createdAt);
              const bTime = b.ballotAddedAt ? Date.parse(b.ballotAddedAt) : Date.parse(b.createdAt);
              return aTime - bTime;
            });

            if (ballotQueue.length === 0) return null;

            return (
              <BroadcastPanel
                title="Ballot Queue"
                accent="#34d399"
                meta={`${ballotQueue.length} eligible`}
                bodyClassName="space-y-3"
              >
                  <p className="text-sm" style={broadcastMutedTextStyle}>
                    These suggestions have reached {ENDORSEMENT_THRESHOLD} endorsements and are eligible for voting.
                  </p>
                  <ol className="space-y-2 list-none">
                    {ballotQueue.map((s, index) => (
                      <li key={s.id} className="flex gap-3">
                        <span className="flex-shrink-0 font-bold w-6 tabular-nums" style={broadcastFaintTextStyle}>{index + 1}.</span>
                        <Link
                          href={`/suggestions/${s.id}`}
                          className="flex-1 block rounded-xl p-3 transition-colors hover:brightness-110"
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.07)`,
                            borderLeft: `3px solid ${categoryAccent(s.category)}`,
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium" style={{ color: '#F4F6FB' }}>{s.title || `Suggestion #${s.id.slice(0, 8)}`}</span>
                            {s.voteTag === 'voted_on' ? <SuggestionStatusBadge variant="voted_on">Voting</SuggestionStatusBadge> : null}
                          </div>
                          {s.content ? (
                            <p className="text-sm mt-1 line-clamp-2" style={broadcastMutedTextStyle}>
                              {s.content.slice(0, 120)}{s.content.length > 120 ? '…' : ''}
                            </p>
                          ) : null}
                          {s.ballotAddedAt ? (
                            <p className="text-xs mt-2" style={broadcastFaintTextStyle}>
                              Added to ballot: {new Date(s.ballotAddedAt).toLocaleString()}
                            </p>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ol>
              </BroadcastPanel>
            );
          })()}

          <div className="space-y-4">
              <div className="flex items-center justify-end gap-2 flex-wrap">
                <span className={broadcastLabelClass} style={broadcastFaintTextStyle}>Sort</span>
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className={`${darkSelectClass} !w-auto text-sm py-1`}
                  fullWidth={false}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="closest_to_ballot">Closest to ballot</option>
                </Select>
              </div>
              {loading ? (
                <p style={broadcastMutedTextStyle}>Loading…</p>
              ) : (() => {
                const activeItems = items.filter((s) => !s.voteTag || s.voteTag === 'voted_on');
                const closedItems = items.filter((s) => s.voteTag === 'vote_passed' || s.voteTag === 'vote_failed');

                if (activeItems.length === 0 && closedItems.length === 0) {
                  return <p style={broadcastMutedTextStyle}>No suggestions yet. Be the first to submit one!</p>;
                }

                const getEligibleCount = (s: Suggestion) =>
                  (s.endorsers || []).filter((t) => t !== s.proposerTeam).length;

                return (
                  <>
                    {activeItems.length > 0 && (
                      <ul className="space-y-4 list-none">
                        {(() => {
                          const groups = new Map<string, Suggestion[]>();
                          for (const s of activeItems) {
                            const key = s.groupId ? `g:${s.groupId}` : `s:${s.id}`;
                            if (!groups.has(key)) groups.set(key, []);
                            groups.get(key)!.push(s);
                          }
                          const ordered = Array.from(groups.values()).map((arr) =>
                            arr.sort((a, b) => (a.groupPos || 0) - (b.groupPos || 0))
                          );
                          if (sortBy === 'newest') {
                            ordered.sort((a, b) => Date.parse(b[0].createdAt) - Date.parse(a[0].createdAt));
                          } else if (sortBy === 'oldest') {
                            ordered.sort((a, b) => Date.parse(a[0].createdAt) - Date.parse(b[0].createdAt));
                          } else if (sortBy === 'closest_to_ballot') {
                            ordered.sort((a, b) => getEligibleCount(b[0]) - getEligibleCount(a[0]));
                          }
                          return ordered.map((arr, gi) => {
                            const first = arr[0];
                            return (
                              <li key={`grp-${gi}`} className="list-none">
                                <BroadcastPanel
                                  accent={categoryAccent(first.category)}
                                  title={first.category || 'Proposal'}
                                  meta={new Date(first.createdAt).toLocaleString()}
                                  bodyClassName="space-y-4 !py-4"
                                >
                                  {arr.map((s, idx) => (
                                    <SuggestionItemCard
                                      key={s.id}
                                      suggestion={s}
                                      index={idx}
                                      auth={auth}
                                      myTeam={myTeam}
                                      isAdmin={isAdmin}
                                      tallies={tallies}
                                      myVotes={myVotes}
                                      adminVotes={adminVotes}
                                      endorseBusy={endorseBusy}
                                      endorsementThreshold={ENDORSEMENT_THRESHOLD}
                                      onVote={vote}
                                      onEndorse={handleEndorse}
                                    />
                                  ))}
                                </BroadcastPanel>
                              </li>
                            );
                          });
                        })()}
                      </ul>
                    )}

                    {closedItems.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm font-medium mb-3" style={broadcastMutedTextStyle}>
                          ▶ Voted / Closed ({closedItems.length})
                        </summary>
                        <ul className="space-y-4 mt-3 list-none">
                          {(() => {
                            const closedGroups = new Map<string, Suggestion[]>();
                            for (const s of closedItems) {
                              const key = s.groupId ? `g:${s.groupId}` : `s:${s.id}`;
                              if (!closedGroups.has(key)) closedGroups.set(key, []);
                              closedGroups.get(key)!.push(s);
                            }
                            const closedOrdered = Array.from(closedGroups.values()).map((arr) =>
                              arr.sort((a, b) => (a.groupPos || 0) - (b.groupPos || 0))
                            );
                            closedOrdered.sort((a, b) => Date.parse(b[0].createdAt) - Date.parse(a[0].createdAt));
                            return closedOrdered.map((arr, gi) => {
                              const first = arr[0];
                              return (
                                <li key={`closed-grp-${gi}`} className="list-none">
                                  <BroadcastPanel
                                    accent={categoryAccent(first.category)}
                                    title={first.category || 'Closed'}
                                    meta={new Date(first.createdAt).toLocaleString()}
                                    bodyClassName="space-y-4 !py-4 opacity-75"
                                  >
                                    {arr.map((s, idx) => (
                                      <SuggestionItemCard
                                        key={s.id}
                                        suggestion={s}
                                        index={idx}
                                        dimmed
                                        auth={auth}
                                        myTeam={myTeam}
                                        isAdmin={isAdmin}
                                        tallies={tallies}
                                        myVotes={myVotes}
                                        adminVotes={adminVotes}
                                        endorseBusy={endorseBusy}
                                        endorsementThreshold={ENDORSEMENT_THRESHOLD}
                                        onVote={vote}
                                        onEndorse={handleEndorse}
                                      />
                                    ))}
                                  </BroadcastPanel>
                                </li>
                              );
                            });
                          })()}
                        </ul>
                      </details>
                    )}
                  </>
                );
              })()}
          </div>
        </div>
      </div>
    </div>
  );
}
