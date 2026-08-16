import { type NextRequest } from 'next/server';
import { getPlayerProfileWithHonors } from '@/lib/players/player-honors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  try {
    const profile = await getPlayerProfileWithHonors(playerId);
    if (!profile) return Response.json({ error: 'Player not found' }, { status: 404 });
    return Response.json(profile);
  } catch {
    return Response.json({ error: 'Failed to load player profile' }, { status: 500 });
  }
}
