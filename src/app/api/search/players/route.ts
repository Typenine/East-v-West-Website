import { NextRequest, NextResponse } from 'next/server';
import { getAllPlayers } from '@/lib/utils/sleeper-api';

export const revalidate = 60; // cache at the route level for 60s on the server

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (!q || q.length < 2) return NextResponse.json({ players: [] }, { status: 200 });

    const players = await getAllPlayers();
    const out: Array<{ id: string; name: string; position?: string; team?: string }> = [];

    for (const [id, p] of Object.entries(players as Record<string, any>)) {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      if (!name) continue;
      if (name.toLowerCase().includes(q)) {
        out.push({ id, name, position: p.position, team: p.team });
      }
    }

    // Sort best-first: startsWith > contains; then by position weight and name
    out.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ players: out.slice(0, 10) }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ players: [] }, { status: 200 });
  }
}
