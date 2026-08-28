import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import MatchupCard from '@/components/ui/matchup-card';
import { CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import {
  getLeagueMatchups,
  getRosterIdToTeamNameMap,
  type SleeperMatchup,
} from '@/lib/utils/sleeper-api';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

const REGULAR_SEASON_WEEKS = 14;

type ScheduleMatchup = {
  week: number;
  matchupId: number;
  awayTeam: string;
  homeTeam: string;
  awayRosterId: number;
  homeRosterId: number;
  awayScore?: number;
  homeScore?: number;
};

function buildWeekSchedule(
  week: number,
  matchups: SleeperMatchup[],
  nameMap: Map<number, string>,
): ScheduleMatchup[] {
  const byId = new Map<number, SleeperMatchup[]>();
  for (const matchup of matchups) {
    const group = byId.get(matchup.matchup_id) || [];
    group.push(matchup);
    byId.set(matchup.matchup_id, group);
  }

  return Array.from(byId.entries())
    .filter(([, pair]) => pair.length >= 2)
    .map(([matchupId, pair]) => {
      const [away, home] = pair;
      const awayPoints = Number(away.custom_points ?? away.points ?? 0);
      const homePoints = Number(home.custom_points ?? home.points ?? 0);
      const hasScore = awayPoints !== 0 || homePoints !== 0;

      return {
        week,
        matchupId,
        awayTeam: nameMap.get(away.roster_id) || `Roster ${away.roster_id}`,
        homeTeam: nameMap.get(home.roster_id) || `Roster ${home.roster_id}`,
        awayRosterId: away.roster_id,
        homeRosterId: home.roster_id,
        awayScore: hasScore ? awayPoints : undefined,
        homeScore: hasScore ? homePoints : undefined,
      };
    })
    .sort((a, b) => a.matchupId - b.matchupId);
}

export default async function FullSchedulePage() {
  const leagueId = LEAGUE_IDS.CURRENT;
  const weeks = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, index) => index + 1);

  const [nameMap, weeklyMatchups] = await Promise.all([
    getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
    Promise.all(
      weeks.map((week) =>
        getLeagueMatchups(leagueId, week).catch(() => [] as SleeperMatchup[]),
      ),
    ),
  ]);

  const schedule = weeks.map((week, index) => ({
    week,
    matchups: buildWeekSchedule(week, weeklyMatchups[index] || [], nameMap),
  }));

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader
        title={`${CURRENT_SEASON} League Schedule`}
        subtitle="Full regular-season schedule"
        actions={
          <Link href="/" className="text-sm text-[var(--accent)] hover:underline">
            ← Back to home
          </Link>
        }
      />

      <div className="mb-8 mt-4 flex flex-wrap gap-2" aria-label="Jump to week">
        {schedule.map(({ week }) => (
          <a
            key={week}
            href={`#week-${week}`}
            className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            Week {week}
          </a>
        ))}
      </div>

      <div className="space-y-10">
        {schedule.map(({ week, matchups }) => (
          <section key={week} id={`week-${week}`} className="scroll-mt-24">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2">
              <div>
                <h2 className="text-xl font-black text-[var(--text)]">Week {week}</h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {matchups.length ? `${matchups.length} matchups` : 'Schedule not populated yet'}
                </p>
              </div>
              <Link
                href={`/?week=${week}`}
                className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)] hover:underline"
              >
                View on home →
              </Link>
            </div>

            {matchups.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {matchups.map((matchup) => (
                  <MatchupCard
                    key={`${week}-${matchup.matchupId}`}
                    week={week}
                    matchupId={matchup.matchupId}
                    awayTeam={matchup.awayTeam}
                    homeTeam={matchup.homeTeam}
                    awayRosterId={matchup.awayRosterId}
                    homeRosterId={matchup.homeRosterId}
                    awayScore={matchup.awayScore}
                    homeScore={matchup.homeScore}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-sm text-[var(--muted)]">
                Sleeper has not published matchups for this week yet.
              </div>
            )}
          </section>
        ))}
      </div>

      <p className="mt-10 text-xs text-[var(--muted)]">
        Schedule and scores come from the current East v. West Sleeper league. Matchup detail links open the existing weekly matchup pages.
      </p>
    </div>
  );
}
