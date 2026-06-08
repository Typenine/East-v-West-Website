import { type NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import {
  listPolls,
  getRoundsForPoll,
  getOptionsForRound,
  getVoteCount,
} from '@/server/db/votes-queries';
import { TOTAL_ELIGIBLE } from '@/lib/votes/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  try { return isAdminCookieValue(req.cookies.get('evw_admin')?.value); } catch { return false; }
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const polls = await listPolls(true); // include drafts
    const result = [];

    for (const poll of polls) {
      const rounds = await getRoundsForPoll(poll.id);
      const roundsWithDetails = [];

      for (const round of rounds) {
        const options = await getOptionsForRound(round.id);
        const voteCount = await getVoteCount(round.id);
        const totalEligible = TOTAL_ELIGIBLE[poll.eligibilityType] ?? 12;
        roundsWithDetails.push({ ...round, options, voteCount, totalEligible });
      }

      result.push({ poll, rounds: roundsWithDetails, roundCount: rounds.length });
    }

    return Response.json(result);
  } catch {
    return Response.json([], { status: 200 });
  }
}
