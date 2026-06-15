import { type NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import {
  getPollById,
  getRoundsForPoll,
  getOptionsForRound,
  getAllVotesWithSelections,
} from '@/server/db/votes-queries';
import { computeRound, buildBallotMap } from '@/lib/votes/compute';
import {
  getQuestionsForPoll,
  getAllResponses,
  getResponseCount,
  buildFormResults,
} from '@/server/db/poll-form-queries';
import type { AdminRoundResults } from '@/lib/votes/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  try { return isAdminCookieValue(req.cookies.get('evw_admin')?.value); } catch { return false; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const poll = await getPollById(id);
  if (!poll) return Response.json({ error: 'Not found.' }, { status: 404 });

  const rounds = await getRoundsForPoll(id);
  const roundResults: AdminRoundResults[] = [];

  for (const round of rounds) {
    const options = await getOptionsForRound(round.id);
    const allVotes = await getAllVotesWithSelections(round.id);

    let result = null;
    if (round.status === 'closed' || round.status === 'open') {
      const ballotMap = buildBallotMap(
        allVotes.map((v) => ({
          vote: v,
          selections: v.selections.map((s) => ({ optionId: s.optionId, rank: s.rank, selected: s.selected })),
        })),
      );
      try {
        result = computeRound(round, ballotMap, options, poll.eligibilityType);
      } catch {}
    }

    roundResults.push({
      ...round,
      options,
      votes: allVotes.map((v) => ({ vote: v, selections: v.selections })),
      result,
    });
  }

  const questions = await getQuestionsForPoll(id);
  const responses = await getAllResponses(id);
  const responseCount = await getResponseCount(id);
  const formResults = questions.length
    ? await buildFormResults(questions, responses, poll.anonymous)
    : [];

  return Response.json({
    poll,
    rounds: roundResults,
    questions,
    formResults,
    responseCount,
  });
}
