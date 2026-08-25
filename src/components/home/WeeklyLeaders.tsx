import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel } from '@/components/ui/BroadcastPanel';
import { broadcastBodyTextStyle, broadcastMutedTextStyle, PANEL } from '@/lib/ui/broadcast-styles';

export type HomepageMatchup = {
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
};

export default function WeeklyLeaders({ week, matchups }: { week: number; matchups: HomepageMatchup[] }) {
  const completed = matchups.filter((m) => m.homeScore != null && m.awayScore != null);

  if (completed.length === 0) {
    return (
      <section className="mb-10 sm:mb-12">
        <SectionHeader title="Weekly leaders" subtitle={`Week ${week}`} />
        <BroadcastPanel accent="#f59e0b" title="Week awards" meta="Waiting for scores">
          <div className="py-3 text-sm" style={broadcastMutedTextStyle}>
            High score, closest game, biggest win and highest-scoring matchup will populate automatically once Week {week} games begin.
          </div>
        </BroadcastPanel>
      </section>
    );
  }

  const teamScores = completed.flatMap((m) => [
    { team: m.homeTeam, score: m.homeScore ?? 0 },
    { team: m.awayTeam, score: m.awayScore ?? 0 },
  ]).sort((a, b) => b.score - a.score);

  const high = teamScores[0];
  const byMargin = [...completed].sort(
    (a, b) => Math.abs((b.homeScore ?? 0) - (b.awayScore ?? 0)) - Math.abs((a.homeScore ?? 0) - (a.awayScore ?? 0))
  );
  const byClose = [...completed].sort(
    (a, b) => Math.abs((a.homeScore ?? 0) - (a.awayScore ?? 0)) - Math.abs((b.homeScore ?? 0) - (b.awayScore ?? 0))
  );
  const byTotal = [...completed].sort(
    (a, b) => ((b.homeScore ?? 0) + (b.awayScore ?? 0)) - ((a.homeScore ?? 0) + (a.awayScore ?? 0))
  );

  const blowout = byMargin[0];
  const closest = byClose[0];
  const shootout = byTotal[0];
  const blowoutMargin = Math.abs((blowout.homeScore ?? 0) - (blowout.awayScore ?? 0));
  const blowoutWinner = (blowout.homeScore ?? 0) >= (blowout.awayScore ?? 0) ? blowout.homeTeam : blowout.awayTeam;
  const closeMargin = Math.abs((closest.homeScore ?? 0) - (closest.awayScore ?? 0));

  const cards = [
    { label: 'High score', primary: high.team, secondary: high.score.toFixed(1) },
    { label: 'Biggest win', primary: blowoutWinner, secondary: `+${blowoutMargin.toFixed(1)}` },
    { label: 'Closest game', primary: `${closest.awayTeam} vs ${closest.homeTeam}`, secondary: `${closeMargin.toFixed(1)} pts` },
    { label: 'Shootout', primary: `${shootout.awayTeam} vs ${shootout.homeTeam}`, secondary: `${((shootout.homeScore ?? 0) + (shootout.awayScore ?? 0)).toFixed(1)} combined` },
  ];

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader title="Weekly leaders" subtitle={`Week ${week}`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl p-4" style={{ background: PANEL.tintSoft, border: `1px solid ${PANEL.hairline}` }}>
            <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={broadcastMutedTextStyle}>{card.label}</div>
            <div className="mt-2 text-sm font-black leading-snug" style={broadcastBodyTextStyle}>{card.primary}</div>
            <div className="mt-1 text-lg font-black tabular-nums text-amber-500">{card.secondary}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
