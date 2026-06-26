'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { readableAccentOnDark } from '@/lib/trades/trade-card-model';
import { getTeamColors } from '@/lib/utils/team-utils';
import {
  BroadcastPanel,
  BroadcastSubmitButton,
  broadcastBodyTextStyle,
  broadcastFaintTextStyle,
  broadcastMutedTextStyle,
} from '@/components/ui/BroadcastPanel';
import { categoryAccent } from '@/lib/suggestions/category-accents';
import { SuggestionStatusBadge, TeamTagBadge } from '@/components/suggestions/SuggestionStatusBadge';

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
        <p style={broadcastMutedTextStyle}>Loading…</p>
      </div>
    );
  }

  if (error || !suggestion) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Suggestion" />
        <BroadcastPanel title="Error" accent="#ef4444">
          <p className="text-sm text-[var(--danger)]">{error || 'Suggestion not found'}</p>
          <Link href="/suggestions" className="mt-4 inline-block text-sm underline" style={broadcastMutedTextStyle}>
            ← Back to Suggestions
          </Link>
        </BroadcastPanel>
      </div>
    );
  }

  const s = suggestion;
  const isAccepted = s.status === 'accepted';
  const isVague = Boolean(s.vague);
  const eligibleEndorsers = (s.endorsers || []).filter((t) => t !== s.proposerTeam);
  const eligibleCount = eligibleEndorsers.length;
  const needsMore = Math.max(0, ENDORSEMENT_THRESHOLD - eligibleCount);
  const isBallotEligible = eligibleCount >= ENDORSEMENT_THRESHOLD;
  const myEndorsed = !!(auth && myTeam && s.endorsers && s.endorsers.includes(myTeam));
  const canEndorse = !isVague && !s.voteTag && s.proposerTeam !== myTeam;
  const accent = categoryAccent(s.category);

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

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title={getSuggestionLabel(s)} />

      <div className="mb-4">
        <Link href="/suggestions" className="text-sm underline" style={broadcastMutedTextStyle}>
          ← Back to Suggestions
        </Link>
      </div>

      <BroadcastPanel
        title="Proposal"
        accent={accent}
        meta={new Date(s.createdAt).toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}
        bodyClassName="space-y-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          {s.category ? <SuggestionStatusBadge variant="category">{s.category}</SuggestionStatusBadge> : null}
          {s.voteTag === 'voted_on' ? <SuggestionStatusBadge variant="voted_on">Voted On</SuggestionStatusBadge> : null}
          {s.voteTag === 'vote_passed' ? <SuggestionStatusBadge variant="vote_passed">Vote Passed</SuggestionStatusBadge> : null}
          {s.voteTag === 'vote_failed' ? <SuggestionStatusBadge variant="vote_failed">Vote Failed</SuggestionStatusBadge> : null}
          {isVague ? <SuggestionStatusBadge variant="vague">Needs Clarification</SuggestionStatusBadge> : null}
          {isBallotEligible && !s.voteTag ? <SuggestionStatusBadge variant="ballot">Ballot Eligible</SuggestionStatusBadge> : null}
        </div>

        <div
          className="rounded-xl p-4"
          style={{ background: 'var(--panel-tint-soft)', boxShadow: 'inset 0 0 0 1px var(--panel-hairline)' }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <span className="text-2xl font-extrabold tabular-nums" style={broadcastBodyTextStyle}>
                {eligibleCount}/{ENDORSEMENT_THRESHOLD}
              </span>
              <span className="text-sm ml-2" style={broadcastMutedTextStyle}>
                endorsements
              </span>
            </div>
            {needsMore > 0 ? (
              <span className="text-sm" style={broadcastMutedTextStyle}>
                Needs {needsMore} more
              </span>
            ) : (
              <span className="text-sm font-medium" style={{ color: '#86efac' }}>
                ✓ Ballot eligible
              </span>
            )}
          </div>
        </div>

        <div>
          {isAccepted ? <div className="mb-2">✅</div> : null}
          {String(s.content || '')
            .split('\n')
            .map((ln, i) => {
              const m = ln.match(/^(Rule|Effective|Proposal|Issue|How it fixes|Conclusion):\s*(.*)$/i);
              if (m) {
                return (
                  <div key={i} className="text-sm leading-5 mb-1" style={broadcastBodyTextStyle}>
                    <strong style={broadcastMutedTextStyle}>{m[1]}:</strong> {m[2]}
                  </div>
                );
              }
              return (
                <div key={i} className="text-sm leading-5 mb-1" style={broadcastBodyTextStyle}>
                  {ln}
                </div>
              );
            })}
        </div>

        {isAccepted ? (
          <div className="text-xs" style={broadcastFaintTextStyle}>
            Marked added{s.resolvedAt ? ` on ${new Date(s.resolvedAt).toLocaleDateString()}` : ''}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 items-center">
          {s.proposerTeam ? (
            <TeamTagBadge
              team={`Proposed by ${s.proposerTeam}`}
              color={readableAccentOnDark(getTeamColors(s.proposerTeam))}
            />
          ) : null}
          {s.endorsers && s.endorsers.length > 0 ? (
            <span className="text-xs uppercase tracking-wider" style={broadcastFaintTextStyle}>
              Endorsed by
            </span>
          ) : null}
          {s.endorsers?.map((t) => (
            <TeamTagBadge key={t} team={t} color={readableAccentOnDark(getTeamColors(t))} />
          ))}
        </div>

        {auth ? (
          <div className="pt-4" style={{ borderTop: '1px solid var(--panel-hairline)' }}>
            <BroadcastSubmitButton accent={accent} disabled={endorseBusy || !canEndorse} type="button" onClick={handleEndorse}>
              ⭐ {myEndorsed ? 'Unendorse' : 'Endorse'}
            </BroadcastSubmitButton>
          </div>
        ) : null}
      </BroadcastPanel>
    </div>
  );
}
