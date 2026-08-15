import { NextRequest } from 'next/server';
import { getHallOfFameActor, canManageFranchise } from '@/lib/hall-of-fame/auth';
import { getFranchisePlayerHistory, getHallOfFameFranchises } from '@/lib/hall-of-fame/service';
import { listActiveHallOfFameEntries } from '@/server/db/hall-of-fame-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const franchiseId = req.nextUrl.searchParams.get('franchiseId')?.trim() || '';
  if (!franchiseId) return Response.json({ error: 'franchiseId is required.' }, { status: 400 });

  const franchise = getHallOfFameFranchises().find((row) => row.franchiseId === franchiseId);
  if (!franchise) return Response.json({ error: 'Unknown franchise.' }, { status: 404 });

  const actor = await getHallOfFameActor();
  if (!canManageFranchise(actor, franchiseId)) {
    return Response.json({ error: actor.sessionValid ? 'You can only manage your own franchise Hall of Fame.' : 'Please sign in to manage Hall of Fame inductions.' }, { status: 403 });
  }

  const [history, activeEntries] = await Promise.all([
    getFranchisePlayerHistory(franchiseId),
    listActiveHallOfFameEntries(),
  ]);
  const inductedIds = new Set(
    activeEntries.filter((entry) => entry.franchiseId === franchiseId).map((entry) => entry.playerId),
  );
  const candidates = history.filter((candidate) => !candidate.currentlyOnFranchise && !inductedIds.has(candidate.playerId));

  return Response.json({ franchise, candidates });
}
