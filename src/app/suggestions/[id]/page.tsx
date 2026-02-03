'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { getTeamColorStyle } from '@/lib/utils/team-utils';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

type Suggestion = {
  id: string;
  title?: string;
  content: string;
  category?: string;
  createdAt: string;
  status?: 'draft' | 'open' | 'accepted' | 'rejected';
  resolvedAt?: string;
  sponsorTeam?: string;
  proposerTeam?: string;
  vague?: boolean;
  endorsers?: string[];
  voteTag?: 'voted_on' | 'vote_passed' | 'vote_failed';
  groupId?: string;
  groupPos?: number;
  displayNumber?: number;
  ballotForced?: boolean;
};

const ENDORSEMENT_THRESHOLD = 3;

// Helper to format suggestion display label
function getSuggestionLabel(s: Suggestion): string {
  if (s.title && s.title.trim()) return s.title;
  if (s.displayNumber) return `Suggestion ${String(s.displayNumber).padStart(4, '0')}`;
  return `Suggestion #${s.id.slice(0, 8)}`;
}

export default function SuggestionDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState(false);
  const [myTeam, setMyTeam] = useState<string | null>(null);
  const [endorseBusy, setEndorseBusy] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('No suggestion ID provided');
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/suggestions', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load suggestions');
        const data = (await res.json()) as Suggestion[];
        const found = data.find((s) => s.id === id);
        if (!found) {
          setError('Suggestion not found');
        } else {
          setSuggestion(found);
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to load suggestion';
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    load();

    // Check auth
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        setAuth(Boolean(j?.authenticated));
        setMyTeam((j?.claims?.team as string) || null);
      })
      .catch(() => {
        setAuth(false);
        setMyTeam(null);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Suggestion" />
        <p className="text-[var(--muted)]">Loading…</p>
      </div>
    );
  }

  if (error || !suggestion) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Suggestion" />
        <Card>
          <CardContent>
            <p className="text-[var(--danger)]">{error || 'Suggestion not found'}</p>
            <Link href="/suggestions" className="mt-4 inline-block">
              <Button variant="ghost">← Back to Suggestions</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = suggestion;
  const isAccepted = s.status === 'accepted';
  const isVague = Boolean(s.vague);

  // Calculate eligible endorsement count (exclude proposer)
  const eligibleEndorsers = (s.endorsers || []).filter((t) => t !== s.proposerTeam);
  const eligibleCount = eligibleEndorsers.length;
  const needsMore = Math.max(0, ENDORSEMENT_THRESHOLD - eligibleCount);
  const isBallotEligible = eligibleCount >= ENDORSEMENT_THRESHOLD;

  const myEndorsed = !!(auth && myTeam && s.endorsers && s.endorsers.includes(myTeam));
  const canEndorse = !isVague && !s.voteTag && s.proposerTeam !== myTeam;

  async function handleEndorse() {
    if (!auth || !myTeam || !canEndorse || !s) return;
    setEndorseBusy(true);
    try {
      const res = await fetch('/api/me/suggestions/endorse', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ suggestionId: s.id, endorse: !myEndorsed }),
      });
      if (res.ok) {
        setSuggestion((prev) => {
          if (!prev) return prev;
          const arr = Array.isArray(prev.endorsers) ? [...prev.endorsers] : [];
          if (!myEndorsed) {
            if (!arr.includes(myTeam)) arr.push(myTeam);
          } else {
            const idx = arr.indexOf(myTeam);
            if (idx >= 0) arr.splice(idx, 1);
          }
          return { ...prev, endorsers: arr };
        });
      }
    } finally {
      setEndorseBusy(false);
    }
  }

  const proposerStyle = s.proposerTeam ? getTeamColorStyle(s.proposerTeam) : null;

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title={getSuggestionLabel(s)} />

      <div className="mb-4">
        <Link href="/suggestions">
          <Button variant="ghost">← Back to Suggestions</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-6">
          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="text-sm text-[var(--muted)]">
              {new Date(s.createdAt).toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {s.category && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] evw-surface text-[var(--text)]">
                  {s.category}
                </span>
              )}
              {s.voteTag === 'voted_on' && (
                <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#0b5f98', color: '#0b5f98' }}>
                  VOTED ON
                </span>
              )}
              {s.voteTag === 'vote_passed' && (
                <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#16a34a', color: '#16a34a' }}>
                  VOTE PASSED
                </span>
              )}
              {s.voteTag === 'vote_failed' && (
                <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#be161e', color: '#be161e' }}>
                  VOTE FAILED
                </span>
              )}
              {isVague && (
                <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
                  Needs Clarification
                </span>
              )}
              {isBallotEligible && !s.voteTag && (
                <span className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: '#16a34a', color: '#16a34a' }}>
                  BALLOT ELIGIBLE
                </span>
              )}
            </div>
          </div>

          {/* Endorsement counter */}
          <div className="mb-4 p-3 rounded-lg border border-[var(--border)] evw-surface">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-lg">
                  {eligibleCount}/{ENDORSEMENT_THRESHOLD}
                </span>
                <span className="text-sm text-[var(--muted)] ml-2">endorsements</span>
              </div>
              {needsMore > 0 ? (
                <span className="text-sm text-[var(--muted)]">Needs {needsMore} more</span>
              ) : (
                <span className="text-sm text-green-600 font-medium">✓ Ballot eligible</span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="mb-4">
            {isAccepted && <div className="mb-2">✅</div>}
            {(() => {
              const lines = String(s.content || '').split('\n');
              const renderLine = (ln: string, key: number) => {
                const m = ln.match(/^(Rule|Effective|Proposal|Issue|How it fixes|Conclusion):\s*(.*)$/i);
                if (m) {
                  return (
                    <div key={key} className="text-[var(--text)] mb-1">
                      <strong>{m[1]}:</strong> {m[2]}
                    </div>
                  );
                }
                return (
                  <div key={key} className="text-[var(--text)] mb-1">
                    {ln}
                  </div>
                );
              };
              return <div>{lines.map((ln, i) => renderLine(ln, i))}</div>;
            })()}
          </div>

          {isAccepted && (
            <div className="mb-4 text-xs text-[var(--muted)]">
              Marked added{s.resolvedAt ? ` on ${new Date(s.resolvedAt).toLocaleDateString()}` : ''}
            </div>
          )}

          {/* Proposer and endorsers */}
          <div className="mb-4 flex flex-wrap gap-2 items-center">
            {s.proposerTeam && (
              <span
                className="text-xs px-2 py-0.5 rounded-full border"
                style={{
                  borderColor: proposerStyle?.backgroundColor as string,
                  color: proposerStyle?.backgroundColor as string,
                }}
              >
                Proposed by {s.proposerTeam}
              </span>
            )}
            {s.endorsers && s.endorsers.length > 0 && (
              <>
                <span className="text-xs text-[var(--muted)]">Endorsed by</span>
                {s.endorsers.map((t) => (
                  <span
                    key={t}
                    className="text-xs px-2 py-0.5 rounded-full border"
                    style={{
                      borderColor: getTeamColorStyle(t)?.backgroundColor as string,
                      color: getTeamColorStyle(t)?.backgroundColor as string,
                    }}
                  >
                    {t}
                  </span>
                ))}
              </>
            )}
          </div>

          {/* Endorse action */}
          {auth && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <Button
                onClick={handleEndorse}
                disabled={endorseBusy || !canEndorse}
                variant={myEndorsed ? 'primary' : 'ghost'}
                title={
                  !canEndorse
                    ? s.proposerTeam === myTeam
                      ? 'Cannot endorse your own proposal'
                      : 'Cannot endorse (voted on or needs clarification)'
                    : myEndorsed
                      ? 'Unendorse this suggestion'
                      : 'Endorse this suggestion'
                }
              >
                ⭐ {myEndorsed ? 'Unendorse' : 'Endorse'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
