import { buildPlayerAvailabilitySnapshot, type PlayerAvailabilityEntry } from '@/lib/utils/player-availability';
import { filterCompletedTeamWeeks, loadNflverseTeamWeeks } from '@/lib/fantasy/nflverse-team-stats';
import { buildPlayerStatProjection } from '@/lib/fantasy/projection-model';
import { reconcileTeamOpportunityBudgets, type PlayerProjectionCandidate, type TeamOpportunityPlan } from '@/lib/fantasy/projection-opportunity';
import { loadApplicableProjectionOverrides, type ProjectionOverrideRecord } from '@/lib/fantasy/projection-overrides';
import { calibratePlayerRange, loadProjectionCalibration } from '@/lib/fantasy/projection-calibration';
import { buildFantasyBaseline, eligibleProjection, normalizePreseasonActiveProbability } from '@/lib/fantasy/projection-fantasy-baseline';
import { blendSleeperProjection, loadSleeperExternalProjections } from '@/lib/fantasy/sleeper-projections';
import type { WeeklyProjectedPlayer } from '@/lib/fantasy/lineup-types';
import {
  PROJECTION_MODEL_VERSION,
  applyOverrideToAvailability,
  gamesForPlayer,
  groupTeamRows,
  inferHistoricalAvailability,
  loadProjectionInputs,
  loadScheduleWeek,
  normalizedPosition,
  playerName,
  resolveTeamForSamples,
  rowsAllowedByDefense,
  type ProjectionScheduleWeek,
} from '@/lib/fantasy/weekly-projection-data';

export type V3ProjectionResult = {
  players: WeeklyProjectedPlayer[];
  schedule: ProjectionScheduleWeek;
  preseason: boolean;
  plans: Record<string, TeamOpportunityPlan>;
};

