'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { TEAM_NAMES } from '@/lib/constants/league';
import { getTeamLogoPath, getTeamColors } from '@/lib/utils/team-utils';
import { validateBallot } from '@/lib/rivalry/ballot';
import { isBeforeDeadline, deadlineLabel } from '@/lib/rivalry/deadline';
import type { RivalryCycle, RivalryPair } from '@/lib/rivalry/types';

// ─── rulebook excerpts ────────────────────────────────────────────────────────

const RULEBOOK = [
  {
    section: '4.6(c)',
    heading: 'Rivalry Week',
    text: 'The League will designate two (2) weeks of the Regular Season as "Rivalry Week." During Rivalry Week, each team will play its assigned Rival.',
  },
  {
    section: '4.6(d)',
    heading: 'Rival Determination: Rivalry Strength Budget System',
    text: '',
  },
  {
    section: '4.6(d)(2)',
    heading: 'Scores; Budget',
    text: 'Each team must assign each of the other eleven (11) teams a unique whole-number score from 1–100 ("Rivalry Strength Scores"). No number may be used more than once. The total of all Rivalry Strength Scores must equal 550. Each other team must receive at least one (1) point.',
  },
  {
    section: '4.6(d)(3)',
    heading: 'Blood Feuds',
    text: 'If two teams assign each other a score of 100, that matchup is automatically locked as a "Blood Feud." Blood Feuds cannot be overridden. Once locked, those teams are removed from further pairing.',
  },
  {
    section: '4.6(d)(4)',
    heading: 'Pairing Method',
    text: 'For every remaining pair of teams A and B, the "Combined Rivalry Strength" equals (A\'s score for B) + (B\'s score for A). All remaining possible pairings are ranked from highest to lowest Combined Rivalry Strength. Starting at the highest Combined Rivalry Strength, teams are paired off and removed from further pairing until every team has exactly one Rival.',
  },
];

// ─── types ───────────────────────────────────────────────────────────────────

type AuthState = {
  authenticated: boolean;
  isAdmin: boolean;
  claims?: { team?: string };
};

type TeamStatus = {
  teamId: string;
  submitted: boolean;
  submittedAt: string | null;
  reopened: boolean;
};

type ScoreEntry = { targetTeamId: string; score: number };

