import { NextRequest, NextResponse } from 'next/server';
import { getAllPlayers } from '@/lib/utils/sleeper-api';

export const revalidate = 60; // cache at the route level for 60s on the server

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (!q || q.length < 2) return NextResponse.json({ players: [] }, { status: 200 });

    type SlimPlayer = { first_name?: string; last_name?: string; position?: string; team?: string };
    const playersUnknown = (await getAllPlayers()) as unknown;
    const out: Array<{ id: string; name: string; position?: string; team?: string }> = [];

    if (playersUnknown && typeof playersUnknown === 'object') {
      const entries = Object.entries(playersUnknown as Record<string, unknown>);
      for (const [id, u] of entries) {
        const p = u as Partial<SlimPlayer>;
        const first = typeof p.first_name === 'string' ? p.first_name : '';
        const last = typeof p.last_name === 'string' ? p.last_name : '';
        const name = `${first} ${last}`.trim();
        if (!name) continue;
        if (name.toLowerCase().includes(q)) {
          const position = typeof p.position === 'string' ? p.position : undefined;
          const team = typeof p.team === 'string' ? p.team : undefined;
          out.push({ id, name, position, team });
        }
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
  } catch {
    return NextResponse.json({ players: [] }, { status: 200 });
  }
}
