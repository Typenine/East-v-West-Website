'use client';

import { useState } from 'react';
import type { PollQuestion } from '@/lib/votes/types';
import { isOtherOptionText } from '@/lib/votes/question-types';
import { parseMcGridAnswer, parseCbGridAnswer, serializeGridAnswer, type McGridAnswer, type CbGridAnswer } from '@/lib/votes/grid-answers';
import { parseFileAnswer, serializeFileAnswer, fileMaxBytesFromQuestion } from '@/lib/votes/file-answer';

const inputClass =
  'w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus)] disabled:opacity-50';

export function ShortAnswerQ({ q, value, onChange, disabled }: {
  q: PollQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {q.maxLength && (
        <p className="text-xs text-[var(--muted)] text-right">{value.length}/{q.maxLength}</p>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={q.maxLength ?? undefined}
        disabled={disabled}
        placeholder="Your answer"
        className={inputClass}
      />
    </div>
  );
}

export function ParagraphQ({ q, value, onChange, disabled }: {
  q: PollQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {q.maxLength && (
        <p className="text-xs text-[var(--muted)] text-right">{value.length}/{q.maxLength}</p>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={q.maxLength ?? undefined}
        disabled={disabled}
        placeholder="Your answer"
        rows={4}
        className={`${inputClass} resize-y`}
      />
    </div>
  );
}

export function EmailQ({ value, onChange, disabled }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="email"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="name@example.com"
      className={inputClass}
      autoComplete="email"
    />
  );
}

export function NumberQ({ q, value, onChange, disabled }: {
  q: PollQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      min={q.ratingMin ?? undefined}
      max={q.ratingMax ?? undefined}
      disabled={disabled}
      placeholder="Enter a number"
      className={inputClass}
    />
  );
}

export function DateQ({ value, onChange, disabled }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={inputClass}
    />
  );
}

export function TimeQ({ value, onChange, disabled }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={inputClass}
    />
  );
}

export function RatingQ({ q, value, onChange, disabled }: {
  q: PollQuestion;
  value: number | null;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const min = q.ratingMin ?? 1;
  const max = q.ratingMax ?? 10;
  const vals = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        {vals.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => !disabled && onChange(v)}
            disabled={disabled}
            className={`w-10 h-10 rounded-lg border-2 text-sm font-semibold transition-colors
              ${value === v
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
              } disabled:opacity-50 disabled:cursor-default`}
          >
            {v}
          </button>
        ))}
      </div>
      {(q.ratingMinLabel || q.ratingMaxLabel) && (
        <div className="flex justify-between text-xs text-[var(--muted)]">
          <span>{q.ratingMinLabel ?? min}</span>
          <span>{q.ratingMaxLabel ?? max}</span>
        </div>
      )}
    </div>
  );
}

export function DropdownQ({ q, displayOptions, value, otherText, onChange, onOtherTextChange, disabled }: {
  q: PollQuestion;
  displayOptions: PollQuestion['options'];
  value: string | null;
  otherText: string;
  onChange: (optionId: string) => void;
  onOtherTextChange: (v: string) => void;
  disabled?: boolean;
}) {
  const otherOpt = displayOptions.find((o) => isOtherOptionText(o.text));
  return (
    <div className="space-y-2">
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        <option value="">Choose…</option>
        {displayOptions.map((opt) => (
          <option key={opt.id} value={opt.id}>{opt.text}</option>
        ))}
      </select>
      {otherOpt && value === otherOpt.id && (
        <input
          type="text"
          value={otherText}
          onChange={(e) => onOtherTextChange(e.target.value)}
          disabled={disabled}
          placeholder="Please specify"
          className={inputClass}
        />
      )}
    </div>
  );
}

