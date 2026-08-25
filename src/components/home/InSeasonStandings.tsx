import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel } from '@/components/ui/BroadcastPanel';
import { broadcastBodyTextStyle, broadcastMutedTextStyle, PANEL } from '@/lib/ui/broadcast-styles';
import type { StandingsTeam } from '@/components/home/PlayoffRacePanel';

export default function InSeasonStandings({ standings }: { standings: StandingsTeam[] }) {
  const rows = [...standings].sort((a, b) => a.seed - b.seed);
  const hasGames = rows.some((team) => team.wins + team.losses > 0);

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader
        title="Standings"
        subtitle={hasGames ? 'Current playoff order' : 'Standings activate as Week 1 results come in'}
        actions={
          <Link href="/standings" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
            Full standings →
          </Link>
        }
      />
      <BroadcastPanel accent="#2563eb" title="League table" meta={hasGames ? 'Top 6 make the playoffs' : 'Preseason'}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.14em]" style={broadcastMutedTextStyle}>
                <th className="px-3 py-2 w-12">#</th>
                <th className="px-3 py-2">Team</th>
                <th className="px-3 py-2 text-right">W-L</th>
                <th className="px-3 py-2 text-right">PF</th>
                <th className="px-3 py-2 text-right">Avg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((team, index) => {
                const games = team.wins + team.losses;
                const avg = games > 0 ? team.fpts / games : 0;
                const playoffLine = hasGames && index === 5;
                return (
                  <tr
                    key={team.rosterId}
                    className="border-t"
                    style={{
                      borderColor: playoffLine ? '#2563eb' : PANEL.hairline,
                      background: hasGames && team.seed <= 6 ? 'rgba(37,99,235,0.045)' : 'transparent',
                    }}
                  >
                    <td className="px-3 py-3 font-black tabular-nums" style={broadcastMutedTextStyle}>{team.seed}</td>
                    <td className="px-3 py-3 font-bold" style={broadcastBodyTextStyle}>{team.teamName}</td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums" style={broadcastBodyTextStyle}>{team.wins}-{team.losses}</td>
                    <td className="px-3 py-3 text-right tabular-nums" style={broadcastMutedTextStyle}>{team.fpts.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right tabular-nums" style={broadcastMutedTextStyle}>{avg.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </BroadcastPanel>
    </section>
  );
}
