'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import type {
  Poll,
  PollQuestion,
  FormQuestionResult,
  GridQuestionResult,
  FileQuestionResult,
  AdminRoundResults,
} from '@/lib/votes/types';
import { VOTE_TYPE_LABELS } from '@/components/admin/votes/constants';

type ResultsPayload = {
  poll: Poll;
  rounds: AdminRoundResults[];
  questions: PollQuestion[];
  formResults: FormQuestionResult[];
  responseCount: number;
};

type AdminPollResultsProps = {
  pollId: string;
  pollTitle: string;
  onClose: () => void;
};

function GridResultBlock({ result, question }: { result: GridQuestionResult; question?: PollQuestion }) {
  const max = Math.max(...result.rows.flatMap((r) => r.columnCounts.map((c) => c.count)), 1);
  return (
    <div className="space-y-3 overflow-x-auto">
      {result.rows.map((row) => (
        <div key={row.rowId}>
          <p className="text-xs font-semibold mb-1">{row.text}</p>
          <div className="space-y-1">
            {row.columnCounts.map((c) => (
              <div key={c.optionId} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate text-[var(--muted)]">{c.text}</span>
                <div className="flex-1 h-2 rounded-full bg-[var(--surface-strong)] overflow-hidden">
                  <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.round((c.count / max) * 100)}%` }} />
                </div>
                <span className="w-6 text-right">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-[var(--muted)]">{result.total} response{result.total !== 1 ? 's' : ''}</p>
    </div>
  );
}

function FileResultBlock({ result, pollId }: { result: FileQuestionResult; pollId: string }) {
  async function download(key: string) {
    const res = await fetch(`/api/admin/votes/${pollId}/file?key=${encodeURIComponent(key)}`);
    const data = await res.json();
    if (data.url) window.open(data.url, '_blank');
  }

  if (!result.files.length) return <p className="text-sm text-[var(--muted)]">No files uploaded.</p>;

  return (
    <ul className="space-y-2">
      {result.files.map((f, i) => (
        <li key={i} className="flex items-center justify-between gap-2 text-sm rounded-lg bg-[var(--surface-strong)] px-3 py-2">
          <span>
            {f.voterDisplay ? <span className="text-xs text-[var(--muted)] block">{f.voterDisplay}</span> : null}
            {f.filename}
          </span>
          <button type="button" onClick={() => void download(f.key)} className="text-xs text-[var(--accent)] hover:underline shrink-0">
            Download
          </button>
        </li>
      ))}
    </ul>
  );
}

function FormResultBlock({ result, question, pollId }: { result: FormQuestionResult; question?: PollQuestion; pollId: string }) {
  if (result.type === 'grid') return <GridResultBlock result={result} question={question} />;
  if (result.type === 'file') return <FileResultBlock result={result} pollId={pollId} />;
  if (result.type === 'rating') {
    return (
      <p className="text-sm">
        Average <strong>{result.average}</strong> · {result.total} response{result.total !== 1 ? 's' : ''}
      </p>
    );
  }
  if (result.type === 'choice') {
    return (
      <ul className="text-sm space-y-1">
        {result.counts.map((c) => (
          <li key={c.optionId} className="flex justify-between"><span>{c.text}</span><span className="text-[var(--muted)]">{c.count}</span></li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
      {result.answers.map((a, i) => (
        <li key={i} className="rounded bg-[var(--surface-strong)] px-2 py-1">
          {a.voterDisplay ? <span className="text-xs text-[var(--muted)]">{a.voterDisplay}: </span> : null}
          {a.text}
        </li>
      ))}
    </ul>
  );
}

export default function AdminPollResults({ pollId, pollTitle, onClose }: AdminPollResultsProps) {
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'survey' | 'rounds'>('survey');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/votes/${pollId}/results`);
      if (!res.ok) throw new Error('Failed to load results.');
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load results.');
    } finally {
      setLoading(false);
    }
  }, [pollId]);

  useEffect(() => { void load(); }, [load]);

  const hasRounds = (data?.rounds.length ?? 0) > 0;
  const hasSurvey = (data?.questions.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--background)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="font-semibold text-[var(--text)]">Results</h2>
            <p className="text-sm text-[var(--muted)] truncate">{pollTitle}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)] px-2">✕</button>
        </div>

        {hasRounds && hasSurvey ? (
          <div className="flex gap-1 px-5 pt-3 border-b border-[var(--border)]">
            {(['survey', 'rounds'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--muted)]'}`}
              >
                {t === 'survey' ? 'Survey' : 'Ballot rounds'}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? <p className="text-sm text-[var(--muted)]">Loading…</p> : null}
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          {data && !loading ? (
            <>
              <p className="text-xs text-[var(--muted)]">{data.responseCount} survey response{data.responseCount !== 1 ? 's' : ''}</p>
              {(tab === 'survey' || !hasRounds) && hasSurvey ? (
                data.formResults.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">No survey responses yet.</p>
                ) : (
                  data.questions
                    .filter((q) => q.questionType !== 'section_break')
                    .map((q) => {
                      const r = data.formResults.find((fr) => fr.questionId === q.id);
                      if (!r) return null;
                      return (
                        <div key={q.id} className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                          <p className="text-sm font-semibold">{q.text}</p>
                          <FormResultBlock result={r} question={q} pollId={pollId} />
                        </div>
                      );
                    })
                )
              ) : null}
              {(tab === 'rounds' || !hasSurvey) && hasRounds ? (
                <div className="space-y-4">
                  {data.rounds.map((round) => (
                    <div key={round.id} className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                      <p className="text-sm font-semibold">
                        Round {round.roundNumber} · {VOTE_TYPE_LABELS[round.voteType] ?? round.voteType}
                      </p>
                      <p className="text-xs text-[var(--muted)]">{round.votes.length} vote{round.votes.length !== 1 ? 's' : ''}</p>
                      {round.result ? (
                        <pre className="text-xs bg-[var(--surface-strong)] rounded p-2 overflow-x-auto">{JSON.stringify(round.result, null, 2)}</pre>
                      ) : (
                        <p className="text-xs text-[var(--muted)]">Results not computed yet.</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-between gap-2">
          <a href={`/api/admin/votes/${pollId}/export`} download className="text-sm text-[var(--accent)] hover:underline">
            Export CSV
          </a>
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
