'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Label from '@/components/ui/Label';
import Select from '@/components/ui/Select';
import type { Poll, PollRound, PollOption } from '@/lib/votes/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Suggestion = { id: string; title?: string; content: string; endorsers?: string[]; voteTag?: string };

type RoundDef = {
  voteType: string;
  survivorCount: string;
  thresholdType: string;
  thresholdValue: string;
  shuffleOptions: boolean;
};

type QuestionOptionDef = { text: string };

type QuestionDef = {
  questionType: string;
  text: string;
  description: string;
  required: boolean;
  shuffleOptions: boolean;
  ratingMin: string;
  ratingMax: string;
  ratingMinLabel: string;
  ratingMaxLabel: string;
  maxLength: string;
  conditionQuestionIndex: string;
  conditionOptionIndex: string;
  conditionValue: string;
  options: QuestionOptionDef[];
};

type AdminPollEntry = {
  poll: Poll;
  rounds: Array<PollRound & { options: PollOption[]; voteCount: number; totalEligible: number }>;
  roundCount: number;
  responseCount: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

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

const QUESTION_TYPES = [
  { value: 'short_answer', label: 'Short Answer', icon: '—' },
  { value: 'paragraph',    label: 'Paragraph',    icon: '¶' },
  { value: 'rating',       label: 'Rating',       icon: '★' },
  { value: 'multiple_choice', label: 'Multiple Choice', icon: '◎' },
  { value: 'checkboxes',   label: 'Checkboxes',   icon: '☑' },
  { value: 'section_break', label: 'Section Break', icon: '÷' },
];

const STEP_LABELS = ['Basics', 'Rounds', 'Options', 'Survey'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function newQuestion(): QuestionDef {
  return {
    questionType: 'short_answer', text: '', description: '', required: true, shuffleOptions: false,
    ratingMin: '1', ratingMax: '10', ratingMinLabel: '', ratingMaxLabel: '',
    maxLength: '', conditionQuestionIndex: '', conditionOptionIndex: '', conditionValue: '',
    options: [{ text: '' }, { text: '' }],
  };
}

// ── Small UI components ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; dot: string }> = {
    draft:   { bg: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/25',   dot: 'bg-zinc-400' },
    open:    { bg: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25', dot: 'bg-emerald-400' },
    closed:  { bg: 'bg-slate-500/15 text-slate-400 border border-slate-500/25', dot: 'bg-slate-400' },
    pending: { bg: 'bg-amber-500/15 text-amber-400 border border-amber-500/25', dot: 'bg-amber-400' },
  };
  const { bg, dot } = cfg[status] ?? cfg.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot} ${status === 'open' ? 'animate-pulse' : ''}`} />
      {status}
    </span>
  );
}

function StepIndicator({ current, total, labels }: { current: number; total: number; labels: string[] }) {
  return (
    <div className="flex items-start justify-center gap-0 mb-8">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-start">
            <div className="flex flex-col items-center gap-2">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-200
                ${done   ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : active ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--surface)] ring-4 ring-[var(--accent)]/15'
                :          'border-[var(--border)] text-[var(--muted)] bg-[var(--surface)]'}`}
              >
                {done ? '✓' : n}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap
                ${active ? 'text-[var(--accent)]' : done ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>
                {labels[i]}
              </span>
            </div>
            {i < total - 1 && (
              <div className={`h-px w-10 sm:w-16 mt-[18px] mx-2 transition-colors duration-300
                ${done ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AlertBanner({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-500/25 px-4 py-3 text-sm text-red-400">
      <span className="mt-0.5 shrink-0 text-base">⚠</span>
      <span className="flex-1 leading-snug">{msg}</span>
      <button onClick={onDismiss} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity text-xs mt-0.5">✕</button>
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{value} of {max} voted</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-strong)] overflow-hidden">
        <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Question card for the builder ─────────────────────────────────────────────

function QuestionCard({ q, qi, total, questionDefs, onUpdate, onUpdateOption, onMove, onRemove }: {
  q: QuestionDef; qi: number; total: number; questionDefs: QuestionDef[];
  onUpdate: (patch: Partial<QuestionDef>) => void;
  onUpdateOption: (oi: number, text: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const typeInfo = QUESTION_TYPES.find((t) => t.value === q.questionType);
  const isChoice  = q.questionType === 'multiple_choice' || q.questionType === 'checkboxes';
  const isText    = q.questionType === 'short_answer' || q.questionType === 'paragraph';
  const isSection = q.questionType === 'section_break';

  return (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden shadow-sm">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--surface-strong)] border-b border-[var(--border)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm">{typeInfo?.icon}</span>
          <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">{typeInfo?.label}</span>
          {!isSection && (
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${q.required ? 'bg-blue-500/15 text-blue-400' : 'bg-zinc-500/15 text-zinc-400'}`}>
              {q.required ? 'required' : 'optional'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button disabled={qi === 0} onClick={() => onMove(-1)} title="Move up"
            className="rounded px-1.5 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--surface)] disabled:opacity-30 disabled:cursor-default">↑</button>
          <button disabled={qi === total - 1} onClick={() => onMove(1)} title="Move down"
            className="rounded px-1.5 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--surface)] disabled:opacity-30 disabled:cursor-default">↓</button>
          <button onClick={onRemove}
            className="rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors">Remove</button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Type selector */}
        <div className="flex flex-wrap gap-1.5">
          {QUESTION_TYPES.map((t) => (
            <button key={t.value} onClick={() => onUpdate({ questionType: t.value })}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors
                ${q.questionType === t.value
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text)]'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div>
          <Label>{isSection ? 'Section Title' : 'Question'} {!isSection && <span className="text-red-400">*</span>}</Label>
          <Input value={q.text} onChange={(e) => onUpdate({ text: e.target.value })}
            placeholder={isSection ? 'e.g., General Feedback' : 'e.g., How would you rate last season?'} />
        </div>

        {q.description !== undefined && (
          <div>
            <Label>Help text <span className="text-[var(--muted)] font-normal">(optional)</span></Label>
            <Input value={q.description} onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Shown below the question" />
          </div>
        )}

        {q.questionType === 'rating' && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Min</Label><Input type="number" value={q.ratingMin} onChange={(e) => onUpdate({ ratingMin: e.target.value })} /></div>
            <div><Label>Max</Label><Input type="number" value={q.ratingMax} onChange={(e) => onUpdate({ ratingMax: e.target.value })} /></div>
            <div><Label>Min label</Label><Input value={q.ratingMinLabel} onChange={(e) => onUpdate({ ratingMinLabel: e.target.value })} placeholder="e.g., Poor" /></div>
            <div><Label>Max label</Label><Input value={q.ratingMaxLabel} onChange={(e) => onUpdate({ ratingMaxLabel: e.target.value })} placeholder="e.g., Excellent" /></div>
          </div>
        )}

        {isText && (
          <div>
            <Label>Max characters <span className="text-[var(--muted)] font-normal">(optional)</span></Label>
            <Input type="number" min={1} value={q.maxLength} onChange={(e) => onUpdate({ maxLength: e.target.value })} placeholder="No limit" />
          </div>
        )}

        {isChoice && (
          <div className="space-y-2">
            <Label>Options</Label>
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex gap-2 items-center">
                <span className="text-xs text-[var(--muted)] w-5 text-right shrink-0">{oi + 1}.</span>
                <Input value={opt.text} onChange={(e) => onUpdateOption(oi, e.target.value)} placeholder={`Option ${oi + 1}`} />
                {q.options.length > 2 && (
                  <button onClick={() => onUpdate({ options: q.options.filter((_, k) => k !== oi) })}
                    className="text-[var(--muted)] hover:text-red-400 text-sm px-1 shrink-0 transition-colors">✕</button>
                )}
              </div>
            ))}
            <button onClick={() => onUpdate({ options: [...q.options, { text: '' }] })}
              className="text-xs text-[var(--accent)] hover:underline ml-7">+ Add option</button>
          </div>
        )}

        {!isSection && (
          <div className="flex flex-wrap gap-4 pt-1 border-t border-[var(--border)]">
            <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
              <input type="checkbox" checked={q.required} onChange={(e) => onUpdate({ required: e.target.checked })} className="accent-[var(--accent)]" />
              Required
            </label>
            {isChoice && (
              <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
                <input type="checkbox" checked={q.shuffleOptions} onChange={(e) => onUpdate({ shuffleOptions: e.target.checked })} className="accent-[var(--accent)]" />
                Shuffle order
              </label>
            )}
          </div>
        )}

        {!isSection && qi > 0 && (
          <details className="border-t border-[var(--border)] pt-3">
            <summary className="cursor-pointer text-xs text-[var(--muted)] select-none hover:text-[var(--text)]">
              Conditional logic {q.conditionQuestionIndex !== '' ? '· active' : '· none'}
            </summary>
            <div className="mt-2 space-y-2">
              <Select value={q.conditionQuestionIndex}
                onChange={(e) => onUpdate({ conditionQuestionIndex: e.target.value, conditionOptionIndex: '', conditionValue: '' })}>
                <option value="">Always show</option>
                {questionDefs.slice(0, qi).map((pq, pqi) =>
                  pq.text.trim() ? <option key={pqi} value={String(pqi)}>Q{pqi + 1}: {pq.text.slice(0, 45)}</option> : null
                )}
              </Select>
              {q.conditionQuestionIndex !== '' && (() => {
                const cq = questionDefs[parseInt(q.conditionQuestionIndex)];
                if (!cq) return null;
                if (cq.questionType === 'multiple_choice' || cq.questionType === 'checkboxes') {
                  return (
                    <Select value={q.conditionOptionIndex} onChange={(e) => onUpdate({ conditionOptionIndex: e.target.value })}>
                      <option value="">Select trigger option…</option>
                      {cq.options.map((o, oi) => <option key={oi} value={String(oi)}>{o.text || `Option ${oi + 1}`}</option>)}
                    </Select>
                  );
                }
                return (
                  <Input value={q.conditionValue} onChange={(e) => onUpdate({ conditionValue: e.target.value })}
                    placeholder={cq.questionType === 'rating' ? 'Show if rating equals… (e.g., 7)' : 'Show if answer contains this text'} />
                );
              })()}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

// ── Round card for the builder ─────────────────────────────────────────────────

function RoundCard({ r, i, total, onUpdate, onMove, onRemove }: {
  r: RoundDef; i: number; total: number;
  onUpdate: (patch: Partial<RoundDef>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--surface-strong)] border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] text-xs font-bold flex items-center justify-center">{i + 1}</span>
          <span className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Round {i + 1}</span>
        </div>
        <div className="flex gap-1">
          <button disabled={i === 0} onClick={() => onMove(-1)}
            className="rounded px-1.5 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--surface)] disabled:opacity-30">↑</button>
          <button disabled={i === total - 1} onClick={() => onMove(1)}
            className="rounded px-1.5 py-0.5 text-xs text-[var(--muted)] hover:bg-[var(--surface)] disabled:opacity-30">↓</button>
          <button onClick={onRemove}
            className="rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors">Remove</button>
        </div>
      </div>
      <div className="p-4 grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label>Vote type</Label>
          <Select value={r.voteType} onChange={(e) => onUpdate({ voteType: e.target.value })}>
            {Object.entries(VOTE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        {i < total - 1 && (
          <div>
            <Label>Survivors to next round</Label>
            <Input type="number" min={1} value={r.survivorCount} placeholder="e.g., 3"
              onChange={(e) => onUpdate({ survivorCount: e.target.value })} />
          </div>
        )}
        <div className={i < total - 1 ? '' : 'sm:col-span-2'}>
          <Label>Winning threshold</Label>
          <Select value={r.thresholdType} onChange={(e) => onUpdate({ thresholdType: e.target.value })}>
            {Object.entries(THRESHOLD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        {r.thresholdType === 'admin_defined' && (
          <div>
            <Label>Required affirmative votes</Label>
            <Input type="number" min={1} value={r.thresholdValue} onChange={(e) => onUpdate({ thresholdValue: e.target.value })} />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
            <input type="checkbox" checked={r.shuffleOptions} onChange={(e) => onUpdate({ shuffleOptions: e.target.checked })} className="accent-[var(--accent)]" />
            Shuffle option order for each voter
          </label>
        </div>
      </div>
    </div>
  );
}

// ── Step description bar ───────────────────────────────────────────────────────

function StepHint({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-base font-semibold text-[var(--text)]">{title}</h3>
      <p className="text-sm text-[var(--muted)] mt-0.5">{desc}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminVotesPage() {
  const [polls, setPolls]             = useState<AdminPollEntry[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [actionBusy, setActionBusy]   = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [closeConfirm, setCloseConfirm]   = useState<string | null>(null);

  // Builder
  const [showBuilder, setShowBuilder] = useState(false);
  const [step, setStep]               = useState(1);
  const [buildError, setBuildError]   = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const builderRef = useRef<HTMLDivElement>(null);

  // Step 1
  const [title, setTitle]                         = useState('');
  const [description, setDescription]             = useState('');
  const [eligibilityType, setEligibilityType]     = useState('team');
  const [deadline, setDeadline]                   = useState('');
  const [anonymous, setAnonymous]                 = useState(false);
  const [resultVisibility, setResultVisibility]   = useState('admin_publish');
  const [linkedSuggestionIds, setLinkedSuggestionIds] = useState<string[]>([]);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [responseLimit, setResponseLimit]         = useState('');
  const [suggestions, setSuggestions]             = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  // Step 2
  const [rounds, setRounds] = useState<RoundDef[]>([
    { voteType: 'yes_no', survivorCount: '', thresholdType: 'majority', thresholdValue: '', shuffleOptions: false },
  ]);

  // Step 3
  const [options, setOptions] = useState<string[]>(['', '']);

  // Step 4
  const [questionDefs, setQuestionDefs] = useState<QuestionDef[]>([]);

  const fetchPolls = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/votes');
      if (!res.ok) { setError('Admin access required.'); return; }
      setPolls(await res.json());
    } catch { setError('Failed to load polls.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPolls(); }, [fetchPolls]);

  useEffect(() => {
    if (!showBuilder) return;
    setSuggestionsLoading(true);
    fetch('/api/suggestions')
      .then((r) => r.json())
      .then((data: Suggestion[]) =>
        setSuggestions(data.filter((s) => (s.endorsers?.length ?? 0) >= 3 && s.voteTag !== 'vote_passed' && s.voteTag !== 'vote_failed'))
      )
      .catch(() => {})
      .finally(() => setSuggestionsLoading(false));
  }, [showBuilder]);

  useEffect(() => {
    if (showBuilder && builderRef.current) {
      builderRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showBuilder]);

  function setActionError(pollId: string, msg: string) {
    setActionErrors((prev) => ({ ...prev, [pollId]: msg }));
  }
  function clearActionError(pollId: string) {
    setActionErrors((prev) => { const next = { ...prev }; delete next[pollId]; return next; });
  }

  async function doAction(pollId: string, body: object) {
    clearActionError(pollId);
    setActionBusy(pollId);
    try {
      const res = await fetch(`/api/votes/${pollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setActionError(pollId, (d as { error?: string }).error ?? 'Action failed.');
      } else {
        await fetchPolls();
      }
    } catch { setActionError(pollId, 'Network error — please try again.'); }
    finally { setActionBusy(null); }
  }

  async function handleDelete(pollId: string) {
    clearActionError(pollId);
    setActionBusy(pollId);
    try {
      const res = await fetch(`/api/votes/${pollId}`, { method: 'DELETE' });
      if (!res.ok) setActionError(pollId, 'Failed to delete poll.');
      else { setDeleteConfirm(null); await fetchPolls(); }
    } catch { setActionError(pollId, 'Network error — please try again.'); }
    finally { setActionBusy(null); }
  }

  function resetBuilder() {
    setStep(1); setTitle(''); setDescription(''); setEligibilityType('team');
    setDeadline(''); setAnonymous(false); setResultVisibility('admin_publish');
    setLinkedSuggestionIds([]); setConfirmationMessage(''); setResponseLimit('');
    setRounds([{ voteType: 'yes_no', survivorCount: '', thresholdType: 'majority', thresholdValue: '', shuffleOptions: false }]);
    setOptions(['', '']); setQuestionDefs([]); setBuildError(null); setShowBuilder(false);
  }

  function advanceStep() {
    setBuildError(null);
    if (step === 1 && !title.trim()) { setBuildError('Title is required.'); return; }
    if (step === 2) {
      const skipOptions = rounds.length === 0 || rounds[0]?.voteType === 'yes_no';
      setStep(skipOptions ? 4 : 3);
    } else {
      setStep(step + 1);
    }
  }

  function backStep() {
    setBuildError(null);
    if (step === 4) {
      const skipOptions = rounds.length === 0 || rounds[0]?.voteType === 'yes_no';
      setStep(skipOptions ? 2 : 3);
    } else {
      setStep(step - 1);
    }
  }

  function updateRound(i: number, patch: Partial<RoundDef>) {
    setRounds((prev) => prev.map((r, j) => j === i ? { ...r, ...patch } : r));
  }

  function moveRound(i: number, dir: -1 | 1) {
    const next = [...rounds];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setRounds(next);
  }

  function updateQuestion(i: number, patch: Partial<QuestionDef>) {
    setQuestionDefs((prev) => prev.map((q, j) => j === i ? { ...q, ...patch } : q));
  }

  function moveQuestion(i: number, dir: -1 | 1) {
    const next = [...questionDefs];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setQuestionDefs(next);
  }

  async function handleSubmit() {
    setBuildError(null);
    if (!title.trim()) { setBuildError('Title is required.'); setStep(1); return; }

    const hasRounds    = rounds.length > 0;
    const hasQuestions = questionDefs.some((q) => q.text.trim());
    if (!hasRounds && !hasQuestions) {
      setBuildError('Add at least one voting round or one form question.');
      setStep(2); return;
    }

    if (hasRounds && rounds[0].voteType !== 'yes_no') {
      const validOpts = options.filter((o) => o.trim());
      if (validOpts.length < 2) { setBuildError('Round 1 needs at least 2 options.'); setStep(3); return; }
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
        confirmationMessage: confirmationMessage.trim() || undefined,
        responseLimit: responseLimit ? parseInt(responseLimit) : undefined,
        rounds: hasRounds ? rounds.map((r, i) => ({
          voteType: r.voteType,
          survivorCount: i < rounds.length - 1 && r.survivorCount ? parseInt(r.survivorCount) : undefined,
          thresholdType: r.thresholdType,
          thresholdValue: r.thresholdType === 'admin_defined' && r.thresholdValue ? parseInt(r.thresholdValue) : undefined,
          shuffleOptions: r.shuffleOptions,
        })) : [],
        round1Options: hasRounds && rounds[0]?.voteType !== 'yes_no'
          ? options.filter((o) => o.trim()).map((o) => ({ text: o.trim() }))
          : undefined,
        questions: questionDefs
          .filter((q) => q.text.trim() || q.questionType === 'section_break')
          .map((q, i) => {
            const cqIdx = q.conditionQuestionIndex !== '' ? parseInt(q.conditionQuestionIndex) : -1;
            const condQuestion = cqIdx >= 0 ? questionDefs[cqIdx] : null;
            const coIdx = q.conditionOptionIndex !== '' ? parseInt(q.conditionOptionIndex) : -1;
            return {
              questionType: q.questionType,
              text: q.text.trim() || `Section ${i + 1}`,
              description: q.description.trim() || undefined,
              required: q.required,
              shuffleOptions: q.shuffleOptions,
              displayOrder: i,
              ratingMin: q.questionType === 'rating' ? parseInt(q.ratingMin) || 1 : undefined,
              ratingMax: q.questionType === 'rating' ? parseInt(q.ratingMax) || 10 : undefined,
              ratingMinLabel: q.ratingMinLabel.trim() || undefined,
              ratingMaxLabel: q.ratingMaxLabel.trim() || undefined,
              maxLength: q.maxLength ? parseInt(q.maxLength) : undefined,
              conditionValue: condQuestion && coIdx < 0 ? q.conditionValue.trim() || undefined : undefined,
              options: ['multiple_choice', 'checkboxes'].includes(q.questionType)
                ? q.options.filter((o) => o.text.trim()).map((o, oi) => ({ text: o.text.trim(), displayOrder: oi }))
                : undefined,
            };
          }),
      };

      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = `Failed to create poll (${res.status}).`;
        try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch {}
        setBuildError(msg);
        return;
      }

      resetBuilder();
      await fetchPolls();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setBuildError(`Could not reach the server — check your connection and try again. (${message})`);
    } finally {
      setSubmitting(false);
    }
  }

  function getCurrentRoundForPoll(entry: AdminPollEntry) {
    return entry.rounds.find((r) => r.status === 'open')
      ?? entry.rounds.find((r) => r.status === 'closed')
      ?? entry.rounds[0];
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">

      {process.env.NEXT_PUBLIC_VOTES_TEST_MODE === 'true' && (
        <div className="mb-5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 text-sm text-amber-400 font-medium flex items-center gap-2">
          <span>⚗</span> Test mode — Discord notifications are suppressed
        </div>
      )}

      <SectionHeader
        title="Admin · Votes"
        subtitle="Create and manage league polls and surveys"
        actions={
          !showBuilder
            ? <Button onClick={() => setShowBuilder(true)}>+ New Poll</Button>
            : null
        }
      />

      {/* ── Poll Builder ───────────────────────────────────────────────────────── */}
      {showBuilder && (
        <div ref={builderRef}>
          <Card className="mb-8">
            {/* Builder header */}
            <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text)]">New Poll</h2>
                  <p className="text-sm text-[var(--muted)] mt-0.5">Fill in each step, then publish when ready.</p>
                </div>
                <button
                  onClick={resetBuilder}
                  className="text-xs text-[var(--muted)] hover:text-red-400 transition-colors mt-0.5 px-2 py-1 rounded hover:bg-red-500/10"
                >
                  ✕ Cancel
                </button>
              </div>
              <StepIndicator current={step} total={4} labels={STEP_LABELS} />
            </div>

            <CardContent className="px-6 py-6 space-y-5">
              {buildError && <AlertBanner msg={buildError} onDismiss={() => setBuildError(null)} />}

              {/* ── Step 1 — Basics ─────────────────────────────────────────── */}
              {step === 1 && (
                <div className="space-y-5">
                  <StepHint
                    title="Poll basics"
                    desc="Give your poll a title and choose who's eligible to vote."
                  />

                  <div className="grid sm:grid-cols-2 gap-5">
                    <div className="sm:col-span-2">
                      <Label>Title <span className="text-red-400">*</span></Label>
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g., 2026 Draft Location Vote"
                        autoFocus
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Description <span className="text-[var(--muted)] font-normal">(optional)</span></Label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Background context for voters…"
                        rows={2}
                      />
                    </div>
                  </div>

                  {/* Eligibility pills */}
                  <div>
                    <Label>Who can vote?</Label>
                    <div className="mt-2 flex gap-3">
                      {([
                        { value: 'team',   label: 'One vote per team',   sub: '12 eligible' },
                        { value: 'person', label: 'One vote per person', sub: '14 eligible' },
                      ] as const).map(({ value, label, sub }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setEligibilityType(value)}
                          className={`flex-1 rounded-xl border-2 px-4 py-3 text-left transition-all
                            ${eligibilityType === value
                              ? 'border-[var(--accent)] bg-[var(--accent)]/8'
                              : 'border-[var(--border)] hover:border-[var(--accent)]/40'
                            }`}
                        >
                          <div className={`text-sm font-semibold ${eligibilityType === value ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>{label}</div>
                          <div className="text-xs text-[var(--muted)] mt-0.5">{sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Advanced settings */}
                  <details className="rounded-xl border border-[var(--border)] overflow-hidden">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium bg-[var(--surface-strong)] hover:bg-[var(--surface)] select-none flex items-center gap-2">
                      <span>⚙</span> Advanced settings
                      <span className="text-xs text-[var(--muted)] font-normal ml-auto">deadline · visibility · confirmation…</span>
                    </summary>
                    <div className="p-4 space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Deadline <span className="text-[var(--muted)] font-normal">(optional)</span></Label>
                          <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                        </div>
                        <div>
                          <Label>Response cap <span className="text-[var(--muted)] font-normal">(surveys)</span></Label>
                          <Input type="number" min={1} value={responseLimit} onChange={(e) => setResponseLimit(e.target.value)} placeholder="Unlimited" />
                        </div>
                      </div>
                      <div>
                        <Label>Result visibility</Label>
                        <Select value={resultVisibility} onChange={(e) => setResultVisibility(e.target.value)}>
                          <option value="admin_publish">Show only when I publish (recommended)</option>
                          <option value="all_voted">Show automatically after everyone votes</option>
                          <option value="immediate">Show live as votes come in</option>
                        </Select>
                      </div>
                      <label className="flex items-start gap-3 cursor-pointer text-sm select-none">
                        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="accent-[var(--accent)] mt-0.5" />
                        <div>
                          <div className="font-medium">Anonymous results</div>
                          <div className="text-xs text-[var(--muted)]">Members won&apos;t see who voted for what</div>
                        </div>
                      </label>
                      <div>
                        <Label>Confirmation message <span className="text-[var(--muted)] font-normal">(optional)</span></Label>
                        <Textarea
                          value={confirmationMessage}
                          onChange={(e) => setConfirmationMessage(e.target.value)}
                          placeholder="Shown after submission — e.g., 'Thanks for voting! Results post Tuesday.'"
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label>Link to suggestions <span className="text-[var(--muted)] font-normal">(optional)</span></Label>
                        {suggestionsLoading ? (
                          <p className="text-sm text-[var(--muted)] py-2">Loading eligible suggestions…</p>
                        ) : suggestions.length === 0 ? (
                          <p className="text-sm text-[var(--muted)] py-2">No eligible suggestions (need ≥ 3 endorsements, not yet voted).</p>
                        ) : (
                          <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] p-2 mt-1">
                            {suggestions.map((s) => (
                              <label key={s.id} className="flex items-start gap-2 cursor-pointer text-sm p-1.5 rounded hover:bg-[var(--surface-strong)] select-none">
                                <input
                                  type="checkbox"
                                  checked={linkedSuggestionIds.includes(s.id)}
                                  onChange={(e) => setLinkedSuggestionIds(
                                    e.target.checked ? [...linkedSuggestionIds, s.id] : linkedSuggestionIds.filter((x) => x !== s.id)
                                  )}
                                  className="accent-[var(--accent)] mt-0.5"
                                />
                                <span className="leading-snug">{s.title ?? s.content.slice(0, 80)}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
              )}

              {/* ── Step 2 — Voting Rounds ───────────────────────────────────── */}
              {step === 2 && (
                <div className="space-y-4">
                  <StepHint
                    title="Voting rounds"
                    desc="Add one or more voting rounds, or skip to create a survey-only poll. Round 2+ options are auto-populated from the previous round's survivors."
                  />

                  {rounds.length === 0 && (
                    <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-10 text-center space-y-1">
                      <p className="text-sm font-medium text-[var(--text)]">No voting rounds</p>
                      <p className="text-xs text-[var(--muted)]">This will be a survey-only poll — add form questions in Step 4.</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {rounds.map((r, i) => (
                      <RoundCard
                        key={i}
                        r={r} i={i} total={rounds.length}
                        onUpdate={(patch) => updateRound(i, patch)}
                        onMove={(dir) => moveRound(i, dir)}
                        onRemove={() => setRounds(rounds.filter((_, j) => j !== i))}
                      />
                    ))}
                  </div>

                  <button
                    onClick={() => setRounds([...rounds, { voteType: 'select_one', survivorCount: '', thresholdType: 'plurality', thresholdValue: '', shuffleOptions: false }])}
                    className="flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
                  >
                    + Add round
                  </button>
                </div>
              )}

              {/* ── Step 3 — Round 1 Options ─────────────────────────────────── */}
              {step === 3 && (
                <div className="space-y-4">
                  <StepHint
                    title="Round 1 options"
                    desc="Enter the choices voters will rank or select in the first round. Later rounds are populated automatically from survivors."
                  />

                  <div className="space-y-2">
                    {options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-6 text-right text-xs text-[var(--muted)] shrink-0">{i + 1}.</span>
                        <Input
                          value={opt}
                          onChange={(e) => { const a = [...options]; a[i] = e.target.value; setOptions(a); }}
                          placeholder={`Option ${i + 1}`}
                        />
                        {options.length > 2 && (
                          <button
                            onClick={() => setOptions(options.filter((_, j) => j !== i))}
                            className="text-[var(--muted)] hover:text-red-400 px-1 shrink-0 transition-colors"
                          >✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setOptions([...options, ''])}
                    className="text-sm text-[var(--accent)] hover:underline ml-8"
                  >
                    + Add option
                  </button>
                </div>
              )}

              {/* ── Step 4 — Survey Questions ─────────────────────────────────── */}
              {step === 4 && (
                <div className="space-y-4">
                  <StepHint
                    title="Survey questions"
                    desc="Optionally add questions that appear alongside the ballot on the same submission page."
                  />

                  {questionDefs.length === 0 && (
                    <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-10 text-center space-y-1">
                      <p className="text-sm font-medium text-[var(--text)]">No questions yet</p>
                      <p className="text-xs text-[var(--muted)]">Use the buttons below to add a question, or skip to create the poll without a survey.</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {questionDefs.map((q, qi) => (
                      <QuestionCard
                        key={qi}
                        q={q} qi={qi} total={questionDefs.length}
                        questionDefs={questionDefs}
                        onUpdate={(patch) => updateQuestion(qi, patch)}
                        onUpdateOption={(oi, text) =>
                          setQuestionDefs((prev) =>
                            prev.map((qd, j) =>
                              j === qi ? { ...qd, options: qd.options.map((o, k) => k === oi ? { text } : o) } : qd
                            )
                          )
                        }
                        onMove={(dir) => moveQuestion(qi, dir)}
                        onRemove={() => setQuestionDefs(questionDefs.filter((_, j) => j !== qi))}
                      />
                    ))}
                  </div>

                  {/* Quick-add bar */}
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                    <p className="text-xs text-[var(--muted)] mb-2 font-medium uppercase tracking-wider">Add question</p>
                    <div className="flex flex-wrap gap-2">
                      {QUESTION_TYPES.map((t) => (
                        <button
                          key={t.value}
                          onClick={() => setQuestionDefs([...questionDefs, { ...newQuestion(), questionType: t.value }])}
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                        >
                          {t.icon} {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step navigation ──────────────────────────────────────────── */}
              <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                <div>
                  {step > 1 && (
                    <Button variant="ghost" onClick={backStep}>← Back</Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={resetBuilder}>Cancel</Button>
                  {step < 4
                    ? <Button onClick={advanceStep}>Next: {STEP_LABELS[step]} →</Button>
                    : (
                      <Button onClick={handleSubmit} disabled={submitting}>
                        {submitting
                          ? <span className="flex items-center gap-2"><span className="animate-spin text-base">⟳</span> Creating…</span>
                          : 'Create Poll'}
                      </Button>
                    )
                  }
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Poll List ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center gap-3 text-[var(--muted)] py-8">
          <span className="animate-spin text-lg">⟳</span>
          <span>Loading polls…</span>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-500/10 border border-red-500/25 px-5 py-4 text-red-400 text-sm flex items-center gap-2">
          <span>⚠</span> {error}
        </div>
      ) : polls.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-16 text-center space-y-2">
          <p className="text-base font-semibold text-[var(--text)]">No polls yet</p>
          <p className="text-sm text-[var(--muted)]">Hit &quot;+ New Poll&quot; above to create one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {polls.map((entry) => {
            const { poll } = entry;
            const currentRound        = getCurrentRoundForPoll(entry);
            const busy                = actionBusy === poll.id;
            const openRound           = entry.rounds.find((r) => r.status === 'open');
            const closedNonFinalRound = entry.rounds.find((r) => r.status === 'closed' && r.roundNumber < entry.roundCount);
            const closedFinalRound    = entry.rounds.find((r) => r.status === 'closed' && r.roundNumber === entry.roundCount);
            const nextPendingRound    = entry.rounds.find((r) => r.status === 'pending' && r.roundNumber > 1);
            const isFormOnly          = entry.roundCount === 0;
            const pollError           = actionErrors[poll.id];

            return (
              <Card key={poll.id}>
                <CardContent className="p-5 space-y-4">
                  {pollError && (
                    <AlertBanner msg={pollError} onDismiss={() => clearActionError(poll.id)} />
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Left: info */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[var(--text)] truncate">{poll.title}</span>
                        <StatusBadge status={poll.status} />
                        {isFormOnly && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-violet-500/15 text-violet-400 border border-violet-500/25">
                            survey
                          </span>
                        )}
                        {poll.anonymous && (
                          <span className="text-xs text-[var(--muted)] border border-[var(--border)] rounded-full px-2 py-0.5">anon</span>
                        )}
                      </div>

                      {/* Metadata row */}
                      <div className="flex items-center gap-3 text-xs text-[var(--muted)] flex-wrap">
                        <span>{poll.eligibilityType === 'team' ? '12 teams' : '14 people'}</span>
                        {!isFormOnly && currentRound && (
                          <>
                            <span>·</span>
                            <span>Round {currentRound.roundNumber}/{entry.roundCount}</span>
                            <span>·</span>
                            <span>{VOTE_TYPE_LABELS[currentRound.voteType] ?? currentRound.voteType}</span>
                            <StatusBadge status={currentRound.status} />
                          </>
                        )}
                        {poll.deadline && (
                          <>
                            <span>·</span>
                            <span>Deadline: {new Date(poll.deadline).toLocaleString()}</span>
                          </>
                        )}
                      </div>

                      {/* Progress */}
                      {currentRound && !isFormOnly && (
                        <div className="w-52 pt-1">
                          <ProgressBar
                            value={(currentRound as { voteCount?: number }).voteCount ?? 0}
                            max={(currentRound as { totalEligible?: number }).totalEligible ?? 12}
                          />
                        </div>
                      )}
                      {isFormOnly && entry.responseCount > 0 && (
                        <p className="text-xs text-[var(--muted)]">
                          {entry.responseCount} response{entry.responseCount !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>

                    {/* Right: actions */}
                    <div className="flex flex-wrap gap-2 shrink-0 items-start">
                      {/* Form-only actions */}
                      {isFormOnly && poll.status === 'draft' && (
                        <Button size="sm" onClick={() => doAction(poll.id, { action: 'open_poll' })} disabled={busy}>Open</Button>
                      )}
                      {isFormOnly && poll.status === 'open' && (
                        <Button size="sm" variant="ghost" onClick={() => doAction(poll.id, { action: 'close_poll_now' })} disabled={busy}>Close</Button>
                      )}

                      {/* Voting poll actions */}
                      {!isFormOnly && poll.status === 'draft' && (
                        <Button size="sm" onClick={() => doAction(poll.id, { action: 'open_round', roundNumber: 1 })} disabled={busy}>Open Round 1</Button>
                      )}
                      {!isFormOnly && openRound && (
                        closeConfirm === poll.id ? (
                          <>
                            <span className="text-xs text-[var(--muted)] self-center">Close Round {openRound.roundNumber}?</span>
                            <Button size="sm" variant="ghost" onClick={() => setCloseConfirm(null)} disabled={busy}>Cancel</Button>
                            <Button size="sm" onClick={() => { setCloseConfirm(null); doAction(poll.id, { action: 'close_round' }); }} disabled={busy}>Confirm</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setCloseConfirm(poll.id)} disabled={busy}>
                            Close R{openRound.roundNumber}
                          </Button>
                        )
                      )}
                      {!isFormOnly && closedNonFinalRound && !openRound && nextPendingRound && (
                        <>
                          {closedNonFinalRound.resultsPublishedAt == null && (
                            <Button size="sm" variant="ghost"
                              onClick={() => doAction(poll.id, { action: 'publish_results', roundId: closedNonFinalRound.id })}
                              disabled={busy}>
                              Publish R{closedNonFinalRound.roundNumber}
                            </Button>
                          )}
                          <Button size="sm"
                            onClick={() => doAction(poll.id, { action: 'advance_round' }).then(() => doAction(poll.id, { action: 'open_round', roundNumber: nextPendingRound.roundNumber }))}
                            disabled={busy}>
                            Advance → R{nextPendingRound.roundNumber}
                          </Button>
                        </>
                      )}
                      {!isFormOnly && closedFinalRound && closedFinalRound.resultsPublishedAt == null && (
                        <Button size="sm"
                          onClick={() => doAction(poll.id, { action: 'publish_results', roundId: closedFinalRound.id })}
                          disabled={busy}>
                          Publish Results
                        </Button>
                      )}

                      {/* Export */}
                      <a
                        href={`/api/admin/votes/${poll.id}/export`}
                        download
                        className="inline-flex items-center rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)] transition-colors"
                      >
                        CSV
                      </a>

                      {/* Delete */}
                      {deleteConfirm === poll.id ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                          <Button size="sm" variant="danger" onClick={() => handleDelete(poll.id)} disabled={busy}>Delete</Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(poll.id)} disabled={busy}>Delete</Button>
                      )}
                    </div>
                  </div>

                  {/* Expandable round details */}
                  {entry.rounds.some((r) => r.status !== 'pending') && (
                    <details className="border-t border-[var(--border)] pt-3">
                      <summary className="text-xs text-[var(--muted)] cursor-pointer hover:text-[var(--text)] select-none">
                        Voter details
                      </summary>
                      <div className="mt-3 space-y-3 pl-2">
                        {entry.rounds.filter((r) => r.status !== 'pending').map((r) => (
                          <div key={r.id} className="text-xs space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold">Round {r.roundNumber}</span>
                              <StatusBadge status={r.status} />
                              <span className="text-[var(--muted)]">{VOTE_TYPE_LABELS[r.voteType] ?? r.voteType}</span>
                              <span className="text-[var(--muted)]">
                                {(r as { voteCount?: number }).voteCount ?? 0}/{(r as { totalEligible?: number }).totalEligible ?? 12} voted
                              </span>
                            </div>
                            {r.options.length > 0 && (
                              <ul className="ml-4 space-y-0.5 text-[var(--muted)]">
                                {r.options.map((opt) => <li key={opt.id}>· {opt.text}</li>)}
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
