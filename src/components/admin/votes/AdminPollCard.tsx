'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { VOTE_TYPE_LABELS } from '@/components/admin/votes/constants';
import { AlertBanner, ProgressBar, StatusBadge } from '@/components/admin/votes/ui';
import type { AdminPollEntry } from '@/components/admin/votes/types';
import type { PollRound } from '@/lib/votes/types';

type AdminPollCardProps = {
  entry: AdminPollEntry;
  busy: boolean;
  error: string | null;
  deleteConfirm: boolean;
  closeConfirm: boolean;
  onClearError: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
  onDelete: () => void;
  onCloseConfirm: () => void;
  onCloseCancel: () => void;
  onAction: (body: object) => Promise<void>;
  onEdit: () => void;
  onViewResults: () => void;
};

type NextAction = {
  label: string;
  variant: 'primary' | 'ghost';
  body: object;
  hint?: string;
};

function getCurrentRound(entry: AdminPollEntry) {
  return (
    entry.rounds.find((r) => r.status === 'open') ??
    entry.rounds.find((r) => r.status === 'closed') ??
    entry.rounds[0]
  );
}

function computeNextAction(entry: AdminPollEntry): NextAction | null {
  const { poll } = entry;
  const isFormOnly = entry.roundCount === 0;
  const openRound = entry.rounds.find((r) => r.status === 'open');
  const closedNonFinal = entry.rounds.find((r) => r.status === 'closed' && r.roundNumber < entry.roundCount);
  const closedFinal = entry.rounds.find((r) => r.status === 'closed' && r.roundNumber === entry.roundCount);
  const nextPending = entry.rounds.find((r) => r.status === 'pending' && r.roundNumber > 1);

  if (isFormOnly) {
    if (poll.status === 'draft') return { label: 'Open survey', variant: 'primary', body: { action: 'open_poll' }, hint: 'Members can start responding' };
    if (poll.status === 'open') return { label: 'Close survey', variant: 'ghost', body: { action: 'close_poll_now' } };
    return null;
  }

  if (poll.status === 'draft') {
    return { label: 'Open round 1', variant: 'primary', body: { action: 'open_round', roundNumber: 1 }, hint: 'Starts voting and notifies Discord' };
  }
  if (openRound) {
    return { label: `Close round ${openRound.roundNumber}`, variant: 'primary', body: { action: 'close_round' }, hint: 'Stop accepting votes for this round' };
  }
  if (closedNonFinal && nextPending) {
    if (closedNonFinal.resultsPublishedAt == null) {
      return {
        label: `Publish round ${closedNonFinal.roundNumber} results`,
        variant: 'primary',
        body: { action: 'publish_results', roundId: closedNonFinal.id },
        hint: 'Then advance to the next round',
      };
    }
    return {
      label: `Open round ${nextPending.roundNumber}`,
      variant: 'primary',
      body: { action: 'advance_and_open', roundNumber: nextPending.roundNumber, advanceFrom: closedNonFinal.id },
      hint: 'Advances survivors and opens the next round',
    };
  }
  if (closedFinal && closedFinal.resultsPublishedAt == null) {
    return { label: 'Publish final results', variant: 'primary', body: { action: 'publish_results', roundId: closedFinal.id } };
  }
  return null;
}

