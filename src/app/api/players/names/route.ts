import { NextRequest } from 'next/server';
import { getAllPlayersCached } from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const idsParam = url.searchParams.get('ids') || '';
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return Response.json({ players: {} });

    const all = await getAllPlayersCached();
    const players: Record<string, { name: string; position?: string; team?: string }> = {};
    for (const id of ids) {
      const p = all[id];
      if (p) {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || id;
        players[id] = { name, position: p.position || undefined, team: p.team || undefined };
      } else {
        players[id] = { name: id };
      }
    }
    return Response.json({ players });
  } catch (e) {
    return Response.json({ error: 'Failed to resolve players' }, { status: 500 });
  }
}
