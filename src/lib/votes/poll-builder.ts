import type { Poll, PollQuestion } from '@/lib/votes/types';
import { OTHER_OPTION_LABEL } from '@/lib/votes/question-types';
import {
  questionNeedsGrid,
  questionNeedsOptions,
  type QuestionDef,
} from '@/components/admin/votes/question-helpers';
import { defaultRound, type BuilderState } from '@/components/admin/votes/types';

function optionsForSubmit(q: QuestionDef) {
  const needsOpts = questionNeedsOptions(q.questionType) || q.questionType === 'yes_no';
  if (!needsOpts || questionNeedsGrid(q.questionType)) return undefined;
  let opts = q.options.filter((o) => o.text.trim());
  if (q.allowOther && questionNeedsOptions(q.questionType) && !questionNeedsGrid(q.questionType)) {
    const hasOther = opts.some((o) => o.text.trim().toLowerCase() === 'other');
    if (!hasOther) opts = [...opts, { text: OTHER_OPTION_LABEL }];
  }
  return opts.map((o, oi) => ({ text: o.text.trim(), displayOrder: oi }));
}

function columnsForGrid(q: QuestionDef) {
  if (!questionNeedsGrid(q.questionType)) return undefined;
  return q.options.filter((o) => o.text.trim()).map((o, oi) => ({ text: o.text.trim(), displayOrder: oi }));
}

function rowsForGrid(q: QuestionDef) {
  if (!questionNeedsGrid(q.questionType)) return undefined;
  return q.gridRows.filter((r) => r.text.trim()).map((r, ri) => ({ text: r.text.trim(), displayOrder: ri }));
}

function maxLengthForQuestion(q: QuestionDef): number | undefined {
  if (q.questionType === 'file_upload') {
    return (parseInt(q.maxLength, 10) || 10) * 1024 * 1024;
  }
  if (q.maxLength && (q.questionType === 'short_answer' || q.questionType === 'paragraph')) {
    return parseInt(q.maxLength, 10);
  }
  return undefined;
}

export function buildSubmitBody(state: BuilderState, includeRounds = true) {
  const validQuestions = state.questions.filter((q) => q.text.trim() || q.questionType === 'section_break');
  const indexMap = new Map<number, number>();
  let vi = 0;
  for (let i = 0; i < state.questions.length; i++) {
    const q = state.questions[i];
    if (q.text.trim() || q.questionType === 'section_break') {
      indexMap.set(i, vi);
      vi++;
    }
  }
  const hasQuestions = validQuestions.length > 0;
  const hasRounds = includeRounds && state.useFormalRounds && state.rounds.length > 0;

  return {
    title: state.title.trim(),
    description: state.description.trim() || undefined,
    eligibilityType: state.eligibilityType,
    deadline: state.deadline || undefined,
    anonymous: state.anonymous,
    resultVisibility: state.resultVisibility,
    linkedSuggestionIds: state.linkedSuggestionIds.length ? state.linkedSuggestionIds : undefined,
    confirmationMessage: state.confirmationMessage.trim() || undefined,
    responseLimit: state.responseLimit ? parseInt(state.responseLimit, 10) : undefined,
    rounds: hasRounds
      ? state.rounds.map((r, i) => ({
          voteType: r.voteType,
          survivorCount: i < state.rounds.length - 1 && r.survivorCount ? parseInt(r.survivorCount, 10) : undefined,
          thresholdType: r.thresholdType,
          thresholdValue: r.thresholdType === 'admin_defined' && r.thresholdValue ? parseInt(r.thresholdValue, 10) : undefined,
          shuffleOptions: r.shuffleOptions,
        }))
      : [],
    round1Options:
      hasRounds && state.rounds[0]?.voteType !== 'yes_no'
        ? state.round1Options.filter((o) => o.trim()).map((o) => ({ text: o.trim() }))
        : undefined,
    questions: hasQuestions
      ? validQuestions.map((q, i) => ({
          questionType: q.questionType,
          text: q.text.trim() || `Section ${i + 1}`,
          description: q.description.trim() || undefined,
          required: q.required,
          shuffleOptions: q.shuffleOptions,
          displayOrder: i,
          ratingMin: q.questionType === 'rating' ? parseInt(q.ratingMin, 10) || 1 : q.questionType === 'number' && q.ratingMin ? parseInt(q.ratingMin, 10) : undefined,
          ratingMax: q.questionType === 'rating' ? parseInt(q.ratingMax, 10) || 10 : q.questionType === 'number' && q.ratingMax ? parseInt(q.ratingMax, 10) : undefined,
          ratingMinLabel: q.ratingMinLabel.trim() || undefined,
          ratingMaxLabel: q.ratingMaxLabel.trim() || undefined,
          maxLength: maxLengthForQuestion(q),
          conditionQuestionIndex:
            q.conditionQuestionIndex !== ''
              ? indexMap.get(parseInt(q.conditionQuestionIndex, 10))
              : undefined,
          conditionOptionIndex: q.conditionOptionIndex !== '' ? parseInt(q.conditionOptionIndex, 10) : undefined,
          conditionValue: q.conditionValue.trim() || undefined,
          options: questionNeedsGrid(q.questionType) ? columnsForGrid(q) : optionsForSubmit(q),
          gridRows: rowsForGrid(q),
        }))
      : undefined,
  };
}

