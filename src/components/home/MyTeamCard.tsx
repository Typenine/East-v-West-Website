import Link from 'next/link';
import { BroadcastPanel, BroadcastTeamLogo } from '@/components/ui/BroadcastPanel';
import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  teamAccent,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import type { HomepagePhase } from '@/lib/utils/countdown-resolver';
import type { TradeAsset, TradeWants } from '@/types/trade-block';

export type MyTeamData = {
  teamName: string;
  rosterCount: number;
  taxiCount: number;
  irCount: number;
  wins: number;
  losses: number;
  fpts: number;
  seed?: number;
  tradeBlock: TradeAsset[];
  tradeWants: TradeWants | null;
  tradeBlockUpdatedAt: string | null;
  /** Player IDs on this team's trade block */
  tradeBlockPlayerIds: string[];
  /** Count of draft picks on trade block */
  tradeBlockPickCount: number;
  /** Count of picks this team OWNS (all rounds) — derived from pick assets */
  ownedPickCount?: number;
};

function formatRecord(wins: number, losses: number) {
  return `${wins}–${losses}`;
}

function SeedBadge({ seed }: { seed?: number }) {
  if (!seed) return null;
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
      style={{ background: PANEL.tintStronger, color: PANEL.text }}
    >
      #{seed} seed
    </span>
  );
}

type Props = {
  data: MyTeamData;
  phase: HomepagePhase;
};

export default function MyTeamCard({ data, phase }: Props) {
  const {
    teamName, rosterCount, taxiCount, irCount,
    wins, losses, fpts, seed,
    tradeBlock, tradeWants, tradeBlockPickCount,
  } = data;

  const accent = teamAccent(teamName);
  const teamSlug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const isPreDraft = phase === 'post_championship_pre_draft';
  const isPostDraft = phase === 'post_draft_pre_fa';
  const isRegular = phase === 'regular_season' || phase === 'post_deadline_pre_postseason';
  const isPostseason = phase === 'postseason';
  const isPreSeason = phase === 'fa_open_pre_season';

  const activeBlock = tradeBlock.filter((a) => a.type === 'player' || a.type === 'pick');
  const wantedPositions = tradeWants?.positions ?? [];

  return (
    <BroadcastPanel accent={accent} title="My team" meta={teamName}>
      <div className="space-y-3">
        {/* Header: logo + name + record */}
        <div className="flex items-center gap-3">
          <BroadcastTeamLogo team={teamName} accent={accent} size="md" />
          <div className="flex-1 min-w-0">
            <Link
              href={`/teams/${teamSlug}`}
              className="text-base font-bold hover:underline truncate block"
              style={broadcastBodyTextStyle}
            >
              {teamName}
            </Link>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {(isRegular || isPostseason) && (
                <span className="text-xs font-semibold" style={broadcastMutedTextStyle}>
                  {formatRecord(wins, losses)} · {fpts.toFixed(1)} pts
                </span>
              )}
              <SeedBadge seed={seed} />
            </div>
          </div>
        </div>

        {/* Roster summary */}
        <div
          className="grid grid-cols-3 gap-2 rounded-lg p-2"
          style={{ background: PANEL.tint, border: `1px solid ${PANEL.hairline}` }}
        >
          <div className="text-center">
            <div className="text-lg font-extrabold tabular-nums" style={broadcastBodyTextStyle}>{rosterCount}</div>
            <div className="text-[10px] uppercase tracking-wide" style={broadcastFaintTextStyle}>Players</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-extrabold tabular-nums" style={broadcastBodyTextStyle}>{taxiCount}</div>
            <div className="text-[10px] uppercase tracking-wide" style={broadcastFaintTextStyle}>Taxi</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-extrabold tabular-nums" style={broadcastBodyTextStyle}>{irCount}</div>
            <div className="text-[10px] uppercase tracking-wide" style={broadcastFaintTextStyle}>IR</div>
          </div>
        </div>

        {/* Phase-specific section */}
        {isPreDraft && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
              Draft capital
            </div>
            {tradeBlockPickCount > 0 ? (
              <p className="text-xs" style={broadcastMutedTextStyle}>
                {tradeBlockPickCount} pick{tradeBlockPickCount !== 1 ? 's' : ''} on trade block ·{' '}
                <Link href={`/teams/${teamSlug}`} className="underline hover:text-[var(--panel-text)]">
                  View full roster →
                </Link>
              </p>
            ) : (
              <Link href={`/teams/${teamSlug}`} className="text-xs underline hover:text-[var(--panel-text)]" style={broadcastMutedTextStyle}>
                View draft capital →
              </Link>
            )}
            <Link href="/draft" className="block text-xs underline hover:text-[var(--panel-text)]" style={broadcastFaintTextStyle}>
              Draft Central →
            </Link>
          </div>
        )}

        {(isPostDraft || isPreSeason) && (
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
              Post-draft
            </div>
            <p className="text-xs" style={broadcastMutedTextStyle}>
              Roster at {rosterCount} · Taxi squad at {taxiCount}
            </p>
            <Link href={`/teams/${teamSlug}`} className="text-xs underline hover:text-[var(--panel-text)]" style={broadcastFaintTextStyle}>
              View full roster →
            </Link>
          </div>
        )}

        {/* Trade block summary */}
        {activeBlock.length > 0 && (
          <div
            className="rounded-lg p-2 space-y-1"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: '#10b981' }}>
              Your trade block
            </div>
            <p className="text-xs" style={broadcastMutedTextStyle}>
              {activeBlock.length} asset{activeBlock.length !== 1 ? 's' : ''} listed
              {wantedPositions.length > 0 && ` · Wants: ${wantedPositions.slice(0, 3).join(', ')}`}
            </p>
            <Link href="/trade-block" className="text-xs underline hover:text-[var(--panel-text)]" style={{ color: '#10b981' }}>
              Edit trade block →
            </Link>
          </div>
        )}

        {/* No trade block — prompt to list */}
        {activeBlock.length === 0 && (
          <div className="text-xs" style={broadcastFaintTextStyle}>
            Nothing on your trade block.{' '}
            <Link href="/trade-block" className="underline hover:text-[var(--panel-text)]">Add assets →</Link>
          </div>
        )}

        {/* Quick links */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Link
            href={`/teams/${teamSlug}`}
            className="rounded px-2 py-0.5 text-xs hover:text-[var(--panel-text)] transition-colors"
            style={{ background: PANEL.tintMedium, color: PANEL.text, border: `1px solid ${PANEL.hairline}` }}
          >
            Full team →
          </Link>
          <Link
            href="/standings"
            className="rounded px-2 py-0.5 text-xs hover:text-[var(--panel-text)] transition-colors"
            style={{ background: PANEL.tintMedium, color: PANEL.text, border: `1px solid ${PANEL.hairline}` }}
          >
            Standings →
          </Link>
        </div>
      </div>
    </BroadcastPanel>
  );
}
