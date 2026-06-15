import type { FormAnswer, PollQuestion } from '@/lib/votes/types';
import { isChoiceQuestionType, isOtherOptionText, isSingleChoiceType } from '@/lib/votes/question-types';
import { parseMcGridAnswer, parseCbGridAnswer } from '@/lib/votes/grid-answers';
import { parseFileAnswer } from '@/lib/votes/file-answer';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function hasAnswer(a: FormAnswer | undefined): boolean {
  if (!a) return false;
  if (a.textAnswer && a.textAnswer.trim()) return true;
  if (a.ratingValue != null) return true;
  if (a.optionIds && a.optionIds.length > 0) return true;
  return false;
}

export function isConditionMet(q: PollQuestion, answersMap: Record<string, FormAnswer>): boolean {
  if (!q.conditionQuestionId) return true;
  const prior = answersMap[q.conditionQuestionId];
  if (!prior) return false;
  if (q.conditionOptionId) return prior.optionIds?.includes(q.conditionOptionId) ?? false;
  if (q.conditionValue) {
    return prior.textAnswer === q.conditionValue || String(prior.ratingValue) === q.conditionValue;
  }
  return hasAnswer(prior);
}

export function validateQuestionAnswer(q: PollQuestion, a: FormAnswer | undefined): string | null {
  if (q.questionType === 'section_break') return null;

  if (q.questionType === 'file_upload') {
    const file = parseFileAnswer(a?.textAnswer);
    if (q.required && !file) return `Question "${q.text}" is required.`;
    if (file && !file.key.startsWith('polls/')) return `Invalid file upload for "${q.text}".`;
    return null;
  }

  if (q.questionType === 'multiple_choice_grid' || q.questionType === 'checkbox_grid') {
    const isMc = q.questionType === 'multiple_choice_grid';
    const grid = isMc ? parseMcGridAnswer(a?.textAnswer) : parseCbGridAnswer(a?.textAnswer);
    if (q.required) {
      for (const row of q.gridRows) {
        const picked = grid[row.id];
        if (isMc && !picked) return `Complete all rows for "${q.text}".`;
        if (!isMc && (!picked || !picked.length)) return `Complete all rows for "${q.text}".`;
      }
    }
    const colIds = new Set(q.options.map((o) => o.id));
    for (const val of Object.values(grid)) {
      if (isMc) {
        if (typeof val === 'string' && !colIds.has(val)) return `Invalid selection for "${q.text}".`;
      } else if (Array.isArray(val)) {
        for (const id of val) {
          if (!colIds.has(id)) return `Invalid selection for "${q.text}".`;
        }
      }
    }
    return null;
  }

  if (q.required && !hasAnswer(a)) return `Question "${q.text}" is required.`;

  if (!a) return null;

  if (isSingleChoiceType(q.questionType) && a.optionIds?.length && a.optionIds.length > 1) {
    return `"${q.text}" allows only one selection.`;
  }

  if (q.questionType === 'rating' && a.ratingValue != null) {
    const min = q.ratingMin ?? 1;
    const max = q.ratingMax ?? 10;
    if (a.ratingValue < min || a.ratingValue > max) {
      return `Rating for "${q.text}" must be between ${min} and ${max}.`;
    }
  }

  if ((q.questionType === 'short_answer' || q.questionType === 'paragraph') && q.maxLength && a.textAnswer) {
    if (a.textAnswer.length > q.maxLength) {
      return `Answer for "${q.text}" exceeds maximum length of ${q.maxLength} characters.`;
    }
  }

  if (q.questionType === 'email' && a.textAnswer?.trim()) {
    if (!EMAIL_RE.test(a.textAnswer.trim())) {
      return `"${q.text}" must be a valid email address.`;
    }
  }

  if (q.questionType === 'number' && a.textAnswer?.trim()) {
    const n = Number(a.textAnswer);
    if (Number.isNaN(n)) return `"${q.text}" must be a number.`;
    if (q.ratingMin != null && n < q.ratingMin) {
      return `"${q.text}" must be at least ${q.ratingMin}.`;
    }
    if (q.ratingMax != null && n > q.ratingMax) {
      return `"${q.text}" must be at most ${q.ratingMax}.`;
    }
  }

  if (q.questionType === 'date' && a.textAnswer?.trim()) {
    if (Number.isNaN(Date.parse(a.textAnswer))) {
      return `"${q.text}" must be a valid date.`;
    }
  }

  if (q.questionType === 'time' && a.textAnswer?.trim()) {
    if (!/^\d{2}:\d{2}$/.test(a.textAnswer.trim())) {
      return `"${q.text}" must be a valid time (HH:MM).`;
    }
  }

  if (isChoiceQuestionType(q.questionType) && a.optionIds?.length) {
    for (const optId of a.optionIds) {
      if (!q.options.some((o) => o.id === optId)) {
        return `Invalid selection for "${q.text}".`;
      }
    }
    const otherSelected = a.optionIds.some((id) => {
      const opt = q.options.find((o) => o.id === id);
      return opt && isOtherOptionText(opt.text);
    });
    if (otherSelected && !a.textAnswer?.trim()) {
      return `Please specify your "Other" answer for "${q.text}".`;
    }
  }

  return null;
}
