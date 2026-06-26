import Link from 'next/link';
import { BroadcastPanel, BroadcastTeamLogo } from '@/components/ui/BroadcastPanel';
import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  teamAccent,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import {
  formatTeamRecord,
  ordinalPlacement,
  TEAM_STATUS_META,
  TeamAlertRow,
  TeamPlayerTile,
  TeamRankBox,
  TeamStatBox,
} from '@/components/home/MyTeamCardParts';
import MyTeamPhaseFocus from '@/components/home/MyTeamPhaseFocus';
import MyTeamLineupOptimizer from '@/components/home/MyTeamLineupOptimizer';
import MyTeamSecondaryPanels from '@/components/home/MyTeamSecondaryPanels';
import MyTeamDetails from '@/components/home/MyTeamDetails';
import type { MyTeamDashboardModel } from '@/components/home/useMyTeamDashboard';

function formatAverage(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(1);
}

function placementDetail(rank: number | null | undefined, leagueSize: number): string {
  return rank ? `${ordinalPlacement(rank)} of ${leagueSize}` : 'Not ranked';
}

function agePlacementDetail(rank: number | null | undefined, leagueSize: number): string {
  return rank ? `${ordinalPlacement(rank)}-youngest of ${leagueSize}` : 'Age rank unavailable';
}

