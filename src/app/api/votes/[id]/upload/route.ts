import { type NextRequest } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { getPollById } from '@/server/db/votes-queries';
import { presignPut } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ident = await requireTeamUser();
  if (!ident) return Response.json({ error: 'You must be logged in.' }, { status: 401 });

  const poll = await getPollById(id);
  if (!poll) return Response.json({ error: 'Poll not found.' }, { status: 404 });
  if (poll.status !== 'open') return Response.json({ error: 'Poll is not accepting uploads.' }, { status: 409 });

  const body = await req.json().catch(() => ({}));
  const contentType = typeof body.contentType === 'string' ? body.contentType : 'application/octet-stream';
  const ext = typeof body.ext === 'string' ? body.ext.replace(/[^a-z0-9]/gi, '').slice(0, 8) : 'bin';
  const questionId = typeof body.questionId === 'string' ? body.questionId : 'file';

  if (!ALLOWED_TYPES.has(contentType)) {
    return Response.json({ error: 'File type not allowed.' }, { status: 400 });
  }

  const voterId = poll.eligibilityType === 'team' ? ident.team : ident.userId;
  const safeVoter = voterId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const rand = Math.random().toString(36).slice(2, 10);
  const key = `polls/${id}/${safeVoter}/${questionId}/${Date.now()}-${rand}.${ext || 'bin'}`;

  try {
    const putUrl = await presignPut({ key, contentType, expiresSec: 300 });
    return Response.json({ key, putUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
