import { getLeagueIdForSeason } from '@/lib/constants/league';
import { loadTradeBlockLeagueContext, type TradeBlockLeagueContext } from '@/lib/server/trade-assets';
import {
  getLeague,
  getLeagueMatchups,
  getLeagueRosters,
  getNFLState,
  getRosterIdToTeamNameMap,
  type SleeperLeague,
  type SleeperMatchup,
  type SleeperRoster,
} from '@/lib/utils/sleeper-api';
import { savePregameProjectionSnapshot } from '@/lib/fantasy/projection-snapshots';
import { optimizeProjectedLineup } from '@/lib/fantasy/weekly-projections';
import type { TeamOpportunityPlan } from '@/lib/fantasy/projection-opportunity';
import type { LineupOptimizerResponse, WeeklyLineupEntry, WeeklyProjectedPlayer } from '@/lib/fantasy/lineup-types';
import { projectWeeklyPlayersV3 } from '@/lib/fantasy/weekly-projection-engine';
import { PROJECTION_MODEL_VERSION, aggregateConfidence, clamp, numericScoring } from '@/lib/fantasy/weekly-projection-data';

export { PROJECTION_MODEL_VERSION, projectWeeklyPlayersV3 };
export type { ProjectionScheduleWeek } from '@/lib/fantasy/weekly-projection-data';

function lineupEntries(
  slots: string[],
  assignedPlayers: Array<WeeklyProjectedPlayer | null>,
  comparisonIds: Set<string>,
): WeeklyLineupEntry[] {
  return slots.map((slot, slotIndex) => {
    const player = assignedPlayers[slotIndex] || null;
    return { slot, slotIndex, player, changed: Boolean(player && !comparisonIds.has(player.id)) };
  });
}

function buildOptimizerResponse(args: {
  teamName: string;
  season: string;
  week: number;
  league: SleeperLeague;
  roster: SleeperRoster;
  matchup: SleeperMatchup | undefined;
  activePlayerIds: string[];
  projectedPlayers: WeeklyProjectedPlayer[];
  preseason: boolean;
  plans: Record<string, TeamOpportunityPlan>;
}): LineupOptimizerResponse {
  const starterSlots = (args.league.roster_positions || []).filter((slot) => slot !== 'BN');
  const projectedById = new Map(args.projectedPlayers.map((player) => [player.id, player] as const));
  const currentStarterIds = (args.matchup?.starters || []).filter((id) => id && id !== '0');
  const currentAssigned = starterSlots.map((_, index) => {
    const id = args.matchup?.starters?.[index];
    return id && id !== '0' ? projectedById.get(id) || null : null;
  });
  const rosterPlayers = args.activePlayerIds.map((id) => projectedById.get(id)).filter((player): player is WeeklyProjectedPlayer => Boolean(player));
  const optimalAssigned = optimizeProjectedLineup(rosterPlayers, starterSlots);
  const currentIds = new Set<string>(currentAssigned.flatMap((player) => player ? [player.id] : []));
  const optimalIds = new Set<string>(optimalAssigned.flatMap((player) => player ? [player.id] : []));
  const currentTotal = currentAssigned.reduce((sum, player) => sum + (player?.projection || 0), 0);
  const optimalTotal = optimalAssigned.reduce((sum, player) => sum + (player?.projection || 0), 0);
  const available = Boolean(starterSlots.length && currentStarterIds.length);
  const confidence = aggregateConfidence(optimalAssigned.filter((player): player is WeeklyProjectedPlayer => Boolean(player)));
  const representedTeams = new Set(rosterPlayers.map((player) => player.nflTeam).filter(Boolean));
  const teamOpportunityPlans = Object.fromEntries(
    Object.entries(args.plans)
      .filter(([team]) => representedTeams.has(team))
      .map(([team, plan]) => [team, {
        passAttempts: Number(plan.passAttempts.toFixed(1)),
        rushAttempts: Number(plan.rushAttempts.toFixed(1)),
        targetPool: Number(plan.targetPool.toFixed(1)),
        source: plan.source,
      }]),
  );
  return {
    generatedAt: new Date().toISOString(),
    teamName: args.teamName,
    season: args.season,
    week: args.week,
    available,
    reason: available ? null : `Sleeper has not published a Week ${args.week} lineup for this team yet.`,
    currentTotal: available ? Number(currentTotal.toFixed(1)) : null,
    optimalTotal: optimalAssigned.some(Boolean) ? Number(optimalTotal.toFixed(1)) : null,
    potentialGain: available ? Number(Math.max(0, optimalTotal - currentTotal).toFixed(1)) : null,
    currentLineup: lineupEntries(starterSlots, currentAssigned, optimalIds),
    optimalLineup: lineupEntries(starterSlots, optimalAssigned, currentIds),
    projectedPlayers: rosterPlayers,
    modelVersion: PROJECTION_MODEL_VERSION,
    projectionPhase: args.preseason ? 'preseason' : 'in_season',
    confidence,
    confidenceNote: args.preseason
      ? 'Preseason estimate. Team volume is shrunk toward league average, while roles, injuries, and coaching changes remain uncertain.'
      : confidence === 'high'
        ? 'Current-season workload, team opportunity, and role information are established.'
        : confidence === 'medium'
          ? 'Current-season information is available, but some workload or role uncertainty remains.'
          : 'Limited current-season information, a new team, or an unsettled role makes this projection volatile.',
    teamOpportunityPlans,
  };
}

