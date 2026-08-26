import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import PlayoffScenarioLab, { type PlayoffLabGame, type PlayoffLabTeam } from '@/components/standings/PlayoffScenarioLab';
import { CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import { buildLeagueProjectionSnapshotsV3 } from '@/lib/fantasy/weekly-projections-next';
import {
  getLeague,
  getLeagueMatchups,
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
  const [teamsData, league, nameMap] = await Promise.all([
    getTeamsData(leagueId),
    getLeague(leagueId).catch(() => null),
    getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
  ]);

  const settings = (league?.settings || {}) as {
    playoff_teams?: number;
    playoff_week_start?: number;
    playoff_start_week?: number;
  };
  const playoffTeams = Math.max(2, Number(settings.playoff_teams ?? 7));
  const playoffStartWeek = Number(settings.playoff_week_start ?? settings.playoff_start_week ?? 15);
  const regularSeasonEnd = clamp(playoffStartWeek - 1, 1, 17);

  // Do not use Sleeper's NFL-state week here. During preseason that number is the
  // preseason week (for example, Week 3), not East v. West's fantasy week. The
  // standings themselves tell us how many fantasy weeks have actually completed.
  const completedWeeks = teamsData.length
    ? clamp(
        Math.min(...teamsData.map((team) => Math.max(0, team.wins + team.losses + team.ties))),
        0,
        regularSeasonEnd,
      )
    : 0;
  const scenarioStartWeek = Math.min(regularSeasonEnd + 1, completedWeeks + 1);

  const [history, currentProjections] = await Promise.all([
    Promise.all(
      Array.from({ length: completedWeeks }, (_, index) => index + 1)
        .map((week) => getLeagueMatchups(leagueId, week).catch(() => [] as SleeperMatchup[])),
    ),
    scenarioStartWeek <= regularSeasonEnd
      ? buildLeagueProjectionSnapshotsV3({
          season: CURRENT_SEASON,
          week: scenarioStartWeek,
          saveSnapshots: false,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const projectionByTeam = new Map(
    currentProjections
      .filter((projection) => Number.isFinite(projection.optimalTotal ?? NaN))
      .map((projection) => [projection.teamName, Number(projection.optimalTotal)] as const),
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
    const actualPpg = gamesPlayed > 0 ? team.fpts / gamesPlayed : null;
    const projectedPpg = projectionByTeam.get(team.teamName) ?? null;
    const ppg = actualPpg !== null && projectedPpg !== null
      ? (actualPpg * 0.7) + (projectedPpg * 0.3)
      : actualPpg ?? projectedPpg ?? 125;
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
      ppg: Number(ppg.toFixed(2)),
      scoreStdDev: Math.max(10, Math.min(35, Math.sqrt(variance) || 18)),
    };
  });

  const remainingWeeks = scenarioStartWeek <= regularSeasonEnd
    ? Array.from({ length: regularSeasonEnd - scenarioStartWeek + 1 }, (_, index) => scenarioStartWeek + index)
    : [];
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
          scenarioStartWeek={scenarioStartWeek}
          regularSeasonEnd={regularSeasonEnd}
          completedWeeks={completedWeeks}
        />
      </div>
    </div>
  );
}
