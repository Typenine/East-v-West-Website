'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import CreatePollWizard from '@/components/admin/votes/CreatePollWizard';
import AdminPollCard from '@/components/admin/votes/AdminPollCard';
import AdminPollResults from '@/components/admin/votes/AdminPollResults';
import type { AdminPollEntry, BuilderState, Suggestion } from '@/components/admin/votes/types';

function PollListSection({
  title,
  description,
  entries,
  renderCard,
}: {
  title: string;
  description?: string;
  entries: AdminPollEntry[];
  renderCard: (entry: AdminPollEntry) => ReactNode;
}) {
  if (!entries.length) return null;
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
        {description ? <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p> : null}
      </div>
      <div className="space-y-4">{entries.map((entry) => renderCard(entry))}</div>
    </section>
  );
}

export default function AdminVotesDashboard() {
  const [polls, setPolls] = useState<AdminPollEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null);

  const [showBuilder, setShowBuilder] = useState(false);
  const [editPollId, setEditPollId] = useState<string | null>(null);
  const [editState, setEditState] = useState<BuilderState | null>(null);
  const [editCanChangeQuestions, setEditCanChangeQuestions] = useState(true);
  const [editLoading, setEditLoading] = useState(false);
  const [resultsPollId, setResultsPollId] = useState<string | null>(null);
  const [resultsPollTitle, setResultsPollTitle] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const builderRef = useRef<HTMLDivElement>(null);

  const fetchPolls = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/votes', { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Admin access required.');
        return;
      }
      setPolls(await res.json());
    } catch {
      setError('Failed to load polls.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPolls();
  }, [fetchPolls]);

  useEffect(() => {
    if (!showBuilder) return;
    setSuggestionsLoading(true);
    fetch('/api/suggestions')
      .then((r) => r.json())
      .then((data: Suggestion[]) =>
        setSuggestions(data.filter((s) => (s.endorsers?.length ?? 0) >= 3 && s.voteTag !== 'vote_passed' && s.voteTag !== 'vote_failed')),
      )
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, [showBuilder]);

  useEffect(() => {
    if (showBuilder && builderRef.current) {
      builderRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showBuilder]);

  async function doAction(pollId: string, body: object) {
    setActionErrors((prev) => {
      const next = { ...prev };
      delete next[pollId];
      return next;
    });
    setActionBusy(pollId);
    try {
      const res = await fetch(`/api/votes/${pollId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setActionErrors((prev) => ({
          ...prev,
          [pollId]: (d as { error?: string }).error ?? 'Action failed.',
        }));
      } else {
        await fetchPolls();
      }
    } catch {
      setActionErrors((prev) => ({ ...prev, [pollId]: 'Network error — try again.' }));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleDelete(pollId: string) {
    setActionBusy(pollId);
    try {
      const res = await fetch(`/api/votes/${pollId}`, { method: 'DELETE' });
      if (!res.ok) {
        setActionErrors((prev) => ({ ...prev, [pollId]: 'Failed to delete poll.' }));
      } else {
        setDeleteConfirm(null);
        await fetchPolls();
      }
    } catch {
      setActionErrors((prev) => ({ ...prev, [pollId]: 'Network error — try again.' }));
    } finally {
      setActionBusy(null);
    }
  }

  async function openEdit(pollId: string) {
    setEditLoading(true);
    setEditPollId(pollId);
    try {
      const res = await fetch(`/api/admin/votes/${pollId}/form`);
      if (!res.ok) throw new Error('Failed to load poll.');
      const data = await res.json();
      setEditState(data.builderState);
      setEditCanChangeQuestions(Boolean(data.canEditQuestions));
    } catch {
      setEditPollId(null);
      setError('Failed to load poll for editing.');
    } finally {
      setEditLoading(false);
    }
  }

  function closeEdit() {
    setEditPollId(null);
    setEditState(null);
  }

  function renderPollCard(entry: AdminPollEntry) {
    return (
      <AdminPollCard
        key={entry.poll.id}
        entry={entry}
        busy={actionBusy === entry.poll.id}
        error={actionErrors[entry.poll.id] ?? null}
        deleteConfirm={deleteConfirm === entry.poll.id}
        closeConfirm={closeConfirm === entry.poll.id}
        onClearError={() =>
          setActionErrors((prev) => {
            const next = { ...prev };
            delete next[entry.poll.id];
            return next;
          })
        }
        onDeleteConfirm={() => setDeleteConfirm(entry.poll.id)}
        onDeleteCancel={() => setDeleteConfirm(null)}
        onDelete={() => void handleDelete(entry.poll.id)}
        onCloseConfirm={() => setCloseConfirm(entry.poll.id)}
        onCloseCancel={() => setCloseConfirm(null)}
        onAction={(body) => doAction(entry.poll.id, body)}
        onEdit={() => void openEdit(entry.poll.id)}
        onViewResults={() => {
          setResultsPollId(entry.poll.id);
          setResultsPollTitle(entry.poll.title);
        }}
      />
    );
  }

  const draftPolls = polls.filter((e) => e.poll.status === 'draft');
  const livePolls = polls.filter((e) => e.poll.status === 'open');
  const closedPolls = polls.filter((e) => e.poll.status === 'closed');

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {process.env.NEXT_PUBLIC_VOTES_TEST_MODE === 'true' && (
        <div className="mb-5 rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 text-sm text-amber-400 font-medium">
          Test mode — Discord notifications are suppressed
        </div>
      )}

      {successMessage ? (
        <div className="mb-5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3 text-sm text-emerald-400 flex items-start justify-between gap-3">
          <span>{successMessage}</span>
          <button type="button" className="text-emerald-300/80 hover:text-emerald-200 shrink-0" onClick={() => setSuccessMessage(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ) : null}

      <SectionHeader
        title="Admin · Votes"
        subtitle="Create drafts privately, then publish when members should see polls on the Vote page"
        actions={!showBuilder ? <Button onClick={() => setShowBuilder(true)}>+ New poll</Button> : null}
      />

      {showBuilder ? (
        <div ref={builderRef} className="mb-8">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <CreatePollWizard
                suggestions={suggestions}
                suggestionsLoading={suggestionsLoading}
                onCancel={() => setShowBuilder(false)}
                onCreated={(result) => {
                  setShowBuilder(false);
                  setSuccessMessage(
                    result?.published
                      ? 'Poll published — members can see and respond on the Vote page.'
                      : 'Draft saved — only you see it here until you click Publish poll.',
                  );
                  void fetchPolls();
                }}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {editPollId && editState && !editLoading ? (
        <div className="mb-8">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <CreatePollWizard
                mode="edit"
                pollId={editPollId}
                initialState={editState}
                canEditQuestions={editCanChangeQuestions}
                suggestions={suggestions}
                suggestionsLoading={suggestionsLoading}
                onCancel={closeEdit}
                onCreated={closeEdit}
                onSaved={() => {
                  closeEdit();
                  void fetchPolls();
                }}
              />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {resultsPollId ? (
        <AdminPollResults
          pollId={resultsPollId}
          pollTitle={resultsPollTitle}
          onClose={() => setResultsPollId(null)}
        />
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 text-[var(--muted)] py-8">
          <span className="animate-spin text-lg">⟳</span>
          <span>Loading polls…</span>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-500/10 border border-red-500/25 px-5 py-4 text-red-400 text-sm">{error}</div>
      ) : polls.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-16 text-center space-y-3">
          <p className="text-base font-semibold text-[var(--text)]">No polls yet</p>
          <p className="text-sm text-[var(--muted)]">Save a draft to build privately, or publish when you are ready for members to vote.</p>
          <Button onClick={() => setShowBuilder(true)}>Create a poll</Button>
        </div>
      ) : (
        <div className="space-y-8">
          <PollListSection
            title="Drafts"
            description="Not visible on the Vote page — publish when ready."
            entries={draftPolls}
            renderCard={renderPollCard}
          />
          <PollListSection
            title="Live"
            description="Published and accepting responses on the Vote page."
            entries={livePolls}
            renderCard={renderPollCard}
          />
          <PollListSection
            title="Closed"
            description="No longer accepting responses."
            entries={closedPolls}
            renderCard={renderPollCard}
          />
        </div>
      )}
    </div>
  );
}
