import Image from 'next/image';
import CountdownTimer from '@/components/ui/countdown-timer';
import MatchupCard from '@/components/ui/matchup-card';
import { IMPORTANT_DATES, LEAGUE_IDS } from '@/lib/constants/league';
import { getLeagueMatchups, getTeamsData, getNFLState } from '@/lib/utils/sleeper-api';
import EmptyState from '@/components/ui/empty-state';
import SectionHeader from '@/components/ui/SectionHeader';
import LinkButton from '@/components/ui/LinkButton';

export const revalidate = 20; // ISR: refresh at most every 20s to reduce API churn and flakiness

export default async function Home() {
  const leagueId = LEAGUE_IDS.CURRENT;
  const currentWeekMatchups: Array<{
    homeTeam: string;
    awayTeam: string;
    homeRosterId: number;
    awayRosterId: number;
    homeScore?: number;
    awayScore?: number;
    week: number;
    kickoffTime?: string;
  }> = [];
  let currentWeek = 1;
  try {
    // Get current NFL state and teams in parallel
    const [nflState, teams] = await Promise.all([
      getNFLState().catch(() => ({ week: 1, display_week: 1, season_type: 'regular' })),
      getTeamsData(leagueId).catch(() => [] as Array<{ rosterId: number; teamName: string }>),
    ]);
    const seasonType = (nflState as { season_type?: string }).season_type ?? 'regular';
    const hasScores = (nflState as { season_has_scores?: boolean }).season_has_scores;
    const rawWeek = (nflState as { week?: number; display_week?: number }).week ?? (nflState as { display_week?: number }).display_week ?? 1;
    const week1Ts = new Date(IMPORTANT_DATES.NFL_WEEK_1_START).getTime();
    const beforeWeek1 = Number.isFinite(week1Ts) && Date.now() < week1Ts;
    if (seasonType !== 'regular' || beforeWeek1 || hasScores === false) {
      currentWeek = 1;
    } else {
      // Determine week display policy based on day-of-week in Eastern Time
      const now = new Date();
      const dowET = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(now);
      const isMonTue = dowET === 'Mon' || dowET === 'Tue';
      const sleeperWeek = typeof rawWeek === 'number' && rawWeek >= 1 && rawWeek <= 18 ? rawWeek : 1;
      // Freeze to previous week on Mon/Tue; flip to current sleeper week starting Wed
      currentWeek = isMonTue ? Math.max(1, sleeperWeek - 1) : sleeperWeek;
    }

    const matchups = await getLeagueMatchups(leagueId, currentWeek);
    // If the current week hasn't started (all 0-0) OR Sleeper returns empty, show previous week's matchups instead
    const hasAnyPoints = matchups.some((m) => ((m as { custom_points?: number; points?: number }).custom_points ?? m.points ?? 0) > 0);
    let mus = matchups;
    // Only allow fallback to previous week on Mon/Tue Eastern to avoid flipping back after Wed
    {
      const now = new Date();
      const dowET = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(now);
      const allowFallbackToPrev = dowET === 'Mon' || dowET === 'Tue';
      if (allowFallbackToPrev && (matchups.length === 0 || !hasAnyPoints) && currentWeek > 1) {
        const prevWeek = currentWeek - 1;
        const prev = await getLeagueMatchups(leagueId, prevWeek);
        // Use previous only if it has any entries
        if (prev.length > 0) {
          currentWeek = prevWeek;
          mus = prev;
        }
      }
    }
    const rosterIdToName = new Map<number, string>(
      teams.map((t) => [t.rosterId, t.teamName])
    );
    const groups = new Map<number, { roster_id: number; points: number }[]>();
    for (const m of mus) {
      const arr = groups.get(m.matchup_id) || [];
      // Use points reported by Sleeper
      const pts = (m.custom_points ?? m.points ?? 0);
      arr.push({ roster_id: m.roster_id, points: pts });
      groups.set(m.matchup_id, arr);
    }
    for (const arr of groups.values()) {
      if (arr.length >= 2) {
        const [a, b] = arr; // arbitrary away/home
        const includeScores = (b.points ?? 0) > 0 || (a.points ?? 0) > 0;
        currentWeekMatchups.push({
          homeTeam: rosterIdToName.get(b.roster_id) ?? `Roster ${b.roster_id}`,
          awayTeam: rosterIdToName.get(a.roster_id) ?? `Roster ${a.roster_id}`,
          homeRosterId: b.roster_id,
          awayRosterId: a.roster_id,
          homeScore: includeScores ? b.points : undefined,
          awayScore: includeScores ? a.points : undefined,
          week: currentWeek,
        });
      }
    }
  } catch {
    // If Sleeper data isn't available yet, render with empty state below
  }
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col items-center gap-4 mb-8">
        <Image
          src="/assets/teams/East v West Logos/Official East v. West Logo.png"
          alt="East v. West League Logo"
          width={200}
          height={200}
          priority
          className="h-24 w-auto object-contain"
        />
        <SectionHeader title="East v. West Fantasy Football" className="mx-auto max-w-fit" />
      </div>
      
      {/* Countdowns Section */}
      <section className="mb-12">
        <SectionHeader title="Key dates" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CountdownTimer 
            targetDate={IMPORTANT_DATES.TRADE_DEADLINE} 
            title="Trade deadline in"
          />
          <CountdownTimer 
            targetDate={IMPORTANT_DATES.PLAYOFFS_START} 
            title="Playoffs start in"
          />
        </div>
      </section>
      
      {/* Current Week Preview */}
      <section className="mb-12">
        <SectionHeader title={`Week ${currentWeek} matchups`} />
        {currentWeekMatchups.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentWeekMatchups.map((matchup, index) => (
              <MatchupCard 
                key={index}
                homeTeam={matchup.homeTeam}
                awayTeam={matchup.awayTeam}
                homeRosterId={matchup.homeRosterId}
                awayRosterId={matchup.awayRosterId}
                homeScore={matchup.homeScore}
                awayScore={matchup.awayScore}
                kickoffTime={matchup.kickoffTime}
                week={matchup.week}
              />
            ))}
          </div>
        ) : (
          <EmptyState 
            title={`No Week ${currentWeek} matchups`}
            message={`Matchups for Week ${currentWeek} are not yet available from Sleeper. Check back closer to kickoff.`}
          />
        )}
      </section>
      
      {/* Quick Links */}
      <section>
        <SectionHeader title="Quick links" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <LinkButton href="/teams" aria-label="View all teams">Teams</LinkButton>
          <LinkButton href="/standings" aria-label="View league standings">Standings</LinkButton>
          <LinkButton href="/history" aria-label="View league history">History</LinkButton>
          <LinkButton href="/draft" aria-label="View draft information">Draft</LinkButton>
          <LinkButton href="/suggestions" aria-label="Submit anonymous suggestions">Suggestions</LinkButton>
        </div>
      </section>
    </div>
  );
}
