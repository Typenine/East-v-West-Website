'use client';

import { useCallback, useEffect, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Label from '@/components/ui/Label';
import Select from '@/components/ui/Select';
import type { Poll, PollRound, PollOption, PollListItem } from '@/lib/votes/types';

type Suggestion = { id: string; title?: string; content: string; endorsers?: string[]; voteTag?: string };

type RoundDef = {
  voteType: string;
  survivorCount: string;
  thresholdType: string;
  thresholdValue: string;
};

type AdminPollEntry = {
  poll: Poll;
  rounds: Array<PollRound & { options: PollOption[]; voteCount: number; totalEligible: number }>;
  roundCount: number;
};

const VOTE_TYPE_LABELS: Record<string, string> = {
  borda: 'Ranked – Borda Count',
  irv: 'Ranked – IRV',
  select_one: 'Select One',
  select_multi: 'Select Multiple',
  eliminate: 'Vote to Eliminate',
  yes_no: 'Yes / No',
};

const THRESHOLD_LABELS: Record<string, string> = {
  plurality: 'Plurality (most votes wins)',
  majority: 'Majority (7 team / 8 person)',
  supermajority: 'Supermajority (9 team)',
  admin_defined: 'Custom number',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  open: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[status] ?? STATUS_COLORS.draft}`}>
      {status}
    </span>
  );
}

export default function AdminVotesPage() {
  const [polls, setPolls] = useState<AdminPollEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Builder state
  const [showBuilder, setShowBuilder] = useState(false);
  const [step, setStep] = useState(1);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eligibilityType, setEligibilityType] = useState('team');
  const [deadline, setDeadline] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [resultVisibility, setResultVisibility] = useState('admin_publish');
  const [linkedSuggestionIds, setLinkedSuggestionIds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Step 2 fields
  const [rounds, setRounds] = useState<RoundDef[]>([
    { voteType: 'yes_no', survivorCount: '', thresholdType: 'majority', thresholdValue: '' },
  ]);

  // Step 3 fields
  const [options, setOptions] = useState<string[]>(['', '']);

  const fetchPolls = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/votes');
      if (!res.ok) { setError('Admin access required.'); return; }
      setPolls(await res.json());
    } catch {
      setError('Failed to load votes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPolls(); }, [fetchPolls]);

  useEffect(() => {
    if (!showBuilder) return;
    setSuggestionsLoading(true);
    fetch('/api/suggestions')
      .then((r) => r.json())
      .then((data: Suggestion[]) => {
        setSuggestions(data.filter((s) => (s.endorsers?.length ?? 0) >= 3 && s.voteTag !== 'vote_passed' && s.voteTag !== 'vote_failed'));
      })
      .catch(() => {})
      .finally(() => setSuggestionsLoading(false));
  }, [showBuilder]);

  async function doAction(pollId: string, body: object) {
    setActionBusy(pollId);
    try {
      const res = await fetch(`/api/votes/${pollId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Action failed.'); }
      else await fetchPolls();
    } catch { alert('Network error.'); }
    finally { setActionBusy(null); }
  }

  async function handleDelete(pollId: string) {
    setActionBusy(pollId);
    try {
      const res = await fetch(`/api/votes/${pollId}`, { method: 'DELETE' });
      if (!res.ok) alert('Failed to delete poll.');
      else { setDeleteConfirm(null); await fetchPolls(); }
    } catch { alert('Network error.'); }
    finally { setActionBusy(null); }
  }

  function resetBuilder() {
    setStep(1); setTitle(''); setDescription(''); setEligibilityType('team');
    setDeadline(''); setAnonymous(false); setResultVisibility('admin_publish');
    setLinkedSuggestionIds([]); setRounds([{ voteType: 'yes_no', survivorCount: '', thresholdType: 'majority', thresholdValue: '' }]);
    setOptions(['', '']); setBuildError(null); setShowBuilder(false);
  }

  async function handleSubmit() {
    setBuildError(null);
    if (!title.trim()) { setBuildError('Title is required.'); setStep(1); return; }
    const firstRound = rounds[0];
    if (firstRound.voteType !== 'yes_no') {
      const validOpts = options.filter((o) => o.trim());
      if (validOpts.length < 2) { setBuildError('Round 1 requires at least 2 options.'); setStep(3); return; }
    }
    setSubmitting(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || undefined,
        eligibilityType,
        deadline: deadline || undefined,
        anonymous,
        resultVisibility,
        linkedSuggestionIds: linkedSuggestionIds.length ? linkedSuggestionIds : undefined,
        rounds: rounds.map((r, i) => ({
          voteType: r.voteType,
          survivorCount: i < rounds.length - 1 && r.survivorCount ? parseInt(r.survivorCount) : undefined,
          thresholdType: r.thresholdType,
          thresholdValue: r.thresholdType === 'admin_defined' && r.thresholdValue ? parseInt(r.thresholdValue) : undefined,
        })),
        round1Options: firstRound.voteType !== 'yes_no' ? options.filter((o) => o.trim()).map((o) => ({ text: o.trim() })) : undefined,
      };
      const res = await fetch('/api/votes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setBuildError(data.error ?? 'Failed to create poll.'); }
      else { resetBuilder(); await fetchPolls(); }
    } catch { setBuildError('Network error.'); }
    finally { setSubmitting(false); }
  }

  function getCurrentRoundForPoll(entry: AdminPollEntry) {
    return entry.rounds.find((r) => r.status === 'open') ?? entry.rounds.find((r) => r.status === 'closed') ?? entry.rounds[0];
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <SectionHeader
        title="Admin · Votes"
        subtitle="Create and manage league polls"
        actions={
          !showBuilder ? (
            <Button onClick={() => setShowBuilder(true)}>+ New Poll</Button>
          ) : null
        }
      />

      {/* Poll Builder */}
      {showBuilder && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>New Poll — Step {step} of 3</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {buildError && <p className="text-sm text-red-500">{buildError}</p>}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <Label>Title *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., 2026 Draft Location Vote" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional context for voters" rows={3} />
                </div>
                <div>
                  <Label>Eligibility</Label>
                  <div className="flex gap-4 mt-1">
                    {(['team', 'person'] as const).map((t) => (
                      <label key={t} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" checked={eligibilityType === t} onChange={() => setEligibilityType(t)} />
                        <span>{t === 'team' ? 'Teams (12 votes)' : 'People (14 votes)'}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Deadline (optional)</Label>
                  <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                </div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                    <span className="text-sm">Anonymous results (members can't see who voted)</span>
                  </label>
                </div>
                <div>
                  <Label>Result Visibility</Label>
                  <Select value={resultVisibility} onChange={(e) => setResultVisibility(e.target.value)}>
                    <option value="admin_publish">Show only when I publish (default)</option>
                    <option value="all_voted">Show after all eligible voters have voted</option>
                    <option value="immediate">Show immediately as votes come in</option>
                  </Select>
                </div>
                <div>
                  <Label>Link Suggestions (optional)</Label>
                  {suggestionsLoading ? <p className="text-sm text-[var(--muted)]">Loading eligible suggestions…</p> : (
                    suggestions.length === 0
                      ? <p className="text-sm text-[var(--muted)]">No eligible suggestions (need ≥3 endorsements, not yet voted on).</p>
                      : <div className="space-y-1 max-h-40 overflow-y-auto border border-[var(--border)] rounded-lg p-2">
                          {suggestions.map((s) => (
                            <label key={s.id} className="flex items-start gap-2 cursor-pointer text-sm p-1 rounded hover:bg-[var(--surface-strong)]">
                              <input
                                type="checkbox"
                                checked={linkedSuggestionIds.includes(s.id)}
                                onChange={(e) => setLinkedSuggestionIds(e.target.checked ? [...linkedSuggestionIds, s.id] : linkedSuggestionIds.filter((x) => x !== s.id))}
                              />
                              <span>{s.title ?? s.content.slice(0, 80)}</span>
                            </label>
                          ))}
                        </div>
                  )}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--muted)]">Configure each round. Options for rounds 2+ are auto-populated from survivors after each round closes.</p>
                {rounds.map((r, i) => (
                  <div key={i} className="border border-[var(--border)] rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-sm">Round {i + 1}</p>
                      <div className="flex gap-1">
                        {i > 0 && <Button variant="ghost" onClick={() => { const a = [...rounds]; [a[i-1], a[i]] = [a[i], a[i-1]]; setRounds(a); }}>↑</Button>}
                        {i < rounds.length - 1 && <Button variant="ghost" onClick={() => { const a = [...rounds]; [a[i], a[i+1]] = [a[i+1], a[i]]; setRounds(a); }}>↓</Button>}
                        {rounds.length > 1 && <Button variant="ghost" onClick={() => setRounds(rounds.filter((_, j) => j !== i))}>Remove</Button>}
                      </div>
                    </div>
                    <div>
                      <Label>Vote Type</Label>
                      <Select value={r.voteType} onChange={(e) => { const a = [...rounds]; a[i] = { ...a[i], voteType: e.target.value }; setRounds(a); }}>
                        {Object.entries(VOTE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </Select>
                    </div>
                    {i < rounds.length - 1 && (
                      <div>
                        <Label>Options that advance to next round</Label>
                        <Input type="number" min={1} value={r.survivorCount} placeholder="e.g., 3" onChange={(e) => { const a = [...rounds]; a[i] = { ...a[i], survivorCount: e.target.value }; setRounds(a); }} />
                      </div>
                    )}
                    <div>
                      <Label>Threshold</Label>
                      <Select value={r.thresholdType} onChange={(e) => { const a = [...rounds]; a[i] = { ...a[i], thresholdType: e.target.value }; setRounds(a); }}>
                        {Object.entries(THRESHOLD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </Select>
                    </div>
                    {r.thresholdType === 'admin_defined' && (
                      <div>
                        <Label>Required affirmative votes</Label>
                        <Input type="number" min={1} value={r.thresholdValue} onChange={(e) => { const a = [...rounds]; a[i] = { ...a[i], thresholdValue: e.target.value }; setRounds(a); }} />
                      </div>
                    )}
                  </div>
                ))}
                <Button variant="ghost" onClick={() => setRounds([...rounds, { voteType: 'select_one', survivorCount: '', thresholdType: 'plurality', thresholdValue: '' }])}>
                  + Add Round
                </Button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                {rounds[0]?.voteType === 'yes_no' ? (
                  <p className="text-sm text-[var(--muted)]">Yes/No polls auto-create the Yes and No options — no input needed.</p>
                ) : (
                  <>
                    <p className="text-sm text-[var(--muted)]">Enter the options for Round 1. Subsequent rounds will be populated automatically from survivors.</p>
                    {options.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={opt} onChange={(e) => { const a = [...options]; a[i] = e.target.value; setOptions(a); }} placeholder={`Option ${i + 1}`} />
                        {options.length > 2 && <Button variant="ghost" onClick={() => setOptions(options.filter((_, j) => j !== i))}>✕</Button>}
                      </div>
                    ))}
                    <Button variant="ghost" onClick={() => setOptions([...options, ''])}>+ Add Option</Button>
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={resetBuilder}>Cancel</Button>
              {step > 1 && <Button variant="ghost" onClick={() => setStep(step - 1)}>← Back</Button>}
              {step < 3
                ? <Button onClick={() => { setBuildError(null); setStep(step + 1); }}>Next →</Button>
                : <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Creating…' : 'Create Poll'}</Button>
              }
            </div>
          </CardContent>
        </Card>
      )}

      {/* Poll Table */}
      {loading ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : polls.length === 0 ? (
        <p className="text-[var(--muted)]">No polls yet. Create one above.</p>
      ) : (
        <div className="space-y-4">
          {polls.map((entry) => {
            const { poll } = entry;
            const currentRound = getCurrentRoundForPoll(entry);
            const busy = actionBusy === poll.id;
            const openRound = entry.rounds.find((r) => r.status === 'open');
            const closedNonFinalRound = entry.rounds.find((r) => r.status === 'closed' && r.roundNumber < entry.roundCount);
            const closedFinalRound = entry.rounds.find((r) => r.status === 'closed' && r.roundNumber === entry.roundCount);
            const nextPendingRound = entry.rounds.find((r) => r.status === 'pending' && r.roundNumber > 1);

            return (
              <Card key={poll.id}>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{poll.title}</span>
                        <StatusBadge status={poll.status} />
                        <span className="text-xs text-[var(--muted)]">{poll.eligibilityType === 'team' ? '12 teams' : '14 people'}</span>
                        {poll.anonymous && <span className="text-xs text-[var(--muted)]">anonymous</span>}
                      </div>
                      {currentRound && (
                        <p className="text-sm text-[var(--muted)] mt-0.5">
                          Round {currentRound.roundNumber}/{entry.roundCount} — <StatusBadge status={currentRound.status} />
                          {' '}{VOTE_TYPE_LABELS[currentRound.voteType] ?? currentRound.voteType}
                          {' '}· {(currentRound as { voteCount?: number }).voteCount ?? 0}/{(currentRound as { totalEligible?: number }).totalEligible ?? 12} voted
                        </p>
                      )}
                      {poll.deadline && (
                        <p className="text-xs text-[var(--muted)] mt-0.5">Deadline: {new Date(poll.deadline).toLocaleString()}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
                      {/* Draft: open round 1 */}
                      {poll.status === 'draft' && (
                        <Button size="sm" onClick={() => doAction(poll.id, { action: 'open_round', roundNumber: 1 })} disabled={busy}>
                          Open Round 1
                        </Button>
                      )}

                      {/* Open round is open: close it */}
                      {openRound && (
                        <Button size="sm" variant="ghost" onClick={() => doAction(poll.id, { action: 'close_round' })} disabled={busy}>
                          Close Round {openRound.roundNumber}
                        </Button>
                      )}

                      {/* Closed non-final round: advance or publish */}
                      {closedNonFinalRound && !openRound && nextPendingRound && (
                        <>
                          {closedNonFinalRound.resultsPublishedAt == null && (
                            <Button size="sm" variant="ghost" onClick={() => doAction(poll.id, { action: 'publish_results', roundId: closedNonFinalRound.id })} disabled={busy}>
                              Publish Round {closedNonFinalRound.roundNumber}
                            </Button>
                          )}
                          <Button size="sm" onClick={() => doAction(poll.id, { action: 'advance_round' }).then(() => doAction(poll.id, { action: 'open_round', roundNumber: nextPendingRound.roundNumber }))} disabled={busy}>
                            Advance to Round {nextPendingRound.roundNumber}
                          </Button>
                        </>
                      )}

                      {/* Closed final round: publish results */}
                      {closedFinalRound && closedFinalRound.resultsPublishedAt == null && (
                        <Button size="sm" onClick={() => doAction(poll.id, { action: 'publish_results', roundId: closedFinalRound.id })} disabled={busy}>
                          Publish Results
                        </Button>
                      )}

                      {/* Delete */}
                      {deleteConfirm === poll.id ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                          <Button size="sm" onClick={() => handleDelete(poll.id)} disabled={busy}>Confirm Delete</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(poll.id)} disabled={busy}>Delete</Button>
                      )}
                    </div>
                  </div>

                  {/* Round details — who voted */}
                  {entry.rounds.some((r) => r.status !== 'pending') && (
                    <details className="mt-3">
                      <summary className="text-xs text-[var(--muted)] cursor-pointer hover:text-[var(--text)]">View voter details</summary>
                      <div className="mt-2 space-y-2">
                        {entry.rounds.filter((r) => r.status !== 'pending').map((r) => (
                          <div key={r.id} className="text-xs">
                            <span className="font-medium">Round {r.roundNumber} ({VOTE_TYPE_LABELS[r.voteType] ?? r.voteType}):</span>
                            {' '}{(r as { voteCount?: number }).voteCount ?? 0}/{(r as { totalEligible?: number }).totalEligible ?? 12} voted
                            {r.options.length > 0 && (
                              <ul className="ml-4 mt-1 space-y-0.5">
                                {r.options.map((opt) => <li key={opt.id} className="text-[var(--muted)]">• {opt.text}</li>)}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
