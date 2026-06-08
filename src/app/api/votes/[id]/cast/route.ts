import { type NextRequest } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { postToDiscordWebhook } from '@/lib/utils/discord';
import {
  getPollById,
  getCurrentOpenRound,
  getOptionsForRound,
  getVoteCount,
  getMyVote,
  upsertVote,
  markDiscordNotified,
} from '@/server/db/votes-queries';
import { TOTAL_ELIGIBLE } from '@/lib/votes/types';
import type { BallotSelection } from '@/lib/votes/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SITE_URL = process.env.SITE_URL ?? '';
const DISCORD_VOTES_WEBHOOK_URL = process.env.DISCORD_VOTES_WEBHOOK_URL ?? '';
const TEST_MODE = process.env.VOTES_TEST_MODE === 'true';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ident = await requireTeamUser();
  if (!ident) return Response.json({ error: 'You must be logged in to vote.' }, { status: 401 });

  const poll = await getPollById(id);
  if (!poll) return Response.json({ error: 'Poll not found.' }, { status: 404 });
  if (poll.status !== 'open') return Response.json({ error: 'This poll is not open.' }, { status: 409 });

  const round = await getCurrentOpenRound(id);
  if (!round) return Response.json({ error: 'No open round.' }, { status: 409 });

  const voterId = poll.eligibilityType === 'team' ? ident.team : ident.userId;
  const voterDisplay = ident.team;

  const body = await req.json().catch(() => ({}));
  const selections: BallotSelection[] = Array.isArray(body.selections) ? body.selections : [];

  if (!selections.length) return Response.json({ error: 'No selections provided.' }, { status: 400 });

  // Validate ballot
  const options = await getOptionsForRound(round.id);
  const optionIds = new Set(options.map((o) => o.id));

  for (const sel of selections) {
    if (!optionIds.has(sel.optionId)) {
      return Response.json({ error: `Invalid option: ${sel.optionId}` }, { status: 400 });
    }
  }

  switch (round.voteType) {
    case 'borda':
    case 'irv': {
      if (selections.length !== options.length) {
        return Response.json({ error: `You must rank all ${options.length} options.` }, { status: 400 });
      }
      const ranks = selections.map((s) => s.rank).filter((r) => r != null) as number[];
      const uniqueRanks = new Set(ranks);
      if (uniqueRanks.size !== options.length || Math.min(...ranks) !== 1 || Math.max(...ranks) !== options.length) {
        return Response.json({ error: 'Ranks must be unique integers from 1 to N.' }, { status: 400 });
      }
      break;
    }
    case 'select_one':
    case 'eliminate': {
      const selected = selections.filter((s) => s.selected);
      if (selected.length !== 1) {
        return Response.json({ error: 'You must select exactly one option.' }, { status: 400 });
      }
      break;
    }
    case 'select_multi': {
      if (!selections.some((s) => s.selected)) {
        return Response.json({ error: 'You must select at least one option.' }, { status: 400 });
      }
      break;
    }
    case 'yes_no': {
      const selected = selections.filter((s) => s.selected);
      if (selected.length !== 1) {
        return Response.json({ error: 'You must select Yes or No.' }, { status: 400 });
      }
      break;
    }
  }

  const ok = await upsertVote(round.id, voterId, voterDisplay, selections);
  if (!ok) return Response.json({ error: 'Failed to save vote.' }, { status: 500 });

  // Check 50% Discord reminder milestone
  try {
    if (!poll.discordNotifiedReminder && DISCORD_VOTES_WEBHOOK_URL && !TEST_MODE) {
      const voteCount = await getVoteCount(round.id);
      const totalEligible = TOTAL_ELIGIBLE[poll.eligibilityType] ?? 12;
      if (voteCount / totalEligible >= 0.5) {
        const link = `${SITE_URL}/votes/${id}`;
        await postToDiscordWebhook(DISCORD_VOTES_WEBHOOK_URL, {
          content: `Halfway there — ${voteCount}/${totalEligible} have voted on **${poll.title}**.\n${link}`,
          embeds: [{
            title: poll.title,
            url: link,
            color: 0xf59e0b,
            ...(poll.deadline ? { fields: [{ name: 'Deadline', value: new Date(poll.deadline).toLocaleDateString(), inline: true }] } : {}),
          }],
        }).catch(() => {});
        await markDiscordNotified(id, 'reminder');
      }
    }
  } catch {}

  return Response.json({ ok: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Allow checking if already voted (same URL, GET method)
  const { id } = await params;
  const ident = await requireTeamUser();
  if (!ident) return Response.json({ hasVoted: false, vote: null });

  const poll = await getPollById(id);
  if (!poll) return Response.json({ hasVoted: false, vote: null });

  const round = await getCurrentOpenRound(id);
  if (!round) return Response.json({ hasVoted: false, vote: null });

  const voterId = poll.eligibilityType === 'team' ? ident.team : ident.userId;
  const myVote = await getMyVote(round.id, voterId);

  return Response.json({
    hasVoted: !!myVote,
    vote: myVote ? myVote.selections.map((s) => ({ optionId: s.optionId, rank: s.rank, selected: s.selected })) : null,
  });
}
