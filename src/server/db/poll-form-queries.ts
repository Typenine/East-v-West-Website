import { getDb } from './client';
import { sql } from 'drizzle-orm';
import type {
  PollQuestion,
  PollQuestionOption,
  PollResponse,
  FormAnswer,
  QuestionType,
  FormQuestionResult,
} from '@/lib/votes/types';

// ── helpers ──────────────────────────────────────────────────────────────────

function toIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return String(v);
}

function rowToQuestionOption(r: Record<string, unknown>): PollQuestionOption {
  return {
    id: String(r.id),
    questionId: String(r.question_id),
    text: String(r.text),
    displayOrder: Number(r.display_order ?? 0),
  };
}

function rowToQuestion(r: Record<string, unknown>, options: PollQuestionOption[]): PollQuestion {
  return {
    id: String(r.id),
    pollId: String(r.poll_id),
    questionType: (r.question_type as QuestionType),
    text: String(r.text),
    description: r.description ? String(r.description) : null,
    required: Boolean(r.required),
    shuffleOptions: Boolean(r.shuffle_options),
    displayOrder: Number(r.display_order ?? 0),
    ratingMin: r.rating_min != null ? Number(r.rating_min) : 1,
    ratingMax: r.rating_max != null ? Number(r.rating_max) : 10,
    ratingMinLabel: r.rating_min_label ? String(r.rating_min_label) : null,
    ratingMaxLabel: r.rating_max_label ? String(r.rating_max_label) : null,
    maxLength: r.max_length != null ? Number(r.max_length) : null,
    conditionQuestionId: r.condition_question_id ? String(r.condition_question_id) : null,
    conditionOptionId: r.condition_option_id ? String(r.condition_option_id) : null,
    conditionValue: r.condition_value ? String(r.condition_value) : null,
    options,
  };
}

function rowToAnswer(r: Record<string, unknown>): FormAnswer {
  return {
    questionId: String(r.question_id),
    textAnswer: r.text_answer ? String(r.text_answer) : null,
    ratingValue: r.rating_value != null ? Number(r.rating_value) : null,
    optionIds: Array.isArray(r.option_ids) ? (r.option_ids as string[]) : null,
  };
}

function rowToResponse(r: Record<string, unknown>, answers: FormAnswer[]): PollResponse {
  return {
    id: String(r.id),
    pollId: String(r.poll_id),
    voterId: String(r.voter_id),
    voterDisplay: r.voter_display ? String(r.voter_display) : null,
    submittedAt: toIso(r.submitted_at) ?? new Date().toISOString(),
    answers,
  };
}

// ── Question reads ────────────────────────────────────────────────────────────

export async function getQuestionsForPoll(pollId: string): Promise<PollQuestion[]> {
  try {
    const db = getDb();
    const qRows = await db.execute(sql`
      SELECT * FROM poll_questions WHERE poll_id = ${pollId}::uuid ORDER BY display_order ASC
    `);
    const questions = qRows as unknown as Record<string, unknown>[];
    if (!questions.length) return [];

    // Eager-load all options for these questions in one query
    const ids = questions.map((q) => `'${String(q.id)}'`).join(',');
    const optRows = await db.execute(
      sql.raw(`SELECT * FROM poll_question_options WHERE question_id IN (${ids}) ORDER BY display_order ASC`),
    );
    const allOptions = (optRows as unknown as Record<string, unknown>[]).map(rowToQuestionOption);

    return questions.map((q) => {
      const opts = allOptions.filter((o) => o.questionId === String(q.id));
      return rowToQuestion(q, opts);
    });
  } catch {
    return [];
  }
}

// ── Question writes ───────────────────────────────────────────────────────────