export function MultipleChoiceQ({ q, displayOptions, value, otherText, onChange, onOtherTextChange, disabled }: {
  q: PollQuestion;
  displayOptions: PollQuestion['options'];
  value: string | null;
  otherText: string;
  onChange: (optionId: string) => void;
  onOtherTextChange: (v: string) => void;
  disabled?: boolean;
}) {
  const otherOpt = displayOptions.find((o) => isOtherOptionText(o.text));
  return (
    <div className="space-y-2">
      {displayOptions.map((opt) => (
        <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
          <input
            type="radio"
            name={`q-${q.id}`}
            checked={value === opt.id}
            onChange={() => !disabled && onChange(opt.id)}
            disabled={disabled}
            className="accent-[var(--accent)]"
          />
          <span className="text-sm group-hover:text-[var(--accent)] transition-colors">{opt.text}</span>
        </label>
      ))}
      {otherOpt && value === otherOpt.id && (
        <input
          type="text"
          value={otherText}
          onChange={(e) => onOtherTextChange(e.target.value)}
          disabled={disabled}
          placeholder="Please specify"
          className={`${inputClass} ml-6`}
        />
      )}
    </div>
  );
}

export function CheckboxesQ({ q, displayOptions, value, otherText, onChange, onOtherTextChange, disabled }: {
  q: PollQuestion;
  displayOptions: PollQuestion['options'];
  value: string[];
  otherText: string;
  onChange: (optionIds: string[]) => void;
  onOtherTextChange: (v: string) => void;
  disabled?: boolean;
}) {
  const otherOpt = displayOptions.find((o) => isOtherOptionText(o.text));

  function toggle(optId: string) {
    if (disabled) return;
    const next = value.includes(optId) ? value.filter((id) => id !== optId) : [...value, optId];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {displayOptions.map((opt) => (
        <label key={opt.id} className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={value.includes(opt.id)}
            onChange={() => toggle(opt.id)}
            disabled={disabled}
            className="accent-[var(--accent)]"
          />
          <span className="text-sm group-hover:text-[var(--accent)] transition-colors">{opt.text}</span>
        </label>
      ))}
      {otherOpt && value.includes(otherOpt.id) && (
        <input
          type="text"
          value={otherText}
          onChange={(e) => onOtherTextChange(e.target.value)}
          disabled={disabled}
          placeholder="Please specify"
          className={`${inputClass} ml-6`}
        />
      )}
    </div>
  );
}

export function YesNoQ({ displayOptions, value, onChange, disabled }: {
  displayOptions: PollQuestion['options'];
  value: string | null;
  onChange: (optionId: string) => void;
  disabled?: boolean;
}) {
  const yesOpt = displayOptions.find((o) => o.text.toLowerCase() === 'yes') ?? displayOptions[0];
  const noOpt = displayOptions.find((o) => o.text.toLowerCase() === 'no') ?? displayOptions[1];

  return (
    <div className="flex gap-3">
      {[yesOpt, noOpt].filter(Boolean).map((opt) => {
        const isYes = opt.text.toLowerCase() === 'yes';
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={`flex-1 rounded-xl border-2 py-3 text-base font-bold transition-colors disabled:opacity-50 ${
              active
                ? isYes
                  ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                  : 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                : 'border-[var(--border)] hover:border-[var(--accent)]'
            }`}
          >
            {opt.text}
          </button>
        );
      })}
    </div>
  );
}

