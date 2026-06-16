'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Label from '@/components/ui/Label';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { POLL_QUESTION_TYPES, THRESHOLD_LABELS, VOTE_TYPE_LABELS } from '@/components/admin/votes/constants';
import { AlertBanner, SectionBlock } from '@/components/admin/votes/ui';
import {
  applyQuestionTypeDefaults,
  defaultRound,
  duplicateQuestion,
  initialBuilderState,
  newQuestion,
  questionNeedsChoicesLocked,
  questionNeedsGrid,
  questionNeedsOptions,
  type BuilderState,
  type QuestionDef,
  type RoundDef,
  type Suggestion,
} from '@/components/admin/votes/types';
import { buildSubmitBody, validateBuilderState } from '@/lib/votes/poll-builder';

async function parseApiJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      'The server returned an unexpected response (not JSON). If you are admin-only without a team login, refresh and try again — or log in with your team PIN.',
    );
  }
}

export type PollCreateResult = { published: boolean };

type CreatePollWizardProps = {
  suggestions: Suggestion[];
  suggestionsLoading: boolean;
  onCancel: () => void;
  onCreated: (result?: PollCreateResult) => void;
  mode?: 'create' | 'edit';
  pollId?: string;
  initialState?: BuilderState;
  canEditQuestions?: boolean;
  onSaved?: () => void;
};

function usesFormalRounds(state: BuilderState): boolean {
  return state.useFormalRounds && state.rounds.length > 0;
}