type StatusData = {
  cycle: RivalryCycle | null;
  submittedCount: number;
  totalTeams: number;
  teams: TeamStatus[];
  mySubmission: { submittedAt: string; scores: ScoreEntry[] } | null;
  adminSubmissions?: Array<{ teamId: string; scores: ScoreEntry[] }> | null;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function TeamLogo({ teamName, size = 48 }: { teamName: string; size?: number }) {
  const colors = getTeamColors(teamName);
  return (
    <div
      className="rounded-lg flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: colors.primary }}
    >
      <Image
        src={getTeamLogoPath(teamName)}
        alt={teamName}
        width={size}
        height={size}
        className="object-contain"
        style={{ maxWidth: size * 0.85, maxHeight: size * 0.85 }}
      />
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function RulebookSection() {
  return (
    <div className="mb-8 space-y-3">
      <p className="text-sm font-semibold text-[var(--muted)] uppercase tracking-widest mb-3">Rulebook</p>
      {RULEBOOK.map((r) => (
        <div key={r.section} className="rounded-[var(--radius-card)] border border-[var(--border)] p-4 bg-[var(--surface)]">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: '#fff' }}>
              {r.section}
            </span>
            <span className="text-sm font-semibold text-[var(--text)]">{r.heading}</span>
          </div>
          {r.text && <p className="text-sm text-[var(--muted)] leading-relaxed">{r.text}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── budget tracker (sticky) ─────────────────────────────────────────────────

function BudgetTracker({ validation }: { validation: ReturnType<typeof validateBallot> }) {
  const { total, teamsScored, teamsRemaining, uniqueCount, duplicateMap, invalidIds, budgetError, impossibleBudget } = validation;
  const BUDGET = 550;
  const OTHERS = 11;
  const pct = Math.min(100, (total / BUDGET) * 100);
  const over = total > BUDGET;
  const exact = total === BUDGET;
  const barColor = over ? 'var(--danger)' : exact ? '#22c55e' : 'var(--accent)';
  const dupCount = Object.keys(duplicateMap).length;

  return (
    <div
      className="sticky top-0 z-20 rounded-b-xl border border-[var(--border)] shadow-lg px-4 py-3"
      style={{ background: 'var(--surface)', borderTop: 'none' }}
    >
      <div className="w-full rounded-full overflow-hidden mb-2" style={{ height: 6, background: 'var(--border)' }}>
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 items-center">
        <span className="text-sm font-semibold" style={{ color: over ? 'var(--danger)' : exact ? '#22c55e' : 'var(--text)' }}>
          {total} / {BUDGET} pts
          {budgetError && <span className="ml-1 font-normal text-xs">({budgetError})</span>}
        </span>

        <span className="text-sm text-[var(--muted)]">
          <span className="text-[var(--text)] font-medium">{teamsScored}</span>/{OTHERS} teams scored
          {teamsRemaining > 0 && <span> · {teamsRemaining} left</span>}
        </span>

        <span className="text-sm text-[var(--muted)]">
          <span className="text-[var(--text)] font-medium">{uniqueCount}</span>/{teamsScored || OTHERS} unique
          {dupCount > 0 && (
            <span className="ml-1 text-xs font-medium" style={{ color: 'var(--danger)' }}>
              · {dupCount} dup{dupCount !== 1 ? 's' : ''}
            </span>
          )}
          {invalidIds.length > 0 && (
            <span className="ml-1 text-xs font-medium" style={{ color: 'var(--danger)' }}>
              · {invalidIds.length} invalid
            </span>
          )}
        </span>

        {impossibleBudget && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#7c3aed22', color: '#a78bfa' }}>
            ⚠ Budget unreachable with remaining slots
          </span>
        )}
      </div>
    </div>
  );
}

// ─── team score card ──────────────────────────────────────────────────────────

function TeamScoreCard({
  teamName, score, onChange, duplicateOf, isInvalid, isBloodFeud,
}: {
  teamName: string;
  score: string;
  onChange: (v: string) => void;
  duplicateOf: string[];
  isInvalid: boolean;
  isBloodFeud: boolean;
}) {
  const colors = getTeamColors(teamName);
  const hasError = isInvalid || duplicateOf.length > 0;

  return (
    <div
      className="relative rounded-[var(--radius-card)] border overflow-hidden transition-shadow"
      style={{
        borderColor: hasError ? 'var(--danger)' : isBloodFeud ? '#f59e0b' : 'var(--border)',
        background: 'var(--surface)',
        boxShadow: isBloodFeud ? '0 0 0 1px #f59e0b33' : undefined,
      }}
    >
      <div style={{ height: 4, background: colors.primary }} />
      <div className="p-3 flex items-center gap-3">
        <TeamLogo teamName={teamName} size={44} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text)] leading-tight truncate">{teamName}</p>
          {isBloodFeud && duplicateOf.length === 0 && (
            <p className="text-xs mt-0.5" style={{ color: '#f59e0b' }}>
              🔥 Blood Feud if they also give you 100
            </p>
          )}
          {duplicateOf.length > 0 && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--danger)' }}>
              {isBloodFeud ? '⚠ Duplicate 100 — ' : 'Same score as '}{duplicateOf.join(', ')}
            </p>
          )}
          {isInvalid && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--danger)' }}>
              Must be 1–100
            </p>
          )}
        </div>
        <input
          type="number"
          min={1}
          max={100}
          step={1}
          value={score}
          onChange={(e) => onChange(e.target.value)}
          placeholder="—"
          className="w-16 text-center rounded-lg text-sm font-bold py-2 px-1 border transition-colors focus:outline-none focus:border-[var(--accent)]"
          style={{
            background: 'var(--surface-strong, var(--bg))',
            color: 'var(--text)',
            borderColor: hasError ? 'var(--danger)' : isBloodFeud ? '#f59e0b' : 'var(--border)',
          }}
          aria-label={`Score for ${teamName}`}
          aria-invalid={hasError}
        />
      </div>
    </div>
  );
}

// ─── submission form ──────────────────────────────────────────────────────────

