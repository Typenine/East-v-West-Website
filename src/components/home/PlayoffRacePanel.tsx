import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel, BroadcastTeamLogo } from '@/components/ui/BroadcastPanel';
import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  teamAccent,
  PANEL,
} from '@/lib/ui/broadcast-styles';

export type StandingsTeam = {
  teamName: string;
  rosterId: number;
  wins: number;
  losses: number;
  fpts: number;
  seed: number;
};

type Props = {
  standings: StandingsTeam[];
  playoffSpots?: number; // typically 6 in a 12-team league
};

export default function PlayoffRacePanel({ standings, playoffSpots = 6 }: Props) {
  if (standings.length === 0) return null;

  const inPlayoffs    = standings.filter((t) => t.seed <= playoffSpots);
  const onTheBubble   = standings.filter((t) => t.seed > playoffSpots && t.seed <= playoffSpots + 2);
  const outsideField  = standings.filter((t) => t.seed > playoffSpots + 2);

  const lastIn   = standings.find((t) => t.seed === playoffSpots);
  const firstOut = standings.find((t) => t.seed === playoffSpots + 1);
  const cutlineGapWins = lastIn && firstOut ? lastIn.wins - firstOut.wins : null;

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader
        title="Playoff race"
        actions={
          <Link href="/standings" className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            Full standings →
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* In the field */}
        <BroadcastPanel accent="#10b981" title="In the playoffs" meta={`Top ${playoffSpots} seeds`}>
          <ul className="space-y-2">
            {inPlayoffs.map((team) => {
              const accent = teamAccent(team.teamName);
              return (
                <li key={team.rosterId} className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-bold tabular-nums w-5 text-center shrink-0"
                    style={{ color: PANEL.faint }}
                  >
                    {team.seed}
                  </span>
                  <BroadcastTeamLogo team={team.teamName} accent={accent} size="sm" />
                  <span className="flex-1 text-xs font-medium truncate" style={broadcastBodyTextStyle}>
                    {team.teamName}
                  </span>
                  <span className="text-xs tabular-nums shrink-0" style={broadcastMutedTextStyle}>
                    {team.wins}–{team.losses}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 text-xs" style={broadcastFaintTextStyle}>
            <Link href="/standings" className="underline hover:text-white">Full standings →</Link>
          </div>
        </BroadcastPanel>

        {/* Bubble + outside the field */}
        <div className="space-y-4">
          {onTheBubble.length > 0 && (
            <BroadcastPanel
              accent="#f59e0b"
              title="On the bubble"
              meta={cutlineGapWins !== null ? `${cutlineGapWins}W gap to cutline` : undefined}
            >
              <ul className="space-y-1.5">
                {onTheBubble.map((team) => {
                  const winsBack = lastIn ? Math.max(0, lastIn.wins - team.wins) : null;
                  return (
                    <li key={team.rosterId} className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-bold tabular-nums w-5 text-center shrink-0"
                        style={{ color: PANEL.faint }}
                      >
                        {team.seed}
                      </span>
                      <span className="flex-1 text-xs font-medium truncate" style={broadcastBodyTextStyle}>
                        {team.teamName}
                      </span>
                      <span className="text-xs tabular-nums shrink-0" style={broadcastMutedTextStyle}>
                        {team.wins}–{team.losses}
                      </span>
                      {winsBack !== null && winsBack > 0 && (
                        <span className="text-xs shrink-0" style={{ color: '#f59e0b' }}>
                          {winsBack}W back
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </BroadcastPanel>
          )}

          {outsideField.length > 0 && (
            <BroadcastPanel accent="#6b7280" title="Outside the field">
              <ul className="space-y-1">
                {outsideField.map((team) => (
                  <li
                    key={team.rosterId}
                    className="flex items-center justify-between gap-2 text-xs"
                    style={broadcastMutedTextStyle}
                  >
                    <span className="truncate">{team.teamName}</span>
                    <span className="tabular-nums shrink-0">{team.wins}–{team.losses}</span>
                  </li>
                ))}
              </ul>
            </BroadcastPanel>
          )}
        </div>
      </div>
    </section>
  );
}