async function publishNewPoll(pollId: string, state: BuilderState): Promise<void> {
  const body = usesFormalRounds(state)
    ? { action: 'open_round', roundNumber: 1 }
    : { action: 'open_poll' };
  const res = await fetch(`/api/votes/${pollId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await parseApiJson(res)) as { error?: string };
    throw new Error(
      data.error ?? 'Poll saved as draft, but publishing failed. Use Publish poll on the card below.',
    );
  }
}

function QuestionEditor({
  q,
  index,
  total,
  priorQuestions,
  onUpdate,
  onMove,
  onRemove,
  onDuplicate,
}: {
  q: QuestionDef;
  index: number;
  total: number;
  priorQuestions: QuestionDef[];
  onUpdate: (patch: Partial<QuestionDef>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const typeMeta = POLL_QUESTION_TYPES.find((t) => t.value === q.questionType);
  const isSection = q.questionType === 'section_break';
  const isGrid = questionNeedsGrid(q.questionType);
  const showOptions = ((questionNeedsOptions(q.questionType) && !isGrid) || q.questionType === 'yes_no');
  const lockOptions = questionNeedsChoicesLocked(q.questionType);
  const priorAnswerable = priorQuestions
    .map((pq, pi) => ({ pq, pi }))
    .filter(({ pq }) => pq.questionType !== 'section_break');
  const conditionParent =
    q.conditionQuestionIndex !== ''
      ? priorQuestions[parseInt(q.conditionQuestionIndex, 10)]
      : null;
  const conditionParentOpts =
    conditionParent && (questionNeedsOptions(conditionParent.questionType) || conditionParent.questionType === 'yes_no')
      ? conditionParent.options.filter((o) => o.text.trim())
      : [];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-[var(--surface-strong)] border-b border-[var(--border)]">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
          Question {index + 1}
          {typeMeta ? ` · ${typeMeta.label}` : ''}
        </span>
        <div className="flex gap-1">
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="text-xs px-2 py-1 rounded disabled:opacity-30">↑</button>
          <button type="button" disabled={index === total - 1} onClick={() => onMove(1)} className="text-xs px-2 py-1 rounded disabled:opacity-30">↓</button>
          <button type="button" onClick={onDuplicate} className="text-xs px-2 py-1 rounded hover:bg-[var(--surface-strong)]">Duplicate</button>
          {total > 1 ? (
            <button type="button" onClick={onRemove} className="text-xs px-2 py-1 rounded text-red-400 hover:bg-red-500/10">Remove</button>
          ) : null}
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <Label>Question type</Label>
          <Select
            value={q.questionType}
            onChange={(e) => onUpdate(applyQuestionTypeDefaults(q, e.target.value))}
          >
            {POLL_QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label} — {t.hint}</option>
            ))}
          </Select>
        </div>

        <div>
          <Label>{isSection ? 'Section title' : 'Question'} {!isSection && <span className="text-red-400">*</span>}</Label>
          <Input
            value={q.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            placeholder={isSection ? 'e.g. Travel & lodging' : 'What do you want to ask?'}
          />
        </div>

        {!isSection && (
          <div>
            <Label>Help text</Label>
            <Input value={q.description} onChange={(e) => onUpdate({ description: e.target.value })} placeholder="Optional context shown below the question" />
          </div>
        )}

        {q.questionType === 'rating' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Min</Label><Input type="number" value={q.ratingMin} onChange={(e) => onUpdate({ ratingMin: e.target.value })} /></div>
              <div><Label>Max</Label><Input type="number" value={q.ratingMax} onChange={(e) => onUpdate({ ratingMax: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Min label</Label><Input value={q.ratingMinLabel} onChange={(e) => onUpdate({ ratingMinLabel: e.target.value })} placeholder="e.g. Strongly disagree" /></div>
              <div><Label>Max label</Label><Input value={q.ratingMaxLabel} onChange={(e) => onUpdate({ ratingMaxLabel: e.target.value })} placeholder="e.g. Strongly agree" /></div>
            </div>
          </div>
        )}

        {q.questionType === 'number' && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Min (optional)</Label><Input type="number" value={q.ratingMin} onChange={(e) => onUpdate({ ratingMin: e.target.value })} placeholder="No minimum" /></div>
            <div><Label>Max (optional)</Label><Input type="number" value={q.ratingMax} onChange={(e) => onUpdate({ ratingMax: e.target.value })} placeholder="No maximum" /></div>
          </div>
        )}

        {(q.questionType === 'short_answer' || q.questionType === 'paragraph') && (
          <div>
            <Label>Max characters</Label>
            <Input type="number" value={q.maxLength} onChange={(e) => onUpdate({ maxLength: e.target.value })} placeholder="No limit" />
          </div>
        )}

        {q.questionType === 'file_upload' && (
          <div>
            <Label>Max file size (MB)</Label>
            <Input type="number" min={1} max={50} value={q.maxLength || '10'} onChange={(e) => onUpdate({ maxLength: e.target.value })} />
            <p className="text-xs text-[var(--muted)] mt-1">PDF, Word, Excel, images, and plain text.</p>
          </div>
        )}

        {isGrid && (
          <>
            <div className="space-y-2">
              <Label>Column labels</Label>
              {q.options.map((opt, oi) => (
                <div key={oi} className="flex gap-2 items-center">
                  <span className="text-xs text-[var(--muted)] w-4">{oi + 1}.</span>
                  <Input
                    value={opt.text}
                    onChange={(e) => onUpdate({ options: q.options.map((o, k) => (k === oi ? { text: e.target.value } : o)) })}
                    placeholder={`Column ${oi + 1}`}
                  />
                  {q.options.length > 2 ? (
                    <button type="button" onClick={() => onUpdate({ options: q.options.filter((_, k) => k !== oi) })} className="text-red-400 text-sm">✕</button>
                  ) : null}
                </div>
              ))}
              <button type="button" onClick={() => onUpdate({ options: [...q.options, { text: '' }] })} className="text-xs text-[var(--accent)] hover:underline">+ Add column</button>
            </div>
            <div className="space-y-2">
              <Label>Row labels</Label>
              {q.gridRows.map((row, ri) => (
                <div key={ri} className="flex gap-2 items-center">
                  <span className="text-xs text-[var(--muted)] w-4">{ri + 1}.</span>
                  <Input
                    value={row.text}
                    onChange={(e) => onUpdate({ gridRows: q.gridRows.map((r, k) => (k === ri ? { text: e.target.value } : r)) })}
                    placeholder={`Row ${ri + 1}`}
                  />
                  {q.gridRows.length > 2 ? (
                    <button type="button" onClick={() => onUpdate({ gridRows: q.gridRows.filter((_, k) => k !== ri) })} className="text-red-400 text-sm">✕</button>
                  ) : null}
                </div>
              ))}
              <button type="button" onClick={() => onUpdate({ gridRows: [...q.gridRows, { text: '' }] })} className="text-xs text-[var(--accent)] hover:underline">+ Add row</button>
            </div>
          </>
        )}

        {showOptions && (
          <div className="space-y-2">
            <Label>{q.questionType === 'yes_no' ? 'Answers (fixed)' : 'Answer choices'}</Label>
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex gap-2 items-center">
                <span className="text-xs text-[var(--muted)] w-4">{oi + 1}.</span>
                <Input
                  value={opt.text}
                  disabled={lockOptions}
                  onChange={(e) =>
                    onUpdate({
                      options: q.options.map((o, k) => (k === oi ? { text: e.target.value } : o)),
                    })
                  }
                  placeholder={q.questionType === 'yes_no' ? undefined : `Choice ${oi + 1}`}
                />
                {!lockOptions && q.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onUpdate({ options: q.options.filter((_, k) => k !== oi) })}
                    className="text-red-400 text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {!lockOptions && (
              <button
                type="button"
                onClick={() => onUpdate({ options: [...q.options, { text: '' }] })}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                + Add choice
              </button>
            )}
            {questionNeedsOptions(q.questionType) && (
              <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
                <input type="checkbox" checked={q.allowOther} onChange={(e) => onUpdate({ allowOther: e.target.checked })} className="accent-[var(--accent)]" />
                Include &quot;Other&quot; with free-text follow-up
              </label>
            )}
            {showOptions && !lockOptions && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={q.shuffleOptions} onChange={(e) => onUpdate({ shuffleOptions: e.target.checked })} className="accent-[var(--accent)]" />
                Shuffle choice order for each voter
              </label>
            )}
          </div>
        )}

        {priorAnswerable.length > 0 && !isSection && (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-3 space-y-2">
            <Label>Conditional logic</Label>
            <p className="text-xs text-[var(--muted)]">Show this question only when a prior answer matches (like Google Forms).</p>
            <Select
              value={q.conditionQuestionIndex}
              onChange={(e) =>
                onUpdate({
                  conditionQuestionIndex: e.target.value,
                  conditionOptionIndex: '',
                  conditionValue: '',
                })
              }
            >
              <option value="">Always show</option>
              {priorAnswerable.map(({ pq, pi }) => (
                <option key={pi} value={String(pi)}>
                  After Q{pi + 1}: {pq.text.trim() || pq.questionType}
                </option>
              ))}
            </Select>
            {q.conditionQuestionIndex !== '' && conditionParentOpts.length > 0 && (
              <Select
                value={q.conditionOptionIndex}
                onChange={(e) => onUpdate({ conditionOptionIndex: e.target.value, conditionValue: '' })}
              >
                <option value="">Any answer to that question</option>
                {conditionParentOpts.map((opt, oi) => (
                  <option key={oi} value={String(oi)}>{opt.text || `Choice ${oi + 1}`}</option>
                ))}
              </Select>
            )}
            {q.conditionQuestionIndex !== '' && conditionParentOpts.length === 0 && conditionParent && (
              <Input
                value={q.conditionValue}
                onChange={(e) => onUpdate({ conditionValue: e.target.value })}
                placeholder="Exact answer text (optional)"
              />
            )}
          </div>
        )}

        {!isSection && (
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={q.required} onChange={(e) => onUpdate({ required: e.target.checked })} className="accent-[var(--accent)]" />
            Required question
          </label>
        )}
      </div>
    </div>
  );
}

const QUICK_QUESTION_TYPES = ['yes_no', 'multiple_choice', 'short_answer', 'paragraph', 'section_break'] as const;

function questionTypeGroups() {
  const groups = new Map<string, (typeof POLL_QUESTION_TYPES)[number][]>();
  for (const t of POLL_QUESTION_TYPES) {
    const list = groups.get(t.group) ?? [];
    list.push(t);
    groups.set(t.group, list);
  }
  return groups;
}

function QuestionTypePicker({
  onAdd,
  label,
  compact,
}: {
  onAdd: (type: string) => void;
  label?: string;
  compact?: boolean;
}) {
  const groups = questionTypeGroups();
  const quickTypes = POLL_QUESTION_TYPES.filter((t) =>
    (QUICK_QUESTION_TYPES as readonly string[]).includes(t.value),
  );

  return (
    <div className="space-y-2">
      {label ? <p className="text-xs font-medium text-[var(--muted)]">{label}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {quickTypes.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onAdd(t.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
          >
            + {t.label}
          </button>
        ))}
        <Select
          value=""
          fullWidth={false}
          size="sm"
          onChange={(e) => {
            if (e.target.value) onAdd(e.target.value);
          }}
          className="min-w-[11rem]"
        >
          <option value="">More types…</option>
          {[...groups.entries()].map(([group, types]) => (
            <optgroup key={group} label={group}>
              {types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
      {!compact ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--muted)] hover:text-[var(--text)] select-none">
            Show all question types
          </summary>
          <div className="flex flex-wrap gap-2 pt-2">
            {POLL_QUESTION_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => onAdd(t.value)}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                title={t.hint}
              >
                + {t.label}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function InsertQuestionBelow({ onAdd }: { onAdd: (type: string) => void }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 border-t border-dashed border-[var(--border)]" />
      <Select
        value=""
        fullWidth={false}
        size="sm"
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value);
        }}
        className="min-w-[9rem]"
      >
        <option value="">+ Insert below</option>
        {POLL_QUESTION_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <div className="flex-1 border-t border-dashed border-[var(--border)]" />
    </div>
  );
}

function RoundEditor({
  r,
  i,
  total,
  onUpdate,
  onRemove,
}: {
  r: RoundDef;
  i: number;
  total: number;
  onUpdate: (patch: Partial<RoundDef>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Round {i + 1}</span>
        {total > 1 ? (
          <button type="button" onClick={onRemove} className="text-xs text-red-400 hover:underline">Remove</button>
        ) : null}
      </div>
      <div>
        <Label>Vote type</Label>
        <Select value={r.voteType} onChange={(e) => onUpdate({ voteType: e.target.value })}>
          {Object.entries(VOTE_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </div>
      {i < total - 1 && (
        <div>
          <Label>Survivors advancing</Label>
          <Input type="number" min={1} value={r.survivorCount} placeholder="e.g. 3" onChange={(e) => onUpdate({ survivorCount: e.target.value })} />
        </div>
      )}
      <div>
        <Label>Threshold</Label>
        <Select value={r.thresholdType} onChange={(e) => onUpdate({ thresholdType: e.target.value })}>
          {Object.entries(THRESHOLD_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}

export default function CreatePollWizard({
  suggestions,
  suggestionsLoading,
  onCancel,
  onCreated,
  mode = 'create',
  pollId,
  initialState,
  canEditQuestions = true,
  onSaved,
}: CreatePollWizardProps) {
  const [state, setState] = useState<BuilderState>(initialState ?? initialBuilderState());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = mode === 'edit';
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollToIndex = useRef<number | null>(null);

  const patch = (p: Partial<BuilderState>) => setState((prev) => ({ ...prev, ...p }));

  useEffect(() => {
    const idx = scrollToIndex.current;
    if (idx == null) return;
    scrollToIndex.current = null;
    requestAnimationFrame(() => {
      questionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [state.questions.length]);

  const handleSubmit = async (intent: 'draft' | 'publish' = 'draft') => {
    const err = isEdit && !canEditQuestions
      ? (!state.title.trim() ? 'Add a poll title.' : null)
      : validateBuilderState(isEdit ? { ...state, useFormalRounds: false } : state);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (isEdit && pollId) {
        const body = buildSubmitBody(state, false);
        const res = await fetch(`/api/admin/votes/${pollId}/form`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: body.title,
            description: body.description,
            deadline: body.deadline,
            anonymous: body.anonymous,
            resultVisibility: body.resultVisibility,
            confirmationMessage: body.confirmationMessage,
            responseLimit: body.responseLimit,
            linkedSuggestionIds: body.linkedSuggestionIds,
            questions: canEditQuestions ? body.questions : undefined,
          }),
        });
        if (!res.ok) {
          const data = (await parseApiJson(res)) as { error?: string };
          throw new Error(data.error ?? 'Failed to save poll.');
        }
        (onSaved ?? onCreated)();
        return;
      }
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildSubmitBody(state)),
      });
      const data = (await parseApiJson(res)) as { error?: string; poll?: { id: string } };
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to create poll.');
      }
      const pollIdCreated = data.poll?.id;
      if (intent === 'publish') {
        if (!pollIdCreated) throw new Error('Poll created but id missing — publish from the poll card.');
        await publishNewPoll(pollIdCreated, state);
      }
      onCreated({ published: intent === 'publish' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save poll.');
    } finally {
      setSubmitting(false);
    }
  };

  const addQuestionAt = (type: string, afterIndex?: number) => {
    const insertAt = afterIndex == null ? state.questions.length : afterIndex + 1;
    const next = [...state.questions];
    next.splice(insertAt, 0, newQuestion(type));
    scrollToIndex.current = insertAt;
    patch({ questions: next });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)]">{isEdit ? 'Edit poll' : 'New poll'}</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            {isEdit && !canEditQuestions
              ? 'Responses exist — you can edit title, description, and settings. Questions are locked.'
              : 'Save as draft to review privately, or publish when members should see it on the Vote page.'}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="text-xs text-[var(--muted)] hover:text-red-400 px-2 py-1">Cancel</button>
      </div>

      {error ? <AlertBanner msg={error} onDismiss={() => setError(null)} /> : null}

      <SectionBlock title="Poll info" description="Title and who can respond.">
        <div>
          <Label>Title <span className="text-red-400">*</span></Label>
          <Input value={state.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. 2026 offseason survey" autoFocus />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={state.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Optional intro for voters" rows={2} />
        </div>
        <div>
          <Label>Who can respond?</Label>
          {isEdit ? (
            <p className="text-sm text-[var(--muted)] mt-1">
              {state.eligibilityType === 'team' ? 'One per team (12)' : 'One per person (14)'} — cannot change after creation.
            </p>
          ) : (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {([
              { value: 'team', label: 'One per team', sub: '12 teams' },
              { value: 'person', label: 'One per person', sub: '14 people' },
            ] as const).map(({ value, label, sub }) => (
              <button
                key={value}
                type="button"
                onClick={() => patch({ eligibilityType: value })}
                className={`rounded-lg border-2 px-3 py-2.5 text-left ${
                  state.eligibilityType === value ? 'border-[var(--accent)] bg-[var(--accent)]/8' : 'border-[var(--border)]'
                }`}
              >
                <div className="text-sm font-semibold">{label}</div>
                <div className="text-xs text-[var(--muted)]">{sub}</div>
              </button>
            ))}
          </div>
          )}
        </div>
      </SectionBlock>

      {(!isEdit || canEditQuestions) && (
      <SectionBlock title="Questions" description="Add questions at the top or bottom — or insert between any two. The bar stays visible while you scroll.">
        <div className="sticky top-0 z-10 -mx-1 px-1 py-2.5 mb-3 bg-[var(--background)]/95 backdrop-blur-sm border-b border-[var(--border)] rounded-lg">
          <QuestionTypePicker onAdd={(type) => addQuestionAt(type)} label="Add question" compact />
        </div>

        <div className="space-y-1">
          {state.questions.map((q, qi) => (
            <Fragment key={qi}>
              <div ref={(el) => { questionRefs.current[qi] = el; }}>
                <QuestionEditor
                  q={q}
                  index={qi}
                  total={state.questions.length}
                  priorQuestions={state.questions.slice(0, qi)}
                  onUpdate={(p) =>
                    patch({
                      questions: state.questions.map((qd, j) => (j === qi ? { ...qd, ...p } : qd)),
                    })
                  }
                  onMove={(dir) => {
                    const next = [...state.questions];
                    [next[qi], next[qi + dir]] = [next[qi + dir], next[qi]];
                    patch({ questions: next });
                  }}
                  onRemove={() => patch({ questions: state.questions.filter((_, j) => j !== qi) })}
                  onDuplicate={() => {
                    const next = [...state.questions];
                    next.splice(qi + 1, 0, duplicateQuestion(q));
                    scrollToIndex.current = qi + 1;
                    patch({ questions: next });
                  }}
                />
              </div>
              <InsertQuestionBelow onAdd={(type) => addQuestionAt(type, qi)} />
            </Fragment>
          ))}
        </div>

        <div className="pt-4 mt-2 border-t border-dashed border-[var(--border)]">
          <QuestionTypePicker onAdd={(type) => addQuestionAt(type)} label="Add another question" />
        </div>
      </SectionBlock>
      )}

      {!isEdit && (
      <SectionBlock title="Formal multi-round ballot" description="Optional: ranked/IRV bracket voting with elimination rounds — separate from the questions above." optional>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={state.useFormalRounds}
            onChange={(e) => patch({ useFormalRounds: e.target.checked })}
            className="accent-[var(--accent)] mt-0.5"
          />
          <span>
            <span className="font-medium">Add a formal voting round</span>
            <span className="block text-xs text-[var(--muted)] mt-0.5">
              Use for league votes that need Borda, IRV, or multi-round elimination. Most polls only need questions above.
            </span>
          </span>
        </label>

        {state.useFormalRounds ? (
          <div className="space-y-3 pt-2 border-t border-[var(--border)]">
            {state.rounds.map((r, i) => (
              <RoundEditor
                key={i}
                r={r}
                i={i}
                total={state.rounds.length}
                onUpdate={(p) => patch({ rounds: state.rounds.map((rd, j) => (j === i ? { ...rd, ...p } : rd)) })}
                onRemove={() => patch({ rounds: state.rounds.filter((_, j) => j !== i) })}
              />
            ))}
            <button
              type="button"
              onClick={() => patch({ rounds: [...state.rounds, defaultRound('select_one')] })}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              + Add round
            </button>
            {state.rounds[0]?.voteType !== 'yes_no' && (
              <div className="space-y-2">
                <Label>Round 1 ballot options</Label>
                {state.round1Options.map((opt, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="text-xs text-[var(--muted)] w-5">{i + 1}.</span>
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const next = [...state.round1Options];
                        next[i] = e.target.value;
                        patch({ round1Options: next });
                      }}
                      placeholder={`Option ${i + 1}`}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => patch({ round1Options: [...state.round1Options, ''] })}
                  className="text-xs text-[var(--accent)] hover:underline ml-7"
                >
                  + Add option
                </button>
              </div>
            )}
          </div>
        ) : null}
      </SectionBlock>
      )}

      <SectionBlock title="Settings" optional>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Deadline</Label>
            <Input type="datetime-local" value={state.deadline} onChange={(e) => patch({ deadline: e.target.value })} />
          </div>
          <div>
            <Label>Response cap</Label>
            <Input type="number" min={1} value={state.responseLimit} onChange={(e) => patch({ responseLimit: e.target.value })} placeholder="Unlimited" />
          </div>
        </div>
        <div>
          <Label>When to show results</Label>
          <Select value={state.resultVisibility} onChange={(e) => patch({ resultVisibility: e.target.value })}>
            <option value="admin_publish">When I publish (recommended)</option>
            <option value="all_voted">After everyone responds</option>
            <option value="immediate">Live as responses come in</option>
          </Select>
        </div>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={state.anonymous} onChange={(e) => patch({ anonymous: e.target.checked })} className="accent-[var(--accent)] mt-0.5" />
          <span>
            <span className="font-medium">Anonymous responses</span>
            <span className="block text-xs text-[var(--muted)] mt-0.5">
              Hides who wrote each text answer from members. Totals (e.g. 8 voted Yes) still show unless you set results to &quot;When I publish&quot; and publish after closing.
            </span>
          </span>
        </label>
        <div>
          <Label>Confirmation message</Label>
          <Textarea value={state.confirmationMessage} onChange={(e) => patch({ confirmationMessage: e.target.value })} rows={2} placeholder="Shown after submit" />
        </div>
        <div>
          <Label>Link suggestions</Label>
          {suggestionsLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No eligible suggestions.</p>
          ) : (
            <div className="max-h-32 overflow-y-auto rounded-lg border border-[var(--border)] p-2 space-y-1 mt-1">
              {suggestions.map((s) => (
                <label key={s.id} className="flex gap-2 text-sm p-1.5 rounded hover:bg-[var(--surface-strong)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.linkedSuggestionIds.includes(s.id)}
                    onChange={(e) =>
                      patch({
                        linkedSuggestionIds: e.target.checked
                          ? [...state.linkedSuggestionIds, s.id]
                          : state.linkedSuggestionIds.filter((x) => x !== s.id),
                      })
                    }
                    className="accent-[var(--accent)] mt-0.5"
                  />
                  <span>{s.title ?? s.content.slice(0, 80)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </SectionBlock>

      <div className="sticky bottom-0 pt-3 pb-1 bg-[var(--background)]/95 backdrop-blur-sm border-t border-[var(--border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {!isEdit ? (
          <p className="text-xs text-[var(--muted)]">
            <span className="font-medium text-[var(--text)]">Draft</span> — admins only.
            <span className="mx-1.5">·</span>
            <span className="font-medium text-[var(--text)]">Publish</span> — visible on Vote page.
          </p>
        ) : (
          <span />
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
          {isEdit ? (
            <Button type="button" onClick={() => void handleSubmit('draft')} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save changes'}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => void handleSubmit('draft')} disabled={submitting}>
                {submitting ? 'Saving…' : 'Save draft'}
              </Button>
              <Button type="button" onClick={() => void handleSubmit('publish')} disabled={submitting}>
                {submitting ? 'Publishing…' : 'Publish poll'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
