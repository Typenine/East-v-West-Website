import { NextResponse } from 'next/server';
import { getAllPlayersCached, type SleeperPlayer } from '@/lib/utils/sleeper-api';

// 5 minutes cache in-memory
const TTL_MS = 5 * 60 * 1000;
type PlayerInfo = {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  position?: string;
  team?: string;
  status?: string;
  injury_status?: string;
  years_exp?: number;
  rookie_year?: string | number;
};

const cache: Record<string, { ts: number; data: PlayerInfo }> = {};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

    const now = Date.now();
    const cached = cache[id];
    if (cached && now - cached.ts < TTL_MS) {
      return NextResponse.json(cached.data, { status: 200 });
    }

    const players = await getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>));
    const p = players[id] as SleeperPlayer | undefined;
    if (!p) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const data: PlayerInfo = {
      id,
      first_name: p.first_name,
      last_name: p.last_name,
      full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      position: p.position,
      team: p.team,
      status: p.status,
      injury_status: p.injury_status,
      years_exp: p.years_exp,
      rookie_year: p.rookie_year,
    };

    cache[id] = { ts: now, data };
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
