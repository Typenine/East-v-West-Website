import { type NextRequest } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { getPollById } from '@/server/db/votes-queries';
import {
  getQuestionsForPoll,
  getResponseCount,
  upsertResponse,
} from '@/server/db/poll-form-queries';
import type { FormAnswer, PollQuestion } from '@/lib/votes/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isConditionMet(q: PollQuestion, answersMap: Record<string, FormAnswer>): boolean {
  if (!q.conditionQuestionId) return true;
  const prior = answersMap[q.conditionQuestionId];
  if (!prior) return false;
  if (q.conditionOptionId) return prior.optionIds?.includes(q.conditionOptionId) ?? false;
  if (q.conditionValue) {
    return prior.textAnswer === q.conditionValue || String(prior.ratingValue) === q.conditionValue;
  }
  return false;
}

function hasAnswer(a: FormAnswer | undefined): boolean {
  if (!a) return false;
  if (a.textAnswer && a.textAnswer.trim()) return true;
  if (a.ratingValue != null) return true;
  if (a.optionIds && a.optionIds.length > 0) return true;
  return false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ident = await requireTeamUser();
  if (!ident) return Response.json({ error: 'You must be logged in to respond.' }, { status: 401 });

  const poll = await getPollById(id);
  if (!poll) return Response.json({ error: 'Poll not found.' }, { status: 404 });
  if (poll.status !== 'open') return Response.json({ error: 'This poll is not accepting responses.' }, { status: 409 });

  const voterId = poll.eligibilityType === 'team' ? ident.team : ident.userId;
  const voterDisplay = ident.team;

  // Check response limit (new responses only — upsert replaces existing, so only enforce for first submission)
  if (poll.responseLimit) {
    const existing = await getResponseCount(id);
    // Allow re-submission (upsert) — only block if this is a new voter and limit is reached
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

  // Build answersMap for conditional check
  const answersMap: Record<string, FormAnswer> = {};
  for (const a of answers) {
    answersMap[a.questionId] = a;
  }

  // Validate
  for (const q of questions) {
    if (q.questionType === 'section_break') continue;
    if (!isConditionMet(q, answersMap)) continue;

    const a = answersMap[q.id];
    if (q.required && !hasAnswer(a)) {
      return Response.json({ error: `Question "${q.text}" is required.` }, { status: 400 });
    }

    if (q.questionType === 'rating' && a?.ratingValue != null) {
      if (a.ratingValue < q.ratingMin || a.ratingValue > q.ratingMax) {
        return Response.json({
          error: `Rating for "${q.text}" must be between ${q.ratingMin} and ${q.ratingMax}.`,
        }, { status: 400 });
      }
    }

    if ((q.questionType === 'short_answer' || q.questionType === 'paragraph') && q.maxLength && a?.textAnswer) {
      if (a.textAnswer.length > q.maxLength) {
        return Response.json({
          error: `Answer for "${q.text}" exceeds maximum length of ${q.maxLength} characters.`,
        }, { status: 400 });
      }
    }
  }

  const ok = await upsertResponse(id, voterId, voterDisplay, answers);
  if (!ok) return Response.json({ error: 'Failed to save response.' }, { status: 500 });

  return Response.json({ ok: true, confirmationMessage: poll.confirmationMessage });
}
