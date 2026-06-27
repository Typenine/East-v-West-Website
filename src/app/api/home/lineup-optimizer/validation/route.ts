import { NextResponse } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { getLeagueIdForSeason } from '@/lib/constants/league';
import { getLeagueMatchups } from '@/lib/utils/sleeper-api';
import { loadLatestProjectionSnapshot } from '@/lib/fantasy/projection-snapshots';
import {
  buildProjectionValidation,
  saveProjectionValidation,
} from '@/lib/fantasy/projection-calibration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const result = buildProjectionValidation({ response: snapshot, actualByPlayer, source: 'live' });
  await saveProjectionValidation(result.rows);
  return NextResponse.json({ snapshot, validation: result.summary });
}
