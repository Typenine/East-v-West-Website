import type { SleeperPlayer } from '@/lib/utils/sleeper-api';
import type { TeamAssets } from '@/lib/server/trade-assets';
import type {
  TeamDashboardComparisonRow,
  TeamDashboardDraftPick,
  TeamDashboardLoosePlayer,
  TeamDashboardLooseRoster,
  TeamDashboardLooseTeam,
  TeamDashboardPositionAges,
  TeamDashboardRanks,
} from '@/lib/home/team-dashboard-types';
import {
  dashboardDraftPickValue,
  dashboardNumber,
  dashboardPosition,
  rankDashboardValues,
  roundOrdinal,
  sleeperStat,
} from '@/lib/home/team-dashboard-helpers';

type DashboardDraftOverview = null | {
  year?: number;
  allSlots?: Array<{ overall: number; round: number; team: string }>;
};

const AGE_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
type AgePosition = (typeof AGE_POSITIONS)[number];
type PositionAgeValues = Record<AgePosition, number[]>;

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function rosterAgeData(
  roster: TeamDashboardLooseRoster | undefined,
  playerMap: Record<string, SleeperPlayer>
): {
  averageAge: number | null;
  positionAges: TeamDashboardPositionAges;
  allAges: number[];
  positionAgeValues: PositionAgeValues;
} {
  const positionAgeValues: PositionAgeValues = { QB: [], RB: [], WR: [], TE: [] };
  const allAges: number[] = [];

  for (const id of Array.from(new Set(roster?.players || []))) {
    const player = playerMap[id] as TeamDashboardLoosePlayer | undefined;
    const position = dashboardPosition(player?.position);
    const age = dashboardNumber(player?.age, NaN);
    if (!AGE_POSITIONS.includes(position as AgePosition) || !Number.isFinite(age)) continue;
    positionAgeValues[position as AgePosition].push(age);
    allAges.push(age);
  }

  return {
    averageAge: average(allAges),
    positionAges: {
      QB: average(positionAgeValues.QB),
      RB: average(positionAgeValues.RB),
      WR: average(positionAgeValues.WR),
      TE: average(positionAgeValues.TE),
    },
    allAges,
    positionAgeValues,
  };
}

function sortedComparisonRows(
  rows: Array<{ team: string; value: number | null; count?: number }>,
  ranks: Map<string, number>
): TeamDashboardComparisonRow[] {
  return rows
    .map((row) => ({
      team: row.team,
      rank: ranks.get(row.team) || null,
      value: row.value,
      count: row.count,
    }))
    .sort((a, b) => {
      if (a.rank == null && b.rank == null) return a.team.localeCompare(b.team);
      if (a.rank == null) return 1;
      if (b.rank == null) return -1;
      return a.rank - b.rank || a.team.localeCompare(b.team);
    });
}

