import { type NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { getPollById, getRoundsForPoll, getOptionsForRound, getAllVotesWithSelections } from '@/server/db/votes-queries';
import { getQuestionsForPoll, getAllResponses } from '@/server/db/poll-form-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  try { return isAdminCookieValue(req.cookies.get('evw_admin')?.value); } catch { return false; }
}

function csvCell(v: string | null | undefined): string {
  if (v == null) return '""';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const poll = await getPollById(id);
  if (!poll) return Response.json({ error: 'Not found.' }, { status: 404 });

  const rounds = await getRoundsForPoll(poll.id);
  const questions = (await getQuestionsForPoll(poll.id)).filter((q) => q.questionType !== 'section_break');

  // Collect all ballot data per round
  type VoterBallotMap = Map<string, string>; // roundId → ballot cell text
  const voterMap = new Map<string, { display: string; ballotByRound: VoterBallotMap; formAnswers: Map<string, string> }>();

  for (const round of rounds) {
    const options = await getOptionsForRound(round.id);
    const optionTextById = new Map(options.map((o) => [o.id, o.text]));
    const allVotes = await getAllVotesWithSelections(round.id);

    for (const v of allVotes) {
      if (!voterMap.has(v.voterId)) {
        voterMap.set(v.voterId, { display: v.voterDisplay ?? v.voterId, ballotByRound: new Map(), formAnswers: new Map() });
      }
      const entry = voterMap.get(v.voterId)!;

      let ballotCell = '';
      switch (round.voteType) {
        case 'borda':
        case 'irv': {
          const ranked = [...v.selections]
            .filter((s) => s.rank != null)
            .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
          ballotCell = ranked.map((s) => `${optionTextById.get(s.optionId) ?? s.optionId} (${s.rank})`).join(', ');
          break;
        }
        case 'select_one':
        case 'eliminate': {
          const sel = v.selections.find((s) => s.selected);
          ballotCell = sel ? (optionTextById.get(sel.optionId) ?? '') : '';
          break;
        }
        case 'select_multi': {
          ballotCell = v.selections.filter((s) => s.selected).map((s) => optionTextById.get(s.optionId) ?? '').join(', ');
          break;
        }
        case 'yes_no': {
          const sel = v.selections.find((s) => s.selected);
          ballotCell = sel ? (optionTextById.get(sel.optionId) ?? '') : '';
          break;
        }
      }
      entry.ballotByRound.set(round.id, ballotCell);
    }
  }

  // Collect form responses
  const allResponses = await getAllResponses(poll.id);
  for (const resp of allResponses) {
    if (!voterMap.has(resp.voterId)) {
      voterMap.set(resp.voterId, { display: resp.voterDisplay ?? resp.voterId, ballotByRound: new Map(), formAnswers: new Map() });
    }
    const entry = voterMap.get(resp.voterId)!;

    for (const answer of resp.answers) {
      const q = questions.find((q) => q.id === answer.questionId);
      if (!q) continue;

      let cell = '';
      if (q.questionType === 'short_answer' || q.questionType === 'paragraph' || q.questionType === 'date' || q.questionType === 'time' || q.questionType === 'number' || q.questionType === 'email') {
        cell = answer.textAnswer ?? '';
      } else if (q.questionType === 'rating') {
        cell = answer.ratingValue != null ? String(answer.ratingValue) : '';
      } else if (q.questionType === 'multiple_choice' || q.questionType === 'yes_no' || q.questionType === 'dropdown') {
        const optId = answer.optionIds?.[0];
        const label = optId ? (q.options.find((o) => o.id === optId)?.text ?? '') : '';
        cell = answer.textAnswer ? `${label} — ${answer.textAnswer}` : label;
      } else if (q.questionType === 'checkboxes') {
        const labels = (answer.optionIds ?? []).map((oid) => q.options.find((o) => o.id === oid)?.text ?? oid).join(', ');
        cell = answer.textAnswer ? `${labels} — ${answer.textAnswer}` : labels;
      } else if (q.questionType === 'multiple_choice_grid' || q.questionType === 'checkbox_grid') {
        const raw = answer.textAnswer ?? '';
        cell = raw;
      } else if (q.questionType === 'file_upload') {
        try {
          const f = JSON.parse(answer.textAnswer ?? '{}') as { filename?: string };
          cell = f.filename ?? '';
        } catch {
          cell = '';
        }
      }
      entry.formAnswers.set(answer.questionId, cell);
    }
  }

  // Build CSV
  const roundHeaders = rounds.map((r) => `Round ${r.roundNumber} (${r.voteType})`);
  const questionHeaders = questions.map((q) => q.text.slice(0, 50));
  const header = ['voter_id', 'voter_display', 'submitted_at', ...roundHeaders, ...questionHeaders].map(csvCell).join(',');

  const dataRows = [...voterMap.entries()].map(([voterId, entry]) => {
    const ballotCells = rounds.map((r) => csvCell(entry.ballotByRound.get(r.id) ?? ''));
    const formCells = questions.map((q) => csvCell(entry.formAnswers.get(q.id) ?? ''));
    return [csvCell(voterId), csvCell(entry.display), csvCell(''), ...ballotCells, ...formCells].join(',');
  });

  const csv = [header, ...dataRows].join('\r\n');
  const safeTitle = poll.title.replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 40).trim().replace(/ /g, '-') || 'poll';

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${safeTitle}-results.csv"`,
    },
  });
}