function SubmissionForm({
  myTeam,
  initialDraft,
  isEdit,
  onSubmitSuccess,
  onCancelEdit,
}: {
  myTeam: string;
  initialDraft?: Record<string, string>;
  isEdit?: boolean;
  onSubmitSuccess: () => void;
  onCancelEdit?: () => void;
}) {
  const otherTeams = useMemo(() => TEAM_NAMES.filter((t) => t !== myTeam), [myTeam]);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    initialDraft ?? Object.fromEntries(otherTeams.map((t) => [t, ''])),
  );
  const [showReview, setShowReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validation = useMemo(() => validateBallot(draft, otherTeams), [draft, otherTeams]);

  const updateScore = useCallback((teamId: string, val: string) => {
    setDraft((prev) => ({ ...prev, [teamId]: val }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!validation.isValid) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const scores = otherTeams.map((t) => ({ targetTeamId: t, score: Number(draft[t]) }));
      const res = await fetch('/api/rivalries/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scores }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSubmitError(data.error ?? 'Submission failed. Try again.');
      } else {
        onSubmitSuccess();
      }
    } catch {
      setSubmitError('Network error. Check your connection.');
    } finally {
      setSubmitting(false);
    }
  }, [validation.isValid, draft, otherTeams, onSubmitSuccess]);

  const reviewList = useMemo(() => {
    if (!validation.isValid) return [];
    return otherTeams
      .map((t) => ({ teamId: t, score: Number(draft[t]) }))
      .sort((a, b) => b.score - a.score);
  }, [validation.isValid, draft, otherTeams]);

  if (showReview && validation.isValid) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="mb-4">
          <button
            onClick={() => setShowReview(false)}
            className="text-sm font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
            style={{ color: 'var(--accent)' }}
          >
            ← Back to edit
          </button>
        </div>
        <Card>
          <CardHeader>
            <p className="font-semibold text-[var(--text)]">
              {isEdit ? 'Review Your Updated Rivalry Scores' : 'Review Your Rivalry Scores'}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 mb-4">
              {reviewList.map(({ teamId, score }) => (
                <div key={teamId} className="flex items-center gap-3">
                  <TeamLogo teamName={teamId} size={32} />
                  <span className="flex-1 text-sm text-[var(--text)] truncate">{teamId}</span>
                  <span
                    className="text-sm font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: score === 100 ? '#f59e0b22' : 'var(--surface-strong, var(--border))',
                      color: score === 100 ? '#f59e0b' : 'var(--text)',
                    }}
                  >
                    {score}{score === 100 && ' 🔥'}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-xs text-[var(--muted)] flex gap-4 mb-4 pb-4 border-b border-[var(--border)]">
              <span>Total: <strong className="text-[var(--text)]">550 / 550</strong></span>
              <span>Duplicates: <strong className="text-[var(--text)]">0</strong></span>
              <span>Invalid: <strong className="text-[var(--text)]">0</strong></span>
            </div>
            <p className="text-xs text-[var(--muted)] mb-4">
              {isEdit
                ? 'This will replace your previous submission. You can edit again before the deadline.'
                : 'Once submitted, your rankings are locked unless you edit before the deadline or commissioners reopen your submission.'}
            </p>
            {submitError && (
              <p className="text-sm mb-3" style={{ color: 'var(--danger)' }}>{submitError}</p>
            )}
            <Button variant="primary" fullWidth disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Submitting…' : isEdit ? 'Update Rivalry Scores' : 'Submit Rivalry Scores'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <BudgetTracker validation={validation} />

      <div className="mt-4 mb-6">
        {isEdit && onCancelEdit && (
          <button
            onClick={onCancelEdit}
            className="text-sm font-medium underline underline-offset-2 mb-3 block transition-opacity hover:opacity-70"
            style={{ color: 'var(--accent)' }}
          >
            ← Cancel edit
          </button>
        )}
        <h3 className="text-lg font-semibold text-[var(--text)] mb-1">
          {isEdit ? 'Edit Your Rivalry Strength Scores' : 'Assign Your Rivalry Strength Scores'}
        </h3>
        <p className="text-sm text-[var(--muted)] leading-relaxed">
          Give each other team a unique whole-number score from 1–100. Higher scores mean you want that team as your rival more.
          Your scores must total exactly <strong className="text-[var(--text)]">550</strong>.
          No duplicate scores. Every team must receive at least 1 point.
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
          Submissions lock on <strong className="text-[var(--text)]">{deadlineLabel()}</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {otherTeams.map((team) => (
          <TeamScoreCard
            key={team}
            teamName={team}
            score={draft[team] ?? ''}
            onChange={(v) => updateScore(team, v)}
            duplicateOf={(validation.duplicateMap[team] ?? []).filter((d) => d !== team)}
            isInvalid={validation.invalidIds.includes(team)}
            isBloodFeud={validation.bloodFeuds.includes(team)}
          />
        ))}
      </div>

      <div className="flex justify-end">
        <Button variant="primary" size="lg" disabled={!validation.isValid} onClick={() => setShowReview(true)}>
          Review Rivalry Scores →
        </Button>
      </div>
      {!validation.isValid && (
        <p className="text-xs text-right mt-1" style={{ color: 'var(--muted)' }}>
          Fix all errors above before you can review.
        </p>
      )}
    </div>
  );
}