export default function MyTeamCardView({ model }: { model: MyTeamDashboardModel }) {
  const {
    data,
    phase,
    dashboard,
    lineup,
    news,
    loading,
    lineupLoading,
    alerts,
    status,
    activeBlock,
    wantedPositions,
    tradeLabels,
    tradeLabelsLoading,
    teamPath,
  } = model;
  const {
    teamName,
    rosterCount,
    taxiCount,
    irCount,
    wins,
    losses,
    fpts,
    seed,
    tradeWants,
    tradeBlockUpdatedAt,
  } = data;
  const accent = teamAccent(teamName);
  const statusMeta = TEAM_STATUS_META[status];
  const activeCount = dashboard?.roster.active
    ?? Math.max(0, rosterCount - taxiCount - irCount);
  const activeLimit = dashboard?.roster.activeLimit || 0;
  const taxiLimit = dashboard?.roster.taxiLimit || 0;
  const irLimit = dashboard?.roster.irLimit || 0;
  const displayWins = dashboard?.standings.wins ?? wins;
  const displayLosses = dashboard?.standings.losses ?? losses;
  const displayPoints = dashboard?.standings.pointsFor ?? fpts;
  const displaySeed = dashboard?.standings.seed ?? seed ?? null;
  const season = dashboard?.standings.season;
  const ranks = dashboard?.standings.ranks;
  const leagueSize = ranks?.leagueSize || 12;
  const isPreDraft = phase === 'post_championship_pre_draft';
  const actionableAlerts = alerts.filter(
    (alert) => alert.severity === 'critical' || alert.severity === 'warning'
  );

  return (
    <BroadcastPanel accent={accent} title="My team" meta={teamName}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <BroadcastTeamLogo team={teamName} accent={accent} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-black truncate" style={broadcastBodyTextStyle}>
                {teamName}
              </h3>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{
                  color: statusMeta.color,
                  background: statusMeta.bg,
                  border: `1px solid ${statusMeta.color}44`,
                }}
              >
                {loading ? 'Checking team…' : statusMeta.label}
              </span>
            </div>
            <div
              className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs"
              style={broadcastMutedTextStyle}
            >
              {season && <span>{season} season</span>}
              <span className="font-semibold">
                {formatTeamRecord(displayWins, displayLosses)}
              </span>
              <span>{displayPoints.toFixed(1)} PF</span>
              {displaySeed && <span>#{displaySeed} seed</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <TeamStatBox
            value={activeLimit ? `${activeCount}/${activeLimit}` : String(activeCount)}
            label="Active roster"
            warning={(dashboard?.roster.cutsRequired || 0) > 0}
          />
          <TeamStatBox
            value={taxiLimit
              ? `${dashboard?.roster.taxi ?? taxiCount}/${taxiLimit}`
              : String(dashboard?.roster.taxi ?? taxiCount)}
            label="Taxi"
            warning={taxiLimit > 0 && (dashboard?.roster.taxi || 0) > taxiLimit}
          />
          <TeamStatBox
            value={irLimit
              ? `${dashboard?.roster.ir ?? irCount}/${irLimit}`
              : String(dashboard?.roster.ir ?? irCount)}
            label="Reserve"
            warning={(dashboard?.roster.irIneligible || 0) > 0}
          />
          <TeamStatBox
            value={(dashboard?.roster.cutsRequired || 0) > 0
              ? `${dashboard?.roster.cutsRequired} cut${dashboard?.roster.cutsRequired === 1 ? '' : 's'}`
              : `${dashboard?.roster.openSpots ?? 0} open`}
            label="Roster room"
            warning={(dashboard?.roster.cutsRequired || 0) > 0}
          />
        </div>

        <MyTeamPhaseFocus
          dashboard={dashboard}
          phase={phase}
          teamName={teamName}
          accent={accent}
          fallbackTaxi={taxiCount}
          fallbackIr={irCount}
        />

        <MyTeamLineupOptimizer
          lineup={lineup}
          loading={lineupLoading}
          accent={accent}
        />

        {dashboard && ranks && (
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={broadcastFaintTextStyle}>
              League position
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-1.5">
              <TeamRankBox
                label={`${dashboard.standings.season} record`}
                value={formatTeamRecord(displayWins, displayLosses)}
                detail={placementDetail(ranks.record, leagueSize)}
              />
              <TeamRankBox
                label={`${dashboard.standings.season} points scored`}
                value={displayPoints.toFixed(1)}
                detail={`${placementDetail(ranks.points, leagueSize)} · league avg ${formatAverage(dashboard.standings.leagueAverages.pointsFor)}`}
              />
              <TeamRankBox
                label={`${dashboard.standings.season} potential points`}
                value={dashboard.standings.maxPoints == null ? '—' : dashboard.standings.maxPoints.toFixed(1)}
                detail={dashboard.standings.maxPoints == null
                  ? 'Season total unavailable'
                  : `Season total · ${placementDetail(ranks.maxPoints, leagueSize)} · league avg ${formatAverage(dashboard.standings.leagueAverages.maxPoints)}`}
                title="Season-to-date total from the highest-scoring legal lineup available from the full roster each week. This is not a projection."
              />
              <TeamRankBox
                label="Average age"
                value={dashboard.standings.averageAge == null
                  ? '—'
                  : `${dashboard.standings.averageAge.toFixed(1)} years`}
                detail={dashboard.standings.averageAge == null
                  ? 'QB, RB, WR and TE age unavailable'
                  : `${agePlacementDetail(ranks.youth, leagueSize)} · league avg ${formatAverage(dashboard.standings.leagueAverages.averageAge)}`}
                title="Average age of rostered QBs, RBs, WRs and TEs."
              />
              <TeamRankBox
                label="Draft capital"
                value={`${dashboard.draft.picks.length} owned pick${dashboard.draft.picks.length === 1 ? '' : 's'}`}
                detail={placementDetail(ranks.draftCapital, leagueSize)}
                title="League rank weights pick year, round and exact slot when the draft order is available."
              />
            </div>
          </div>
        )}

        {actionableAlerts.length > 0 && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
                Team attention
              </div>
              {actionableAlerts.length > 3 && (
                <span className="text-[10px]" style={broadcastFaintTextStyle}>Top 3 shown</span>
              )}
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              {actionableAlerts.slice(0, 3).map((alert, index) => (
                <TeamAlertRow key={`${alert.title}-${index}`} alert={alert} />
              ))}
            </div>
          </div>
        )}

        {dashboard?.roster.corePlayers.length ? (
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={broadcastFaintTextStyle}>
              Core players
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              {dashboard.roster.corePlayers.map((player) => (
                <TeamPlayerTile key={player.id} player={player} accent={accent} />
              ))}
            </div>
          </div>
        ) : null}

        <MyTeamSecondaryPanels
          tradeLabels={tradeLabels}
          tradeLabelsLoading={tradeLabelsLoading}
          tradeAssetCount={activeBlock.length}
          wantedPositions={wantedPositions}
          tradeWantsText={tradeWants?.text}
          tradeBlockUpdatedAt={tradeBlockUpdatedAt}
          news={news}
        />

        <MyTeamDetails
          dashboard={dashboard}
          alerts={actionableAlerts}
          teamName={teamName}
          accent={accent}
        />

        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={teamPath} className="rounded-md px-3 py-2 text-xs font-bold" style={{ background: accent, color: '#fff' }}>
            Open team dashboard
          </Link>
          <Link
            href="/trade-block"
            className="rounded-md px-3 py-2 text-xs font-semibold"
            style={{ background: PANEL.tintMedium, color: PANEL.text, border: `1px solid ${PANEL.hairline}` }}
          >
            Edit trade block
          </Link>
          <Link
            href={isPreDraft ? '/draft?view=team-prospect-draftboard' : '/standings'}
            className="rounded-md px-3 py-2 text-xs font-semibold"
            style={{ background: PANEL.tintMedium, color: PANEL.text, border: `1px solid ${PANEL.hairline}` }}
          >
            {isPreDraft ? 'Open draft board' : 'League standings'}
          </Link>
        </div>
      </div>
    </BroadcastPanel>
  );
}
