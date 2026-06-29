import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import type {
  LineupOptimizerResponse,
  ProjectionConfidence,
  WeeklyLineupEntry,
  WeeklyProjectedPlayer,
} from '@/lib/fantasy/lineup-types';

function confidenceLabel(confidence: ProjectionConfidence): string {
  return `${confidence.charAt(0).toUpperCase()}${confidence.slice(1)} confidence`;
}

function LineupPlayerRow({
  entry,
  side,
}: {
  entry: WeeklyLineupEntry;
  side: 'current' | 'optimal';
}) {
  const highlight = entry.changed
    ? side === 'optimal'
      ? { background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.35)' }
      : { background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.35)' }
    : { background: PANEL.tint, border: `1px solid ${PANEL.hairline}` };

  return (
    <div className="rounded-md p-2 min-h-[72px]" style={highlight}>
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
        <details className="group/player">
          <summary className="list-none cursor-pointer">
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
            <div className="flex items-center justify-between gap-2 mt-1">
              <span className="text-[8px] truncate" style={broadcastFaintTextStyle}>
                {entry.player.expectedRole}
              </span>
              <span className="text-[8px] whitespace-nowrap" style={broadcastFaintTextStyle}>
                {entry.player.rangeLow.toFixed(1)}–{entry.player.rangeHigh.toFixed(1)}
              </span>
            </div>
          </summary>
          <div className="mt-2 pt-2 border-t text-[9px] leading-relaxed" style={{ borderColor: PANEL.hairline, ...broadcastMutedTextStyle }}>
            <div>{entry.player.workload}</div>
            <div>{confidenceLabel(entry.player.confidence)}</div>
            {entry.player.assumption && <div className="mt-1">{entry.player.assumption}</div>}
          </div>
        </details>
      ) : (
        <div className="text-xs mt-1" style={broadcastMutedTextStyle}>Empty slot</div>
      )}
    </div>
  );
}

