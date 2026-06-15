export type VoteType = 'borda' | 'irv' | 'select_one' | 'select_multi' | 'eliminate' | 'yes_no';
export type ThresholdType = 'plurality' | 'majority' | 'supermajority' | 'admin_defined';
export type EligibilityType = 'team' | 'person';
export type PollStatus = 'draft' | 'open' | 'closed';
export type RoundStatus = 'pending' | 'open' | 'closed';
export type ResultVisibility = 'immediate' | 'all_voted' | 'admin_publish';

export interface Poll {
  id: string;
  title: string;
  description: string | null;
  status: PollStatus;
  eligibilityType: EligibilityType;
  linkedSuggestionIds: string[] | null;
  anonymous: boolean;
  resultVisibility: ResultVisibility;
  deadline: string | null;
  discordNotifiedOpen: boolean;
  discordNotifiedReminder: boolean;
  discordNotifiedClosed: boolean;
  confirmationMessage: string | null;
  responseLimit: number | null;
  createdAt: string;
  closedAt: string | null;
}

export interface PollRound {
  id: string;
  pollId: string;
  roundNumber: number;
  status: RoundStatus;
  voteType: VoteType;
  survivorCount: number | null;
  thresholdType: ThresholdType;
  thresholdValue: number | null;
  shuffleOptions: boolean;
  resultsPublishedAt: string | null;
  openedAt: string | null;
  closedAt: string | null;
}

export interface PollOption {
  id: string;
  roundId: string;
  text: string;
  linkedSuggestionId: string | null;
  carriedFromOptionId: string | null;
  displayOrder: number;
}

export interface PollVote {
  id: string;
  roundId: string;
  voterId: string;
  voterDisplay: string | null;
  createdAt: string;
}

export interface PollVoteSelection {
  id: string;
  voteId: string;
  optionId: string;
  rank: number | null;
  selected: boolean | null;
}

// ── Form question types ────────────────────────────────────────────────────

export type QuestionType =
  | 'short_answer'
  | 'paragraph'
  | 'rating'
  | 'multiple_choice'
  | 'checkboxes'
  | 'dropdown'
  | 'yes_no'
  | 'date'
  | 'time'
  | 'number'
  | 'email'
  | 'multiple_choice_grid'
  | 'checkbox_grid'
  | 'file_upload'
  | 'section_break';

export interface PollQuestionGridRow {
  id: string;
  questionId: string;
  text: string;
  displayOrder: number;
}

export interface PollQuestionOption {
  id: string;
  questionId: string;
  text: string;
  displayOrder: number;
}

export interface PollQuestion {
  id: string;
  pollId: string;
  questionType: QuestionType;
  text: string;
  description: string | null;
  required: boolean;
  shuffleOptions: boolean;
  displayOrder: number;
  ratingMin: number | null;
  ratingMax: number | null;
  ratingMinLabel: string | null;
  ratingMaxLabel: string | null;
  maxLength: number | null;
  conditionQuestionId: string | null;
  conditionOptionId: string | null;
  conditionValue: string | null;
  options: PollQuestionOption[];
  gridRows: PollQuestionGridRow[];
}

export interface FormAnswer {
  questionId: string;
  textAnswer: string | null;
  ratingValue: number | null;
  optionIds: string[] | null;
}

export interface PollResponse {
  id: string;
  pollId: string;
  voterId: string;
  voterDisplay: string | null;
  submittedAt: string;
  answers: FormAnswer[];
}

// Aggregated results per question for display
export interface RatingQuestionResult {
  questionId: string;
  type: 'rating';
  average: number;
  distribution: { value: number; count: number }[];
  total: number;
}

export interface TextQuestionResult {
  questionId: string;
  type: 'text';
  answers: { voterDisplay: string | null; text: string }[];
}

export interface ChoiceQuestionResult {
  questionId: string;
  type: 'choice';
  counts: { optionId: string; text: string; count: number }[];
  total: number;
}

export interface GridQuestionResult {
  questionId: string;
  type: 'grid';
  gridType: 'multiple_choice_grid' | 'checkbox_grid';
  rows: { rowId: string; text: string; columnCounts: { optionId: string; text: string; count: number }[] }[];
  total: number;
}

export interface FileQuestionResult {
  questionId: string;
  type: 'file';
  files: { voterDisplay: string | null; filename: string; key: string; contentType: string }[];
}

export type FormQuestionResult =
  | RatingQuestionResult
  | TextQuestionResult
  | ChoiceQuestionResult
  | GridQuestionResult
  | FileQuestionResult;

// ── Ballot input from the API ──────────────────────────────────────────────

export type BallotSelection = { optionId: string; rank?: number; selected?: boolean };
export type BallotMap = Record<string, BallotSelection[]>; // voterId → selections

// ── Computed result shapes ─────────────────────────────────────────────────

export interface BordaOptionScore {
  optionId: string;
  text: string;
  points: number;
  isSurvivor: boolean;
}

export interface BordaResult {
  type: 'borda';
  scores: BordaOptionScore[];
  survivors: string[]; // optionIds of options that advance
}

export interface IRVElimRound {
  roundIndex: number;
  firstChoiceCounts: Record<string, number>; // optionId → count
  eliminated: string[]; // optionIds eliminated this round
}

export interface IRVResult {
  type: 'irv';
  rounds: IRVElimRound[];
  winners: string[]; // optionIds
  threshold: number;
}

export interface PluralityOptionCount {
  optionId: string;
  text: string;
  count: number;
  isWinner: boolean;
}

export interface PluralityResult {
  type: 'plurality';
  counts: PluralityOptionCount[];
  winners: string[]; // optionIds
}

export interface YesNoResult {
  type: 'yes_no';
  yes: number;
  no: number;
  passed: boolean;
  threshold: number;
}

export type RoundResult = BordaResult | IRVResult | PluralityResult | YesNoResult;

// ── API response shapes ────────────────────────────────────────────────────

export interface RoundWithDetails extends PollRound {
  options: PollOption[];
  voteCount: number;
  totalEligible: number;
  resultsVisible: boolean;
  result?: RoundResult | null;
}

export interface PollListItem {
  poll: Poll;
  currentRound: RoundWithDetails | null;
  roundCount: number;
  responseCount: number;
}

export interface PollDetail extends PollListItem {
  rounds: RoundWithDetails[];
  myBallot: BallotSelection[] | null;
  questions: PollQuestion[];
  myFormResponse: FormAnswer[] | null;
  responseCount: number;
  formResults: FormQuestionResult[] | null;
}

// ── Admin-only shapes (include voter identity) ─────────────────────────────

export interface AdminVoteRecord {
  vote: PollVote;
  selections: PollVoteSelection[];
}

export interface AdminRoundResults extends PollRound {
  options: PollOption[];
  votes: AdminVoteRecord[];
  result?: RoundResult | null;
}

export const TOTAL_ELIGIBLE: Record<EligibilityType, number> = {
  team: 12,
  person: 14,
};
