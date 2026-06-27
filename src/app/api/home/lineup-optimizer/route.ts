import { NextResponse } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { buildTeamLineupOptimizerV3 } from '@/lib/fantasy/weekly-projections-next';
import type { LineupOptimizerResponse } from '@/lib/fantasy/lineup-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_TTL_MS = 10 * 60 * 1000;
const responseCache = new Map<string, { ts: number; data: LineupOptimizerResponse }>();

export async function GET() {
  const user = await requireTeamUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const cached = responseCache.get(user.team);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  }

  try {
    const data = await buildTeamLineupOptimizerV3(user.team);
    responseCache.set(user.team, { ts: Date.now(), data });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    console.error('[home-lineup-optimizer] failed', error);
    const message = error instanceof Error ? error.message : '';
    const status = message === 'Team roster not found' ? 404 : 500;
    return NextResponse.json(
      { error: status === 404 ? message : 'Unable to build lineup projections' },
      { status }
    );
  }
}
