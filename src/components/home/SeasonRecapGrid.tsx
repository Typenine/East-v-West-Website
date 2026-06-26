import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  BroadcastPanel,
  BroadcastSectionLabel,
  BroadcastTeamLogo,
  BroadcastAccentBadge,
} from '@/components/ui/BroadcastPanel';
import {
  PANEL,
  broadcastBodyTextStyle,
  broadcastFaintTextStyle,
  broadcastMutedTextStyle,
  teamAccent,
} from '@/lib/ui/broadcast-styles';

export type SeasonRecapData = {
  podium?: { champion: string; runnerUp: string; thirdPlace: string };
  awards?: {
    mvp?: { name: string; points: number; teamName?: string };
    roy?: { name: string; points: number; teamName?: string };
  };
  weeklyHighsTopTeams?: Array<{ teamName: string; rosterId?: number; count: number }>;
  regularSeasonWinner?: { teamName: string; rosterId: number; wins: number; fpts: number };
  pfLeader?: { teamName: string; rosterId: number; fpts: number };
  topWeeks3?: Array<{
    teamName: string;
    rosterId: number;
    week: number;
    points: number;
    opponentTeamName: string;
    opponentRosterId: number;
  }>;
  lastPlace?: { teamName: string; rosterId?: number };
  toiletBowlLoser?: { teamName: string; rosterId?: number };
  tenthPlaceWinner?: { teamName: string; rosterId?: number };
};

const RECAP_ACCENT = '#eab308';

function RecapRow({
  accent,
  children,
  className,
}: {
  accent: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={['rounded-xl px-3 py-2.5', className].filter(Boolean).join(' ')}
      style={{
        background: PANEL.tintSoft,
        boxShadow: `inset 0 0 0 1px ${PANEL.hairline}`,
        borderLeft: `3px solid ${accent}`,
      }}
    >
      {children}
    </div>
  );
}

function TeamRecapLink({
  teamName,
  rosterId,
  label,
  sub,
  badge,
}: {
  teamName: string;
  rosterId?: number;
  label?: string;
  sub?: string;
  badge?: string;
}) {
  const accent = teamAccent(teamName);
  const inner = (
    <RecapRow accent={accent}>
      <div className="flex items-center gap-3 min-w-0">
        <BroadcastTeamLogo team={teamName} accent={accent} size="sm" />
        <div className="min-w-0 flex-1">
          {label ? (
            <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={broadcastFaintTextStyle}>
              {label}
            </div>
          ) : null}
          <div className="truncate text-sm font-semibold" style={broadcastBodyTextStyle}>
            {teamName}
          </div>
          {sub ? (
            <div className="truncate text-xs mt-0.5" style={broadcastMutedTextStyle}>
              {sub}
            </div>
          ) : null}
        </div>
        {badge ? <BroadcastAccentBadge accent={accent}>{badge}</BroadcastAccentBadge> : null}
      </div>
    </RecapRow>
  );

  if (rosterId) {
    return (
      <Link href={`/teams/${rosterId}`} className="block hover:brightness-110 transition-all">
        {inner}
      </Link>
    );
  }
  return inner;
}

function EmptyRecap({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm" style={broadcastMutedTextStyle}>
      {children}
    </p>
  );
}

