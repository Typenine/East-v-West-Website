import { type NextRequest } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { getPollById } from '@/server/db/votes-queries';
import {
  getQuestionsForPoll,
  getResponseCount,
  upsertResponse,
} from '@/server/db/poll-form-queries';
import type { FormAnswer } from '@/lib/votes/types';
import { isConditionMet, validateQuestionAnswer } from '@/lib/votes/validate-answer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ident = await requireTeamUser();
  if (!ident) return Response.json({ error: 'You must be logged in to respond.' }, { status: 401 });

  const poll = await getPollById(id);
  if (!poll) return Response.json({ error: 'Poll not found.' }, { status: 404 });
  if (poll.status !== 'open') return Response.json({ error: 'This poll is not accepting responses.' }, { status: 409 });

  const voterId = poll.eligibilityType === 'team' ? ident.team : ident.userId;
  const voterDisplay = ident.team;

  if (poll.responseLimit) {
    const existing = await getResponseCount(id);
    const { getResponseByVoter } = await import('@/server/db/poll-form-queries');
    const myExisting = await getResponseByVoter(id, voterId);
    if (!myExisting && existing >= poll.responseLimit) {
      return Response.json({ error: 'Response limit reached.' }, { status: 409 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const answers: FormAnswer[] = Array.isArray(body.answers) ? body.answers : [];

  const questions = await getQuestionsForPoll(id);
  if (!questions.length) return Response.json({ error: 'No questions found.' }, { status: 400 });

  const answersMap: Record<string, FormAnswer> = {};
  for (const a of answers) {
    answersMap[a.questionId] = a;
  }

  for (const q of questions) {
    if (!isConditionMet(q, answersMap)) continue;
    const err = validateQuestionAnswer(q, answersMap[q.id]);
    if (err) return Response.json({ error: err }, { status: 400 });
  }

  const ok = await upsertResponse(id, voterId, voterDisplay, answers);
  if (!ok) return Response.json({ error: 'Failed to save response.' }, { status: 500 });

  return Response.json({ ok: true, confirmationMessage: poll.confirmationMessage });
}
