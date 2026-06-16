import { type NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { requireTeamUser } from '@/lib/server/session';
import { postToDiscordWebhook } from '@/lib/utils/discord';
import {
  getPollById,
  getRoundsForPoll,
  getOptionsForRound,
  getVoteCount,
  getMyVote,
  getAllVotesWithSelections,
  updatePollStatus,
  updateRoundStatus,
  publishRoundResults,
  createOptions,
  deletePoll,
  markDiscordNotified,
  publishPollSurveyResults,
  updateSuggestionVoteTag,
  getRoundById,
} from '@/server/db/votes-queries';
import {
  getQuestionsForPoll,
  getResponseByVoter,
  getResponseCount,
  getAllResponses,
  buildFormResults,
} from '@/server/db/poll-form-queries';
import { computeRound, buildBallotMap } from '@/lib/votes/compute';
import { TOTAL_ELIGIBLE } from '@/lib/votes/types';
import { surveyResultsVisibleToMembers } from '@/lib/votes/results-visibility';
import type { PollDetail, RoundWithDetails, RoundResult } from '@/lib/votes/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.SITE_URL ?? '';
const DISCORD_VOTES_WEBHOOK_URL = process.env.DISCORD_VOTES_WEBHOOK_URL ?? '';
const TEST_MODE = process.env.VOTES_TEST_MODE === 'true';

function isAdmin(req: NextRequest): boolean {
  try { return isAdminCookieValue(req.cookies.get('evw_admin')?.value); } catch { return false; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const poll = await getPollById(id);
    if (!poll) return Response.json({ error: 'Not found.' }, { status: 404 });

    const admin = isAdmin(req);
    if (poll.status === 'draft' && !admin) return Response.json({ error: 'Not found.' }, { status: 404 });

    const rounds = await getRoundsForPoll(poll.id);
    const totalEligible = TOTAL_ELIGIBLE[poll.eligibilityType] ?? 12;

    // Get caller identity for myBallot
    let voterId: string | null = null;
    try {
      const ident = await requireTeamUser();
      if (ident) {
        voterId = poll.eligibilityType === 'team' ? ident.team : ident.userId;
      }
    } catch {}

    const roundsWithDetails: RoundWithDetails[] = [];
    let myBallot = null;

    for (const round of rounds) {
      const options = await getOptionsForRound(round.id);
      const voteCount = await getVoteCount(round.id);
      const resultsVisible =
        admin ||
        poll.resultVisibility === 'immediate' ||
        (poll.resultVisibility === 'all_voted' && voteCount >= totalEligible) ||
        round.resultsPublishedAt != null;

      let result: RoundResult | null = null;
      if (resultsVisible && round.status === 'closed') {
        const allVotes = await getAllVotesWithSelections(round.id);
        const ballotMap = buildBallotMap(
          allVotes.map((v) => ({ vote: v, selections: v.selections.map((s) => ({ optionId: s.optionId, rank: s.rank, selected: s.selected })) })),
        );
        result = computeRound(round, ballotMap, options, poll.eligibilityType);
      }

      roundsWithDetails.push({ ...round, options, voteCount, totalEligible, resultsVisible, result });

      // myBallot: only for the current open round
      if (round.status === 'open' && voterId) {
        const myVote = await getMyVote(round.id, voterId);
        if (myVote) {
          myBallot = myVote.selections.map((s) => ({ optionId: s.optionId, rank: s.rank ?? undefined, selected: s.selected ?? undefined }));
        }
      }
    }

    const openRound = roundsWithDetails.find((r) => r.status === 'open') ?? null;

    // Form questions + responses
    const questions = await getQuestionsForPoll(poll.id);
    const responseCount = await getResponseCount(poll.id);
    const myFormResponse = voterId ? await getResponseByVoter(poll.id, voterId) : null;

    // Aggregate form results for members only when visibility rules allow
    const pollResultsVisible =
      admin ||
      (questions.length > 0 && surveyResultsVisibleToMembers(poll, responseCount, totalEligible));
    let formResults = null;
    if (questions.length && pollResultsVisible) {
      const allResponses = await getAllResponses(poll.id);
      formResults = await buildFormResults(questions, allResponses, poll.anonymous);
    }

    const detail: PollDetail = {
      poll,
      currentRound: openRound,
      roundCount: rounds.length,
      rounds: roundsWithDetails,
      myBallot,
      questions,
      myFormResponse: myFormResponse?.answers ?? null,
      responseCount,
      formResults,
    };

    return Response.json(detail);
  } catch {
    return Response.json({ error: 'Server error.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  try {
    const body = await req.json();
    const { action, roundNumber, roundId } = body as { action: string; roundNumber?: number; roundId?: string };
    const poll = await getPollById(id);
    if (!poll) return Response.json({ error: 'Not found.' }, { status: 404 });

    const rounds = await getRoundsForPoll(id);
    const totalEligible = TOTAL_ELIGIBLE[poll.eligibilityType] ?? 12;

    // For form-only polls (no rounds): open/close directly
    if (action === 'open_poll') {
      await updatePollStatus(id, 'open');
      return Response.json({ ok: true });
    }

    if (action === 'close_poll_now') {
      await updatePollStatus(id, 'closed', new Date().toISOString());
      return Response.json({ ok: true });
    }

    if (action === 'open_round') {
      const targetNum = roundNumber ?? 1;
      const round = rounds.find((r) => r.roundNumber === targetNum);
      if (!round) return Response.json({ error: 'Round not found.' }, { status: 404 });
      if (round.status !== 'pending') return Response.json({ error: 'Round is not pending.' }, { status: 409 });

      await updateRoundStatus(round.id, 'open', { openedAt: new Date().toISOString() });
      if (targetNum === 1) await updatePollStatus(id, 'open');

      // Discord open notification (first round only)
      if (targetNum === 1 && !poll.discordNotifiedOpen && DISCORD_VOTES_WEBHOOK_URL && !TEST_MODE) {
        const link = `${SITE_URL}/votes/${id}`;
        await postToDiscordWebhook(DISCORD_VOTES_WEBHOOK_URL, {
          content: `A new vote is open: **${poll.title}**\n${link}`,
          embeds: [{
            title: poll.title,
            description: poll.description ?? undefined,
            url: link,
            color: 0x3b82f6,
            fields: [
              { name: 'Eligibility', value: poll.eligibilityType === 'team' ? '12 teams' : '14 members', inline: true },
              ...(poll.deadline ? [{ name: 'Deadline', value: new Date(poll.deadline).toLocaleDateString(), inline: true }] : []),
            ],
          }],
        }).catch(() => {});
        await markDiscordNotified(id, 'open');
      }

      return Response.json({ ok: true });
    }

    if (action === 'close_round') {
      const openRound = rounds.find((r) => r.status === 'open');
      if (!openRound) return Response.json({ error: 'No open round.' }, { status: 409 });

      await updateRoundStatus(openRound.id, 'closed', { closedAt: new Date().toISOString() });
      const isLastRound = openRound.roundNumber === rounds.length;
      if (isLastRound) await updatePollStatus(id, 'closed', new Date().toISOString());

      return Response.json({ ok: true });
    }

    if (action === 'advance_round') {
      const closedRound = rounds.find((r) => r.status === 'closed' && r.roundNumber < rounds.length);
      if (!closedRound) return Response.json({ error: 'No closed non-final round to advance from.' }, { status: 409 });

      const nextRound = rounds.find((r) => r.roundNumber === closedRound.roundNumber + 1);
      if (!nextRound) return Response.json({ error: 'Next round not found.' }, { status: 404 });

      // Compute survivors from the closed round
      const closedOptions = await getOptionsForRound(closedRound.id);
      const allVotes = await getAllVotesWithSelections(closedRound.id);
      const ballotMap = buildBallotMap(
        allVotes.map((v) => ({ vote: v, selections: v.selections.map((s) => ({ optionId: s.optionId, rank: s.rank, selected: s.selected })) })),
      );
      const result = computeRound(closedRound, ballotMap, closedOptions, poll.eligibilityType);
      const survivorIds = 'survivors' in result ? result.survivors : 'winners' in result ? result.winners : [];

      // Create options in next round from survivors
      const survivorOptions = survivorIds
        .map((sid) => closedOptions.find((o) => o.id === sid))
        .filter(Boolean) as typeof closedOptions;

      const newOptions = await createOptions(
        survivorOptions.map((opt, idx) => ({
          roundId: nextRound.id,
          text: opt.text,
          linkedSuggestionId: opt.linkedSuggestionId,
          carriedFromOptionId: opt.id,
          displayOrder: idx,
        })),
      );

      return Response.json({ ok: true, nextRound, options: newOptions });
    }

    if (action === 'publish_results') {
      const targetRoundId = roundId ?? rounds.find((r) => r.status === 'closed')?.id;
      if (!targetRoundId) return Response.json({ error: 'No closed round to publish.' }, { status: 409 });

      const round = await getRoundById(targetRoundId);
      if (!round) return Response.json({ error: 'Round not found.' }, { status: 404 });

      await publishRoundResults(targetRoundId);

      const isLastRound = round.roundNumber === rounds.length;
      if (isLastRound) {
        // Post Discord results notification
        if (!poll.discordNotifiedClosed && DISCORD_VOTES_WEBHOOK_URL && !TEST_MODE) {
          const link = `${SITE_URL}/votes/${id}`;
          await postToDiscordWebhook(DISCORD_VOTES_WEBHOOK_URL, {
            content: `Results are in for **${poll.title}**.\n${link}`,
            embeds: [{ title: poll.title, url: link, color: 0x22c55e }],
          }).catch(() => {});
          await markDiscordNotified(id, 'closed');
        }

        // Update linked suggestion voteTags based on result
        if (poll.linkedSuggestionIds?.length) {
          const options = await getOptionsForRound(targetRoundId);
          const allVotes = await getAllVotesWithSelections(targetRoundId);
          const ballotMap = buildBallotMap(
            allVotes.map((v) => ({ vote: v, selections: v.selections.map((s) => ({ optionId: s.optionId, rank: s.rank, selected: s.selected })) })),
          );
          const result = computeRound(round, ballotMap, options, poll.eligibilityType);
          const passed = 'passed' in result ? result.passed : ('winners' in result && result.winners.length > 0);

          for (const sid of poll.linkedSuggestionIds) {
            await updateSuggestionVoteTag(sid, passed ? 'vote_passed' : 'vote_failed').catch(() => {});
          }
        }
      }

      return Response.json({ ok: true });
    }

    if (action === 'close_poll') {
      await updatePollStatus(id, 'closed', new Date().toISOString());
      return Response.json({ ok: true });
    }

    if (action === 'publish_survey_results') {
      if (rounds.length > 0) {
        return Response.json({ error: 'Use round publish for ballot polls.' }, { status: 409 });
      }
      if (poll.status !== 'closed') {
        return Response.json({ error: 'Close the survey before publishing results.' }, { status: 409 });
      }
      const ok = await publishPollSurveyResults(id);
      if (!ok) return Response.json({ error: 'Failed to publish survey results.' }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch {
    return Response.json({ error: 'Server error.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const ok = await deletePoll(id);
  return ok ? Response.json({ ok: true }) : Response.json({ error: 'Failed to delete.' }, { status: 500 });
}
