import { neon } from '@neondatabase/serverless';
import type {
  LineupOptimizerResponse,
  ProjectionValidationSummary,
  WeeklyProjectedPlayer,
} from '@/lib/fantasy/lineup-types';

export type ProjectionBucket = 'low' | 'medium' | 'high';

export type ProjectionCalibrationCell = {
  position: string;
  bucket: ProjectionBucket;
  sampleSize: number;
  bias: number;
  meanAbsoluteError: number;
  residualSd: number;
  coverage: number | null;
};

export type ProjectionValidationRow = {
  season: number;
  week: number;
  team: string;
  modelVersion: string;
  source: 'live' | 'backtest';
  playerId: string;
  position: string;
  bucket: ProjectionBucket;
  projection: number;
  actual: number;
  error: number;
  absoluteError: number;
  rangeLow: number;
  rangeHigh: number;
  covered: boolean;
  snapshotGeneratedAt: string;
};

const FALLBACK_SD: Record<string, number> = {
  QB: 6.2,
  RB: 5.2,
  WR: 5.5,
  TE: 4.5,
  K: 3.5,
  DEF: 4.8,
};

function databaseUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function projectionBucket(points: number): ProjectionBucket {
  if (points < 8) return 'low';
  if (points < 15) return 'medium';
  return 'high';
}

function calibrationKey(position: string, bucket: ProjectionBucket): string {
  return `${position.toUpperCase()}:${bucket}`;
}

export async function loadProjectionCalibration(
  modelVersion: string,
  cutoff?: { beforeSeason: number; beforeWeek: number },
): Promise<Map<string, ProjectionCalibrationCell>> {
  const url = databaseUrl();
  if (!url) return new Map();
  try {
    const sql = neon(url);
    const rows = await sql`
      SELECT
        position,
        prediction_bucket,
        count(*)::integer AS sample_size,
        avg(error)::double precision AS bias,
        avg(absolute_error)::double precision AS mean_absolute_error,
        coalesce(stddev_pop(error), 0)::double precision AS residual_sd,
        avg(CASE WHEN range_covered THEN 1.0 ELSE 0.0 END)::double precision AS coverage
      FROM projection_validation_results
      WHERE model_version = ${modelVersion}
        AND (
          ${cutoff?.beforeSeason ?? null}::integer IS NULL
          OR season < ${cutoff?.beforeSeason ?? null}
          OR (season = ${cutoff?.beforeSeason ?? null} AND week < ${cutoff?.beforeWeek ?? null})
        )
      GROUP BY position, prediction_bucket
    ` as Array<Record<string, unknown>>;
    const out = new Map<string, ProjectionCalibrationCell>();
    for (const row of rows) {
      const position = String(row.position || '').toUpperCase();
      const bucket = String(row.prediction_bucket || 'medium') as ProjectionBucket;
      const cell: ProjectionCalibrationCell = {
        position,
        bucket,
        sampleSize: Number(row.sample_size || 0),
        bias: Number(row.bias || 0),
        meanAbsoluteError: Number(row.mean_absolute_error || 0),
        residualSd: Number(row.residual_sd || 0),
        coverage: row.coverage == null ? null : Number(row.coverage),
      };
      out.set(calibrationKey(position, bucket), cell);
    }
    return out;
  } catch (error) {
    console.warn('[projection-calibration] unable to load calibration', error);
    return new Map();
  }
}

export function calibratePlayerRange(
  player: WeeklyProjectedPlayer,
  calibration: Map<string, ProjectionCalibrationCell>,
): WeeklyProjectedPlayer {
  if (player.isBye) return { ...player, rangeLow: 0, rangeHigh: 0, calibrationSampleSize: 0 };
  const bucket = projectionBucket(player.projection);
  const cell = calibration.get(calibrationKey(player.position, bucket));
  const fallback = Math.max(
    FALLBACK_SD[player.position] || 5,
    2.4 + (player.projection * 0.30),
  );
  const empirical = cell && cell.sampleSize >= 20 && cell.residualSd > 0
    ? clamp(cell.residualSd, fallback * 0.72, fallback * 1.55)
    : fallback;
  const workloadUncertainty = clamp(player.workloadUncertainty || 1, 0.85, 1.5);
  const roleUncertainty = 1 + ((0.5 - Math.abs(player.startProbability - 0.5)) * 0.32);
  // 1.282 standard deviations gives an approximately 80% central interval.
  const halfWidth = empirical * 1.282 * workloadUncertainty * roleUncertainty;
  return {
    ...player,
    rangeLow: Number(Math.max(0, player.projection - halfWidth).toFixed(1)),
    rangeHigh: Number(Math.max(0, player.projection + halfWidth).toFixed(1)),
    calibrationSampleSize: cell?.sampleSize || 0,
    calibrationBias: cell ? Number(cell.bias.toFixed(2)) : null,
    calibrationCoverage: cell?.coverage == null ? null : Number(cell.coverage.toFixed(3)),
  };
}