function activeIdsForRoster(roster: SleeperRoster, matchup?: SleeperMatchup): string[] {
  const source = matchup?.players?.length ? matchup.players : roster.players || [];
  if (matchup?.players?.length) return source.filter((id) => id && id !== '0');
  const taxi = new Set((roster.taxi || []).filter(Boolean));
  const reserve = new Set((roster.reserve || []).filter(Boolean));
  return source.filter((id) => id && id !== '0' && !taxi.has(id) && !reserve.has(id));
}

async function buildFromCurrentContext(args: {
  context: TradeBlockLeagueContext;
  season: string;
  week: number;
  teamNames?: string[];
  saveSnapshots: boolean;
}): Promise<LineupOptimizerResponse[]> {
  if (!args.context.league) throw new Error('League is unavailable');
  const matchups = await getLeagueMatchups(args.context.leagueId, args.week).catch(() => [] as SleeperMatchup[]);
  const selectedRosters = args.context.rosters.filter((roster) => {
    const name = args.context.nameMap.get(roster.roster_id);
    return name && (!args.teamNames || args.teamNames.includes(name));
  });
  const activeByRoster = new Map<number, string[]>();
  const allIds = new Set<string>();
  for (const roster of selectedRosters) {
    const matchup = matchups.find((entry) => entry.roster_id === roster.roster_id);
    const ids = activeIdsForRoster(roster, matchup);
    activeByRoster.set(roster.roster_id, ids);
    ids.forEach((id) => allIds.add(id));
  }
  const projection = await projectWeeklyPlayersV3({
    season: args.season,
    week: args.week,
    playerIds: Array.from(allIds),
    scoringSettings: numericScoring(args.context.league.scoring_settings),
    leagueId: args.context.leagueId,
  });
  const projectedById = new Map(projection.players.map((player) => [player.id, player] as const));
  const responses: LineupOptimizerResponse[] = [];
  for (const roster of selectedRosters) {
    const teamName = args.context.nameMap.get(roster.roster_id);
    if (!teamName) continue;
    const ids = activeByRoster.get(roster.roster_id) || [];
    const response = buildOptimizerResponse({
      teamName,
      season: args.season,
      week: args.week,
      league: args.context.league,
      roster,
      matchup: matchups.find((entry) => entry.roster_id === roster.roster_id),
      activePlayerIds: ids,
      projectedPlayers: ids.map((id) => projectedById.get(id)).filter((player): player is WeeklyProjectedPlayer => Boolean(player)),
      preseason: projection.preseason,
      plans: projection.plans,
    });
    if (args.saveSnapshots) {
      await savePregameProjectionSnapshot({ response, earliestKickoff: projection.schedule.earliestKickoff });
    }
    responses.push(response);
  }
  return responses;
}

export async function buildTeamLineupOptimizerV3(teamName: string): Promise<LineupOptimizerResponse> {
  const [context, state] = await Promise.all([
    loadTradeBlockLeagueContext(),
    getNFLState().catch(() => ({ week: 1, display_week: 1, season: String(new Date().getFullYear()) })),
  ]);
  const season = String(context.league?.season || state.season || new Date().getFullYear());
  const week = clamp(Number(state.week ?? state.display_week ?? 1), 1, 18);
  const responses = await buildFromCurrentContext({ context, season, week, teamNames: [teamName], saveSnapshots: true });
  const response = responses[0];
  if (!response) throw new Error('Team roster not found');
  return response;
}

