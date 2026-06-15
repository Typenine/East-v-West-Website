'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import type {
  PollDetail,
  RoundWithDetails,
  BordaResult,
  IRVResult,
  PluralityResult,
  YesNoResult,
  BallotSelection,
  PollQuestion,
  FormAnswer,
  FormQuestionResult,
  RatingQuestionResult,
  TextQuestionResult,
  ChoiceQuestionResult,
} from '@/lib/votes/types';
import { isConditionMet } from '@/lib/votes/validate-answer';
import {
  ShortAnswerQ,
  ParagraphQ,
  EmailQ,
  NumberQ,
  DateQ,
  TimeQ,
  RatingQ,
  DropdownQ,
  MultipleChoiceQ,
  CheckboxesQ,
  YesNoQ,
  McGridQ,
  CbGridQ,
  FileUploadQ,
  formatAnswerDisplay,
} from '@/components/votes/FormQuestionFields';
import { parseMcGridAnswer, parseCbGridAnswer, serializeGridAnswer } from '@/lib/votes/grid-answers';
import { parseFileAnswer } from '@/lib/votes/file-answer';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  open: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

const VOTE_TYPE_LABELS: Record<string, string> = {
  borda: 'Ranked – Borda Count',
  irv: 'Ranked – Instant Runoff',
  select_one: 'Select One',
  select_multi: 'Select Multiple',
  eliminate: 'Vote to Eliminate',
  yes_no: 'Yes / No',
};

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[status] ?? STATUS_COLORS.draft}`}>
      {status}
    </span>
  );
}

function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-[var(--muted)]">
        <span>{label ?? `${value}/${max} have voted`}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--surface-strong)] overflow-hidden">
        <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Ballot Components ─────────────────────────────────────────────────────────

function RankBallot({ round, displayOptions, onChange }: {
  round: RoundWithDetails;
  displayOptions: typeof round.options;
  onChange: (selections: BallotSelection[]) => void;
}) {
  const [ranks, setRanks] = useState<Record<string, string>>(() =>
    Object.fromEntries(round.options.map((o) => [o.id, ''])),
  );

  function update(optId: string, val: string) {
    const next = { ...ranks, [optId]: val };
    setRanks(next);
    const selections = round.options.map((o) => ({
      optionId: o.id,
      rank: next[o.id] ? parseInt(next[o.id]) : undefined,
      selected: undefined,
    }));
    onChange(selections);
  }

  const usedRanks = new Set(Object.values(ranks).filter(Boolean));
  const hasDuplicates = usedRanks.size < Object.values(ranks).filter(Boolean).length;
  const allRanked = Object.values(ranks).every((v) => v !== '');

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted)]">
        Rank each option 1–{round.options.length} (1 = your top choice). All options must be ranked.
      </p>
      {displayOptions.map((opt) => (
        <div key={opt.id} className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={round.options.length}
            value={ranks[opt.id] ?? ''}
            onChange={(e) => update(opt.id, e.target.value)}
            className="w-16 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-center text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
          />
          <span className="text-sm">{opt.text}</span>
        </div>
      ))}
      {hasDuplicates && <p className="text-xs text-red-500">Each rank must be unique.</p>}
      {!allRanked && <p className="text-xs text-[var(--muted)]">Rank all {round.options.length} options to submit.</p>}
    </div>
  );
}

function RadioBallot({ round, displayOptions, onChange, label }: {
  round: RoundWithDetails;
  displayOptions: typeof round.options;
  onChange: (selections: BallotSelection[]) => void;
  label?: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  function pick(optId: string) {
    setSelected(optId);
    onChange(round.options.map((o) => ({ optionId: o.id, selected: o.id === optId })));
  }

  return (
    <div className="space-y-3">
      {label && <p className="text-sm text-[var(--muted)]">{label}</p>}
      {displayOptions.map((opt) => (
        <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
          <input type="radio" name={`vote-${round.id}`} checked={selected === opt.id} onChange={() => pick(opt.id)} className="accent-[var(--accent)]" />
          <span className="text-sm group-hover:text-[var(--accent)] transition-colors">{opt.text}</span>
        </label>
      ))}
    </div>
  );
}

function CheckboxBallot({ round, displayOptions, onChange }: {
  round: RoundWithDetails;
  displayOptions: typeof round.options;
  onChange: (selections: BallotSelection[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(optId: string) {
    const next = new Set(selected);
    next.has(optId) ? next.delete(optId) : next.add(optId);
    setSelected(next);
    onChange(round.options.map((o) => ({ optionId: o.id, selected: next.has(o.id) })));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted)]">Select all that apply.</p>
      {displayOptions.map((opt) => (
        <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
          <input type="checkbox" checked={selected.has(opt.id)} onChange={() => toggle(opt.id)} className="accent-[var(--accent)]" />
          <span className="text-sm group-hover:text-[var(--accent)] transition-colors">{opt.text}</span>
        </label>
      ))}
    </div>
  );
}

function YesNoBallot({ round, onChange }: {
  round: RoundWithDetails;
  onChange: (selections: BallotSelection[]) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const yesOpt = round.options.find((o) => o.displayOrder === 0) ?? round.options[0];
  const noOpt = round.options.find((o) => o.displayOrder === 1) ?? round.options[1];

  function pick(optId: string) {
    setPicked(optId);
    onChange(round.options.map((o) => ({ optionId: o.id, selected: o.id === optId })));
  }

  return (
    <div className="flex gap-4">
      <button
        onClick={() => yesOpt && pick(yesOpt.id)}
        className={`flex-1 rounded-xl border-2 py-4 text-lg font-bold transition-colors ${picked === yesOpt?.id ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'border-[var(--border)] hover:border-green-400'}`}
      >
        Yes
      </button>
      <button
        onClick={() => noOpt && pick(noOpt.id)}
        className={`flex-1 rounded-xl border-2 py-4 text-lg font-bold transition-colors ${picked === noOpt?.id ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'border-[var(--border)] hover:border-red-400'}`}
      >
        No
      </button>
    </div>
  );
}

// ── Voting Results Components ─────────────────────────────────────────────────

function BordaResultDisplay({ result }: { result: BordaResult }) {
  return (
    <div className="space-y-2">
      {result.scores.map((s, i) => (
        <div key={s.optionId} className={`flex items-center justify-between rounded-lg px-3 py-2 ${s.isSurvivor ? 'bg-green-50 dark:bg-green-900/20 ring-1 ring-green-500/30' : 'bg-[var(--surface-strong)]'}`}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--muted)] w-5">#{i + 1}</span>
            <span className="text-sm">{s.text}</span>
            {s.isSurvivor && <span className="text-xs font-semibold text-green-600 dark:text-green-400">Advances</span>}
          </div>
          <span className="text-sm font-semibold">{s.points} pts</span>
        </div>
      ))}
    </div>
  );
}

function IRVResultDisplay({ result }: { result: IRVResult }) {
  return (
    <div className="space-y-3">
      {result.rounds.map((r, i) => (
        <details key={i} open={i === result.rounds.length - 1}>
          <summary className="cursor-pointer text-sm font-medium">
            Elimination Round {i + 1}
            {r.eliminated.length > 0 && <span className="ml-2 text-xs text-red-500">— eliminated</span>}
          </summary>
          <div className="mt-2 space-y-1 pl-2">
            {Object.entries(r.firstChoiceCounts).sort((a, b) => b[1] - a[1]).map(([optId, count]) => (
              <div key={optId} className={`flex justify-between text-sm px-2 py-1 rounded ${r.eliminated.includes(optId) ? 'text-red-500 line-through opacity-60' : ''}`}>
                <span>{optId}</span>
                <span>{count} first-choice votes</span>
              </div>
            ))}
          </div>
        </details>
      ))}
      {result.winners.length > 0 && (
        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm font-semibold text-green-700 dark:text-green-400">
          Winner: {result.winners.join(', ')}
        </div>
      )}
    </div>
  );
}

function PluralityResultDisplay({ result, round }: { result: PluralityResult; round: RoundWithDetails }) {
  const max = Math.max(...result.counts.map((c) => c.count), 1);
  return (
    <div className="space-y-2">
      {result.counts.map((c) => (
        <div key={c.optionId} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className={c.isWinner ? 'font-semibold' : ''}>{c.text}</span>
            <span className="text-[var(--muted)]">{c.count} vote{c.count !== 1 ? 's' : ''}</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-strong)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${c.isWinner ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]/40'}`}
              style={{ width: `${Math.round((c.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function YesNoResultDisplay({ result }: { result: YesNoResult }) {
  const total = result.yes + result.no;
  const yesPct = total > 0 ? Math.round((result.yes / total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-center">
        <div className={`flex-1 rounded-xl border-2 py-4 ${result.passed ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-[var(--border)]'}`}>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{result.yes}</p>
          <p className="text-sm text-[var(--muted)]">Yes</p>
        </div>
        <div className={`flex-1 rounded-xl border-2 py-4 ${!result.passed ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-[var(--border)]'}`}>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{result.no}</p>
          <p className="text-sm text-[var(--muted)]">No</p>
        </div>
      </div>
      <p className="text-sm text-center text-[var(--muted)]">
        {yesPct}% in favour · Required: {result.threshold} affirmative votes ·{' '}
        <span className={`font-semibold ${result.passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
          {result.passed ? 'Passed' : 'Failed'}
        </span>
      </p>
    </div>
  );
}

function RoundResultDisplay({ result, round }: { result: BordaResult | IRVResult | PluralityResult | YesNoResult; round: RoundWithDetails }) {
  if (result.type === 'borda') return <BordaResultDisplay result={result} />;
  if (result.type === 'irv') return <IRVResultDisplay result={result} />;
  if (result.type === 'yes_no') return <YesNoResultDisplay result={result} />;
  return <PluralityResultDisplay result={result} round={round} />;
}

// ── Form Results Components ───────────────────────────────────────────────────

function RatingResultDisplay({ result }: { result: RatingQuestionResult }) {
  const max = Math.max(...result.distribution.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Average: {result.average} / {result.distribution[result.distribution.length - 1]?.value ?? 10}</p>
      <div className="space-y-1">
        {result.distribution.map((d) => (
          <div key={d.value} className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted)] w-4 text-right">{d.value}</span>
            <div className="flex-1 h-2 rounded-full bg-[var(--surface-strong)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.round((d.count / max) * 100)}%` }} />
            </div>
            <span className="text-xs text-[var(--muted)] w-4">{d.count}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-[var(--muted)]">{result.total} response{result.total !== 1 ? 's' : ''}</p>
    </div>
  );
}

