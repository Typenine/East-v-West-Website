import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import PlayoffScenarioLab, { type PlayoffLabGame, type PlayoffLabTeam } from '@/components/standings/PlayoffScenarioLab';
import { CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import {
  getLeague,
  getLeagueMatchups,
  getNFLState,
  getRosterIdToTeamNameMap,
  getTeamsData,
  type SleeperMatchup,
} from '@/lib/utils/sleeper-api';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default async function PlayoffLabPage() {
  const leagueId = LEAGUE_IDS.CURRENT;
  const [teamsData, league, nflState, nameMap] = await Promise.all([
    getTeamsData(leagueId),
    getLeague(leagueId).catch(() => null),
    getNFLState().catch(() => ({ week: 1 } as { week?: number })),
    getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
  ]);

  const settings = (league?.settings || {}) as {
    playoff_teams?: number;
    playoff_week_start?: number;
    playoff_start_week?: number;
  };
  const playoffTeams = Math.max(2, Number(settings.playoff_teams ?? 6));
  const playoffStartWeek = Number(settings.playoff_week_start ?? settings.playoff_start_week ?? 15);
  const regularSeasonEnd = clamp(playoffStartWeek - 1, 1, 17);
  const currentWeek = clamp(Number((nflState as { week?: number }).week ?? 1), 1, regularSeasonEnd);

  const historyWeeks = Array.from({ length: Math.max(0, currentWeek - 1) }, (_, index) => index + 1);
  const history = await Promise.all(
    historyWeeks.map((week) => getLeagueMatchups(leagueId, week).catch(() => [] as SleeperMatchup[])),
  );

  const weeklyScores = new Map<number, number[]>();
  for (const week of history) {
    for (const matchup of week) {
      const points = Number(matchup.custom_points ?? matchup.points ?? 0);
      if (!Number.isFinite(points) || points <= 0) continue;
      const scores = weeklyScores.get(matchup.roster_id) || [];
      scores.push(points);
      weeklyScores.set(matchup.roster_id, scores);
    }
  }

  const teams: PlayoffLabTeam[] = teamsData.map((team) => {
    const scores = weeklyScores.get(team.rosterId) || [];
    const gamesPlayed = Math.max(0, team.wins + team.losses + team.ties);
    const ppg = gamesPlayed > 0 ? team.fpts / gamesPlayed : 125;
    const mean = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : ppg;
    const variance = scores.length > 1
      ? scores.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / scores.length
      : Math.pow(18, 2);

    return {
      rosterId: team.rosterId,
      teamName: team.teamName,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      pointsFor: team.fpts,
      gamesPlayed,
      ppg: Number((ppg || 125).toFixed(2)),
      scoreStdDev: Math.max(10, Math.min(35, Math.sqrt(variance) || 18)),
    };
  });

  const remainingWeeks = Array.from({ length: regularSeasonEnd - currentWeek + 1 }, (_, index) => currentWeek + index);
  const remaining = await Promise.all(
    remainingWeeks.map(async (week) => ({
      week,
      matchups: await getLeagueMatchups(leagueId, week).catch(() => [] as SleeperMatchup[]),
    })),
  );

  const games: PlayoffLabGame[] = [];
  for (const { week, matchups } of remaining) {
    const grouped = new Map<number, SleeperMatchup[]>();
    for (const matchup of matchups) {
      const group = grouped.get(matchup.matchup_id) || [];
      group.push(matchup);
      grouped.set(matchup.matchup_id, group);
    }
    for (const [matchupId, pair] of grouped.entries()) {
      if (pair.length < 2) continue;
      const [a, b] = pair;
      games.push({
        id: `${week}-${matchupId}`,
        week,
        aRosterId: a.roster_id,
        aTeam: nameMap.get(a.roster_id) || teamsData.find((team) => team.rosterId === a.roster_id)?.teamName || `Roster ${a.roster_id}`,
        bRosterId: b.roster_id,
        bTeam: nameMap.get(b.roster_id) || teamsData.find((team) => team.rosterId === b.roster_id)?.teamName || `Roster ${b.roster_id}`,
      });
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader
        title="Playoff Scenario Lab"
        subtitle={`${CURRENT_SEASON} playoff odds, remaining schedule, and what-if outcomes`}
        actions={
          <Link href="/standings" className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-bold hover:bg-white/5">
            Back to standings
          </Link>
        }
      />
      <div className="mt-5">
        <PlayoffScenarioLab
          teams={teams}
          games={games}
          playoffTeams={playoffTeams}
          currentWeek={currentWeek}
          regularSeasonEnd={regularSeasonEnd}
        />
      </div>
    </div>
  );
}