function BenchPlayerChip({
  player,
  wasCurrentStarter,
}: {
  player: WeeklyProjectedPlayer;
  wasCurrentStarter: boolean;
}) {
  return (
    <details
      className="group/bench min-w-[142px] max-w-[165px] shrink-0 rounded-md px-2.5 py-2"
      style={wasCurrentStarter
        ? { background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.30)' }
        : { background: PANEL.tint, border: `1px solid ${PANEL.hairline}` }}
    >
      <summary className="list-none cursor-pointer">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[8px] uppercase tracking-wide truncate" style={broadcastFaintTextStyle}>
            {player.position}{player.nflTeam ? ` · ${player.nflTeam}` : ''}
          </span>
          {wasCurrentStarter && (
            <span className="text-[8px] uppercase tracking-wide font-bold" style={{ color: '#f59e0b' }}>
              Moved
            </span>
          )}
        </div>
        <div className="text-[11px] font-bold truncate mt-1" style={broadcastBodyTextStyle}>
          {player.name}
        </div>
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-[9px] truncate" style={broadcastMutedTextStyle}>
            {player.isBye ? 'BYE' : player.opponent ? `vs ${player.opponent}` : player.expectedRole}
          </span>
          <span className="text-[11px] font-black tabular-nums" style={broadcastBodyTextStyle}>
            {player.projection.toFixed(1)}
          </span>
        </div>
      </summary>
      <div className="mt-2 pt-2 border-t text-[9px] leading-relaxed" style={{ borderColor: PANEL.hairline, ...broadcastMutedTextStyle }}>
        <div>{player.expectedRole}</div>
        <div>{player.workload}</div>
        <div>{player.rangeLow.toFixed(1)}–{player.rangeHigh.toFixed(1)} range</div>
      </div>
    </details>
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
      <div className="rounded-xl p-3" style={{ background: PANEL.tintSoft, border: `1px solid ${PANEL.hairline}` }}>
        <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
          Weekly lineup projections
        </div>
        <div className="text-xs mt-2" style={broadcastMutedTextStyle}>
          Calculating the optimal legal lineup…
        </div>
      </div>
    );
  }

  if (!lineup) return null;

  const hasOptimalLineup = lineup.optimalTotal != null
    && lineup.optimalLineup.some((entry) => Boolean(entry.player));
  const hasCurrentLineup = lineup.currentTotal != null
    && lineup.currentLineup.some((entry) => Boolean(entry.player));

  if (!hasOptimalLineup) {
    return (
      <div className="rounded-xl p-3" style={{ background: PANEL.tintSoft, border: `1px solid ${PANEL.hairline}` }}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
            Week {lineup.week} lineup projections
          </div>
          <span className="text-[9px]" style={broadcastFaintTextStyle}>{lineup.season}</span>
        </div>
        <div className="text-xs mt-2" style={broadcastMutedTextStyle}>
          {lineup.reason || 'Weekly lineup projections are not available yet.'}
        </div>
      </div>
    );
  }

  const gain = lineup.potentialGain || 0;
  const phaseLabel = lineup.projectionPhase === 'preseason' ? 'Preseason estimate' : `Week ${lineup.week} estimate`;
  const optimalPlayerIds = new Set(
    lineup.optimalLineup.flatMap((entry) => entry.player ? [entry.player.id] : []),
  );
  const currentPlayerIds = new Set(
    lineup.currentLineup.flatMap((entry) => entry.player ? [entry.player.id] : []),
  );
  const benchPlayers = lineup.projectedPlayers
    .filter((player) => !optimalPlayerIds.has(player.id))
    .sort((a, b) => (b.projection - a.projection) || a.name.localeCompare(b.name));

  return (
    <details className="group rounded-xl" style={{ background: PANEL.tintSoft, border: `1px solid ${PANEL.hairline}` }}>
      <summary className="cursor-pointer list-none p-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
            Week {lineup.week} lineup projections
          </div>
          <span className="text-[9px]" style={broadcastFaintTextStyle}>
            {hasCurrentLineup ? 'Click to compare lineups' : 'Click to view optimal lineup'}
          </span>
        </div>
        <div className="text-[9px] mb-2" style={broadcastMutedTextStyle}>
          {phaseLabel} · {confidenceLabel(lineup.confidence)}
        </div>
        <div className={hasCurrentLineup ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-1 gap-2'}>
          {hasCurrentLineup && (
            <div className="rounded-lg px-3 py-2" style={{ background: PANEL.tint, border: `1px solid ${PANEL.hairline}` }}>
              <div className="text-[9px] uppercase tracking-wide" style={broadcastFaintTextStyle}>Current lineup</div>
              <div className="text-lg font-black tabular-nums mt-0.5" style={broadcastBodyTextStyle}>
                {lineup.currentTotal?.toFixed(1) ?? '—'}
              </div>
              <div className="text-[10px]" style={broadcastMutedTextStyle}>projected points</div>
            </div>
          )}
          <div className="rounded-lg px-3 py-2" style={{ background: `${accent}12`, border: `1px solid ${accent}44` }}>
            <div className="text-[9px] uppercase tracking-wide" style={broadcastFaintTextStyle}>Optimal lineup</div>
            <div className="flex items-end justify-between gap-2 mt-0.5">
              <div className="text-lg font-black tabular-nums" style={{ color: accent }}>
                {lineup.optimalTotal?.toFixed(1) ?? '—'}
              </div>
              {hasCurrentLineup && gain > 0 && (
                <span className="text-[10px] font-bold" style={{ color: '#10b981' }}>+{gain.toFixed(1)}</span>
              )}
            </div>
            <div className="text-[10px]" style={broadcastMutedTextStyle}>projected points</div>
          </div>
        </div>
        {!hasCurrentLineup && (
          <div className="text-[10px] mt-2" style={broadcastMutedTextStyle}>
            Sleeper has not published the Week {lineup.week} lineup yet. The current-lineup comparison will appear automatically when it does.
          </div>
        )}
      </summary>

      <div className="border-t p-3" style={{ borderColor: PANEL.hairline }}>
        <div className="rounded-lg px-3 py-2 mb-3" style={{ background: PANEL.tint, border: `1px solid ${PANEL.hairline}` }}>
          <div className="text-[9px] uppercase tracking-wide font-bold" style={broadcastFaintTextStyle}>
            Projection confidence
          </div>
          <div className="text-[10px] mt-1 leading-relaxed" style={broadcastMutedTextStyle}>
            {lineup.confidenceNote}
          </div>
        </div>
        {hasCurrentLineup ? (
          <>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>Current lineup</div>
              <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: accent }}>Optimal lineup</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {lineup.currentLineup.map((entry, index) => (
                <div key={`lineup-pair-${entry.slotIndex}`} className="contents">
                  <LineupPlayerRow entry={entry} side="current" />
                  <LineupPlayerRow
                    entry={lineup.optimalLineup[index] || { slot: entry.slot, slotIndex: entry.slotIndex, player: null, changed: false }}
                    side="optimal"
                  />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: accent }}>Optimal lineup</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {lineup.optimalLineup.map((entry) => (
                <LineupPlayerRow key={`optimal-${entry.slotIndex}`} entry={{ ...entry, changed: false }} side="optimal" />
              ))}
            </div>
          </>
        )}
        {benchPlayers.length > 0 && (
          <div className="mt-4 pt-3 border-t" style={{ borderColor: PANEL.hairline }}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
                Bench comparison
              </div>
              <span className="text-[9px] tabular-nums" style={broadcastFaintTextStyle}>
                {benchPlayers.length} player{benchPlayers.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="text-[9px] mt-1" style={broadcastMutedTextStyle}>
              Every active roster player outside the optimal lineup, highest projection first.
            </div>
            <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
              {benchPlayers.map((player) => (
                <BenchPlayerChip
                  key={`bench-${player.id}`}
                  player={player}
                  wasCurrentStarter={currentPlayerIds.has(player.id)}
                />
              ))}
            </div>
          </div>
        )}
        <div className="text-[9px] mt-3 leading-relaxed" style={broadcastFaintTextStyle}>
          Projections estimate football workload and efficiency, then apply the league&apos;s Sleeper scoring settings. Matchup effects use only same-season opponent data and remain modest. Click a player for role and workload details.
        </div>
      </div>
    </details>
  );
}
