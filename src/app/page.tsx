import Link from 'next/link';
import CountdownTimer from '@/components/ui/countdown-timer';
import MatchupCard from '@/components/ui/matchup-card';
import { IMPORTANT_DATES, LEAGUE_IDS } from '@/lib/constants/league';
import { getLeagueMatchups, getTeamsData } from '@/lib/utils/sleeper-api';
import EmptyState from '@/components/ui/empty-state';

export const revalidate = 0; // always fetch fresh Sleeper data

export default async function Home() {
  const leagueId = LEAGUE_IDS.CURRENT;
  const week1Matchups: Array<{
    homeTeam: string;
    awayTeam: string;
    homeScore?: number;
    awayScore?: number;
    week: number;
    kickoffTime?: string;
  }> = [];
  try {
    const [matchups, teams] = await Promise.all([
      getLeagueMatchups(leagueId, 1),
      getTeamsData(leagueId),
    ]);
    const rosterIdToName = new Map<number, string>(
      teams.map((t) => [t.rosterId, t.teamName])
    );
    const groups = new Map<number, { roster_id: number; points: number }[]>();
    for (const m of matchups) {
      const arr = groups.get(m.matchup_id) || [];
      arr.push({ roster_id: m.roster_id, points: m.points });
      groups.set(m.matchup_id, arr);
    }
    for (const arr of groups.values()) {
      if (arr.length >= 2) {
        const [a, b] = arr; // arbitrary away/home
        const includeScores = (b.points ?? 0) > 0 || (a.points ?? 0) > 0;
        week1Matchups.push({
          homeTeam: rosterIdToName.get(b.roster_id) ?? `Roster ${b.roster_id}`,
          awayTeam: rosterIdToName.get(a.roster_id) ?? `Roster ${a.roster_id}`,
          homeScore: includeScores ? b.points : undefined,
          awayScore: includeScores ? a.points : undefined,
          week: 1,
        });
      }
    }
  } catch {
    // If Sleeper data isn't available yet, render with empty state below
  }
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">East v. West Fantasy Football</h1>
      
      {/* Countdowns Section */}
      <section className="mb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CountdownTimer 
            targetDate={IMPORTANT_DATES.NFL_WEEK_1_START} 
            title="Regular season starts in" 
            className="bg-blue-50 border border-blue-200"
          />
          <CountdownTimer 
            targetDate={IMPORTANT_DATES.TRADE_DEADLINE} 
            title="Trade deadline in" 
            className="bg-amber-50 border border-amber-200"
          />
        </div>
      </section>
      
      {/* Week 1 Preview */}
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Week 1 Preview</h2>
        {week1Matchups.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {week1Matchups.map((matchup, index) => (
              <MatchupCard 
                key={index}
                homeTeam={matchup.homeTeam}
                awayTeam={matchup.awayTeam}
                homeScore={matchup.homeScore}
                awayScore={matchup.awayScore}
                kickoffTime={matchup.kickoffTime}
                week={matchup.week}
                className="bg-white"
              />
            ))}
          </div>
        ) : (
          <EmptyState 
            title="No Week 1 matchups"
            message="Matchups for Week 1 are not yet available from Sleeper. Check back closer to kickoff."
          />
        )}
      </section>
      
      {/* Quick Links */}
      <section>
        <h2 className="text-2xl font-bold mb-6">Quick Links</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Link 
            href="/teams" 
            className="bg-slate-700 text-white p-4 rounded-lg text-center font-medium hover:bg-slate-800 transition-colors"
            aria-label="View all teams"
          >
            Teams
          </Link>
          <Link 
            href="/standings" 
            className="bg-slate-700 text-white p-4 rounded-lg text-center font-medium hover:bg-slate-800 transition-colors"
            aria-label="View league standings"
          >
            Standings
          </Link>
          <Link 
            href="/history" 
            className="bg-slate-700 text-white p-4 rounded-lg text-center font-medium hover:bg-slate-800 transition-colors"
            aria-label="View league history"
          >
            History
          </Link>
          <Link 
            href="/draft" 
            className="bg-slate-700 text-white p-4 rounded-lg text-center font-medium hover:bg-slate-800 transition-colors"
            aria-label="View draft information"
          >
            Draft
          </Link>
        </div>
      </section>
    </div>
  );
}
