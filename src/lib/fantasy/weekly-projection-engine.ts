import { buildPlayerAvailabilitySnapshot, type PlayerAvailabilityEntry } from '@/lib/utils/player-availability';
import { filterCompletedTeamWeeks, loadNflverseTeamWeeks } from '@/lib/fantasy/nflverse-team-stats';
import { loadRecentSnapUsage, type RecentSnapUsage } from '@/lib/fantasy/nflverse-snap-counts';
import { buildPlayerStatProjection } from '@/lib/fantasy/projection-model';
import { reconcileTeamOpportunityBudgets, type PlayerProjectionCandidate, type TeamOpportunityPlan } from '@/lib/fantasy/projection-opportunity';
import { loadApplicableProjectionOverrides, type ProjectionOverrideRecord } from '@/lib/fantasy/projection-overrides';
import { calibratePlayerRange, loadProjectionCalibration, projectionBucket, type ProjectionCalibrationCell } from '@/lib/fantasy/projection-calibration';
import { buildFantasyBaseline, eligibleProjection, normalizePreseasonActiveProbability } from '@/lib/fantasy/projection-fantasy-baseline';
import { blendSleeperProjection, loadSleeperExternalProjections } from '@/lib/fantasy/sleeper-projections';
import type { WeeklyProjectedPlayer } from '@/lib/fantasy/lineup-types';
import {
  PROJECTION_MODEL_VERSION,
  applyOverrideToAvailability,
  clamp,
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

const CALIBRATION_FALLBACK_MODEL = 'statline-v3.3-sleeper-combined';

export type V3ProjectionResult = {
  players: WeeklyProjectedPlayer[];
  schedule: ProjectionScheduleWeek;
  preseason: boolean;
  plans: Record<string, TeamOpportunityPlan>;
};

function withTraceAdjustment(player: WeeklyProjectedPlayer, adjustment: string): WeeklyProjectedPlayer {
  if (!player.projectionTrace) return player;
  return {
    ...player,
    projectionTrace: {
      ...player.projectionTrace,
      adjustments: [...player.projectionTrace.adjustments, adjustment],
    },
  };
}

function expectedSnapShare(position: string, startProbability: number): number | null {
  const start = clamp(startProbability, 0, 1);
  if (position === 'QB') return clamp(0.16 + (start * 0.82), 0.16, 0.98);
  if (position === 'RB') return clamp(0.20 + (start * 0.48), 0.20, 0.68);
  if (position === 'WR') return clamp(0.27 + (start * 0.56), 0.27, 0.83);
  if (position === 'TE') return clamp(0.25 + (start * 0.52), 0.25, 0.77);
  return null;
}

function applySnapContext(player: WeeklyProjectedPlayer, snap: RecentSnapUsage | undefined): WeeklyProjectedPlayer {
  if (!snap || player.isBye || player.projection <= 0) return player;
  const expected = expectedSnapShare(player.position, player.startProbability);
  if (!expected || snap.games < 2 || snap.recentSnapPct <= 0) return player;
  const continuity = player.nflTeam && snap.latestTeam && player.nflTeam !== snap.latestTeam
    ? 0.55
    : 1;
  const sampleConfidence = clamp(snap.games / 5, 0, 1) * continuity;
  const ratio = clamp(snap.recentSnapPct / expected, 0.45, 1.65);
  const factor = clamp(1 + ((ratio - 1) * 0.10 * sampleConfidence), 0.95, 1.05);
  if (Math.abs(factor - 1) < 0.004) return player;
  const next = {
    ...player,
    projection: Number((player.projection * factor).toFixed(1)),
    baseline: Number((player.baseline * factor).toFixed(1)),
    workloadUncertainty: Number(((player.workloadUncertainty || 1) * (continuity < 1 ? 1.03 : 0.98)).toFixed(3)),
  };
  return withTraceAdjustment(next, `nflverse-snap-share-${snap.recentSnapPct.toFixed(3)}-factor-${factor.toFixed(3)}`);
}

function applyMarketContext(player: WeeklyProjectedPlayer, schedule: ProjectionScheduleWeek): WeeklyProjectedPlayer {
  if (player.isBye || !player.nflTeam || player.projection <= 0) return player;
  const market = schedule.marketByTeam[player.nflTeam];
  if (!market) return player;
  const impliedDelta = clamp((market.impliedPoints - 22.5) / 22.5, -0.28, 0.28);
  const spread = market.spread == null ? 0 : clamp(market.spread, -12, 12);
  let factor = 1;
  if (player.position === 'QB' || player.position === 'WR' || player.position === 'TE') {
    factor += impliedDelta * 0.10;
    factor += spread * 0.0015;
  } else if (player.position === 'RB') {
    factor += impliedDelta * 0.11;
    factor -= spread * 0.0020;
  } else if (player.position === 'K') {
    factor += impliedDelta * 0.13;
  } else if (player.position === 'DEF') {
    const opponent = schedule.opponents[player.nflTeam];
    const opponentMarket = opponent ? schedule.marketByTeam[opponent] : undefined;
    if (opponentMarket) {
      const opponentDelta = clamp((22.5 - opponentMarket.impliedPoints) / 22.5, -0.28, 0.28);
      factor += opponentDelta * 0.12;
    }
  }
  factor = clamp(factor, 0.96, 1.04);
  if (Math.abs(factor - 1) < 0.003) return player;
  const next = {
    ...player,
    projection: Number((player.projection * factor).toFixed(1)),
    baseline: Number((player.baseline * factor).toFixed(1)),
  };
  return withTraceAdjustment(next, `market-implied-${market.impliedPoints.toFixed(1)}-factor-${factor.toFixed(3)}`);
}

function applyMeanCalibration(
  player: WeeklyProjectedPlayer,
  calibration: Map<string, ProjectionCalibrationCell>,
): WeeklyProjectedPlayer {
  if (player.isBye || player.projection <= 0) return player;
  const bucket = projectionBucket(player.projection);
  const cell = calibration.get(`${player.position.toUpperCase()}:${bucket}`);
  if (!cell || cell.sampleSize < 30 || !Number.isFinite(cell.bias)) return player;
  const reliability = clamp((cell.sampleSize - 20) / 180, 0, 0.50);
  const correction = clamp(-cell.bias * reliability, -1.25, 1.25);
  if (Math.abs(correction) < 0.08) return player;
  const next = {
    ...player,
    projection: Number(Math.max(0, player.projection + correction).toFixed(1)),
    baseline: Number(Math.max(0, player.baseline + correction).toFixed(1)),
  };
  return withTraceAdjustment(next, `historical-bias-correction-${correction.toFixed(2)}`);
}

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
  const teamByPlayer = new Map(candidateIds.map((id) => [
    id,
    resolveTeamForSamples(playerMap[id], gamesByPlayer.get(id) || [], historicalMode),
  ] as const));
  const preseason = throughWeek === 0 || filterCompletedTeamWeeks(currentRaw, throughWeek).length === 0;

  const snapUsage = await loadRecentSnapUsage({
    season,
    throughWeek,
    playerIds: candidateIds,
    playerMap,
    teamByPlayer,
  }).catch((error) => {
    console.warn('[weekly-projection-engine] snap usage supplement unavailable', error);
    return new Map<string, RecentSnapUsage>();
  });

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
  const cutoff = historicalMode ? { beforeSeason: season, beforeWeek: args.week } : undefined;
  const calibration = await loadProjectionCalibration(PROJECTION_MODEL_VERSION, cutoff);
  if (PROJECTION_MODEL_VERSION !== CALIBRATION_FALLBACK_MODEL) {
    const fallbackCalibration = await loadProjectionCalibration(CALIBRATION_FALLBACK_MODEL, cutoff);
    for (const [key, value] of fallbackCalibration.entries()) {
      if (!calibration.has(key)) calibration.set(key, value);
    }
  }

  const candidates: PlayerProjectionCandidate[] = candidateIds.map((id) => {
    const player = playerMap[id];
    const position = normalizedPosition(player);
    const games = gamesByPlayer.get(id) || [];
    const nflTeam = teamByPlayer.get(id) || null;
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

  const freeContextAnchored = reconciled.players.map((player) => {
    const withSnaps = applySnapContext(player, snapUsage.get(player.id));
    return applyMarketContext(withSnaps, schedule);
  });

  const externallyAnchored = freeContextAnchored.map((player) => {
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

  const biasCorrected = externallyAnchored.map((player) => applyMeanCalibration(player, calibration));
  const calibrated = biasCorrected.map((player) => calibratePlayerRange(player, calibration));
  const requested = new Set(args.playerIds);
  return {
    players: calibrated.filter((player) => requested.has(player.id)),
    schedule,
    preseason,
    plans: reconciled.plans,
  };
}