function totalActual(ids: string[], actualByPlayer: Map<string, number>): number {
  return ids.reduce((sum, id) => sum + (actualByPlayer.get(id) || 0), 0);
}

export function buildProjectionValidation(args: {
  response: LineupOptimizerResponse;
  actualByPlayer: Map<string, number>;
  source: 'live' | 'backtest';
}): { summary: ProjectionValidationSummary; rows: ProjectionValidationRow[] } {
  const { response, actualByPlayer, source } = args;
  const rows: ProjectionValidationRow[] = (response.projectedPlayers || [])
    .filter((player) => actualByPlayer.has(player.id))
    .map((player) => {
      const actual = actualByPlayer.get(player.id) || 0;
      const error = player.projection - actual;
      return {
        season: Number(response.season),
        week: response.week,
        team: response.teamName,
        modelVersion: response.modelVersion,
        source,
        playerId: player.id,
        position: player.position,
        bucket: projectionBucket(player.projection),
        projection: player.projection,
        actual,
        error,
        absoluteError: Math.abs(error),
        rangeLow: player.rangeLow,
        rangeHigh: player.rangeHigh,
        covered: actual >= player.rangeLow && actual <= player.rangeHigh,
        snapshotGeneratedAt: response.generatedAt,
      };
    });

  const byPosition: ProjectionValidationSummary['byPosition'] = {};
  for (const position of new Set(rows.map((row) => row.position))) {
    const positionRows = rows.filter((row) => row.position === position);
    byPosition[position] = {
      sampleSize: positionRows.length,
      meanAbsoluteError: Number((positionRows.reduce((sum, row) => sum + row.absoluteError, 0) / positionRows.length).toFixed(2)),
      bias: Number((positionRows.reduce((sum, row) => sum + row.error, 0) / positionRows.length).toFixed(2)),
      rmse: Number(Math.sqrt(positionRows.reduce((sum, row) => sum + (row.error ** 2), 0) / positionRows.length).toFixed(2)),
      rangeCoverage: Number((positionRows.filter((row) => row.covered).length / positionRows.length).toFixed(3)),
    };
  }

  const byBucket: NonNullable<ProjectionValidationSummary['byBucket']> = {};
  for (const bucket of ['low', 'medium', 'high'] as ProjectionBucket[]) {
    const bucketRows = rows.filter((row) => row.bucket === bucket);
    if (!bucketRows.length) continue;
    byBucket[bucket] = {
      sampleSize: bucketRows.length,
      meanAbsoluteError: Number((bucketRows.reduce((sum, row) => sum + row.absoluteError, 0) / bucketRows.length).toFixed(2)),
      bias: Number((bucketRows.reduce((sum, row) => sum + row.error, 0) / bucketRows.length).toFixed(2)),
      rangeCoverage: Number((bucketRows.filter((row) => row.covered).length / bucketRows.length).toFixed(3)),
    };
  }

  const currentIds = response.currentLineup.flatMap((entry) => entry.player ? [entry.player.id] : []);
  const optimalIds = response.optimalLineup.flatMap((entry) => entry.player ? [entry.player.id] : []);
  const submittedLineupActual = response.available ? totalActual(currentIds, actualByPlayer) : null;
  const optimalLineupActual = totalActual(optimalIds, actualByPlayer);
  const recommendations: WeeklyProjectedPlayer[] = response.optimalLineup.flatMap((entry) => entry.changed && entry.player ? [entry.player] : []);
  const replaced: WeeklyProjectedPlayer[] = response.currentLineup.flatMap((entry) => entry.changed && entry.player ? [entry.player] : []);
  const paired = Math.min(recommendations.length, replaced.length);
  let correct = 0;
  for (let index = 0; index < paired; index += 1) {
    if ((actualByPlayer.get(recommendations[index].id) || 0) > (actualByPlayer.get(replaced[index].id) || 0)) correct += 1;
  }

  const summary: ProjectionValidationSummary = {
    sampleSize: rows.length,
    meanAbsoluteError: rows.length ? Number((rows.reduce((sum, row) => sum + row.absoluteError, 0) / rows.length).toFixed(2)) : null,
    bias: rows.length ? Number((rows.reduce((sum, row) => sum + row.error, 0) / rows.length).toFixed(2)) : null,
    rmse: rows.length ? Number(Math.sqrt(rows.reduce((sum, row) => sum + (row.error ** 2), 0) / rows.length).toFixed(2)) : null,
    byPosition,
    byBucket,
    optimalBeatSubmitted: submittedLineupActual == null ? null : optimalLineupActual > submittedLineupActual,
    submittedLineupActual: submittedLineupActual == null ? null : Number(submittedLineupActual.toFixed(2)),
    optimalLineupActual: Number(optimalLineupActual.toFixed(2)),
    startSitAccuracy: paired ? Number((correct / paired).toFixed(3)) : null,
    confidenceRangeCoverage: rows.length ? Number((rows.filter((row) => row.covered).length / rows.length).toFixed(3)) : null,
  };
  return { summary, rows };
}

