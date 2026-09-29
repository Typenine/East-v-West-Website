import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import PlayoffScenarioLab from '@/components/standings/PlayoffScenarioLab';
import { CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import { loadProjectionSnapshotsForWeek } from '@/lib/fantasy/projection-snapshot-store';
import {
  PRIOR_PSEUDO_GAMES,
  type PlayoffLabGame,
  type PlayoffLabTeam,
} from '@/lib/fantasy/playoff-model';
import {
  getLeague,
  getLeagueMatchups,
  getRosterIdToTeamNameMap,
  getTeamsData,
  type SleeperMatchup,
} from '@/lib/utils/sleeper-api';

export const revalidate = 180;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleVariance(values: number[]) {
  if (values.length < 2) return null;
  const mean = average(values) || 0;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}

export default async function PlayoffLabPage() {
  const leagueId = LEAGUE_IDS.CURRENT;
  const sleeperOptions = { timeoutMs: 3500, retries: 1, retryDelayMs: 150 } as const;

  const [teamsData, league, nameMap] = await Promise.all([
    getTeamsData(leagueId, sleeperOptions),
    getLeague(leagueId, sleeperOptions).catch(() => null),
    getRosterIdToTeamNameMap(leagueId, sleeperOptions).catch(() => new Map<number, string>()),
  ]);

  const settings = (league?.settings || {}) as {
    playoff_teams?: number;
    playoff_week_start?: number;
    playoff_start_week?: number;
  };
  const playoffTeams = Math.max(2, Number(settings.playoff_teams ?? 7));
  const playoffStartWeek = Number(settings.playoff_week_start ?? settings.playoff_start_week ?? 15);
  const regularSeasonEnd = clamp(playoffStartWeek - 1, 1, 17);

  const completedWeeks = teamsData.length
    ? clamp(
        Math.min(...teamsData.map((team) => Math.max(0, team.wins + team.losses + team.ties))),
        0,
        regularSeasonEnd,
      )
    : 0;
  const scenarioStartWeek = Math.min(regularSeasonEnd + 1, completedWeeks + 1);

  const weeks = Array.from({ length: regularSeasonEnd }, (_, index) => index + 1);
  const projectionWeek = Math.min(regularSeasonEnd, Math.max(1, scenarioStartWeek));
  const fallbackProjectionWeek = Math.max(1, Math.min(regularSeasonEnd, completedWeeks || 1));

  const [weeklyMatchups, currentProjectionSnapshots, fallbackProjectionSnapshots] = await Promise.all([
    Promise.all(
      weeks.map((week) =>
        getLeagueMatchups(leagueId, week, sleeperOptions).catch(() => [] as SleeperMatchup[]),
      ),
    ),
    loadProjectionSnapshotsForWeek({
      season: Number(CURRENT_SEASON),
      week: projectionWeek,
    }).catch(() => []),
    fallbackProjectionWeek !== projectionWeek
      ? loadProjectionSnapshotsForWeek({
          season: Number(CURRENT_SEASON),
          week: fallbackProjectionWeek,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const projectionSnapshots = currentProjectionSnapshots.length >= Math.min(teamsData.length, 8)
    ? currentProjectionSnapshots
    : fallbackProjectionSnapshots.length
      ? fallbackProjectionSnapshots
      : currentProjectionSnapshots;
  const projectionSource = projectionSnapshots.length
    ? 'saved Week ' + String(
        projectionSnapshots === currentProjectionSnapshots ? projectionWeek : fallbackProjectionWeek,
      ) + ' lineup projections'
    : 'the league scoring baseline because no saved weekly projection was available';

  const projectionByTeam = new Map(
    projectionSnapshots
      .map((snapshot) => {
        const value = Number(snapshot.currentTotal ?? snapshot.optimalTotal ?? NaN);
        return [snapshot.teamName, value] as const;
      })
      .filter(([, value]) => Number.isFinite(value) && value > 0),
  );

  const weeklyScores = new Map<number, number[]>();
  for (let weekIndex = 0; weekIndex < completedWeeks; weekIndex += 1) {
    for (const matchup of weeklyMatchups[weekIndex] || []) {
      const points = Number(matchup.custom_points ?? matchup.points ?? 0);
      if (!Number.isFinite(points) || points <= 0) continue;
      const scores = weeklyScores.get(matchup.roster_id) || [];
      scores.push(points);
      weeklyScores.set(matchup.roster_id, scores);
    }
  }

  let residualSumSquares = 0;
  let residualDegrees = 0;
  for (const scores of weeklyScores.values()) {
    if (scores.length < 2) continue;
    const teamMean = average(scores) || 0;
    residualSumSquares += scores.reduce((sum, value) => sum + (value - teamMean) ** 2, 0);
    residualDegrees += scores.length - 1;
  }
  const pooledWeeklyStdDev = clamp(
    residualDegrees > 0 ? Math.sqrt(residualSumSquares / residualDegrees) : 18,
    15,
    28,
  );

  const validProjectionValues = [...projectionByTeam.values()];
  const totalLeaguePoints = teamsData.reduce((sum, team) => sum + Number(team.fpts || 0), 0);
  const totalLeagueGames = teamsData.reduce(
    (sum, team) => sum + Math.max(0, team.wins + team.losses + team.ties),
    0,
  );
  const leagueActualPpg = totalLeagueGames > 0 ? totalLeaguePoints / totalLeagueGames : null;
  const leagueProjectionPpg = average(validProjectionValues);
  const leagueBaseline = leagueProjectionPpg ?? leagueActualPpg ?? 125;

  const teams: PlayoffLabTeam[] = teamsData.map((team) => {
    const scores = weeklyScores.get(team.rosterId) || [];
    const gamesPlayed = Math.max(0, team.wins + team.losses + team.ties);
    const actualPpg = gamesPlayed > 0 ? team.fpts / gamesPlayed : null;
    const priorPpg = projectionByTeam.get(team.teamName) ?? leagueBaseline;
    const modelPpg = actualPpg !== null
      ? ((priorPpg * PRIOR_PSEUDO_GAMES) + (actualPpg * gamesPlayed)) / (PRIOR_PSEUDO_GAMES + gamesPlayed)
      : priorPpg;

    const observedVariance = sampleVariance(scores);
    const observedDegrees = Math.max(0, scores.length - 1);
    const variancePriorWeight = 5;
    const shrunkVariance = (
      ((observedVariance ?? 0) * observedDegrees) +
      ((pooledWeeklyStdDev ** 2) * variancePriorWeight)
    ) / (observedDegrees + variancePriorWeight);

    const weeklyStdDev = clamp(Math.sqrt(shrunkVariance), 14, 30);
    const strengthStdDev = clamp(
      pooledWeeklyStdDev * Math.sqrt(2.25 / (gamesPlayed + 2.25)),
      5,
      13,
    );

    return {
      rosterId: team.rosterId,
      teamName: team.teamName,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      pointsFor: team.fpts,
      gamesPlayed,
      actualPpg: actualPpg !== null ? Number(actualPpg.toFixed(2)) : null,
      priorPpg: Number(priorPpg.toFixed(2)),
      modelPpg: Number(modelPpg.toFixed(2)),
      weeklyStdDev: Number(weeklyStdDev.toFixed(2)),
      strengthStdDev: Number(strengthStdDev.toFixed(2)),
    };
  });

  const games: PlayoffLabGame[] = [];
  let loadedFutureWeeks = 0;
  for (let week = scenarioStartWeek; week <= regularSeasonEnd; week += 1) {
    const matchups = weeklyMatchups[week - 1] || [];
    if (matchups.length > 0) loadedFutureWeeks += 1;

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
        id: String(week) + '-' + String(matchupId),
        week,
        aRosterId: a.roster_id,
        aTeam: nameMap.get(a.roster_id)
          || teamsData.find((team) => team.rosterId === a.roster_id)?.teamName
          || 'Roster ' + String(a.roster_id),
        bRosterId: b.roster_id,
        bTeam: nameMap.get(b.roster_id)
          || teamsData.find((team) => team.rosterId === b.roster_id)?.teamName
          || 'Roster ' + String(b.roster_id),
      });
    }
  }

  const expectedFutureWeeks = Math.max(0, regularSeasonEnd - scenarioStartWeek + 1);
  const scheduleCoverage = loadedFutureWeeks < expectedFutureWeeks
    ? 'Some future Sleeper schedule data did not load, so odds may be incomplete until the next refresh.'
    : null;

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader
        title="Playoff Lab"
        subtitle={CURRENT_SEASON + ' playoff forecast, scenarios, clinching paths, and elimination paths'}
        actions={
          <Link
            href="/standings"
            className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-bold transition hover:bg-white/5"
          >
            Standings
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
          projectionSource={projectionSource}
          scheduleCoverage={scheduleCoverage}
        />
      </div>
    </div>
  );
}