export type QuestionInput = {
  questionType: string;
  text: string;
  description?: string | null;
  required?: boolean;
  shuffleOptions?: boolean;
  displayOrder: number;
  ratingMin?: number | null;
  ratingMax?: number | null;
  ratingMinLabel?: string | null;
  ratingMaxLabel?: string | null;
  maxLength?: number | null;
  conditionQuestionId?: string | null;
  conditionOptionId?: string | null;
  conditionValue?: string | null;
  options?: { text: string; displayOrder: number }[];
};

export async function createQuestions(pollId: string, questions: QuestionInput[]): Promise<PollQuestion[]> {
  if (!questions.length) return [];
  const results: PollQuestion[] = [];
  try {
    const db = getDb();
    for (const q of questions) {
      const qRows = await db.execute(sql`
        INSERT INTO poll_questions (
          poll_id, question_type, text, description, required, shuffle_options, display_order,
          rating_min, rating_max, rating_min_label, rating_max_label, max_length,
          condition_question_id, condition_option_id, condition_value
        ) VALUES (
          ${pollId}::uuid,
          ${q.questionType},
          ${q.text},
          ${q.description ?? null},
          ${q.required ?? true},
          ${q.shuffleOptions ?? false},
          ${q.displayOrder},
          ${q.ratingMin ?? 1},
          ${q.ratingMax ?? 10},
          ${q.ratingMinLabel ?? null},
          ${q.ratingMaxLabel ?? null},
          ${q.maxLength ?? null},
          ${(q.conditionQuestionId ?? null) as string | null}::uuid,
          ${(q.conditionOptionId ?? null) as string | null}::uuid,
          ${q.conditionValue ?? null}
        )
        RETURNING *
      `);
      const qRow = (qRows as unknown as Record<string, unknown>[])[0];
      if (!qRow) continue;

      const options: PollQuestionOption[] = [];
      if (q.options?.length) {
        for (const opt of q.options) {
          const oRows = await db.execute(sql`
            INSERT INTO poll_question_options (question_id, text, display_order)
            VALUES (${String(qRow.id)}::uuid, ${opt.text}, ${opt.displayOrder})
            RETURNING *
          `);
          const oRow = (oRows as unknown as Record<string, unknown>[])[0];
          if (oRow) options.push(rowToQuestionOption(oRow));
        }
      }
      results.push(rowToQuestion(qRow, options));
    }
  } catch {
    // partial results returned; caller handles
  }
  return results;
}

// ── Response reads ────────────────────────────────────────────────────────────

export async function getResponseCount(pollId: string): Promise<number> {
  try {
    const db = getDb();
    const rows = await db.execute(sql`SELECT COUNT(*) as cnt FROM poll_responses WHERE poll_id = ${pollId}::uuid`);
    return Number((rows as unknown as Record<string, unknown>[])[0]?.cnt ?? 0);
  } catch {
    return 0;
  }
}

export async function getResponseByVoter(pollId: string, voterId: string): Promise<PollResponse | null> {
  try {
    const db = getDb();
    const rRows = await db.execute(sql`
      SELECT * FROM poll_responses WHERE poll_id = ${pollId}::uuid AND voter_id = ${voterId} LIMIT 1
    `);
    const rRow = (rRows as unknown as Record<string, unknown>[])[0];
    if (!rRow) return null;

    const aRows = await db.execute(sql`
      SELECT * FROM poll_response_answers WHERE response_id = ${String(rRow.id)}::uuid
    `);
    const answers = (aRows as unknown as Record<string, unknown>[]).map(rowToAnswer);
    return rowToResponse(rRow, answers);
  } catch {
    return null;
  }
}