export function pollToBuilderState(poll: Poll, questions: PollQuestion[]): BuilderState {
  const idToIndex = new Map(questions.map((q, i) => [q.id, i]));

  return {
    title: poll.title,
    description: poll.description ?? '',
    eligibilityType: poll.eligibilityType,
    deadline: poll.deadline ? poll.deadline.slice(0, 16) : '',
    anonymous: poll.anonymous,
    resultVisibility: poll.resultVisibility,
    linkedSuggestionIds: poll.linkedSuggestionIds ?? [],
    confirmationMessage: poll.confirmationMessage ?? '',
    responseLimit: poll.responseLimit != null ? String(poll.responseLimit) : '',
    questions: questions.map((q) => {
      let conditionQuestionIndex = '';
      let conditionOptionIndex = '';
      if (q.conditionQuestionId) {
        const pi = idToIndex.get(q.conditionQuestionId);
        if (pi != null) conditionQuestionIndex = String(pi);
        if (q.conditionOptionId) {
          const parent = questions[pi ?? -1];
          const oi = parent?.options.findIndex((o) => o.id === q.conditionOptionId);
          if (oi != null && oi >= 0) conditionOptionIndex = String(oi);
        }
      }
      return {
        questionType: q.questionType,
        text: q.text,
        description: q.description ?? '',
        required: q.required,
        shuffleOptions: q.shuffleOptions,
        ratingMin: q.ratingMin != null ? String(q.ratingMin) : '1',
        ratingMax: q.ratingMax != null ? String(q.ratingMax) : '10',
        ratingMinLabel: q.ratingMinLabel ?? '',
        ratingMaxLabel: q.ratingMaxLabel ?? '',
        maxLength:
          q.questionType === 'file_upload'
            ? String(q.maxLength ? Math.round(q.maxLength / 1024 / 1024) : 10)
            : q.maxLength != null
              ? String(q.maxLength)
              : '',
        options: q.options.map((o) => ({ text: o.text })),
        gridRows: q.gridRows.map((r) => ({ text: r.text })),
        conditionQuestionIndex,
        conditionOptionIndex,
        conditionValue: q.conditionValue ?? '',
        allowOther: q.options.some((o) => o.text.trim().toLowerCase() === 'other'),
      };
    }),
    useFormalRounds: false,
    rounds: [defaultRound('select_one')],
    round1Options: ['', '', ''],
  };
}

export function validateBuilderState(state: BuilderState): string | null {
  if (!state.title.trim()) return 'Add a poll title.';
  const validQuestions = state.questions.filter((q) => q.text.trim() || q.questionType === 'section_break');
  const hasQuestions = validQuestions.length > 0;
  const hasRounds = state.useFormalRounds && state.rounds.length > 0;
  if (!hasQuestions && !hasRounds) return 'Add at least one question.';
  for (const q of validQuestions) {
    if (q.questionType === 'section_break') continue;
    if (!q.text.trim()) return 'Every question needs text (section headers can be empty).';
    if (questionNeedsOptions(q.questionType) && !questionNeedsGrid(q.questionType)) {
      const opts = q.options.filter((o) => o.text.trim());
      if (opts.length < 2) return `"${q.text || 'A question'}" needs at least two choices.`;
    }
    if (questionNeedsGrid(q.questionType)) {
      const cols = q.options.filter((o) => o.text.trim());
      const rows = q.gridRows.filter((r) => r.text.trim());
      if (cols.length < 2) return `"${q.text || 'Grid'}" needs at least two columns.`;
      if (rows.length < 2) return `"${q.text || 'Grid'}" needs at least two rows.`;
    }
  }
  if (hasRounds && state.rounds[0]?.voteType !== 'yes_no') {
    const opts = state.round1Options.filter((o) => o.trim());
    if (opts.length < 2) return 'The formal ballot needs at least two round-1 options.';
  }
  return null;
}