export async function buildLeagueProjectionSnapshotsV3(): Promise<LineupOptimizerResponse[]> {
  const [context, state] = await Promise.all([
    loadTradeBlockLeagueContext(),
    getNFLState().catch(() => ({ week: 1, display_week: 1, season: String(new Date().getFullYear()) })),
  ]);
  const season = String(context.league?.season || state.season || new Date().getFullYear());
  const week = clamp(Number(state.week ?? state.display_week ?? 1), 1, 18);
  return buildFromCurrentContext({ context, season, week, saveSnapshots: true });
}

export async function buildHistoricalLeagueWeekV3(args: {
  season: number;
  week: number;
  leagueId: string;
}): Promise<{
  responses: LineupOptimizerResponse[];
  actualByPlayer: Map<string, number>;
}> {
  const [league, rosters, nameMap, matchups] = await Promise.all([
    getLeague(args.leagueId),
    getLeagueRosters(args.leagueId),
    getRosterIdToTeamNameMap(args.leagueId),
    getLeagueMatchups(args.leagueId, args.week).catch(() => [] as SleeperMatchup[]),
  ]);
  const allIds = new Set<string>();
  for (const matchup of matchups) for (const id of matchup.players || []) if (id && id !== '0') allIds.add(id);
  const projection = await projectWeeklyPlayersV3({
    season: String(args.season),
    week: args.week,
    playerIds: Array.from(allIds),
    scoringSettings: numericScoring(league.scoring_settings),
    leagueId: args.leagueId,
    historicalMode: true,
    saveOverrides: false,
  });
  const projectedById = new Map(projection.players.map((player) => [player.id, player] as const));
  const responses: LineupOptimizerResponse[] = [];
  for (const matchup of matchups) {
    const roster = rosters.find((entry) => entry.roster_id === matchup.roster_id);
    if (!roster) continue;
    const teamName = nameMap.get(roster.roster_id) || `Roster ${roster.roster_id}`;
    const ids = (matchup.players || []).filter((id) => id && id !== '0');
    responses.push(buildOptimizerResponse({
      teamName,
      season: String(args.season),
      week: args.week,
      league,
      roster,
      matchup,
      activePlayerIds: ids,
      projectedPlayers: ids.map((id) => projectedById.get(id)).filter((player): player is WeeklyProjectedPlayer => Boolean(player)),
      preseason: projection.preseason,
      plans: projection.plans,
    }));
  }
  const actualByPlayer = new Map<string, number>();
  for (const matchup of matchups) {
    for (const [id, points] of Object.entries(matchup.players_points || {})) {
      const value = Number(points);
      if (Number.isFinite(value)) actualByPlayer.set(id, value);
    }
  }
  return { responses, actualByPlayer };
}

export async function getLeagueScoredBaselinesV3(args: {
  season: string;
  throughWeek: number;
  playerIds: string[];
}): Promise<Record<string, { mean: number; stddev: number; games: number; last3Avg: number; decayedMean: number }>> {
  const leagueId = getLeagueIdForSeason(args.season);
  if (!leagueId) return {};
  const [league, state] = await Promise.all([
    getLeague(leagueId),
    getNFLState().catch(() => ({ season: String(new Date().getFullYear()) })),
  ]);
  const historicalMode = Number(args.season) < Number(state.season || new Date().getFullYear());
  const result = await projectWeeklyPlayersV3({
    season: args.season,
    week: Math.max(1, Math.min(18, args.throughWeek + 1)),
    playerIds: args.playerIds,
    scoringSettings: numericScoring(league.scoring_settings),
    leagueId,
    historicalMode,
    saveOverrides: !historicalMode,
  });
  return Object.fromEntries(result.players.map((player) => [player.id, {
    mean: player.projection,
    stddev: Math.max(0.1, (player.rangeHigh - player.rangeLow) / 2.564),
    games: player.calibrationSampleSize || 0,
    last3Avg: player.projection,
    decayedMean: player.projection,
  }]));
}