function WorkflowStrip({ poll, entry }: { poll: AdminPollEntry['poll']; entry: AdminPollEntry }) {
  const isFormOnly = entry.roundCount === 0;
  const openRound = entry.rounds.find((r) => r.status === 'open');
  const allClosed = !isFormOnly && entry.rounds.length > 0 && entry.rounds.every((r) => r.status === 'closed');
  const published = isFormOnly
    ? poll.status === 'closed'
    : entry.rounds.some((r) => r.resultsPublishedAt != null) && poll.status === 'closed';

  const steps = isFormOnly
    ? [
        { id: 'draft', label: 'Draft', done: poll.status !== 'draft' },
        { id: 'open', label: 'Open', done: poll.status === 'open' || poll.status === 'closed', active: poll.status === 'open' },
        { id: 'closed', label: 'Closed', done: poll.status === 'closed', active: poll.status === 'closed' },
      ]
    : [
        { id: 'draft', label: 'Draft', done: poll.status !== 'draft', active: poll.status === 'draft' },
        { id: 'live', label: 'Live', done: poll.status === 'closed' || Boolean(openRound), active: Boolean(openRound) },
        { id: 'closed', label: 'Closed', done: allClosed, active: allClosed && !published },
        { id: 'published', label: 'Published', done: published, active: published },
      ];

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              s.active
                ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                : s.done
                  ? 'border-[var(--border)] text-[var(--text)]'
                  : 'border-[var(--border)] text-[var(--muted)]'
            }`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 ? <span className="text-[var(--muted)] text-xs">→</span> : null}
        </div>
      ))}
    </div>
  );
}

export default function AdminPollCard({
  entry,
  busy,
  error,
  deleteConfirm,
  closeConfirm,
  onClearError,
  onDeleteConfirm,
  onDeleteCancel,
  onDelete,
  onCloseConfirm,
  onCloseCancel,
  onAction,
  onEdit,
  onViewResults,
}: AdminPollCardProps) {
  const { poll } = entry;
  const currentRound = getCurrentRound(entry);
  const isFormOnly = entry.roundCount === 0;
  const nextAction = computeNextAction(entry);
  const openRound = entry.rounds.find((r) => r.status === 'open');

  const runNext = async () => {
    if (!nextAction) return;
    const body = nextAction.body as Record<string, unknown>;
    if (body.action === 'advance_and_open') {
      await onAction({ action: 'advance_round' });
      await onAction({ action: 'open_round', roundNumber: body.roundNumber });
      return;
    }
    if (nextAction.label.startsWith('Close round') && !closeConfirm) {
      onCloseConfirm();
      return;
    }
    await onAction(nextAction.body);
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        {error ? <AlertBanner msg={error} onDismiss={onClearError} /> : null}

        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-start gap-2 flex-wrap">
              <h3 className="font-semibold text-[var(--text)] text-base">{poll.title}</h3>
              <StatusBadge status={poll.status} />
              {isFormOnly ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/25">survey</span>
              ) : null}
            </div>

            {poll.description ? <p className="text-sm text-[var(--muted)] line-clamp-2">{poll.description}</p> : null}

            <WorkflowStrip poll={poll} entry={entry} />

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
              <span>{poll.eligibilityType === 'team' ? '12 teams' : '14 people'}</span>
              {!isFormOnly && currentRound ? (
                <>
                  <span>· Round {currentRound.roundNumber}/{entry.roundCount}</span>
                  <span>· {VOTE_TYPE_LABELS[currentRound.voteType] ?? currentRound.voteType}</span>
                </>
              ) : null}
              {poll.deadline ? <span>· Deadline {new Date(poll.deadline).toLocaleString()}</span> : null}
            </div>

            {currentRound && !isFormOnly ? (
              <div className="max-w-xs">
                <ProgressBar value={currentRound.voteCount ?? 0} max={currentRound.totalEligible ?? 12} />
              </div>
            ) : null}
            {isFormOnly && entry.responseCount > 0 ? (
              <p className="text-xs text-[var(--muted)]">{entry.responseCount} response{entry.responseCount !== 1 ? 's' : ''}</p>
            ) : null}

            {nextAction?.hint ? <p className="text-xs text-[var(--accent)]">{nextAction.hint}</p> : null}
          </div>

          <div className="flex flex-col gap-2 shrink-0 min-w-[200px]">
            {nextAction ? (
              closeConfirm && openRound ? (
                <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xs text-[var(--text)]">Close round {openRound.roundNumber}?</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={onCloseCancel} disabled={busy}>Cancel</Button>
                    <Button size="sm" onClick={() => { onCloseCancel(); void onAction({ action: 'close_round' }); }} disabled={busy}>Confirm</Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant={nextAction.variant} onClick={() => void runNext()} disabled={busy} fullWidth>
                  {busy ? 'Working…' : nextAction.label}
                </Button>
              )
            ) : (
              <p className="text-xs text-[var(--muted)] text-center py-2">No action needed</p>
            )}

            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onEdit} disabled={busy} className="flex-1">
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={onViewResults} disabled={busy} className="flex-1">
                Results
              </Button>
            </div>

            <Link
              href={`/votes/${poll.id}`}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
            >
              View as member →
            </Link>

            <div className="flex gap-2">
              <a
                href={`/api/admin/votes/${poll.id}/export`}
                download
                className="flex-1 inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-strong)]"
              >
                Export CSV
              </a>
              {deleteConfirm ? (
                <>
                  <Button size="sm" variant="ghost" onClick={onDeleteCancel}>No</Button>
                  <Button size="sm" variant="danger" onClick={onDelete} disabled={busy}>Delete</Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={onDeleteConfirm} disabled={busy}>Delete</Button>
              )}
            </div>
          </div>
        </div>

        {entry.rounds.some((r) => r.status !== 'pending') ? (
          <details className="border-t border-[var(--border)] pt-3">
            <summary className="text-xs text-[var(--muted)] cursor-pointer hover:text-[var(--text)]">Round breakdown</summary>
            <div className="mt-3 grid sm:grid-cols-2 gap-3">
              {entry.rounds.filter((r) => r.status !== 'pending').map((r) => (
                <RoundSummary key={r.id} round={r} />
              ))}
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RoundSummary({ round }: { round: PollRound & { options: { id: string; text: string }[]; voteCount?: number; totalEligible?: number } }) {
  return (
    <div className="rounded-lg border border-[var(--border)] p-3 text-xs space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold">Round {round.roundNumber}</span>
        <StatusBadge status={round.status} />
        <span className="text-[var(--muted)]">{VOTE_TYPE_LABELS[round.voteType]}</span>
      </div>
      <p className="text-[var(--muted)]">
        {(round as { voteCount?: number }).voteCount ?? 0}/{(round as { totalEligible?: number }).totalEligible ?? 12} voted
      </p>
      {round.options.length > 0 ? (
        <ul className="text-[var(--muted)] space-y-0.5">
          {round.options.map((o) => (
            <li key={o.id}>· {o.text}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
