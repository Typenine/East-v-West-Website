import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import type { HomepagePhase } from '@/lib/utils/countdown-resolver';
import type { TeamDashboardResponse } from '@/lib/home/team-dashboard-types';

export default function MyTeamPhaseFocus({
  dashboard,
  phase,
  teamName,
  accent,
  fallbackTaxi,
  fallbackIr,
}: {
  dashboard: TeamDashboardResponse | null;
  phase: HomepagePhase;
  teamName: string;
  accent: string;
  fallbackTaxi: number;
  fallbackIr: number;
}) {
  const isPreDraft = phase === 'post_championship_pre_draft';
  const isPostDraft = phase === 'post_draft_pre_fa';
  const isPreseason = phase === 'fa_open_pre_season';
  const isRegular = phase === 'regular_season' || phase === 'post_deadline_pre_postseason';
  const isPostseason = phase === 'postseason';
  const visibleDraftPicks = dashboard?.draft.picks.slice(0, 8) || [];

  return (
    <div
      className="rounded-xl p-3"
      style={{ background: PANEL.tintSoft, border: `1px solid ${PANEL.hairline}` }}
    >
      {isPreDraft && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
                Draft command center
              </div>
              {dashboard && (
                <div className="text-sm font-bold mt-0.5" style={broadcastBodyTextStyle}>
                  {dashboard.draft.picks.length} owned pick
                  {dashboard.draft.picks.length === 1 ? '' : 's'}
                </div>
              )}
            </div>
            {dashboard?.draft.rank && (
              <span
                className="rounded px-2 py-1 text-[10px] font-bold"
                style={{ color: accent, background: `${accent}18` }}
              >
                #{dashboard.draft.rank} draft capital
              </span>
            )}
          </div>
          {!dashboard ? (
            <div className="text-xs" style={broadcastMutedTextStyle}>
              Loading draft ownership…
            </div>
          ) : visibleDraftPicks.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {visibleDraftPicks.map((pick, index) => (
                <span
                  key={`${pick.year}-${pick.label}-${index}`}
                  className="rounded-md px-2 py-1 text-xs font-bold"
                  title={
                    pick.originalTeam && pick.originalTeam !== teamName
                      ? `Originally ${pick.originalTeam}`
                      : undefined
                  }
                  style={{
                    background: `${accent}18`,
                    color: accent,
                    border: `1px solid ${accent}44`,
                  }}
                >
                  {pick.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-xs" style={broadcastMutedTextStyle}>
              No owned picks were found.
            </div>
          )}
        </div>
      )}

      {(isPostDraft || isPreseason) && (
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
            {isPostDraft ? 'Post-draft roster build' : 'Preseason readiness'}
          </div>
          <div className="mt-2 grid sm:grid-cols-2 gap-2">
            <div>
              <div className="text-sm font-bold" style={broadcastBodyTextStyle}>
                {dashboard?.roster.rookies.length || 0} rookie
                {dashboard?.roster.rookies.length === 1 ? '' : 's'} on roster
              </div>
              <div className="text-[11px] mt-1" style={broadcastMutedTextStyle}>
                {dashboard?.roster.rookies.length
                  ? dashboard.roster.rookies.map((player) => player.name).join(', ')
                  : 'No rookie metadata available yet.'}
              </div>
            </div>
            <div>
              <div className="text-sm font-bold" style={broadcastBodyTextStyle}>
                {(dashboard?.roster.cutsRequired || 0) > 0
                  ? `${dashboard?.roster.cutsRequired} cuts still required`
                  : `${dashboard?.roster.openSpots || 0} active spots available`}
              </div>
              <div className="text-[11px] mt-1" style={broadcastMutedTextStyle}>
                Taxi {dashboard?.roster.taxi ?? fallbackTaxi}/
                {dashboard?.roster.taxiLimit || '—'} · Reserve{' '}
                {dashboard?.roster.ir ?? fallbackIr}/{dashboard?.roster.irLimit || '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {(isRegular || isPostseason) && (
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
              {isPostseason
                ? 'Postseason matchup'
                : `Week ${dashboard?.matchup?.week || ''} matchup`}
            </div>
            {dashboard?.matchup?.postseasonPath && (
              <span className="text-[10px] font-bold" style={{ color: accent }}>
                {dashboard.matchup.postseasonPath}
              </span>
            )}
          </div>
          {dashboard?.matchup ? (
            <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-base font-black" style={broadcastBodyTextStyle}>
                  vs. {dashboard.matchup.opponent}
                </div>
                <div className="text-[11px] mt-0.5" style={broadcastMutedTextStyle}>
                  Opponent: {dashboard.matchup.opponentWins}–{dashboard.matchup.opponentLosses}
                  {dashboard.matchup.teamScore != null && dashboard.matchup.opponentScore != null
                    ? ` · Score ${dashboard.matchup.teamScore.toFixed(1)}–${dashboard.matchup.opponentScore.toFixed(1)}`
                    : ''}
                </div>
              </div>
              {dashboard.matchup.recentForm.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] mr-1" style={broadcastFaintTextStyle}>
                    Recent
                  </span>
                  {dashboard.matchup.recentForm.map((result, index) => (
                    <span
                      key={`${result}-${index}`}
                      className="h-6 w-6 rounded flex items-center justify-center text-[10px] font-black"
                      style={{
                        color:
                          result === 'W' ? '#10b981' : result === 'L' ? '#ef4444' : '#f59e0b',
                        background:
                          result === 'W'
                            ? 'rgba(16,185,129,0.12)'
                            : result === 'L'
                              ? 'rgba(239,68,68,0.12)'
                              : 'rgba(245,158,11,0.12)',
                      }}
                    >
                      {result}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs mt-2" style={broadcastMutedTextStyle}>
              The next matchup has not populated yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
