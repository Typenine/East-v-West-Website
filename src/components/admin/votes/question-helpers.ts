import type { QuestionType } from '@/lib/votes/types';

export type QuestionOptionDef = { text: string };

export type QuestionDef = {
  questionType: string;
  text: string;
  description: string;
  required: boolean;
  shuffleOptions: boolean;
  ratingMin: string;
  ratingMax: string;
  ratingMinLabel: string;
  ratingMaxLabel: string;
  maxLength: string;
  options: QuestionOptionDef[];
  gridRows: QuestionOptionDef[];
  conditionQuestionIndex: string;
  conditionOptionIndex: string;
  conditionValue: string;
  allowOther: boolean;
};

export function newQuestion(type = 'yes_no'): QuestionDef {
  const base: QuestionDef = {
    questionType: type,
    text: '',
    description: '',
    required: true,
    shuffleOptions: false,
    ratingMin: '1',
    ratingMax: '10',
    ratingMinLabel: '',
    ratingMaxLabel: '',
    maxLength: '',
    options: [{ text: '' }, { text: '' }],
    gridRows: [{ text: '' }, { text: '' }],
    conditionQuestionIndex: '',
    conditionOptionIndex: '',
    conditionValue: '',
    allowOther: false,
  };
  return applyQuestionTypeDefaults(base, type);
}

export function questionNeedsGrid(type: string): boolean {
  return type === 'multiple_choice_grid' || type === 'checkbox_grid';
}

export function applyQuestionTypeDefaults(q: QuestionDef, type: string): QuestionDef {
  if (type === 'yes_no') {
    return { ...q, questionType: type, options: [{ text: 'Yes' }, { text: 'No' }], allowOther: false };
  }
  if (type === 'multiple_choice' || type === 'checkboxes' || type === 'dropdown') {
    return {
      ...q,
      questionType: type,
      options: q.options.length >= 2 ? q.options : [{ text: '' }, { text: '' }],
    };
  }
  if (questionNeedsGrid(type)) {
    return {
      ...q,
      questionType: type,
      options: q.options.length >= 2 ? q.options : [{ text: '' }, { text: '' }],
      gridRows: q.gridRows.length >= 2 ? q.gridRows : [{ text: '' }, { text: '' }],
      allowOther: false,
    };
  }
  if (type === 'number') {
    return { ...q, questionType: type, ratingMin: '', ratingMax: '', allowOther: false };
  }
  if (type === 'file_upload') {
    return { ...q, questionType: type, maxLength: q.maxLength || '10', allowOther: false };
  }
  if (type === 'section_break') {
    return { ...q, questionType: type, required: false, allowOther: false };
  }
  return { ...q, questionType: type, allowOther: false };
}

export function questionNeedsOptions(type: string): boolean {
  return type === 'multiple_choice' || type === 'checkboxes' || type === 'dropdown' || questionNeedsGrid(type);
}

export function questionNeedsChoicesLocked(type: string): boolean {
  return type === 'yes_no';
}

export function duplicateQuestion(q: QuestionDef): QuestionDef {
  return {
    ...q,
    text: q.text ? `${q.text} (copy)` : q.text,
    options: q.options.map((o) => ({ ...o })),
    gridRows: q.gridRows.map((r) => ({ ...r })),
    conditionQuestionIndex: '',
    conditionOptionIndex: '',
    conditionValue: '',
  };
}

export const CHOICE_QUESTION_TYPES: QuestionType[] = [
  'multiple_choice',
  'checkboxes',
  'dropdown',
  'yes_no',
];

export const TEXT_QUESTION_TYPES: QuestionType[] = [
  'short_answer',
  'paragraph',
  'date',
  'time',
  'number',
  'email',
];

export function isChoiceQuestionType(type: string): boolean {
  return CHOICE_QUESTION_TYPES.includes(type as QuestionType);
}

export function isTextQuestionType(type: string): boolean {
  return TEXT_QUESTION_TYPES.includes(type as QuestionType);
}

export function isSingleChoiceType(type: string): boolean {
  return type === 'multiple_choice' || type === 'dropdown' || type === 'yes_no';
}

export const OTHER_OPTION_LABEL = 'Other';

export function isOtherOptionText(text: string): boolean {
  return text.trim().toLowerCase() === 'other' || text.trim().toLowerCase().startsWith('other:');
}
