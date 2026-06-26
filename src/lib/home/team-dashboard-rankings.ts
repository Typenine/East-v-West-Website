import type { SleeperPlayer } from '@/lib/utils/sleeper-api';
import type { HomepagePhase } from '@/lib/utils/countdown-resolver';
import type { TeamAssets } from '@/lib/server/trade-assets';
import type {
  TeamDashboardDraftPick,
  TeamDashboardLoosePlayer,
  TeamDashboardLooseRoster,
  TeamDashboardLooseTeam,
  TeamDashboardRanks,
} from '@/lib/home/team-dashboard-types';
import {
  dashboardDraftPickValue,
  dashboardNumber,
  dashboardPosition,
  dashboardPowerPercent,
  rankDashboardValues,
  roundOrdinal,
  sleeperStat,
} from '@/lib/home/team-dashboard-helpers';

type DashboardDraftOverview = null | {
  year?: number;
  allSlots?: Array<{ overall: number; round: number; team: string }>;
};

export function buildDashboardDraftAndRanks(args: {
  teamName: string;
  currentYear: number;
  phase: HomepagePhase;
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
    phase,
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

  const draftScores: Array<{ team: string; value: number }> = [];
  for (const [currentTeam, assets] of allAssets.entries()) {
    let value = 0;
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
    }
    draftScores.push({ team: currentTeam, value });
  }
  const draftRanks = rankDashboardValues(draftScores, 'desc');

  const averageAgeRows = Array.from(nameMap.entries()).map(([rosterId, currentTeam]) => {
    const roster = rosters.find((entry) => entry.roster_id === rosterId);
    const ages = Array.from(new Set(roster?.players || []))
      .map((id) => playerMap[id] as TeamDashboardLoosePlayer | undefined)
      .filter((player) =>
        player && ['QB', 'RB', 'WR', 'TE'].includes(dashboardPosition(player.position))
      )
      .map((player) => dashboardNumber(player?.age, NaN))
      .filter(Number.isFinite);
    return {
      team: currentTeam,
      value: ages.length ? ages.reduce((sum, age) => sum + age, 0) / ages.length : 99,
    };
  });
  const youthRanks = rankDashboardValues(averageAgeRows, 'asc');

  const recordRows = teams.map((team) => ({
    team: team.teamName,
    value: dashboardNumber(team.wins) * 10000 + dashboardNumber(team.fpts),
  }));
  const pointsRows = teams.map((team) => ({
    team: team.teamName,
    value: dashboardNumber(team.fpts),
  }));
  const maxPointRows = Array.from(nameMap.entries()).map(([rosterId, currentTeam]) => {
    const roster = rosters.find((entry) => entry.roster_id === rosterId);
    return { team: currentTeam, value: sleeperStat(roster?.settings, 'ppts') };
  });
  const recordRanks = rankDashboardValues(recordRows, 'desc');
  const pointsRanks = rankDashboardValues(pointsRows, 'desc');
  const maxPointRanks = rankDashboardValues(maxPointRows, 'desc');

  const regularWeights = [
    'regular_season',
    'post_deadline_pre_postseason',
    'postseason',
  ].includes(phase);
  const powerRows = Array.from(nameMap.values()).map((currentTeam) => {
    const value = regularWeights
      ? dashboardPowerPercent(recordRanks.get(currentTeam), leagueSize) * 0.32
        + dashboardPowerPercent(pointsRanks.get(currentTeam), leagueSize) * 0.25
        + dashboardPowerPercent(maxPointRanks.get(currentTeam), leagueSize) * 0.18
        + dashboardPowerPercent(draftRanks.get(currentTeam), leagueSize) * 0.13
        + dashboardPowerPercent(youthRanks.get(currentTeam), leagueSize) * 0.12
      : dashboardPowerPercent(draftRanks.get(currentTeam), leagueSize) * 0.34
        + dashboardPowerPercent(youthRanks.get(currentTeam), leagueSize) * 0.24
        + dashboardPowerPercent(pointsRanks.get(currentTeam), leagueSize) * 0.18
        + dashboardPowerPercent(maxPointRanks.get(currentTeam), leagueSize) * 0.14
        + dashboardPowerPercent(recordRanks.get(currentTeam), leagueSize) * 0.10;
    return { team: currentTeam, value };
  });
  const powerRanks = rankDashboardValues(powerRows, 'desc');
  const teamRosterId = Array.from(nameMap.entries()).find(([, name]) => name === teamName)?.[0];
  const teamRoster = rosters.find((entry) => entry.roster_id === teamRosterId);
  const maxPoints = sleeperStat(teamRoster?.settings, 'ppts');

  const ranks: TeamDashboardRanks = {
    record: recordRanks.get(teamName) || null,
    points: pointsRanks.get(teamName) || null,
    maxPoints: maxPoints > 0 ? maxPointRanks.get(teamName) || null : null,
    youth: youthRanks.get(teamName) || null,
    draftCapital: draftRanks.get(teamName) || null,
    power: powerRanks.get(teamName) || null,
    leagueSize,
  };

  return {
    picks: draftPicks,
    exactCurrentYear: exactTeamSlots.length > 0,
    draftRank: draftRanks.get(teamName) || null,
    ranks,
    maxPoints: maxPoints > 0 ? maxPoints : null,
    seed: recordRanks.get(teamName) || null,
  };
}