export default function SeasonRecapGrid({
  recap,
  rosterNameMap,
}: {
  recap: SeasonRecapData;
  rosterNameMap: Map<number, string>;
}) {
  const invert = new Map<string, number>();
  rosterNameMap.forEach((nm, rid) => invert.set(nm, rid));

  const podiumLabels = ['Champion', 'Runner-up', 'Third place'] as const;
  const podiumNames = [
    recap.podium?.champion,
    recap.podium?.runnerUp,
    recap.podium?.thirdPlace,
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
      <BroadcastPanel title="Top 3" accent={RECAP_ACCENT} bodyClassName="space-y-3">
        {podiumLabels.map((label, idx) => {
          const name = podiumNames[idx];
          if (!name || name === 'TBD') {
            return (
              <RecapRow key={label} accent={RECAP_ACCENT}>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={broadcastFaintTextStyle}>
                  {label}
                </div>
                <div className="text-sm font-semibold mt-1" style={broadcastMutedTextStyle}>
                  TBD
                </div>
              </RecapRow>
            );
          }
          return (
            <TeamRecapLink
              key={label}
              teamName={name}
              rosterId={invert.get(name)}
              label={label}
              badge={`#${idx + 1}`}
            />
          );
        })}
      </BroadcastPanel>

      <BroadcastPanel title="Awards" accent="#a78bfa" bodyClassName="space-y-3">
        {recap.awards?.mvp ? (
          <RecapRow accent={teamAccent(recap.awards.mvp.teamName)}>
            <BroadcastSectionLabel accent={teamAccent(recap.awards.mvp.teamName)}>MVP</BroadcastSectionLabel>
            <div className="text-sm font-semibold" style={broadcastBodyTextStyle}>
              {recap.awards.mvp.name}
            </div>
            <div className="text-xs mt-1" style={broadcastMutedTextStyle}>
              {recap.awards.mvp.points.toFixed(2)} pts
              {recap.awards.mvp.teamName ? ` · ${recap.awards.mvp.teamName}` : ''}
            </div>
          </RecapRow>
        ) : (
          <EmptyRecap>MVP: TBD</EmptyRecap>
        )}
        {recap.awards?.roy ? (
          <RecapRow accent={teamAccent(recap.awards.roy.teamName)}>
            <BroadcastSectionLabel accent={teamAccent(recap.awards.roy.teamName)}>Rookie of the Year</BroadcastSectionLabel>
            <div className="text-sm font-semibold" style={broadcastBodyTextStyle}>
              {recap.awards.roy.name}
            </div>
            <div className="text-xs mt-1" style={broadcastMutedTextStyle}>
              {recap.awards.roy.points.toFixed(2)} pts
              {recap.awards.roy.teamName ? ` · ${recap.awards.roy.teamName}` : ''}
            </div>
          </RecapRow>
        ) : (
          <EmptyRecap>Rookie of the Year: TBD</EmptyRecap>
        )}
      </BroadcastPanel>

      <BroadcastPanel title="Weekly Highs" accent="#38bdf8" meta="Top 3" bodyClassName="space-y-2">
        {recap.weeklyHighsTopTeams && recap.weeklyHighsTopTeams.length > 0 ? (
          recap.weeklyHighsTopTeams.map((row, idx) => (
            <TeamRecapLink
              key={row.teamName}
              teamName={row.teamName}
              rosterId={row.rosterId}
              sub={`${row.count} weekly high${row.count === 1 ? '' : 's'}`}
              badge={`#${idx + 1}`}
            />
          ))
        ) : (
          <EmptyRecap>TBD</EmptyRecap>
        )}
      </BroadcastPanel>

      {recap.regularSeasonWinner ? (
        <BroadcastPanel title="Regular Season" accent={teamAccent(recap.regularSeasonWinner.teamName)}>
          <TeamRecapLink
            teamName={recap.regularSeasonWinner.teamName}
            rosterId={recap.regularSeasonWinner.rosterId}
            label="Best Record"
            sub={`${recap.regularSeasonWinner.wins} wins · ${recap.regularSeasonWinner.fpts.toFixed(2)} PF`}
          />
        </BroadcastPanel>
      ) : null}

      {recap.pfLeader ? (
        <BroadcastPanel title="Points For" accent={teamAccent(recap.pfLeader.teamName)}>
          <TeamRecapLink
            teamName={recap.pfLeader.teamName}
            rosterId={recap.pfLeader.rosterId}
            label="PF Leader"
            sub={`${recap.pfLeader.fpts.toFixed(2)} total PF`}
          />
        </BroadcastPanel>
      ) : null}

      {recap.topWeeks3 && recap.topWeeks3.length > 0 ? (
        <BroadcastPanel title="Top Scores" accent="#f97316" meta="Best weeks" bodyClassName="space-y-2">
          {recap.topWeeks3.map((w, i) => {
            const accent = teamAccent(w.teamName);
            return (
              <RecapRow key={`${w.week}-${w.rosterId}-${i}`} accent={accent}>
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/teams/${w.rosterId}`} className="flex items-center gap-3 min-w-0 hover:underline">
                    <BroadcastTeamLogo team={w.teamName} accent={accent} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={broadcastBodyTextStyle}>
                        #{i + 1} {w.teamName}
                      </div>
                      <div className="text-xs" style={broadcastMutedTextStyle}>
                        Week {w.week}
                      </div>
                    </div>
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="text-base font-extrabold tabular-nums" style={broadcastBodyTextStyle}>
                      {w.points.toFixed(2)}
                    </div>
                    <Link
                      href={`/teams/${w.opponentRosterId}`}
                      className="text-xs hover:underline"
                      style={broadcastFaintTextStyle}
                    >
                      vs {w.opponentTeamName}
                    </Link>
                  </div>
                </div>
              </RecapRow>
            );
          })}
        </BroadcastPanel>
      ) : null}

      {recap.lastPlace ? (
        <BroadcastPanel title="Last Place" accent={teamAccent(recap.lastPlace.teamName)}>
          <TeamRecapLink
            teamName={recap.lastPlace.teamName}
            rosterId={recap.lastPlace.rosterId}
            label="Regular season"
          />
        </BroadcastPanel>
      ) : null}

      {recap.toiletBowlLoser ? (
        <BroadcastPanel title="Toilet Bowl" accent={teamAccent(recap.toiletBowlLoser.teamName)}>
          <TeamRecapLink
            teamName={recap.toiletBowlLoser.teamName}
            rosterId={recap.toiletBowlLoser.rosterId}
            label="Losers bracket final"
          />
        </BroadcastPanel>
      ) : null}

      {recap.tenthPlaceWinner ? (
        <BroadcastPanel title="10th Place" accent={teamAccent(recap.tenthPlaceWinner.teamName)}>
          <TeamRecapLink
            teamName={recap.tenthPlaceWinner.teamName}
            rosterId={recap.tenthPlaceWinner.rosterId}
            label="Classification game winner"
          />
        </BroadcastPanel>
      ) : null}
    </div>
  );
}
