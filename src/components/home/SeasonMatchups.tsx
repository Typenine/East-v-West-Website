import Link from 'next/link';
import MatchupCard from '@/components/ui/matchup-card';
import EmptyState from '@/components/ui/empty-state';
import SectionHeader from '@/components/ui/SectionHeader';

export type SeasonHomeMatchup = {
  homeTeam: string;
  awayTeam: string;
  homeRosterId: number;
  awayRosterId: number;
  homeScore?: number;
  awayScore?: number;
  week: number;
  matchupId: number;
  kickoffTime?: string;
};

export default function SeasonMatchups({
  selectedWeek,
  maxWeeks,
  matchups,
}: {
  selectedWeek: number;
  maxWeeks: number;
  matchups: SeasonHomeMatchup[];
}) {
  const prevWeek = Math.max(1, selectedWeek - 1);
  const nextWeek = Math.min(maxWeeks, selectedWeek + 1);

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader
        title="This week in East v. West"
        subtitle={`Week ${selectedWeek}`}
        actions={
          <Link href="/matchups" className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            Full schedule →
          </Link>
        }
      />

      <div className="mb-5 flex items-center gap-2" aria-label="Select week">
        <Link
          href={`/?week=${prevWeek}`}
          prefetch={false}
          aria-disabled={selectedWeek === 1}
          className={`rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-semibold ${
            selectedWeek === 1 ? 'pointer-events-none opacity-40' : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          ‹ Week {prevWeek}
        </Link>
        <div className="rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 py-1.5 text-sm font-black text-white">
          Week {selectedWeek}
        </div>
        <Link
          href={`/?week=${nextWeek}`}
          prefetch={false}
          aria-disabled={selectedWeek === maxWeeks}
          className={`rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-semibold ${
            selectedWeek === maxWeeks ? 'pointer-events-none opacity-40' : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
        >
          Week {nextWeek} ›
        </Link>
      </div>

      {matchups.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {matchups.map((matchup) => (
            <MatchupCard
              key={`${matchup.week}-${matchup.matchupId}`}
              homeTeam={matchup.homeTeam}
              awayTeam={matchup.awayTeam}
              homeRosterId={matchup.homeRosterId}
              awayRosterId={matchup.awayRosterId}
              homeScore={matchup.homeScore}
              awayScore={matchup.awayScore}
              kickoffTime={matchup.kickoffTime}
              week={matchup.week}
              matchupId={matchup.matchupId}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={`Week ${selectedWeek} matchups are not populated yet`}
          message="The in-season home is live. Sleeper matchup cards will appear here automatically when the schedule is available."
        />
      )}
    </section>
  );
}
