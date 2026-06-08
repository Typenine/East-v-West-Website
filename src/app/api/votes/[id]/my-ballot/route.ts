import { type NextRequest } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { getPollById, getCurrentOpenRound, getMyVote } from '@/server/db/votes-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ident = await requireTeamUser();
  if (!ident) return Response.json({ ballot: null });

  const poll = await getPollById(id);
  if (!poll) return Response.json({ ballot: null });

  const round = await getCurrentOpenRound(id);
  if (!round) return Response.json({ ballot: null });

  const voterId = poll.eligibilityType === 'team' ? ident.team : ident.userId;
  const myVote = await getMyVote(round.id, voterId);

  if (!myVote) return Response.json({ ballot: null });

  return Response.json({
    ballot: myVote.selections.map((s) => ({
      optionId: s.optionId,
      rank: s.rank ?? undefined,
      selected: s.selected ?? undefined,
    })),
    roundId: round.id,
  });
}
