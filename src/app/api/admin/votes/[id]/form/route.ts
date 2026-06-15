import { type NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { getPollById, updatePollFormMetadata } from '@/server/db/votes-queries';
import {
  getQuestionsForPoll,
  getResponseCount,
  replacePollQuestions,
  type QuestionInput,
} from '@/server/db/poll-form-queries';
import { pollToBuilderState } from '@/lib/votes/poll-builder';

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

  const questions = await getQuestionsForPoll(id);
  const responseCount = await getResponseCount(id);

  return Response.json({
    poll,
    builderState: pollToBuilderState(poll, questions),
    responseCount,
    canEditQuestions: poll.status === 'draft' || (poll.status === 'open' && responseCount === 0),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const poll = await getPollById(id);
  if (!poll) return Response.json({ error: 'Not found.' }, { status: 404 });

  const responseCount = await getResponseCount(id);
  const canEditQuestions = poll.status === 'draft' || (poll.status === 'open' && responseCount === 0);

  const body = await req.json().catch(() => ({}));
  const {
    title,
    description,
    deadline,
    anonymous,
    resultVisibility,
    confirmationMessage,
    responseLimit,
    linkedSuggestionIds,
    questions,
  } = body as {
    title?: string;
    description?: string;
    deadline?: string;
    anonymous?: boolean;
    resultVisibility?: string;
    confirmationMessage?: string;
    responseLimit?: number;
    linkedSuggestionIds?: string[];
    questions?: QuestionInput[];
  };

  if (!title?.trim()) return Response.json({ error: 'Title is required.' }, { status: 400 });

  const metaOk = await updatePollFormMetadata(id, {
    title: title.trim(),
    description: description ?? null,
    deadline: deadline ?? null,
    anonymous,
    resultVisibility,
    confirmationMessage: confirmationMessage ?? null,
    responseLimit: responseLimit ?? null,
    linkedSuggestionIds: linkedSuggestionIds ?? null,
  });
  if (!metaOk) return Response.json({ error: 'Failed to update poll.' }, { status: 500 });

  if (questions?.length) {
    if (!canEditQuestions) {
      return Response.json({ error: 'Cannot change questions after responses exist. Edit title/settings only.' }, { status: 409 });
    }
    const created = await replacePollQuestions(id, questions);
    if (!created.length) return Response.json({ error: 'Failed to save questions.' }, { status: 500 });
    return Response.json({ ok: true, questions: created });
  }

  return Response.json({ ok: true });
}
