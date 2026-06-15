import type { Poll, PollOption, PollRound } from '@/lib/votes/types';
import {
  applyQuestionTypeDefaults,
  duplicateQuestion,
  newQuestion,
  questionNeedsChoicesLocked,
  questionNeedsGrid,
  questionNeedsOptions,
  type QuestionDef,
  type QuestionOptionDef,
} from '@/components/admin/votes/question-helpers';

export type { QuestionDef, QuestionOptionDef };
export {
  applyQuestionTypeDefaults,
  duplicateQuestion,
  newQuestion,
  questionNeedsChoicesLocked,
  questionNeedsGrid,
  questionNeedsOptions,
};

export type Suggestion = {
  id: string;
  title?: string;
  content: string;
  endorsers?: string[];
  voteTag?: string;
};

export type RoundDef = {
  voteType: string;
  survivorCount: string;
  thresholdType: string;
  thresholdValue: string;
  shuffleOptions: boolean;
};

export type AdminPollEntry = {
  poll: Poll;
  rounds: Array<PollRound & { options: PollOption[]; voteCount: number; totalEligible: number }>;
  roundCount: number;
  responseCount: number;
};

export type BuilderState = {
  title: string;
  description: string;
  eligibilityType: string;
  deadline: string;
  anonymous: boolean;
  resultVisibility: string;
  linkedSuggestionIds: string[];
  confirmationMessage: string;
  responseLimit: string;
  questions: QuestionDef[];
  /** Optional formal multi-round ballot (IRV, brackets, etc.) */
  useFormalRounds: boolean;
  rounds: RoundDef[];
  round1Options: string[];
};

export function defaultRound(voteType = 'select_one'): RoundDef {
  return {
    voteType,
    survivorCount: '',
    thresholdType: voteType === 'yes_no' ? 'majority' : 'plurality',
    thresholdValue: '',
    shuffleOptions: false,
  };
}

export function initialBuilderState(): BuilderState {
  return {
    title: '',
    description: '',
    eligibilityType: 'team',
    deadline: '',
    anonymous: false,
    resultVisibility: 'admin_publish',
    linkedSuggestionIds: [],
    confirmationMessage: '',
    responseLimit: '',
    questions: [newQuestion('yes_no')],
    useFormalRounds: false,
    rounds: [defaultRound('select_one')],
    round1Options: ['', '', ''],
  };
}