export async function getAllResponses(pollId: string): Promise<PollResponse[]> {
  try {
    const db = getDb();
    const rRows = await db.execute(sql`
      SELECT * FROM poll_responses WHERE poll_id = ${pollId}::uuid ORDER BY submitted_at ASC
    `);
    const responses = rRows as unknown as Record<string, unknown>[];
    if (!responses.length) return [];

    const ids = responses.map((r) => `'${String(r.id)}'`).join(',');
    const aRows = await db.execute(
      sql.raw(`SELECT * FROM poll_response_answers WHERE response_id IN (${ids})`),
    );
    const aRowsTyped = aRows as unknown as Record<string, unknown>[];
    return responses.map((r) => {
      const respId = String(r.id);
      const answers = aRowsTyped
        .filter((a) => String(a.response_id) === respId)
        .map(rowToAnswer);
      return rowToResponse(r, answers);
    });
  } catch {
    return [];
  }
}

// ── Response writes ───────────────────────────────────────────────────────────

export async function upsertResponse(
  pollId: string,
  voterId: string,
  voterDisplay: string,
  answers: FormAnswer[],
): Promise<boolean> {
  try {
    const db = getDb();
    await db.execute(sql`BEGIN`);
    try {
      // Delete existing response (cascade removes answers)
      await db.execute(sql`
        DELETE FROM poll_responses WHERE poll_id = ${pollId}::uuid AND voter_id = ${voterId}
      `);

      // Insert fresh response
      const rRows = await db.execute(sql`
        INSERT INTO poll_responses (poll_id, voter_id, voter_display)
        VALUES (${pollId}::uuid, ${voterId}, ${voterDisplay})
        RETURNING id
      `);
      const responseId = String((rRows as unknown as Record<string, unknown>[])[0]?.id ?? '');
      if (!responseId) throw new Error('no response id');

      // Insert answers
      for (const a of answers) {
        await db.execute(sql`
          INSERT INTO poll_response_answers (response_id, question_id, text_answer, rating_value, option_ids)
          VALUES (
            ${responseId}::uuid,
            ${a.questionId}::uuid,
            ${a.textAnswer ?? null},
            ${a.ratingValue ?? null},
            ${a.optionIds ? JSON.stringify(a.optionIds) : null}::text[]
          )
        `);
      }

      await db.execute(sql`COMMIT`);
      return true;
    } catch (inner) {
      await db.execute(sql`ROLLBACK`);
      throw inner;
    }
  } catch {
    return false;
  }
}

// ── Form results aggregation ──────────────────────────────────────────────────

export async function buildFormResults(
  questions: PollQuestion[],
  responses: PollResponse[],
  anonymous: boolean,
): Promise<FormQuestionResult[]> {
  const results: FormQuestionResult[] = [];

  for (const q of questions) {
    if (q.questionType === 'section_break') continue;

    const answers = responses.flatMap((r) => r.answers.filter((a) => a.questionId === q.id));

    if (q.questionType === 'rating') {
      const values = answers.map((a) => a.ratingValue).filter((v): v is number => v != null);
      const avg = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
      const dist: { value: number; count: number }[] = [];
      for (let v = q.ratingMin; v <= q.ratingMax; v++) {
        dist.push({ value: v, count: values.filter((x) => x === v).length });
      }
      results.push({ questionId: q.id, type: 'rating', average: Math.round(avg * 10) / 10, distribution: dist, total: values.length });
    } else if (q.questionType === 'short_answer' || q.questionType === 'paragraph') {
      const textAnswers: { voterDisplay: string | null; text: string }[] = [];
      for (const resp of responses) {
        const a = resp.answers.find((ra) => ra.questionId === q.id);
        if (a?.textAnswer) {
          textAnswers.push({ voterDisplay: anonymous ? null : resp.voterDisplay, text: a.textAnswer });
        }
      }
      results.push({ questionId: q.id, type: 'text', answers: textAnswers });
    } else if (q.questionType === 'multiple_choice' || q.questionType === 'checkboxes') {
      const counts = q.options.map((opt) => ({
        optionId: opt.id,
        text: opt.text,
        count: answers.filter((a) => a.optionIds?.includes(opt.id)).length,
      }));
      results.push({ questionId: q.id, type: 'choice', counts, total: answers.filter((a) => a.optionIds?.length).length });
    }
  }

  return results;
}
