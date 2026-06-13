'use client';

import Link from 'next/link';
import { getTeamColors } from '@/lib/utils/team-utils';
import { readableAccentOnDark } from '@/lib/trades/trade-card-model';
import {
  PANEL,
  broadcastChipButtonClass,
  broadcastMutedTextStyle,
  broadcastBodyTextStyle,
  broadcastFaintTextStyle,
} from '@/components/ui/BroadcastPanel';
import { categoryAccent } from '@/lib/suggestions/category-accents';
import { SuggestionStatusBadge, TeamTagBadge } from '@/components/suggestions/SuggestionStatusBadge';

export type SuggestionItem = {
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
};

function renderContent(content: string, isAccepted: boolean) {
  const lines = String(content || '').split('\n');
  return (
    <div>
      {isAccepted ? <div className="mb-1">✅</div> : null}
      {lines.map((ln, i) => {
        const m = ln.match(/^(Rule|Effective|Proposal|Issue|How it fixes|Conclusion):\s*(.*)$/i);
        if (m) {
          return (
            <div key={i} className="text-sm leading-5" style={broadcastBodyTextStyle}>
              <strong style={{ color: PANEL.muted }}>{m[1]}:</strong> {m[2]}
            </div>
          );
        }
        return (
          <div key={i} className="text-sm leading-5" style={broadcastBodyTextStyle}>
            {ln}
          </div>
        );
      })}
    </div>
  );
}

export default function SuggestionItemCard({
  suggestion: s,
  index,
  dimmed = false,
  auth,
  myTeam,
  isAdmin,
  tallies,
  myVotes,
  adminVotes,
  endorseBusy,
  endorsementThreshold,
  onVote,
  onEndorse,
}: {
  suggestion: SuggestionItem;
  index: number;
  dimmed?: boolean;
  auth: boolean;
  myTeam: string | null;
  isAdmin: boolean;
  tallies: Record<string, { up: number; down: number }>;
  myVotes: Record<string, 1 | -1>;
  adminVotes: Record<string, { up: string[]; down: string[] }>;
  endorseBusy: string | null;
  endorsementThreshold: number;
  onVote: (id: string, value: 1 | -1 | 0) => void;
  onEndorse: (id: string, endorse: boolean) => void;
}) {
  const accent = categoryAccent(s.category);
  const isAccepted = s.status === 'accepted';
  const isVague = Boolean(s.vague);
  const myEndorsed = !!(auth && myTeam && s.endorsers && s.endorsers.includes(myTeam));
  const eligibleCount = (s.endorsers || []).filter((t) => t !== s.proposerTeam).length;
  const needsMore = Math.max(0, endorsementThreshold - eligibleCount);
  const isBallotEligible = eligibleCount >= endorsementThreshold;
  const canEndorse = !isVague && !s.voteTag && !(s.proposerTeam === myTeam);

  return (
    <div
      id={s.id}
      className={['rounded-xl p-4', dimmed ? 'opacity-60' : ''].filter(Boolean).join(' ')}
      style={{
        background: 'rgba(255,255,255,0.03)',
        boxShadow: `inset 0 0 0 1px ${PANEL.hairline}${isVague ? ', inset 0 0 0 1px rgba(245,158,11,0.35)' : ''}${isAccepted ? ', inset 0 0 0 1px rgba(34,197,94,0.25)' : ''}`,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <Link
          href={`/suggestions/${s.id}`}
          className="font-semibold hover:underline truncate"
          style={broadcastBodyTextStyle}
        >
          {s.title ? s.title : `Suggestion ${index + 1}`}
        </Link>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <SuggestionStatusBadge variant={isBallotEligible ? 'endorsement_ready' : 'endorsement'}>
            {eligibleCount}/{endorsementThreshold}
          </SuggestionStatusBadge>
          {s.category ? <SuggestionStatusBadge variant="category">{s.category}</SuggestionStatusBadge> : null}
          {s.voteTag === 'voted_on' ? <SuggestionStatusBadge variant="voted_on">Voted On</SuggestionStatusBadge> : null}
          {s.voteTag === 'vote_passed' ? <SuggestionStatusBadge variant="vote_passed">Vote Passed</SuggestionStatusBadge> : null}
          {s.voteTag === 'vote_failed' ? <SuggestionStatusBadge variant="vote_failed">Vote Failed</SuggestionStatusBadge> : null}
          {isVague ? <SuggestionStatusBadge variant="vague">Needs Clarification</SuggestionStatusBadge> : null}
        </div>
      </div>

      {needsMore > 0 && !s.voteTag ? (
        <div className="text-xs mb-2" style={broadcastMutedTextStyle}>
          Needs {needsMore} more endorsement{needsMore > 1 ? 's' : ''}
        </div>
      ) : null}

      {renderContent(s.content, isAccepted)}

      {isAccepted ? (
        <div className="mt-2 text-xs" style={broadcastFaintTextStyle}>
          Marked added{s.resolvedAt ? ` on ${new Date(s.resolvedAt).toLocaleDateString()}` : ''}
        </div>
      ) : null}

      {(s.proposerTeam || (s.endorsers && s.endorsers.length > 0) || s.sponsorTeam) ? (
        <div className="mt-3 flex flex-wrap gap-2 items-center">
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
          {!s.endorsers?.length && s.sponsorTeam ? (
            <TeamTagBadge
              team={`Endorsed by ${s.sponsorTeam}`}
              color={readableAccentOnDark(getTeamColors(s.sponsorTeam))}
            />
          ) : null}
        </div>
      ) : null}

      {!dimmed ? (
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm tabular-nums" style={broadcastMutedTextStyle}>
            Up: {tallies[s.id]?.up || 0}
          </span>
          <span className="text-sm tabular-nums" style={broadcastMutedTextStyle}>
            Down: {tallies[s.id]?.down || 0}
          </span>
          {(auth || isAdmin) ? (
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => (auth ? onVote(s.id, 1) : undefined)}
                aria-label="Thumbs up"
                title={isAdmin && adminVotes[s.id]?.up?.length ? `Up votes: ${adminVotes[s.id].up.join(', ')}` : undefined}
                disabled={!auth}
                className={broadcastChipButtonClass(myVotes[s.id] === 1)}
              >
                👍
              </button>
              <button
                type="button"
                onClick={() => (auth ? onVote(s.id, -1) : undefined)}
                aria-label="Thumbs down"
                title={isAdmin && adminVotes[s.id]?.down?.length ? `Down votes: ${adminVotes[s.id].down.join(', ')}` : undefined}
                disabled={!auth}
                className={broadcastChipButtonClass(myVotes[s.id] === -1)}
              >
                👎
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!auth || !myTeam || !canEndorse) return;
                  onEndorse(s.id, !myEndorsed);
                }}
                disabled={!auth || endorseBusy === s.id || !canEndorse}
                className={broadcastChipButtonClass(myEndorsed)}
                aria-label={myEndorsed ? 'Unendorse' : 'Endorse'}
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
                ⭐
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