export function McGridQ({ q, columns, value, onChange, disabled }: {
  q: PollQuestion;
  columns: PollQuestion['options'];
  value: McGridAnswer;
  onChange: (v: McGridAnswer) => void;
  disabled?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[320px]">
        <thead>
          <tr>
            <th className="p-2 text-left" />
            {columns.map((col) => (
              <th key={col.id} className="p-2 text-center font-medium text-[var(--muted)]">{col.text}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {q.gridRows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--border)]">
              <td className="p-2 font-medium pr-4">{row.text}</td>
              {columns.map((col) => (
                <td key={col.id} className="p-2 text-center">
                  <input
                    type="radio"
                    name={`grid-${q.id}-${row.id}`}
                    checked={value[row.id] === col.id}
                    disabled={disabled}
                    onChange={() => onChange({ ...value, [row.id]: col.id })}
                    className="accent-[var(--accent)]"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CbGridQ({ q, columns, value, onChange, disabled }: {
  q: PollQuestion;
  columns: PollQuestion['options'];
  value: CbGridAnswer;
  onChange: (v: CbGridAnswer) => void;
  disabled?: boolean;
}) {
  function toggle(rowId: string, colId: string) {
    if (disabled) return;
    const cur = value[rowId] ?? [];
    const next = cur.includes(colId) ? cur.filter((id) => id !== colId) : [...cur, colId];
    onChange({ ...value, [rowId]: next });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse min-w-[320px]">
        <thead>
          <tr>
            <th className="p-2 text-left" />
            {columns.map((col) => (
              <th key={col.id} className="p-2 text-center font-medium text-[var(--muted)]">{col.text}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {q.gridRows.map((row) => (
            <tr key={row.id} className="border-t border-[var(--border)]">
              <td className="p-2 font-medium pr-4">{row.text}</td>
              {columns.map((col) => (
                <td key={col.id} className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={(value[row.id] ?? []).includes(col.id)}
                    disabled={disabled}
                    onChange={() => toggle(row.id, col.id)}
                    className="accent-[var(--accent)]"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FileUploadQ({ q, pollId, value, onChange, disabled }: {
  q: PollQuestion;
  pollId: string;
  value: ReturnType<typeof parseFileAnswer>;
  onChange: (json: string | null) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const maxBytes = fileMaxBytesFromQuestion(q.maxLength);

  async function onPick(file: File | null) {
    if (!file || disabled) return;
    setErr(null);
    if (file.size > maxBytes) {
      setErr(`File must be under ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const presignRes = await fetch(`/api/votes/${pollId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type || 'application/octet-stream', ext, questionId: q.id }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error ?? 'Upload failed');

      const putRes = await fetch(presign.putUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
      if (!putRes.ok) throw new Error('Failed to upload file.');

      onChange(serializeFileAnswer({
        key: presign.key,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
          <span>{value.filename}</span>
          {!disabled ? (
            <button type="button" className="text-xs text-red-400" onClick={() => onChange(null)}>Remove</button>
          ) : null}
        </div>
      ) : (
        <input
          type="file"
          disabled={disabled || busy}
          onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
          className="text-sm w-full"
        />
      )}
      {busy ? <p className="text-xs text-[var(--muted)]">Uploading…</p> : null}
      {err ? <p className="text-xs text-red-500">{err}</p> : null}
      <p className="text-xs text-[var(--muted)]">Max {Math.round(maxBytes / 1024 / 1024)} MB · PDF, images, Office docs, text</p>
    </div>
  );
}

export function formatAnswerDisplay(q: PollQuestion, answer: { textAnswer?: string | null; ratingValue?: number | null; optionIds?: string[] | null }): string {
  if (q.questionType === 'multiple_choice_grid') {
    const grid = parseMcGridAnswer(answer.textAnswer);
    return q.gridRows
      .map((row) => {
        const colId = grid[row.id];
        const col = q.options.find((o) => o.id === colId);
        return `${row.text}: ${col?.text ?? '—'}`;
      })
      .join(' · ');
  }
  if (q.questionType === 'checkbox_grid') {
    const grid = parseCbGridAnswer(answer.textAnswer);
    return q.gridRows
      .map((row) => {
        const cols = (grid[row.id] ?? []).map((id) => q.options.find((o) => o.id === id)?.text ?? id).join(', ');
        return `${row.text}: ${cols || '—'}`;
      })
      .join(' · ');
  }
  if (q.questionType === 'file_upload') {
    const file = parseFileAnswer(answer.textAnswer);
    return file?.filename ?? '—';
  }
  if (answer.textAnswer && answer.optionIds?.length) {
    const labels = answer.optionIds.map((id) => q.options.find((o) => o.id === id)?.text ?? id).join(', ');
    return `${labels}${answer.textAnswer ? ` — ${answer.textAnswer}` : ''}`;
  }
  if (answer.textAnswer) return answer.textAnswer;
  if (answer.ratingValue != null) return `Rating: ${answer.ratingValue}`;
  if (answer.optionIds?.length) {
    return answer.optionIds.map((id) => q.options.find((o) => o.id === id)?.text ?? id).join(', ');
  }
  return '—';
}