function TextResultDisplay({ result }: { result: TextQuestionResult }) {
  if (!result.answers.length) return <p className="text-sm text-[var(--muted)]">No responses yet.</p>;
  return (
    <div className="space-y-2">
      {result.answers.map((a, i) => (
        <div key={i} className="rounded-lg bg-[var(--surface-strong)] px-3 py-2">
          {a.voterDisplay && <p className="text-xs text-[var(--muted)] mb-1">{a.voterDisplay}</p>}
          <p className="text-sm">{a.text}</p>
        </div>
      ))}
    </div>
  );
}

function ChoiceResultDisplay({ result }: { result: ChoiceQuestionResult }) {
  const max = Math.max(...result.counts.map((c) => c.count), 1);
  return (
    <div className="space-y-2">
      {result.counts.map((c) => (
        <div key={c.optionId} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{c.text}</span>
            <span className="text-[var(--muted)]">{c.count}</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-strong)] overflow-hidden">
            <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.round((c.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
      <p className="text-xs text-[var(--muted)]">{result.total} response{result.total !== 1 ? 's' : ''}</p>
    </div>
  );
}

function FormResultDisplay({ result }: { result: FormQuestionResult }) {
  if (result.type === 'rating') return <RatingResultDisplay result={result} />;
  if (result.type === 'text') return <TextResultDisplay result={result} />;
  if (result.type === 'grid') {
    return (
      <div className="space-y-2 text-sm">
        {result.rows.map((row) => (
          <div key={row.rowId}>
            <p className="font-medium text-xs">{row.text}</p>
            {row.columnCounts.map((c) => (
              <div key={c.optionId} className="flex justify-between text-xs text-[var(--muted)]">
                <span>{c.text}</span><span>{c.count}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (result.type === 'file') {
    return (
      <ul className="text-sm space-y-1">
        {result.files.map((f, i) => (
          <li key={i}>{f.voterDisplay ? `${f.voterDisplay}: ` : ''}{f.filename}</li>
        ))}
      </ul>
    );
  }
  return <ChoiceResultDisplay result={result} />;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VoteDetailPage() {
  const params = useParams();
  const id = String(params.id);

  const [detail, setDetail] = useState<PollDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Ballot state
  const [ballot, setBallot] = useState<BallotSelection[]>([]);
  const [castBusy, setCastBusy] = useState(false);
  const [castError, setCastError] = useState<string | null>(null);
  const [castSuccess, setCastSuccess] = useState(false);

  // Form state
  const [formAnswers, setFormAnswers] = useState<Record<string, FormAnswer>>({});
  const [hasSubmittedForm, setHasSubmittedForm] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);

  // Shuffled options (stable per mount)
  const [shuffledRoundOpts, setShuffledRoundOpts] = useState<Map<string, typeof detail extends null ? never[] : PollDetail['rounds'][0]['options']>>(new Map());
  const [shuffledQuestionOpts, setShuffledQuestionOpts] = useState<Map<string, PollQuestion['options']>>(new Map());

  const fetchDetail = useCallback(async () => {
    try {
      const [detailRes, meRes] = await Promise.all([fetch(`/api/votes/${id}`), fetch('/api/auth/me')]);
      if (detailRes.ok) {
        const data: PollDetail = await detailRes.json();
        setDetail(data);
        // Pre-fill form answers from existing response
        if (data.myFormResponse?.length) {
          const map: Record<string, FormAnswer> = {};
          for (const a of data.myFormResponse) {
            map[a.questionId] = a;
          }
          setFormAnswers(map);
          setHasSubmittedForm(true);
        }
      }
      if (meRes.ok) { const me = await meRes.json(); setIsLoggedIn(Boolean(me.authenticated)); }
    } catch {}
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // Build stable shuffled option orders on detail load
  useEffect(() => {
    if (!detail) return;
    const roundMap = new Map<string, typeof detail.rounds[0]['options']>();
    for (const r of detail.rounds) {
      roundMap.set(r.id, r.shuffleOptions ? shuffled(r.options) : r.options);
    }
    setShuffledRoundOpts(roundMap as Map<string, never[]>);

    const qMap = new Map<string, PollQuestion['options']>();
    for (const q of detail.questions) {
      qMap.set(q.id, q.shuffleOptions ? shuffled(q.options) : q.options);
    }
    setShuffledQuestionOpts(qMap);
  }, [detail?.poll.id]); // only re-run when poll changes, not on every re-render

  function updateFormAnswer(questionId: string, patch: Partial<FormAnswer>) {
    setFormAnswers((prev) => {
      const existing = prev[questionId] ?? { questionId, textAnswer: null, ratingValue: null, optionIds: null };
      return { ...prev, [questionId]: { ...existing, ...patch } };
    });
  }

  async function handleCast() {
    setCastError(null);
    if (!ballot.length) { setCastError('Please make your selections before submitting.'); return; }
    setCastBusy(true);
    try {
      const res = await fetch(`/api/votes/${id}/cast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: ballot }),
      });
      const data = await res.json();
      if (!res.ok) { setCastError(data.error ?? 'Failed to submit vote.'); return; }
      setCastSuccess(true);
    } catch { setCastError('Network error.'); }
    finally { setCastBusy(false); }
  }

  async function handleFormSubmit() {
    if (!detail) return;
    setFormError(null);
    setFormBusy(true);
    try {
      const answers = Object.values(formAnswers);
      const res = await fetch(`/api/votes/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? 'Failed to submit response.'); return; }
      setHasSubmittedForm(true);
      if (data.confirmationMessage) setConfirmationMessage(data.confirmationMessage);
    } catch { setFormError('Network error.'); }
    finally { setFormBusy(false); }
  }

  async function handleSubmitAll() {
    setCastError(null);
    setFormError(null);
    const hasBallot = detail?.currentRound?.status === 'open' && ballot.length > 0;
    const hasForm = detail?.questions && detail.questions.length > 0;

    if (hasBallot && hasForm) {
      setCastBusy(true);
      setFormBusy(true);
      try {
        const [castRes, formRes] = await Promise.all([
          fetch(`/api/votes/${id}/cast`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selections: ballot }) }),
          fetch(`/api/votes/${id}/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: Object.values(formAnswers) }) }),
        ]);
        const [castData, formData] = await Promise.all([castRes.json(), formRes.json()]);
        if (!castRes.ok) { setCastError(castData.error ?? 'Failed to submit vote.'); }
        if (!formRes.ok) { setFormError(formData.error ?? 'Failed to submit form.'); }
        if (castRes.ok) setCastSuccess(true);
        if (formRes.ok) {
          setHasSubmittedForm(true);
          if (formData.confirmationMessage) setConfirmationMessage(formData.confirmationMessage);
        }
        if (castRes.ok && formRes.ok) await fetchDetail();
      } catch { setCastError('Network error.'); setFormError('Network error.'); }
      finally { setCastBusy(false); setFormBusy(false); }
    } else if (hasBallot) {
      await handleCast();
      await fetchDetail();
    } else if (hasForm) {
      await handleFormSubmit();
      await fetchDetail();
    }
  }

  if (loading) return <div className="container mx-auto px-4 py-8"><p className="text-[var(--muted)]">Loading…</p></div>;
  if (!detail) return <div className="container mx-auto px-4 py-8"><p className="text-red-500">Vote not found.</p></div>;

  const { poll, currentRound, roundCount, rounds, myBallot, questions, formResults, responseCount } = detail;
  const alreadyVoted = Boolean(myBallot?.length) || castSuccess;

  const hasOpenBallot = currentRound?.status === 'open' && isLoggedIn && !alreadyVoted;
  const hasOpenForm = questions.length > 0 && poll.status === 'open' && isLoggedIn && !hasSubmittedForm;
  const showSubmitAll = (hasOpenBallot || hasOpenForm) && (questions.length > 0 || currentRound?.status === 'open');
  const showFormResults = formResults && formResults.length > 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <Link href="/votes" className="text-sm text-[var(--muted)] hover:text-[var(--accent)] transition-colors">← Back to Votes</Link>
      </div>

      <SectionHeader
        title={poll.title}
        subtitle={poll.description ?? undefined}
      />

      {/* Poll meta */}
      <div className="flex flex-wrap gap-2 items-center mb-6">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[poll.status] ?? STATUS_COLORS.draft}`}>{poll.status}</span>
        <span className="text-xs text-[var(--muted)]">{poll.eligibilityType === 'team' ? '12 teams' : '14 members'}</span>
        {roundCount > 1 && <span className="text-xs text-[var(--muted)]">{roundCount} rounds</span>}
        {poll.deadline && <span className="text-xs text-[var(--muted)]">Deadline: {new Date(poll.deadline).toLocaleDateString()}</span>}
        {questions.length > 0 && (
          <span className="text-xs text-[var(--muted)]">{responseCount} response{responseCount !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Confirmation message after successful combined submission */}
      {(castSuccess || hasSubmittedForm) && confirmationMessage && (
        <div className="mb-6 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          {confirmationMessage}
        </div>
      )}

      {/* Active round */}
      {currentRound && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">
              Round {currentRound.roundNumber} of {roundCount} — {VOTE_TYPE_LABELS[currentRound.voteType] ?? currentRound.voteType}
              {' '}<StatusBadge status={currentRound.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBar value={currentRound.voteCount} max={currentRound.totalEligible} />

            {currentRound.status === 'open' && (
              <div>
                {!isLoggedIn ? (
                  <div className="rounded-lg bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted)]">
                    <Link href="/login" className="text-[var(--accent)] underline">Log in</Link> to cast your vote.
                  </div>
                ) : alreadyVoted ? (
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-700 dark:text-green-400 font-medium">
                    Your vote has been recorded. ✓
                    {myBallot && <p className="mt-1 text-xs font-normal text-green-600/80 dark:text-green-400/70">You can change your vote before the round closes by re-submitting.</p>}
                  </div>
                ) : null}

                {isLoggedIn && (
                  <div className={`mt-4 space-y-4 ${alreadyVoted ? 'opacity-70' : ''}`}>
                    {(currentRound.voteType === 'borda' || currentRound.voteType === 'irv') && (
                      <RankBallot round={currentRound} displayOptions={shuffledRoundOpts.get(currentRound.id) ?? currentRound.options} onChange={setBallot} />
                    )}
                    {currentRound.voteType === 'select_one' && (
                      <RadioBallot round={currentRound} displayOptions={shuffledRoundOpts.get(currentRound.id) ?? currentRound.options} onChange={setBallot} label="Select one option." />
                    )}
                    {currentRound.voteType === 'eliminate' && (
                      <RadioBallot round={currentRound} displayOptions={shuffledRoundOpts.get(currentRound.id) ?? currentRound.options} onChange={setBallot} label="Select the option you want eliminated." />
                    )}
                    {currentRound.voteType === 'select_multi' && (
                      <CheckboxBallot round={currentRound} displayOptions={shuffledRoundOpts.get(currentRound.id) ?? currentRound.options} onChange={setBallot} />
                    )}
                    {currentRound.voteType === 'yes_no' && (
                      <YesNoBallot round={currentRound} onChange={setBallot} />
                    )}

                    {castError && !showSubmitAll && <p className="text-sm text-red-500">{castError}</p>}

                    {/* Submit button only shown here if no form questions */}
                    {questions.length === 0 && (
                      <Button onClick={handleCast} disabled={castBusy || !ballot.length}>
                        {castBusy ? 'Submitting…' : alreadyVoted ? 'Update My Vote' : 'Submit Vote'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {currentRound.resultsVisible && currentRound.result && (
              <div className="border-t border-[var(--border)] pt-4">
                <p className="text-sm font-semibold mb-3">Results</p>
                <RoundResultDisplay result={currentRound.result} round={currentRound} />
              </div>
            )}

            {currentRound.status === 'closed' && !currentRound.resultsVisible && (
              <p className="text-sm text-[var(--muted)]">Results will be published by the commissioner.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Questions */}
      {questions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isLoggedIn && poll.status === 'open' && (
              <div className="rounded-lg bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted)]">
                <Link href="/login" className="text-[var(--accent)] underline">Log in</Link> to answer the questions.
              </div>
            )}

            {isLoggedIn && hasSubmittedForm && !formBusy && (
              <div className="flex items-center justify-between rounded-lg bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-700 dark:text-green-400 font-medium">
                <span>Response submitted ✓</span>
                {poll.status === 'open' && (
                  <button
                    onClick={() => setHasSubmittedForm(false)}
                    className="text-xs underline ml-2"
                  >
                    Edit response
                  </button>
                )}
              </div>
            )}

            {questions.map((q) => {
              if (!isConditionMet(q, formAnswers)) return null;
              const displayOpts = shuffledQuestionOpts.get(q.id) ?? q.options;
              const answer = formAnswers[q.id];
              const disabled = hasSubmittedForm || !isLoggedIn || poll.status !== 'open';

              if (q.questionType === 'section_break') {
                return (
                  <div key={q.id} className="border-t border-[var(--border)] pt-4">
                    <p className="font-semibold text-sm">{q.text}</p>
                    {q.description && <p className="text-xs text-[var(--muted)] mt-0.5">{q.description}</p>}
                  </div>
                );
              }

              return (
                <div key={q.id} className="space-y-2">
                  <div>
                    <p className="text-sm font-medium">
                      {q.text}
                      {q.required && <span className="text-red-500 ml-0.5">*</span>}
                    </p>
                    {q.description && <p className="text-xs text-[var(--muted)] mt-0.5">{q.description}</p>}
                  </div>

                  {/* Show results for this question if available */}
                  {showFormResults && (poll.status === 'closed' || !isLoggedIn) && (() => {
                    const r = formResults.find((fr) => fr.questionId === q.id);
                    return r ? (
                      <div className="rounded-lg bg-[var(--surface-strong)] p-3">
                        <FormResultDisplay result={r} />
                      </div>
                    ) : null;
                  })()}

                  {/* Input (shown when poll open and logged in) */}
                  {!disabled && (
                    <>
                      {q.questionType === 'short_answer' && (
                        <ShortAnswerQ q={q} value={answer?.textAnswer ?? ''} onChange={(v) => updateFormAnswer(q.id, { textAnswer: v })} disabled={disabled} />
                      )}
                      {q.questionType === 'paragraph' && (
                        <ParagraphQ q={q} value={answer?.textAnswer ?? ''} onChange={(v) => updateFormAnswer(q.id, { textAnswer: v })} disabled={disabled} />
                      )}
                      {q.questionType === 'email' && (
                        <EmailQ value={answer?.textAnswer ?? ''} onChange={(v) => updateFormAnswer(q.id, { textAnswer: v })} disabled={disabled} />
                      )}
                      {q.questionType === 'number' && (
                        <NumberQ q={q} value={answer?.textAnswer ?? ''} onChange={(v) => updateFormAnswer(q.id, { textAnswer: v })} disabled={disabled} />
                      )}
                      {q.questionType === 'date' && (
                        <DateQ value={answer?.textAnswer ?? ''} onChange={(v) => updateFormAnswer(q.id, { textAnswer: v })} disabled={disabled} />
                      )}
                      {q.questionType === 'time' && (
                        <TimeQ value={answer?.textAnswer ?? ''} onChange={(v) => updateFormAnswer(q.id, { textAnswer: v })} disabled={disabled} />
                      )}
                      {q.questionType === 'rating' && (
                        <RatingQ q={q} value={answer?.ratingValue ?? null} onChange={(v) => updateFormAnswer(q.id, { ratingValue: v })} disabled={disabled} />
                      )}
                      {q.questionType === 'yes_no' && (
                        <YesNoQ
                          displayOptions={displayOpts}
                          value={answer?.optionIds?.[0] ?? null}
                          onChange={(optId) => updateFormAnswer(q.id, { optionIds: [optId] })}
                          disabled={disabled}
                        />
                      )}
                      {q.questionType === 'dropdown' && (
                        <DropdownQ
                          q={q}
                          displayOptions={displayOpts}
                          value={answer?.optionIds?.[0] ?? null}
                          otherText={answer?.textAnswer ?? ''}
                          onChange={(optId) => updateFormAnswer(q.id, { optionIds: [optId] })}
                          onOtherTextChange={(v) => updateFormAnswer(q.id, { textAnswer: v })}
                          disabled={disabled}
                        />
                      )}
                      {q.questionType === 'multiple_choice' && (
                        <MultipleChoiceQ
                          q={q}
                          displayOptions={displayOpts}
                          value={answer?.optionIds?.[0] ?? null}
                          otherText={answer?.textAnswer ?? ''}
                          onChange={(optId) => updateFormAnswer(q.id, { optionIds: [optId] })}
                          onOtherTextChange={(v) => updateFormAnswer(q.id, { textAnswer: v })}
                          disabled={disabled}
                        />
                      )}
                      {q.questionType === 'checkboxes' && (
                        <CheckboxesQ
                          q={q}
                          displayOptions={displayOpts}
                          value={answer?.optionIds ?? []}
                          otherText={answer?.textAnswer ?? ''}
                          onChange={(ids) => updateFormAnswer(q.id, { optionIds: ids })}
                          onOtherTextChange={(v) => updateFormAnswer(q.id, { textAnswer: v })}
                          disabled={disabled}
                        />
                      )}
                      {q.questionType === 'multiple_choice_grid' && (
                        <McGridQ
                          q={q}
                          columns={displayOpts}
                          value={parseMcGridAnswer(answer?.textAnswer)}
                          onChange={(grid) => updateFormAnswer(q.id, { textAnswer: serializeGridAnswer(grid) })}
                          disabled={disabled}
                        />
                      )}
                      {q.questionType === 'checkbox_grid' && (
                        <CbGridQ
                          q={q}
                          columns={displayOpts}
                          value={parseCbGridAnswer(answer?.textAnswer)}
                          onChange={(grid) => updateFormAnswer(q.id, { textAnswer: serializeGridAnswer(grid) })}
                          disabled={disabled}
                        />
                      )}
                      {q.questionType === 'file_upload' && (
                        <FileUploadQ
                          q={q}
                          pollId={id}
                          value={parseFileAnswer(answer?.textAnswer)}
                          onChange={(json) => updateFormAnswer(q.id, { textAnswer: json })}
                          disabled={disabled}
                        />
                      )}
                    </>
                  )}

                  {disabled && hasSubmittedForm && answer && (
                    <div className="rounded-lg bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--muted)]">
                      {formatAnswerDisplay(q, answer)}
                    </div>
                  )}
                </div>
              );
            })}

            {formError && <p className="text-sm text-red-500">{formError}</p>}

            {/* Form-only submit (no voting round) */}
            {isLoggedIn && !hasSubmittedForm && poll.status === 'open' && questions.length > 0 && (!currentRound || currentRound.status !== 'open') && (
              <Button onClick={handleFormSubmit} disabled={formBusy}>
                {formBusy ? 'Submitting…' : 'Submit responses'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Combined submit button when both ballot and form questions are present */}
      {showSubmitAll && currentRound?.status === 'open' && questions.length > 0 && !alreadyVoted && !hasSubmittedForm && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            {castError && <p className="text-sm text-red-500 mb-2">{castError}</p>}
            {formError && <p className="text-sm text-red-500 mb-2">{formError}</p>}
            <Button onClick={handleSubmitAll} disabled={castBusy || formBusy || !ballot.length} className="w-full">
              {castBusy || formBusy ? 'Submitting…' : 'Submit Vote & Survey'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Previous rounds */}
      {rounds.filter((r) => r.status === 'closed' && r.roundNumber !== currentRound?.roundNumber).length > 0 && (
        <div className="space-y-3 mb-6">
          <p className="text-sm font-semibold text-[var(--muted)]">Previous Rounds</p>
          {rounds
            .filter((r) => r.status === 'closed' && r.roundNumber !== currentRound?.roundNumber)
            .map((round) => (
              <details key={round.id} className="border border-[var(--border)] rounded-xl overflow-hidden">
                <summary className="px-4 py-3 cursor-pointer text-sm font-medium flex items-center justify-between">
                  <span>Round {round.roundNumber} — {VOTE_TYPE_LABELS[round.voteType] ?? round.voteType}</span>
                  <StatusBadge status={round.status} />
                </summary>
                <div className="px-4 pb-4 space-y-3">
                  <ProgressBar value={round.voteCount} max={round.totalEligible} />
                  {round.resultsVisible && round.result ? (
                    <RoundResultDisplay result={round.result} round={round} />
                  ) : (
                    <p className="text-sm text-[var(--muted)]">Results not yet published.</p>
                  )}
                </div>
              </details>
            ))}
        </div>
      )}

      {/* Pending future rounds */}
      {rounds.filter((r) => r.status === 'pending').length > 0 && (
        <p className="text-xs text-[var(--muted)] mt-2">
          {rounds.filter((r) => r.status === 'pending').length} more round{rounds.filter((r) => r.status === 'pending').length !== 1 ? 's' : ''} will open after current round closes.
        </p>
      )}

      {/* Closed poll — full form results */}
      {poll.status === 'closed' && showFormResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Survey Results ({responseCount} response{responseCount !== 1 ? 's' : ''})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {questions.filter((q) => q.questionType !== 'section_break').map((q) => {
              const r = formResults.find((fr) => fr.questionId === q.id);
              return (
                <div key={q.id} className="space-y-2">
                  <p className="text-sm font-medium">{q.text}</p>
                  {r ? <FormResultDisplay result={r} /> : <p className="text-sm text-[var(--muted)]">No responses.</p>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
