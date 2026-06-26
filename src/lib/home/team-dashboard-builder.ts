import { LEAGUE_IDS } from '@/lib/constants/league';
import { getHomepagePhase } from '@/lib/utils/countdown-resolver';
import {
  getAllPlayersCached,
  getLeagueTransactionsAllWeeks,
  getNFLState,
  getTeamsData,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';
import {
  loadTradeBlockLeagueContext,
  teamAssetsFromContext,
  type TeamAssets,
} from '@/lib/server/trade-assets';
import { getPlayerValuesBySleeperId } from '@/lib/server/trade-values-cache';
import { getActiveOrLatestDraftId, getDraftOverview } from '@/server/db/queries';
import type {
  TeamDashboardLooseRoster,
  TeamDashboardLooseTeam,
  TeamDashboardLooseTransaction,
  TeamDashboardResponse,
} from '@/lib/home/team-dashboard-types';
import {
  dashboardNumber,
  loadDashboardMatchup,
  sleeperStat,
} from '@/lib/home/team-dashboard-helpers';
import { buildDashboardDraftAndRanks } from '@/lib/home/team-dashboard-rankings';
import {
  buildDashboardRoster,
  buildDashboardTransactions,
} from '@/lib/home/team-dashboard-roster';

export async function buildTeamDashboard(teamName: string): Promise<TeamDashboardResponse> {
  const phase = getHomepagePhase();
  const [ctx, playerMap, playerValues, teamsData, nflState, transactions] = await Promise.all([
    loadTradeBlockLeagueContext(),
    getAllPlayersCached(12 * 60 * 60 * 1000).catch(
      () => ({} as Record<string, SleeperPlayer>)
    ),
    getPlayerValuesBySleeperId().catch(() => new Map<string, number>()),
    getTeamsData(LEAGUE_IDS.CURRENT).catch(() => []),
    getNFLState().catch(() => ({ week: 1, display_week: 1 })),
    getLeagueTransactionsAllWeeks(LEAGUE_IDS.CURRENT).catch(() => []),
  ]);

  const teams = teamsData as TeamDashboardLooseTeam[];
  const rosters = ctx.rosters as TeamDashboardLooseRoster[];
  const roster = rosters.find((entry) => ctx.nameMap.get(entry.roster_id) === teamName);
  if (!roster) throw new Error('Team roster not found');

  const league = ctx.league;
  const currentYear = dashboardNumber(
    (league as unknown as { season?: string })?.season,
    new Date().getFullYear()
  );
  const settings = (league?.settings || {}) as Record<string, unknown>;
  const starterPositions = (league?.roster_positions || []).filter(
    (position) => position !== 'BN'
  );
  const activeLimit = Math.max(0, league?.roster_positions?.length || 0);
  const taxiLimit = dashboardNumber(settings.taxi_slots);
  const irLimit = dashboardNumber(settings.reserve_slots);
  const playoffTeams = Math.max(1, dashboardNumber(settings.playoff_teams, 6));
  const nflWeek = dashboardNumber(nflState.week ?? nflState.display_week, 1);

  const rosterDashboard = buildDashboardRoster({
    roster,
    playerMap,
    playerValues,
    activeLimit,
    starterCount: starterPositions.length,
    taxiLimit,
    irLimit,
    phase,
    nflWeek,
  });

  const allAssets = new Map<string, TeamAssets>();
  for (const currentTeam of ctx.nameMap.values()) {
    allAssets.set(currentTeam, teamAssetsFromContext(currentTeam, ctx));
  }

  let draftOverview: Awaited<ReturnType<typeof getDraftOverview>> | null = null;
  try {
    const draftId = await getActiveOrLatestDraftId();
    if (draftId) draftOverview = await getDraftOverview(draftId);
  } catch {
    draftOverview = null;
  }

  const rankDashboard = buildDashboardDraftAndRanks({
    teamName,
    currentYear,
    phase,
    teams,
    rosters,
    nameMap: ctx.nameMap,
    playerMap,
    allAssets,
    draftOverview,
  });

  const matchup = await loadDashboardMatchup({
    leagueId: ctx.leagueId,
    rosterId: roster.roster_id,
    nameMap: ctx.nameMap,
    teams,
    phase,
    nflWeek,
    playoffTeams,
  });
  const teamStanding = teams.find((team) => team.teamName === teamName);
  const recentTransactions = buildDashboardTransactions({
    transactions: transactions as TeamDashboardLooseTransaction[],
    rosterId: roster.roster_id,
    playerMap,
    nameMap: ctx.nameMap,
  });

  return {
    generatedAt: new Date().toISOString(),
    teamName,
    rosterId: roster.roster_id,
    phase,
    status: rosterDashboard.status,
    roster: {
      active: rosterDashboard.active,
      activeLimit: rosterDashboard.activeLimit,
      openSpots: rosterDashboard.openSpots,
      cutsRequired: rosterDashboard.cutsRequired,
      taxi: rosterDashboard.taxi,
      taxiLimit: rosterDashboard.taxiLimit,
      ir: rosterDashboard.ir,
      irLimit: rosterDashboard.irLimit,
      irIneligible: rosterDashboard.irIneligible,
      emptyLineupSlots: rosterDashboard.emptyLineupSlots,
      positionCounts: rosterDashboard.positionCounts,
      players: rosterDashboard.players,
      rookies: rosterDashboard.rookies,
      corePlayers: rosterDashboard.corePlayers,
    },
    standings: {
      wins: dashboardNumber(teamStanding?.wins ?? roster.settings?.wins),
      losses: dashboardNumber(teamStanding?.losses ?? roster.settings?.losses),
      pointsFor: dashboardNumber(teamStanding?.fpts)
        || sleeperStat(roster.settings, 'fpts'),
      maxPoints: rankDashboard.maxPoints,
      seed: rankDashboard.seed,
      ranks: rankDashboard.ranks,
    },
    matchup,
    draft: {
      picks: rankDashboard.picks,
      exactCurrentYear: rankDashboard.exactCurrentYear,
      rank: rankDashboard.draftRank,
    },
    alerts: rosterDashboard.alerts,
    recentTransactions,
  };
}