export async function saveProjectionValidation(rows: ProjectionValidationRow[]): Promise<void> {
  if (!rows.length) return;
  const url = databaseUrl();
  if (!url) return;
  try {
    const sql = neon(url);
    const chunkSize = 500;
    for (let index = 0; index < rows.length; index += chunkSize) {
      const chunk = rows.slice(index, index + chunkSize).map((row) => ({
        season: row.season,
        week: row.week,
        team: row.team,
        model_version: row.modelVersion,
        source: row.source,
        player_id: row.playerId,
        position: row.position,
        prediction_bucket: row.bucket,
        projection: row.projection,
        actual: row.actual,
        error: row.error,
        absolute_error: row.absoluteError,
        range_low: row.rangeLow,
        range_high: row.rangeHigh,
        range_covered: row.covered,
        snapshot_generated_at: row.snapshotGeneratedAt,
      }));
      await sql`
        INSERT INTO projection_validation_results (
          season, week, team, model_version, source, player_id, position,
          prediction_bucket, projection, actual, error, absolute_error,
          range_low, range_high, range_covered, snapshot_generated_at, validated_at
        )
        SELECT
          item.season, item.week, item.team, item.model_version, item.source,
          item.player_id, item.position, item.prediction_bucket, item.projection,
          item.actual, item.error, item.absolute_error, item.range_low,
          item.range_high, item.range_covered, item.snapshot_generated_at, now()
        FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS item(
          season integer, week integer, team text, model_version text, source text,
          player_id text, position text, prediction_bucket text,
          projection double precision, actual double precision, error double precision,
          absolute_error double precision, range_low double precision,
          range_high double precision, range_covered boolean,
          snapshot_generated_at timestamptz
        )
        ON CONFLICT (season, week, team, model_version, source, player_id)
        DO UPDATE SET
          projection = EXCLUDED.projection, actual = EXCLUDED.actual,
          error = EXCLUDED.error, absolute_error = EXCLUDED.absolute_error,
          range_low = EXCLUDED.range_low, range_high = EXCLUDED.range_high,
          range_covered = EXCLUDED.range_covered,
          snapshot_generated_at = EXCLUDED.snapshot_generated_at,
          validated_at = now()
      `;
    }
  } catch (error) {
    console.warn('[projection-calibration] unable to save validation rows', error);
  }
}

export async function loadProjectionValidationDashboard(modelVersion?: string): Promise<{
  modelVersion: string | null;
  sampleSize: number;
  meanAbsoluteError: number | null;
  bias: number | null;
  rmse: number | null;
  rangeCoverage: number | null;
  byPosition: Array<Record<string, unknown>>;
  recentWeeks: Array<Record<string, unknown>>;
}> {
  const url = databaseUrl();
  if (!url) return { modelVersion: modelVersion || null, sampleSize: 0, meanAbsoluteError: null, bias: null, rmse: null, rangeCoverage: null, byPosition: [], recentWeeks: [] };
  const sql = neon(url);
  const version = modelVersion || null;
  const totals = await sql`
    SELECT
      count(*)::integer AS sample_size,
      avg(absolute_error)::double precision AS mae,
      avg(error)::double precision AS bias,
      sqrt(avg(error * error))::double precision AS rmse,
      avg(CASE WHEN range_covered THEN 1.0 ELSE 0.0 END)::double precision AS coverage
    FROM projection_validation_results
    WHERE (${version}::text IS NULL OR model_version = ${version})
  ` as Array<Record<string, unknown>>;
  const byPosition = await sql`
    SELECT position, count(*)::integer AS sample_size,
      avg(absolute_error)::double precision AS mae,
      avg(error)::double precision AS bias,
      avg(CASE WHEN range_covered THEN 1.0 ELSE 0.0 END)::double precision AS coverage
    FROM projection_validation_results
    WHERE (${version}::text IS NULL OR model_version = ${version})
    GROUP BY position
    ORDER BY position
  ` as Array<Record<string, unknown>>;
  const recentWeeks = await sql`
    SELECT season, week, source, count(*)::integer AS sample_size,
      avg(absolute_error)::double precision AS mae,
      avg(error)::double precision AS bias,
      avg(CASE WHEN range_covered THEN 1.0 ELSE 0.0 END)::double precision AS coverage
    FROM projection_validation_results
    WHERE (${version}::text IS NULL OR model_version = ${version})
    GROUP BY season, week, source
    ORDER BY season DESC, week DESC
    LIMIT 20
  ` as Array<Record<string, unknown>>;
  const total = totals[0] || {};
  return {
    modelVersion: version,
    sampleSize: Number(total.sample_size || 0),
    meanAbsoluteError: total.mae == null ? null : Number(Number(total.mae).toFixed(2)),
    bias: total.bias == null ? null : Number(Number(total.bias).toFixed(2)),
    rmse: total.rmse == null ? null : Number(Number(total.rmse).toFixed(2)),
    rangeCoverage: total.coverage == null ? null : Number(Number(total.coverage).toFixed(3)),
    byPosition,
    recentWeeks,
  };
}