// ─── submitted view ───────────────────────────────────────────────────────────

function SubmittedView({
  mySubmission,
  submittedCount,
  totalTeams,
  cycleOpen,
  onEdit,
}: {
  mySubmission: { submittedAt: string; scores: ScoreEntry[] };
  submittedCount: number;
  totalTeams: number;
  cycleOpen: boolean;
  onEdit: () => void;
}) {
  const sorted = [...mySubmission.scores].sort((a, b) => b.score - a.score);
  const canEdit = cycleOpen && isBeforeDeadline();

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-xl border border-[var(--border)] p-5 mb-6 text-center" style={{ background: 'var(--surface)' }}>
        <p className="text-2xl font-bold text-[var(--text)] mb-1">Your Rivalry Scores Have Been Submitted</p>
        <p className="text-sm text-[var(--muted)]">Submitted {fmtDate(mySubmission.submittedAt)}</p>
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border" style={{ borderColor: 'var(--border)' }}>
          <span className="font-bold text-[var(--text)]">{submittedCount}</span>
          <span className="text-[var(--muted)]">of {totalTeams} teams submitted</span>
        </div>
        {canEdit && (
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Edit My Submission
            </Button>
            <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
              Edits close on {deadlineLabel()}.
            </p>
          </div>
        )}
        {cycleOpen && !canEdit && (
          <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
            The submission deadline has passed. Your ballot is locked.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <p className="font-semibold text-[var(--text)]">Your Submitted Scores</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sorted.map(({ targetTeamId, score }) => (
              <div key={targetTeamId} className="flex items-center gap-3">
                <TeamLogo teamName={targetTeamId} size={36} />
                <span className="flex-1 text-sm text-[var(--text)] truncate">{targetTeamId}</span>
                <span
                  className="text-sm font-bold px-2.5 py-1 rounded-full"
                  style={{
                    background: score === 100 ? '#f59e0b22' : 'var(--surface-strong, var(--border))',
                    color: score === 100 ? '#f59e0b' : 'var(--text)',
                  }}
                >
                  {score}{score === 100 && ' 🔥'}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── published view ───────────────────────────────────────────────────────────

function PairCard({ pair }: { pair: RivalryPair }) {
  const aColors = getTeamColors(pair.teamAId);
  const bColors = getTeamColors(pair.teamBId);
  return (
    <div
      className="rounded-[var(--radius-card)] border overflow-hidden"
      style={{
        borderColor: pair.isBloodFeud ? '#f59e0b' : 'var(--border)',
        boxShadow: pair.isBloodFeud ? '0 0 0 1px #f59e0b55' : undefined,
        background: 'var(--surface)',
      }}
    >
      {pair.isBloodFeud && (
        <div className="text-center py-1.5 text-xs font-bold tracking-widest" style={{ background: '#f59e0b', color: '#000' }}>
          🔥 BLOOD FEUD 🔥
        </div>
      )}
      <div className="p-4 flex items-center gap-3">
        <div className="flex-1 flex flex-col items-center text-center gap-1.5">
          <div className="rounded-xl p-2" style={{ background: aColors.primary }}>
            <Image src={getTeamLogoPath(pair.teamAId)} alt={pair.teamAId} width={52} height={52} className="object-contain" />
          </div>
          <p className="text-xs font-semibold text-[var(--text)] leading-tight">{pair.teamAId}</p>
          <p className="text-xs text-[var(--muted)]">gave <strong className="text-[var(--text)]">{pair.teamAScoreForB}</strong></p>
        </div>
        <div className="text-center shrink-0">
          <p className="text-xs text-[var(--muted)] font-medium">vs</p>
          <p className="text-lg font-black text-[var(--text)]">{pair.combinedScore}</p>
          <p className="text-xs text-[var(--muted)]">combined</p>
        </div>
        <div className="flex-1 flex flex-col items-center text-center gap-1.5">
          <div className="rounded-xl p-2" style={{ background: bColors.primary }}>
            <Image src={getTeamLogoPath(pair.teamBId)} alt={pair.teamBId} width={52} height={52} className="object-contain" />
          </div>
          <p className="text-xs font-semibold text-[var(--text)] leading-tight">{pair.teamBId}</p>
          <p className="text-xs text-[var(--muted)]">gave <strong className="text-[var(--text)]">{pair.teamBScoreForA}</strong></p>
        </div>
      </div>
    </div>
  );
}

function PublishedView({ pairs }: { pairs: RivalryPair[] }) {
  return (
    <div>
      <div className="rounded-xl border border-[var(--border)] p-5 text-center mb-8" style={{ background: 'var(--surface)' }}>
        <p className="text-2xl font-bold text-[var(--text)] mb-1">Rivalries Are Locked</p>
        <p className="text-sm text-[var(--muted)]">
          These are permanent rivalries. Each team will face its rival during Rivalry Week.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {pairs.map((pair) => <PairCard key={`${pair.teamAId}|${pair.teamBId}`} pair={pair} />)}
      </div>
      <RulebookSection />
    </div>
  );
}

// ─── admin panel ──────────────────────────────────────────────────────────────

function downloadRivalryCSV(adminSubmissions: Array<{ teamId: string; scores: ScoreEntry[] }>) {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const subMap = new Map(adminSubmissions.map((s) => [s.teamId, s.scores]));
  const lines: string[] = [];

  // Section 1: score matrix — rows = submitter, columns = target team
  lines.push(q('RIVALRY SCORE MATRIX'));
  lines.push('');
  lines.push([q('Submitter'), ...TEAM_NAMES.map(q), q('Total')].join(','));
  for (const submitter of TEAM_NAMES) {
    const scores = subMap.get(submitter);
    const cells = TEAM_NAMES.map((target) => {
      if (target === submitter) return q('-');
      if (!scores) return q('not submitted');
      const entry = scores.find((s) => s.targetTeamId === target);
      return entry !== undefined ? String(entry.score) : q('');
    });
    const total = scores ? scores.reduce((s, e) => s + e.score, 0) : '';
    lines.push([q(submitter), ...cells, String(total)].join(','));
  }

  // Section 2: all pair combined scores, sorted desc (mirrors greedy algorithm input)
  lines.push('');
  lines.push('');
  lines.push(q('ALL PAIR COMBINED SCORES (sorted desc — greedy algorithm order)'));
  lines.push('');
  lines.push([q('Team A'), q('Team B'), q('A to B'), q('B to A'), q('Combined'), q('Blood Feud')].join(','));

  type PairRow = { a: string; b: string; aToB: number | null; bToA: number | null; combined: number; bf: boolean };
  const pairRows: PairRow[] = [];
  for (let i = 0; i < TEAM_NAMES.length; i++) {
    for (let j = i + 1; j < TEAM_NAMES.length; j++) {
      const a = TEAM_NAMES[i], b = TEAM_NAMES[j];
      const aToB = subMap.get(a)?.find((s) => s.targetTeamId === b)?.score ?? null;
      const bToA = subMap.get(b)?.find((s) => s.targetTeamId === a)?.score ?? null;
      pairRows.push({ a, b, aToB, bToA, combined: (aToB ?? 0) + (bToA ?? 0), bf: aToB === 100 && bToA === 100 });
    }
  }
  pairRows.sort((x, y) => {
    if (y.combined !== x.combined) return y.combined - x.combined;
    return Math.max(y.aToB ?? 0, y.bToA ?? 0) - Math.max(x.aToB ?? 0, x.bToA ?? 0);
  });
  for (const row of pairRows) {
    lines.push([
      q(row.a), q(row.b),
      row.aToB !== null ? String(row.aToB) : q('?'),
      row.bToA !== null ? String(row.bToA) : q('?'),
      String(row.combined),
      q(row.bf ? 'YES (Blood Feud)' : 'No'),
    ].join(','));
  }

  // UTF-8 BOM so Excel opens with correct encoding
  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rivalry-ballots-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function AdminAllBallots({ adminSubmissions }: { adminSubmissions: Array<{ teamId: string; scores: ScoreEntry[] }> }) {
  const [open, setOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  const subMap = useMemo(() =>
    new Map(adminSubmissions.map((s) => [s.teamId, [...s.scores].sort((a, b) => b.score - a.score)])),
    [adminSubmissions],
  );

  const current = selectedTeam ? subMap.get(selectedTeam) ?? [] : [];

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setOpen((p) => !p)}
          className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]"
        >
          <span
            className="inline-block w-4 h-4 rounded border flex items-center justify-center text-xs"
            style={{ borderColor: 'var(--border)' }}
          >
            {open ? '−' : '+'}
          </span>
          View All Submitted Ballots ({adminSubmissions.length})
        </button>
        {adminSubmissions.length > 0 && (
          <button
            onClick={() => downloadRivalryCSV(adminSubmissions)}
            className="text-xs px-2.5 py-1 rounded font-medium border transition-opacity hover:opacity-75"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            Download CSV
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-[var(--radius-card)] border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
          {/* Team picker */}
          <div className="flex flex-wrap gap-1.5 p-3 border-b border-[var(--border)]">
            {TEAM_NAMES.map((t) => {
              const hasSub = subMap.has(t);
              const isSelected = selectedTeam === t;
              return (
                <button
                  key={t}
                  disabled={!hasSub}
                  onClick={() => setSelectedTeam(isSelected ? null : t)}
                  className="text-xs px-2 py-1 rounded-full font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: isSelected ? 'var(--accent)' : 'var(--border)',
                    color: isSelected ? '#fff' : 'var(--text)',
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {/* Scores panel */}
          {selectedTeam && current.length > 0 && (
            <div className="p-3">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-widest mb-2">
                {selectedTeam} — Submitted Ballot
              </p>
              <div className="space-y-1.5">
                {current.map(({ targetTeamId, score }) => (
                  <div key={targetTeamId} className="flex items-center gap-2">
                    <TeamLogo teamName={targetTeamId} size={24} />
                    <span className="flex-1 text-xs text-[var(--text)] truncate">{targetTeamId}</span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: score === 100 ? '#f59e0b22' : 'var(--border)',
                        color: score === 100 ? '#f59e0b' : 'var(--text)',
                      }}
                    >
                      {score}{score === 100 && ' 🔥'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[var(--muted)] mt-2">
                Total: <strong className="text-[var(--text)]">
                  {current.reduce((s, e) => s + e.score, 0)}
                </strong>
              </p>
            </div>
          )}

          {!selectedTeam && (
            <p className="p-3 text-xs text-[var(--muted)]">Select a team above to view their ballot.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AdminPanel({
  cycle,
  teams,
  submittedCount,
  totalTeams,
  proposedPairs,
  adminSubmissions,
  onRefresh,
}: {
  cycle: RivalryCycle | null;
  teams: TeamStatus[];
  submittedCount: number;
  totalTeams: number;
  proposedPairs?: RivalryPair[];
  adminSubmissions?: Array<{ teamId: string; scores: ScoreEntry[] }> | null;
  onRefresh: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const act = useCallback(async (action: string, teamId?: string) => {
    setWorking(true);
    setMsg(null);
    try {
      const res = await fetch('/api/rivalries/admin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(teamId ? { teamId } : {}) }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setMsg({ text: `Done: ${action}.`, ok: true });
        onRefresh();
      } else {
        setMsg({ text: data.error ?? 'Action failed.', ok: false });
      }
    } catch {
      setMsg({ text: 'Network error.', ok: false });
    } finally {
      setWorking(false);
    }
  }, [onRefresh]);

  const status = cycle?.status ?? 'not_started';

  return (
    <div className="mt-10 pt-8 border-t border-[var(--border)]">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded" style={{ background: 'var(--danger)', color: '#fff' }}>
          Commissioner Only
        </span>
        <p className="text-sm font-semibold text-[var(--text)]">Rivalry Administration</p>
      </div>

      {/* Status bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-[var(--muted)]">
          Cycle: <strong className="text-[var(--text)]">{status}</strong>
        </span>
        <span className="text-sm text-[var(--muted)]">
          Submissions: <strong className="text-[var(--text)]">{submittedCount} / {totalTeams}</strong>
        </span>
        {cycle?.openedAt && <span className="text-xs text-[var(--muted)]">Opened {fmtDate(cycle.openedAt)}</span>}
        {cycle?.closedAt && <span className="text-xs text-[var(--muted)]">Closed {fmtDate(cycle.closedAt)}</span>}
        {cycle?.publishedAt && <span className="text-xs text-[var(--muted)]">Published {fmtDate(cycle.publishedAt)}</span>}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-5">
        {status !== 'published' && (
          <Button
            variant="secondary"
            size="sm"
            disabled={working || submittedCount < totalTeams}
            onClick={() => act('calculate')}
          >
            {submittedCount < totalTeams
              ? `Calculate Pairings (${totalTeams - submittedCount} of ${totalTeams} submitted)`
              : 'Calculate Pairings'}
          </Button>
        )}
        {status === 'calculated' && (
          <Button variant="primary" size="sm" disabled={working} onClick={() => act('publish')}>
            Publish Rivalries — Reveal to League
          </Button>
        )}
      </div>

      {/* Proposed pairings preview — visible only to admin before publish */}
      {status === 'calculated' && proposedPairs && proposedPairs.length > 0 && (
        <div className="mb-5 rounded-[var(--radius-card)] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <p className="text-sm font-semibold text-[var(--text)] mb-1">Proposed Pairings</p>
          <p className="text-xs text-[var(--muted)] mb-3">
            These are not visible to other managers yet. Hit &quot;Publish&quot; above to reveal them to the league.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {proposedPairs.map((pair) => <PairCard key={`${pair.teamAId}|${pair.teamBId}`} pair={pair} />)}
          </div>
        </div>
      )}

      {msg && (
        <p className="text-sm mb-4 px-3 py-2 rounded-lg border" style={{
          color: msg.ok ? '#22c55e' : 'var(--danger)',
          borderColor: msg.ok ? '#22c55e44' : 'var(--danger)',
          background: msg.ok ? '#22c55e11' : 'var(--danger)11',
        }}>
          {msg.text}
        </p>
      )}

      {/* Submission status table */}
      <Card>
        <CardHeader>
          <p className="font-semibold text-[var(--text)] text-sm">Submission Status</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="px-4 py-2.5 text-left font-semibold text-[var(--muted)] text-xs uppercase tracking-wider">Team</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[var(--muted)] text-xs uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[var(--muted)] text-xs uppercase tracking-wider">Submitted</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-[var(--muted)] text-xs uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.teamId} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <TeamLogo teamName={t.teamId} size={28} />
                        <span className="text-[var(--text)] font-medium text-xs">{t.teamId}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {t.reopened ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#f59e0b22', color: '#f59e0b' }}>Reopened</span>
                      ) : t.submitted ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#22c55e22', color: '#22c55e' }}>Submitted</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--border)', color: 'var(--muted)' }}>Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--muted)]">
                      {t.submittedAt ? fmtDate(t.submittedAt) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      {status === 'open' && t.submitted && !t.reopened && (
                        <button
                          disabled={working}
                          onClick={() => act('reopen-submission', t.teamId)}
                          className="text-xs underline underline-offset-2 transition-opacity hover:opacity-70 disabled:opacity-40"
                          style={{ color: 'var(--accent)' }}
                        >
                          Reopen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* All submitted ballots (collapsible, always visible to admin) */}
      {adminSubmissions && adminSubmissions.length > 0 && (
        <AdminAllBallots adminSubmissions={adminSubmissions} />
      )}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function RivalriesPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [pairs, setPairs] = useState<RivalryPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [authRes, statusRes] = await Promise.all([
        fetch('/api/auth/me').then((r) => r.json() as Promise<AuthState>),
        fetch('/api/rivalries/status').then((r) => r.json() as Promise<StatusData>),
      ]);
      setAuth(authRes);
      setStatusData(statusRes);

      const cs = statusRes.cycle?.status;
      if (cs === 'published' || cs === 'calculated') {
        const pairRes = await fetch('/api/rivalries/pairings').then((r) =>
          r.ok ? (r.json() as Promise<{ pairs?: RivalryPair[] }>) : { pairs: [] },
        );
        setPairs((pairRes as { pairs?: RivalryPair[] }).pairs ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Rivalry Selection" />
        <div className="text-center py-16 text-[var(--muted)]">Loading…</div>
      </div>
    );
  }

  const cycle = statusData?.cycle ?? null;
  const myTeam = auth?.claims?.team ?? null;
  const isAdmin = auth?.isAdmin ?? false;
  const status = cycle?.status ?? 'not_started';
  const teams = statusData?.teams ?? [];
  const submittedCount = statusData?.submittedCount ?? 0;
  const totalTeams = statusData?.totalTeams ?? 12;
  const mySubmission = statusData?.mySubmission ?? null;
  const adminSubmissions = statusData?.adminSubmissions ?? null;
  const isPublished = status === 'published';
  // Pairings are calculated but not yet revealed to the league
  const awaitingReveal = status === 'calculated';

  const initialEditDraft: Record<string, string> | undefined = mySubmission
    ? Object.fromEntries(mySubmission.scores.map((s) => [s.targetTeamId, String(s.score)]))
    : undefined;

  const adminPanel = isAdmin ? (
    <AdminPanel
      cycle={cycle}
      teams={teams}
      submittedCount={submittedCount}
      totalTeams={totalTeams}
      proposedPairs={pairs.length > 0 ? pairs : undefined}
      adminSubmissions={adminSubmissions}
      onRefresh={fetchAll}
    />
  ) : null;

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader
        title="Rivalry Selection"
        subtitle="Permanent rivalry pairings — determined once, locked forever."
      />

      {/* ── Published: show results to everyone ── */}
      {isPublished && (
        <>
          <PublishedView pairs={pairs} />
          {adminPanel}
        </>
      )}

      {/* ── Pre-publish: submission flow ── */}
      {!isPublished && (
        <>
          {/* Not logged in */}
          {!auth?.authenticated && (
            <div className="max-w-2xl mx-auto">
              <div className="rounded-xl border border-[var(--border)] p-6 text-center mb-8" style={{ background: 'var(--surface)' }}>
                <p className="text-lg font-semibold text-[var(--text)] mb-1">Submit Your Rivalry Scores</p>
                <p className="text-sm text-[var(--muted)] mb-4">
                  Log in with your team PIN to assign your Rivalry Strength Scores.
                  You can edit your ballot any time before <strong>{deadlineLabel()}</strong>.
                </p>
                <Button variant="primary" onClick={() => { window.location.href = '/login'; }}>
                  Log In to Submit
                </Button>
              </div>
              <RulebookSection />
            </div>
          )}

          {/* Logged in: show form or submitted view */}
          {auth?.authenticated && myTeam && (
            <>
              {/* Awaiting reveal notice (above the ballot, not instead of it) */}
              {awaitingReveal && (
                <div
                  className="max-w-xl mx-auto mb-6 rounded-xl border p-4 text-center text-sm"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <p className="font-semibold text-[var(--text)] mb-0.5">Pairings are being finalized</p>
                  <p className="text-[var(--muted)]">Commissioners are reviewing the results. The reveal is coming soon.</p>
                </div>
              )}

              {/* Form — first-time submit or editing */}
              {(!mySubmission || editing) && (
                <SubmissionForm
                  myTeam={myTeam}
                  initialDraft={editing ? initialEditDraft : undefined}
                  isEdit={editing}
                  onSubmitSuccess={() => { setEditing(false); fetchAll(); }}
                  onCancelEdit={editing ? () => setEditing(false) : undefined}
                />
              )}

              {/* Submitted view */}
              {mySubmission && !editing && (
                <SubmittedView
                  mySubmission={mySubmission}
                  submittedCount={submittedCount}
                  totalTeams={totalTeams}
                  cycleOpen={!awaitingReveal}
                  onEdit={() => setEditing(true)}
                />
              )}
            </>
          )}

          {adminPanel}
        </>
      )}
    </div>
  );
}
