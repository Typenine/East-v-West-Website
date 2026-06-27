import { NextResponse } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { getLeagueIdForSeason } from '@/lib/constants/league';
import { getLeagueMatchups } from '@/lib/utils/sleeper-api';
import { loadLatestProjectionSnapshot } from '@/lib/fantasy/projection-snapshots';
import type { ProjectionValidationSummary, WeeklyProjectedPlayer } from '@/lib/fantasy/lineup-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function totalActual(ids: string[], actualByPlayer: Map<string, number>): number {
  return ids.reduce((sum, id) => sum + (actualByPlayer.get(id) || 0), 0);
}

export async function GET(request: Request) {
  const user = await requireTeamUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const url = new URL(request.url);
  const season = Number(url.searchParams.get('season'));
  const week = Number(url.searchParams.get('week'));
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 18) {
    return NextResponse.json({ error: 'Valid season and week are required' }, { status: 400 });
  }
  const leagueId = getLeagueIdForSeason(season);
  if (!leagueId) return NextResponse.json({ error: 'League season not configured' }, { status: 404 });
  const [snapshot, matchups] = await Promise.all([
    loadLatestProjectionSnapshot({ season, week, team: user.team }),
    getLeagueMatchups(leagueId, week).catch(() => []),
  ]);
  if (!snapshot) return NextResponse.json({ error: 'No pregame projection snapshot found' }, { status: 404 });
  const actualByPlayer = new Map<string, number>();
  for (const matchup of matchups) {
    for (const [playerId, points] of Object.entries(matchup.players_points || {})) {
      const value = Number(points);
      if (Number.isFinite(value)) actualByPlayer.set(playerId, value);
    }
  }
  if (!actualByPlayer.size) {
    return NextResponse.json({ snapshot, validation: null, reason: 'Actual points are not available yet.' });
  }
  const projected = snapshot.projectedPlayers || [];
  const errors = projected
    .filter((player) => actualByPlayer.has(player.id))
    .map((player) => ({
      player,
      actual: actualByPlayer.get(player.id) || 0,
      error: player.projection - (actualByPlayer.get(player.id) || 0),
    }));
  const byPosition: ProjectionValidationSummary['byPosition'] = {};
  for (const position of new Set(errors.map((entry) => entry.player.position))) {
    const rows = errors.filter((entry) => entry.player.position === position);
    byPosition[position] = {
      sampleSize: rows.length,
      meanAbsoluteError: Number((rows.reduce((sum, row) => sum + Math.abs(row.error), 0) / rows.length).toFixed(2)),
      bias: Number((rows.reduce((sum, row) => sum + row.error, 0) / rows.length).toFixed(2)),
    };
  }
  const currentIds = snapshot.currentLineup.flatMap((entry) => entry.player ? [entry.player.id] : []);
  const optimalIds = snapshot.optimalLineup.flatMap((entry) => entry.player ? [entry.player.id] : []);
  const submittedLineupActual = snapshot.available ? totalActual(currentIds, actualByPlayer) : null;
  const optimalLineupActual = totalActual(optimalIds, actualByPlayer);
  const recommendations: WeeklyProjectedPlayer[] = snapshot.optimalLineup.flatMap((entry) => entry.changed && entry.player ? [entry.player] : []);
  const replaced: WeeklyProjectedPlayer[] = snapshot.currentLineup.flatMap((entry) => entry.changed && entry.player ? [entry.player] : []);
  const paired = Math.min(recommendations.length, replaced.length);
  let correct = 0;
  for (let index = 0; index < paired; index += 1) {
    if ((actualByPlayer.get(recommendations[index].id) || 0) > (actualByPlayer.get(replaced[index].id) || 0)) correct += 1;
  }
  const covered = errors.filter((row) => row.actual >= row.player.rangeLow && row.actual <= row.player.rangeHigh).length;
  const validation: ProjectionValidationSummary = {
    sampleSize: errors.length,
    meanAbsoluteError: errors.length ? Number((errors.reduce((sum, row) => sum + Math.abs(row.error), 0) / errors.length).toFixed(2)) : null,
    bias: errors.length ? Number((errors.reduce((sum, row) => sum + row.error, 0) / errors.length).toFixed(2)) : null,
    byPosition,
    optimalBeatSubmitted: submittedLineupActual == null ? null : optimalLineupActual > submittedLineupActual,
    submittedLineupActual: submittedLineupActual == null ? null : Number(submittedLineupActual.toFixed(2)),
    optimalLineupActual: Number(optimalLineupActual.toFixed(2)),
    startSitAccuracy: paired ? Number((correct / paired).toFixed(3)) : null,
    confidenceRangeCoverage: errors.length ? Number((covered / errors.length).toFixed(3)) : null,
  };
  return NextResponse.json({ snapshot, validation });
}
