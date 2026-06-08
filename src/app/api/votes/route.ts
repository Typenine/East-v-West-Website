import { type NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import {
  listPolls,
  getRoundsForPoll,
  getOptionsForRound,
  getVoteCount,
  createPoll,
  createRound,
  createOptions,
  updateSuggestionVoteTag,
} from '@/server/db/votes-queries';
import { TOTAL_ELIGIBLE } from '@/lib/votes/types';
import type { PollListItem, RoundWithDetails } from '@/lib/votes/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  try { return isAdminCookieValue(req.cookies.get('evw_admin')?.value); } catch { return false; }
}

export async function GET(req: NextRequest) {
  try {
    const includeDraft = isAdmin(req);
    const polls = await listPolls(includeDraft);
    const items: PollListItem[] = [];

    for (const poll of polls) {
      const rounds = await getRoundsForPoll(poll.id);
      const openRound = rounds.find((r) => r.status === 'open') ?? null;
      let currentRound: RoundWithDetails | null = null;

      if (openRound) {
        const options = await getOptionsForRound(openRound.id);
        const voteCount = await getVoteCount(openRound.id);
        const totalEligible = TOTAL_ELIGIBLE[poll.eligibilityType] ?? 12;
        const resultsVisible =
          poll.resultVisibility === 'immediate' ||
          (poll.resultVisibility === 'all_voted' && voteCount >= totalEligible) ||
          openRound.resultsPublishedAt != null;

        currentRound = { ...openRound, options, voteCount, totalEligible, resultsVisible };
      }

      items.push({ poll, currentRound, roundCount: rounds.length });
    }

    return Response.json(items);
  } catch {
    return Response.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { title, description, eligibilityType, deadline, anonymous, resultVisibility, linkedSuggestionIds, rounds: roundDefs, round1Options } = body as {
      title: string;
      description?: string;
      eligibilityType: string;
      deadline?: string;
      anonymous?: boolean;
      resultVisibility?: string;
      linkedSuggestionIds?: string[];
      rounds: Array<{ voteType: string; survivorCount?: number; thresholdType: string; thresholdValue?: number }>;
      round1Options?: Array<{ text: string; linkedSuggestionId?: string }>;
    };

    if (!title?.trim()) return Response.json({ error: 'Title is required.' }, { status: 400 });
    if (!roundDefs?.length) return Response.json({ error: 'At least one round is required.' }, { status: 400 });

    const firstRoundType = roundDefs[0]?.voteType;
    if (firstRoundType !== 'yes_no' && (!round1Options || round1Options.length < 2)) {
      return Response.json({ error: 'Round 1 requires at least 2 options.' }, { status: 400 });
    }

    // Create poll
    const poll = await createPoll({
      title: title.trim(),
      description: description?.trim() || null,
      eligibilityType: eligibilityType || 'team',
      linkedSuggestionIds: linkedSuggestionIds?.length ? linkedSuggestionIds : null,
      anonymous: Boolean(anonymous),
      resultVisibility: resultVisibility || 'admin_publish',
      deadline: deadline || null,
    });
    if (!poll) return Response.json({ error: 'Failed to create poll.' }, { status: 500 });

    // Create rounds
    const createdRounds = [];
    for (let i = 0; i < roundDefs.length; i++) {
      const rd = roundDefs[i];
      const round = await createRound({
        pollId: poll.id,
        roundNumber: i + 1,
        voteType: rd.voteType,
        survivorCount: rd.survivorCount ?? null,
        thresholdType: rd.thresholdType || 'plurality',
        thresholdValue: rd.thresholdValue ?? null,
      });
      if (!round) return Response.json({ error: 'Failed to create round.' }, { status: 500 });
      createdRounds.push(round);

      // Create options for round 1 only at creation time
      if (i === 0) {
        if (rd.voteType === 'yes_no') {
          await createOptions([
            { roundId: round.id, text: 'Yes', displayOrder: 0 },
            { roundId: round.id, text: 'No', displayOrder: 1 },
          ]);
        } else if (round1Options?.length) {
          await createOptions(
            round1Options.map((opt, idx) => ({
              roundId: round.id,
              text: opt.text.trim(),
              linkedSuggestionId: opt.linkedSuggestionId || null,
              displayOrder: idx,
            })),
          );
        }
      }
    }

    // Update linked suggestion voteTags
    for (const sid of linkedSuggestionIds ?? []) {
      await updateSuggestionVoteTag(sid, 'voted_on').catch(() => {});
    }

    return Response.json({ ok: true, poll, rounds: createdRounds }, { status: 201 });
  } catch {
    return Response.json({ error: 'Server error.' }, { status: 500 });
  }
}
