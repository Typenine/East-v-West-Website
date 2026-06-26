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
  TEAM_STATUS_META,
  TeamAlertRow,
  TeamPlayerTile,
  TeamRankBox,
  TeamStatBox,
} from '@/components/home/MyTeamCardParts';
import MyTeamPhaseFocus from '@/components/home/MyTeamPhaseFocus';
import MyTeamSecondaryPanels from '@/components/home/MyTeamSecondaryPanels';
import MyTeamDetails from '@/components/home/MyTeamDetails';
import type { MyTeamDashboardModel } from '@/components/home/useMyTeamDashboard';

export default function MyTeamCardView({ model }: { model: MyTeamDashboardModel }) {
  const {
    data,
    phase,
    dashboard,
    news,
    loading,
    alerts,
    status,
    activeBlock,
    wantedPositions,
    tradeLabels,
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
  const ranks = dashboard?.standings.ranks;
  const leagueSize = ranks?.leagueSize || 12;
  const isPreDraft = phase === 'post_championship_pre_draft';

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
              <span className="font-semibold">
                {formatTeamRecord(displayWins, displayLosses)}
              </span>
              <span>{displayPoints.toFixed(1)} PF</span>
              {displaySeed && <span>#{displaySeed} seed</span>}
              {ranks?.power && (
                <span
                  style={{ color: accent }}
                  title="Composite of record, scoring, max points, youth, and draft capital"
                >
                  #{ranks.power} power rank
                </span>
              )}
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

        {ranks && (
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={broadcastFaintTextStyle}>
              League position
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              <TeamRankBox label="Record" rank={ranks.record} leagueSize={leagueSize} />
              <TeamRankBox label="Points" rank={ranks.points} leagueSize={leagueSize} />
              <TeamRankBox label="Max points" rank={ranks.maxPoints} leagueSize={leagueSize} />
              <TeamRankBox label="Youth" rank={ranks.youth} leagueSize={leagueSize} />
              <TeamRankBox label="Draft capital" rank={ranks.draftCapital} leagueSize={leagueSize} />
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
              Team attention
            </div>
            {alerts.length > 3 && (
              <span className="text-[10px]" style={broadcastFaintTextStyle}>Top 3 shown</span>
            )}
          </div>
          <div className="grid sm:grid-cols-3 gap-2">
            {alerts.slice(0, 3).map((alert, index) => (
              <TeamAlertRow key={`${alert.title}-${index}`} alert={alert} />
            ))}
          </div>
        </div>

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
          tradeAssetCount={activeBlock.length}
          wantedPositions={wantedPositions}
          tradeWantsText={tradeWants?.text}
          tradeBlockUpdatedAt={tradeBlockUpdatedAt}
          news={news}
        />

        <MyTeamDetails
          dashboard={dashboard}
          alerts={alerts}
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
