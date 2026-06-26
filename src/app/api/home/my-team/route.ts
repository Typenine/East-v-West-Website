import { NextResponse } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { buildTeamDashboard } from '@/lib/home/team-dashboard-builder';
import type { TeamDashboardResponse } from '@/lib/home/team-dashboard-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 2 * 60 * 1000;
const responseCache = new Map<string, { ts: number; data: TeamDashboardResponse }>();

export async function GET() {
  const user = await requireTeamUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const cached = responseCache.get(user.team);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  }

  try {
    const data = await buildTeamDashboard(user.team);
    responseCache.set(user.team, { ts: Date.now(), data });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    });
  } catch (error) {
    console.error('[home-my-team] failed', error);
    const message = error instanceof Error ? error.message : '';
    const status = message === 'Team roster not found' ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? message : 'Unable to build team dashboard' },
      { status }
    );
  }
}
