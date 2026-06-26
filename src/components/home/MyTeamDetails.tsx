import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import type {
  TeamDashboardAlert,
  TeamDashboardResponse,
} from '@/lib/home/team-dashboard-types';
import {
  compactTeamName,
  TeamAlertRow,
  teamTimeAgo,
} from '@/components/home/MyTeamCardParts';
import { MyTeamPositionAgeComparisons } from '@/components/home/MyTeamLeagueComparisons';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB'];

export default function MyTeamDetails({
  dashboard,
  alerts,
  teamName,
  accent,
}: {
  dashboard: TeamDashboardResponse | null;
  alerts: TeamDashboardAlert[];
  teamName: string;
  accent: string;
}) {
  const picksByYear = dashboard
    ? Array.from(new Set(dashboard.draft.picks.map((pick) => pick.year)))
        .sort((a, b) => a - b)
        .map((year) => ({
          year,
          picks: dashboard.draft.picks.filter((pick) => pick.year === year),
        }))
    : [];

  return (
    <details
      className="group rounded-lg"
      style={{ border: `1px solid ${PANEL.hairline}`, background: PANEL.tintSoft }}
    >
      <summary
        className="cursor-pointer list-none px-3 py-2.5 flex items-center justify-between gap-2 text-xs font-bold"
        style={broadcastBodyTextStyle}
      >
        <span>More team details</span>
        <span className="text-[10px] group-open:rotate-180 transition-transform" aria-hidden>
          ▼
        </span>
      </summary>
      <div className="border-t px-3 py-3 space-y-4" style={{ borderColor: PANEL.hairline }}>
        {dashboard && (
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={broadcastFaintTextStyle}>
              Position breakdown
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(dashboard.roster.positionCounts)
                .sort(([a], [b]) => {
                  const aIndex = POSITION_ORDER.indexOf(a);
                  const bIndex = POSITION_ORDER.indexOf(b);
                  return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
                })
                .map(([position, count]) => (
                  <span
                    key={position}
                    className="rounded px-2 py-1 text-[10px] font-semibold"
                    style={{ background: PANEL.tintMedium, color: PANEL.text }}
                  >
                    {position} {count}
                  </span>
                ))}
            </div>
          </div>
        )}

        {dashboard && (
          <MyTeamPositionAgeComparisons
            dashboard={dashboard}
            teamName={teamName}
            accent={accent}
          />
        )}

        {picksByYear.length ? (
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={broadcastFaintTextStyle}>
              Draft capital by year
            </div>
            <div className="space-y-2">
              {picksByYear.map(({ year, picks }) => (
                <div key={year} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                  <div className="w-12 shrink-0 text-xs font-bold" style={broadcastBodyTextStyle}>
                    {year}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {picks.map((pick, index) => (
                      <span
                        key={`${pick.label}-${index}`}
                        className="rounded px-2 py-1 text-[10px] font-semibold"
                        style={{ background: `${accent}14`, color: accent }}
                      >
                        {pick.exact ? pick.label : `${pick.round}${pick.round === 1 ? 'st' : pick.round === 2 ? 'nd' : pick.round === 3 ? 'rd' : 'th'}`}
                        {pick.originalTeam && pick.originalTeam !== teamName
                          ? ` · orig. ${compactTeamName(pick.originalTeam)}`
                          : ''}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {alerts.length > 3 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={broadcastFaintTextStyle}>
              Additional alerts
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {alerts.slice(3).map((alert, index) => (
                <TeamAlertRow key={`${alert.title}-extra-${index}`} alert={alert} />
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={broadcastFaintTextStyle}>
            Recent transactions
          </div>
          {dashboard?.recentTransactions.length ? (
            <div className="space-y-2">
              {dashboard.recentTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-start justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold capitalize" style={broadcastBodyTextStyle}>
                      {transaction.type.replace(/_/g, ' ')}
                    </div>
                    <div className="text-[11px] mt-0.5" style={broadcastMutedTextStyle}>
                      {transaction.summary}
                    </div>
                  </div>
                  <span className="text-[9px] shrink-0" style={broadcastFaintTextStyle}>
                    {teamTimeAgo(transaction.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs" style={broadcastMutedTextStyle}>
              No recent completed transactions found.
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