export function buildDashboardDraftAndRanks(args: {
  teamName: string;
  currentYear: number;
  teams: TeamDashboardLooseTeam[];
  rosters: TeamDashboardLooseRoster[];
  nameMap: Map<number, string>;
  playerMap: Record<string, SleeperPlayer>;
  allAssets: Map<string, TeamAssets>;
  draftOverview: DashboardDraftOverview;
}) {
  const {
    teamName,
    currentYear,
    teams,
    rosters,
    nameMap,
    playerMap,
    allAssets,
    draftOverview,
  } = args;
  const leagueSize = Math.max(1, rosters.length || teams.length || 12);
  const exactDraftYear = dashboardNumber(draftOverview?.year, 0);
  const exactSlots = draftOverview?.allSlots || [];
  const exactTeamSlots = exactSlots
    .filter((slot) => slot.team === teamName)
    .sort((a, b) => a.overall - b.overall);

  const teamAssets = allAssets.get(teamName) || { players: [], picks: [], faab: 0 };
  const draftPicks: TeamDashboardDraftPick[] = [];
  if (exactTeamSlots.length && exactDraftYear) {
    for (const slot of exactTeamSlots) {
      const slotNumber = ((slot.overall - 1) % leagueSize) + 1;
      draftPicks.push({
        year: exactDraftYear,
        round: slot.round,
        label: `${slot.round}.${String(slotNumber).padStart(2, '0')}`,
        originalTeam: null,
        exact: true,
      });
    }
  }
  for (const pick of teamAssets.picks) {
    if (exactTeamSlots.length && pick.year === exactDraftYear) continue;
    draftPicks.push({
      year: pick.year,
      round: pick.round,
      label: `${pick.year} ${roundOrdinal(pick.round)}`,
      originalTeam: pick.originalTeam,
      exact: false,
    });
  }
  draftPicks.sort(
    (a, b) => a.year - b.year || a.round - b.round || a.label.localeCompare(b.label)
  );

  const draftScores: Array<{ team: string; value: number; count: number }> = [];
  for (const [currentTeam, assets] of allAssets.entries()) {
    let value = 0;
    let count = 0;
    const teamExactSlots = exactSlots.filter((slot) => slot.team === currentTeam);
    for (const slot of teamExactSlots) {
      const slotNumber = ((slot.overall - 1) % leagueSize) + 1;
      value += dashboardDraftPickValue(
        exactDraftYear,
        slot.round,
        slotNumber,
        currentYear,
        leagueSize
      );
      count += 1;
    }
    for (const pick of assets.picks) {
      if (teamExactSlots.length && pick.year === exactDraftYear) continue;
      value += dashboardDraftPickValue(
        pick.year,
        pick.round,
        null,
        currentYear,
        leagueSize
      );
      count += 1;
    }
    draftScores.push({ team: currentTeam, value, count });
  }
  const draftRanks = rankDashboardValues(draftScores, 'desc');

  const ageRows = Array.from(nameMap.entries()).map(([rosterId, currentTeam]) => {
    const roster = rosters.find((entry) => entry.roster_id === rosterId);
    return { team: currentTeam, ...rosterAgeData(roster, playerMap) };
  });
  const youthRanks = rankDashboardValues(
    ageRows.flatMap((row) =>
      row.averageAge == null ? [] : [{ team: row.team, value: row.averageAge }]
    ),
    'asc'
  );
  const positionAgeRanks: Record<AgePosition, Map<string, number>> = {
    QB: rankDashboardValues(
      ageRows.flatMap((row) => row.positionAges.QB == null ? [] : [{ team: row.team, value: row.positionAges.QB }]),
      'asc'
    ),
    RB: rankDashboardValues(
      ageRows.flatMap((row) => row.positionAges.RB == null ? [] : [{ team: row.team, value: row.positionAges.RB }]),
      'asc'
    ),
    WR: rankDashboardValues(
      ageRows.flatMap((row) => row.positionAges.WR == null ? [] : [{ team: row.team, value: row.positionAges.WR }]),
      'asc'
    ),
    TE: rankDashboardValues(
      ageRows.flatMap((row) => row.positionAges.TE == null ? [] : [{ team: row.team, value: row.positionAges.TE }]),
      'asc'
    ),
  };

  const recordRows = teams.map((team) => ({
    team: team.teamName,
    value: dashboardNumber(team.wins) * 10000 + dashboardNumber(team.fpts),
  }));
  const pointsRows = teams.map((team) => ({
    team: team.teamName,
    value: dashboardNumber(team.fpts),
  }));
  const potentialPointRows = Array.from(nameMap.entries()).map(([rosterId, currentTeam]) => {
    const roster = rosters.find((entry) => entry.roster_id === rosterId);
    return { team: currentTeam, value: sleeperStat(roster?.settings, 'ppts') };
  });
  const recordRanks = rankDashboardValues(recordRows, 'desc');
  const pointsRanks = rankDashboardValues(pointsRows, 'desc');
  const potentialPointRanks = rankDashboardValues(potentialPointRows, 'desc');

  const teamRosterId = Array.from(nameMap.entries()).find(([, name]) => name === teamName)?.[0];
  const teamRoster = rosters.find((entry) => entry.roster_id === teamRosterId);
  const teamAgeData = ageRows.find((row) => row.team === teamName);
  const potentialPoints = sleeperStat(teamRoster?.settings, 'ppts');

  const allLeagueAges = ageRows.flatMap((row) => row.allAges);
  const leaguePositionAges: TeamDashboardPositionAges = {
    QB: average(ageRows.flatMap((row) => row.positionAgeValues.QB)),
    RB: average(ageRows.flatMap((row) => row.positionAgeValues.RB)),
    WR: average(ageRows.flatMap((row) => row.positionAgeValues.WR)),
    TE: average(ageRows.flatMap((row) => row.positionAgeValues.TE)),
  };

  const ranks: TeamDashboardRanks = {
    record: recordRanks.get(teamName) || null,
    points: pointsRanks.get(teamName) || null,
    maxPoints: potentialPoints > 0 ? potentialPointRanks.get(teamName) || null : null,
    youth: youthRanks.get(teamName) || null,
    draftCapital: draftRanks.get(teamName) || null,
    leagueSize,
  };

  return {
    picks: draftPicks,
    exactCurrentYear: exactTeamSlots.length > 0,
    draftRank: draftRanks.get(teamName) || null,
    ranks,
    maxPoints: potentialPoints > 0 ? potentialPoints : null,
    averageAge: teamAgeData?.averageAge ?? null,
    positionAges: teamAgeData?.positionAges ?? { QB: null, RB: null, WR: null, TE: null },
    leagueAverages: {
      pointsFor: average(pointsRows.map((row) => row.value)),
      maxPoints: average(potentialPointRows.map((row) => row.value).filter((value) => value > 0)),
      averageAge: average(allLeagueAges),
      positionAges: leaguePositionAges,
    },
    leagueComparisons: {
      averageAge: sortedComparisonRows(
        ageRows.map((row) => ({ team: row.team, value: row.averageAge })),
        youthRanks
      ),
      positionAges: {
        QB: sortedComparisonRows(
          ageRows.map((row) => ({ team: row.team, value: row.positionAges.QB })),
          positionAgeRanks.QB
        ),
        RB: sortedComparisonRows(
          ageRows.map((row) => ({ team: row.team, value: row.positionAges.RB })),
          positionAgeRanks.RB
        ),
        WR: sortedComparisonRows(
          ageRows.map((row) => ({ team: row.team, value: row.positionAges.WR })),
          positionAgeRanks.WR
        ),
        TE: sortedComparisonRows(
          ageRows.map((row) => ({ team: row.team, value: row.positionAges.TE })),
          positionAgeRanks.TE
        ),
      },
      draftCapital: sortedComparisonRows(
        draftScores.map((row) => ({ team: row.team, value: row.value, count: row.count })),
        draftRanks
      ),
    },
    seed: recordRanks.get(teamName) || null,
  };
}