export async function projectWeeklyPlayersV3(args: {
  season: string;
  week: number;
  playerIds: string[];
  scoringSettings: Record<string, number>;
  leagueId?: string;
  historicalMode?: boolean;
  saveOverrides?: boolean;
}): Promise<V3ProjectionResult> {
  const season = Number(args.season);
  const throughWeek = Math.max(0, args.week - 1);
  const historicalMode = Boolean(args.historicalMode);
  const [inputs, schedule, currentRaw, previousRaw] = await Promise.all([
    loadProjectionInputs({ season, throughWeek, requestedIds: args.playerIds, historicalMode }),
    loadScheduleWeek(args.season, args.week),
    loadNflverseTeamWeeks(season),
    loadNflverseTeamWeeks(season - 1),
  ]);
  const { playerMap, batches, candidateIds } = inputs;
  const gamesByPlayer = new Map(candidateIds.map((id) => [id, gamesForPlayer(batches, id)] as const));
  const preseason = throughWeek === 0 || filterCompletedTeamWeeks(currentRaw, throughWeek).length === 0;

  const externalProjections = historicalMode
    ? { byPlayer: new Map(), requested: 0, found: 0, coverage: 0, status: 'unavailable' as const }
    : await loadSleeperExternalProjections({
        season,
        week: args.week,
        playerIds: args.playerIds,
        positionByPlayer: new Map(args.playerIds.map((id) => [id, normalizedPosition(playerMap[id])])),
        scoring: args.scoringSettings,
        preseason,
      }).catch((error) => {
        console.warn('[weekly-projection-engine] Sleeper projection supplement unavailable', error);
        return { byPlayer: new Map(), requested: args.playerIds.length, found: 0, coverage: 0, status: 'unavailable' as const };
      });

  const overrides = !historicalMode && args.saveOverrides !== false
    ? await loadApplicableProjectionOverrides({ season, week: args.week }).catch(() => ({ byPlayer: new Map(), byTeam: new Map() }))
    : { byPlayer: new Map<string, ProjectionOverrideRecord>(), byTeam: new Map<string, ProjectionOverrideRecord>() };

  let availability: Record<string, PlayerAvailabilityEntry> = {};
  if (!historicalMode && args.leagueId) {
    availability = await buildPlayerAvailabilitySnapshot({
      leagueId: args.leagueId,
      uptoWeek: args.week,
      playerIds: candidateIds,
    }).catch(() => ({}));
  }

  const currentRows = filterCompletedTeamWeeks(currentRaw, throughWeek);
  const previousRows = filterCompletedTeamWeeks(previousRaw, 18);
  const currentRowsByTeam = groupTeamRows(currentRows);
  const previousRowsByTeam = groupTeamRows(previousRows);
  const calibration = await loadProjectionCalibration(
    PROJECTION_MODEL_VERSION,
    historicalMode ? { beforeSeason: season, beforeWeek: args.week } : undefined,
  );

  const candidates: PlayerProjectionCandidate[] = candidateIds.map((id) => {
    const player = playerMap[id];
    const position = normalizedPosition(player);
    const games = gamesByPlayer.get(id) || [];
    const nflTeam = resolveTeamForSamples(player, games, historicalMode);
    const opponent = schedule.seasonValidated && nflTeam ? schedule.opponents[nflTeam] || null : null;
    const isBye = Boolean(schedule.seasonValidated && schedule.hasGames && nflTeam && !opponent);
    const inferred = historicalMode
      ? inferHistoricalAvailability(position, games)
      : availability[id] || { tier: 'unknown', weight: 0.92, reasons: ['missing-availability'] };
    const override = overrides.byPlayer.get(id);
    const overriddenAvailability = applyOverrideToAvailability(inferred, override);
    const playerAvailability = preseason && !historicalMode
      ? {
          ...overriddenAvailability,
          weight: normalizePreseasonActiveProbability({
            weight: overriddenAvailability.weight,
            tier: overriddenAvailability.tier,
            status: String(player?.injury_status || player?.status || ''),
          }),
          reasons: [...overriddenAvailability.reasons, 'preseason-active-probability-normalized'],
        }
      : overriddenAvailability;
    const teamRows = [
      ...(previousRowsByTeam.get(nflTeam || '') || []),
      ...(currentRowsByTeam.get(nflTeam || '') || []),
    ];
    const result = buildPlayerStatProjection({
      position,
      games,
      availability: playerAvailability,
      currentTeam: nflTeam,
      opponent,
      teamWeeks: teamRows,
      opponentWeeks: position === 'DEF'
        ? [
            ...(previousRowsByTeam.get(opponent || '') || []),
            ...(currentRowsByTeam.get(opponent || '') || []),
          ]
        : rowsAllowedByDefense(currentRows, opponent),
      currentSeasonGames: currentRowsByTeam.get(nflTeam || '')?.length || 0,
      projectionSeason: season,
      preseason,
      scoring: args.scoringSettings,
      injuryStatus: historicalMode || preseason ? null : String(player?.injury_status || player?.status || '') || null,
    });
    const projection = eligibleProjection(result.points, nflTeam, isBye);
    const base: WeeklyProjectedPlayer = {
      id,
      name: playerName(player),
      position,
      nflTeam,
      opponent,
      projection: Number(projection.toFixed(1)),
      baseline: Number(result.neutralPoints.toFixed(1)),
      matchupFactor: Number(result.matchupFactor.toFixed(3)),
      availabilityWeight: Number(result.activeProbability.toFixed(3)),
      isBye,
      confidence: result.confidence,
      rangeLow: Number((isBye ? 0 : result.rangeLow).toFixed(1)),
      rangeHigh: Number((isBye ? 0 : result.rangeHigh).toFixed(1)),
      expectedRole: result.expectedRole,
      workload: isBye ? 'Bye week' : result.workload,
      assumption: isBye ? 'No game scheduled for this NFL week.' : result.assumption,
      startProbability: Number((override?.startProbability ?? result.startProbability).toFixed(3)),
      activeProbability: Number((override?.activeProbability ?? result.activeProbability).toFixed(3)),
      statLine: isBye ? {} : result.statLine,
    };
    const fantasyBaseline = buildFantasyBaseline({
      games,
      position,
      scoring: args.scoringSettings,
      currentTeam: nflTeam,
    }) || undefined;
    return {
      id,
      player,
      games,
      base,
      override,
      projectionSeason: season,
      fantasyBaseline,
    };
  });

  const reconciled = reconcileTeamOpportunityBudgets({
    candidates,
    currentRowsByTeam,
    previousRowsByTeam,
    preseason,
    scoring: args.scoringSettings,
    teamOverrides: overrides.byTeam,
  });
  const externallyAnchored = reconciled.players.map((player) => {
    const external = externalProjections.byPlayer.get(player.id);
    const override = overrides.byPlayer.get(player.id);
    const blend = blendSleeperProjection({
      internalPoints: player.projection,
      external,
      preseason,
      activeProbability: player.activeProbability,
      roleTrend: player.roleTrend,
      manualOverride: Number.isFinite(override?.projectionPoints),
    });
    if (!external || blend.weight <= 0) return player;
    const sourceLabel = external.source === 'sleeper-season' ? 'season' : 'weekly';
    const assumption = [
      player.assumption,
      `Sleeper's ${sourceLabel} projection is blended as an external anchor.`,
    ].filter(Boolean).join(' ');
    return {
      ...player,
      projection: Number(blend.points.toFixed(1)),
      baseline: Number(blend.points.toFixed(1)),
      assumption,
      workloadUncertainty: Number(((player.workloadUncertainty || 1) * 0.94).toFixed(3)),
      externalProjectionPoints: Number(external.points.toFixed(2)),
      externalProjectionWeight: blend.weight,
      externalProjectionSource: external.source,
      externalProjectionDisagreement: blend.disagreement,
      projectionTrace: player.projectionTrace
        ? {
            ...player.projectionTrace,
            externalProjectionPoints: Number(external.points.toFixed(2)),
            externalProjectionWeight: blend.weight,
            externalProjectionSource: external.source,
            externalProjectionDisagreement: blend.disagreement,
            adjustments: [
              ...player.projectionTrace.adjustments,
              `${external.source}-weight-${blend.weight.toFixed(3)}`,
            ],
          }
        : player.projectionTrace,
    };
  });
  const calibrated = externallyAnchored.map((player) => calibratePlayerRange(player, calibration));
  const requested = new Set(args.playerIds);
  return {
    players: calibrated.filter((player) => requested.has(player.id)),
    schedule,
    preseason,
    plans: reconciled.plans,
  };
}
