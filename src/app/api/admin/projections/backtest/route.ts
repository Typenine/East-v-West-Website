import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredAdminSecret, isAdminCookieValue } from '@/lib/auth/admin';
import { getLeagueIdForSeason } from '@/lib/constants/league';
import { buildHistoricalLeagueWeekV3, PROJECTION_MODEL_VERSION } from '@/lib/fantasy/weekly-projections-next';
import {
  buildProjectionValidation,
  loadProjectionValidationDashboard,
  saveProjectionValidation,
  type ProjectionValidationRow,
} from '@/lib/fantasy/projection-calibration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAdmin(req: NextRequest): boolean {
  const secret = getConfiguredAdminSecret();
  return Boolean(
    isAdminCookieValue(req.cookies.get('evw_admin')?.value) ||
    (secret && req.headers.get('x-admin-secret') === secret)
  );
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json(await loadProjectionValidationDashboard(PROJECTION_MODEL_VERSION));
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const season = Number(body.season || new Date().getFullYear() - 1);
  const startWeek = Math.max(1, Math.min(18, Number(body.startWeek || 1)));
  const endWeek = Math.max(startWeek, Math.min(18, Number(body.endWeek || 18)));
  if (!Number.isInteger(season) || season < 2020 || season > new Date().getFullYear()) {
    return NextResponse.json({ error: 'Valid historical season required' }, { status: 400 });
  }
  const leagueId = getLeagueIdForSeason(season);
  if (!leagueId) return NextResponse.json({ error: `No configured league for ${season}` }, { status: 404 });

  const allRows: ProjectionValidationRow[] = [];
  const weeks: Array<Record<string, unknown>> = [];
  for (let week = startWeek; week <= endWeek; week += 1) {
    try {
      const { responses, actualByPlayer } = await buildHistoricalLeagueWeekV3({ season, week, leagueId });
      if (!actualByPlayer.size) {
        weeks.push({ week, skipped: 'no_actual_points' });
        continue;
      }
      const weekRows: ProjectionValidationRow[] = [];
      for (const response of responses) {
        const validation = buildProjectionValidation({ response, actualByPlayer, source: 'backtest' });
        weekRows.push(...validation.rows);
      }
      await saveProjectionValidation(weekRows);
      allRows.push(...weekRows);
      const mae = weekRows.length ? weekRows.reduce((sum, row) => sum + row.absoluteError, 0) / weekRows.length : null;
      const bias = weekRows.length ? weekRows.reduce((sum, row) => sum + row.error, 0) / weekRows.length : null;
      const coverage = weekRows.length ? weekRows.filter((row) => row.covered).length / weekRows.length : null;
      weeks.push({
        week,
        sampleSize: weekRows.length,
        meanAbsoluteError: mae == null ? null : Number(mae.toFixed(2)),
        bias: bias == null ? null : Number(bias.toFixed(2)),
        rangeCoverage: coverage == null ? null : Number(coverage.toFixed(3)),
      });
    } catch (error) {
      weeks.push({ week, error: error instanceof Error ? error.message : 'backtest_failed' });
    }
  }

  const sampleSize = allRows.length;
  const meanAbsoluteError = sampleSize ? allRows.reduce((sum, row) => sum + row.absoluteError, 0) / sampleSize : null;
  const bias = sampleSize ? allRows.reduce((sum, row) => sum + row.error, 0) / sampleSize : null;
  const rmse = sampleSize ? Math.sqrt(allRows.reduce((sum, row) => sum + (row.error ** 2), 0) / sampleSize) : null;
  const rangeCoverage = sampleSize ? allRows.filter((row) => row.covered).length / sampleSize : null;

  return NextResponse.json({
    ok: true,
    modelVersion: PROJECTION_MODEL_VERSION,
    season,
    startWeek,
    endWeek,
    sampleSize,
    meanAbsoluteError: meanAbsoluteError == null ? null : Number(meanAbsoluteError.toFixed(2)),
    bias: bias == null ? null : Number(bias.toFixed(2)),
    rmse: rmse == null ? null : Number(rmse.toFixed(2)),
    rangeCoverage: rangeCoverage == null ? null : Number(rangeCoverage.toFixed(3)),
    weeks,
    methodology: 'Walk-forward: each week uses only the prior season and games completed before that week. Current depth charts, current injuries, and manual overrides are disabled.',
  });
}
