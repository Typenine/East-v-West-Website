import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import type {
  LineupOptimizerResponse,
  WeeklyLineupEntry,
} from '@/lib/fantasy/lineup-types';

function LineupPlayerRow({
  entry,
  side,
}: {
  entry: WeeklyLineupEntry;
  side: 'current' | 'optimal';
}) {
  const highlight = entry.changed
    ? side === 'optimal'
      ? {
          background: 'rgba(16,185,129,0.10)',
          border: '1px solid rgba(16,185,129,0.35)',
        }
      : {
          background: 'rgba(245,158,11,0.10)',
          border: '1px solid rgba(245,158,11,0.35)',
        }
    : {
        background: PANEL.tint,
        border: `1px solid ${PANEL.hairline}`,
      };

  return (
    <div className="rounded-md p-2 min-h-[58px]" style={highlight}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wide" style={broadcastFaintTextStyle}>
          {entry.slot.replace('_', ' ')}
        </span>
        {entry.changed && (
          <span
            className="text-[8px] uppercase tracking-wide font-bold"
            style={{ color: side === 'optimal' ? '#10b981' : '#f59e0b' }}
          >
            {side === 'optimal' ? 'Start' : 'Replace'}
          </span>
        )}
      </div>
      {entry.player ? (
        <>
          <div className="text-xs font-bold truncate mt-0.5" style={broadcastBodyTextStyle}>
            {entry.player.name}
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-[9px] truncate" style={broadcastMutedTextStyle}>
              {entry.player.position}
              {entry.player.nflTeam ? ` · ${entry.player.nflTeam}` : ''}
              {entry.player.isBye
                ? ' · BYE'
                : entry.player.opponent
                  ? ` · vs ${entry.player.opponent}`
                  : ''}
            </span>
            <span className="text-[10px] font-bold tabular-nums" style={broadcastBodyTextStyle}>
              {entry.player.projection.toFixed(1)}
            </span>
          </div>
        </>
      ) : (
        <div className="text-xs mt-1" style={broadcastMutedTextStyle}>Empty slot</div>
      )}
    </div>
  );
}

export default function MyTeamLineupOptimizer({
  lineup,
  loading,
  accent,
}: {
  lineup: LineupOptimizerResponse | null;
  loading: boolean;
  accent: string;
}) {
  if (loading) {
    return (
      <div
        className="rounded-xl p-3"
        style={{ background: PANEL.tintSoft, border: `1px solid ${PANEL.hairline}` }}
      >
        <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
          Weekly lineup projections
        </div>
        <div className="text-xs mt-2" style={broadcastMutedTextStyle}>
          Calculating the current and optimal legal lineups…
        </div>
      </div>
    );
  }

  if (!lineup) return null;

  if (!lineup.available) {
    return (
      <div
        className="rounded-xl p-3"
        style={{ background: PANEL.tintSoft, border: `1px solid ${PANEL.hairline}` }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
            Week {lineup.week} lineup projections
          </div>
          <span className="text-[9px]" style={broadcastFaintTextStyle}>{lineup.season}</span>
        </div>
        <div className="text-xs mt-2" style={broadcastMutedTextStyle}>
          {lineup.reason || 'Weekly lineup data is not available yet.'}
        </div>
      </div>
    );
  }

  const gain = lineup.potentialGain || 0;

  return (
    <details
      className="group rounded-xl"
      style={{ background: PANEL.tintSoft, border: `1px solid ${PANEL.hairline}` }}
    >
      <summary className="cursor-pointer list-none p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
            Week {lineup.week} lineup projections
          </div>
          <span className="text-[9px]" style={broadcastFaintTextStyle}>
            Click to compare lineups
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div
            className="rounded-lg px-3 py-2"
            style={{ background: PANEL.tint, border: `1px solid ${PANEL.hairline}` }}
          >
            <div className="text-[9px] uppercase tracking-wide" style={broadcastFaintTextStyle}>
              Current lineup
            </div>
            <div className="text-lg font-black tabular-nums mt-0.5" style={broadcastBodyTextStyle}>
              {lineup.currentTotal?.toFixed(1) ?? '—'}
            </div>
            <div className="text-[10px]" style={broadcastMutedTextStyle}>projected points</div>
          </div>
          <div
            className="rounded-lg px-3 py-2"
            style={{ background: `${accent}12`, border: `1px solid ${accent}44` }}
          >
            <div className="text-[9px] uppercase tracking-wide" style={broadcastFaintTextStyle}>
              Optimal lineup
            </div>
            <div className="flex items-end justify-between gap-2 mt-0.5">
              <div className="text-lg font-black tabular-nums" style={{ color: accent }}>
                {lineup.optimalTotal?.toFixed(1) ?? '—'}
              </div>
              {gain > 0 && (
                <span className="text-[10px] font-bold" style={{ color: '#10b981' }}>
                  +{gain.toFixed(1)}
                </span>
              )}
            </div>
            <div className="text-[10px]" style={broadcastMutedTextStyle}>projected points</div>
          </div>
        </div>
      </summary>

      <div className="border-t p-3" style={{ borderColor: PANEL.hairline }}>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
            Current lineup
          </div>
          <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: accent }}>
            Optimal lineup
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {lineup.currentLineup.map((entry, index) => (
            <div key={`lineup-pair-${entry.slotIndex}`} className="contents">
              <LineupPlayerRow entry={entry} side="current" />
              <LineupPlayerRow
                entry={lineup.optimalLineup[index] || {
                  slot: entry.slot,
                  slotIndex: entry.slotIndex,
                  player: null,
                  changed: false,
                }}
                side="optimal"
              />
            </div>
          ))}
        </div>
        <div className="text-[9px] mt-3 leading-relaxed" style={broadcastFaintTextStyle}>
          Projections use league-scored recent results, current availability, and the player&apos;s
          Week {lineup.week} opponent. Highlighted rows are the players that change.
        </div>
      </div>
    </details>
  );
}
