export type RivalryCycleStatus = 'not_started' | 'open' | 'closed' | 'calculated' | 'published';

export type RivalryCycle = {
  id: string;
  status: RivalryCycleStatus;
  openedAt?: string | null;
  closedAt?: string | null;
  calculatedAt?: string | null;
  publishedAt?: string | null;
  createdAt: string;
};

export type RivalryScore = {
  targetTeamId: string;
  score: number;
};

export type RivalrySubmission = {
  cycleId: string;
  teamId: string;
  submittedAt: string;
  scores: RivalryScore[];
  reopenedAt?: string | null;
};

export type RivalryPair = {
  id?: string;
  cycleId: string;
  teamAId: string;
  teamBId: string;
  teamAScoreForB: number;
  teamBScoreForA: number;
  combinedScore: number;
  isBloodFeud: boolean;
  status: 'proposed' | 'active' | 'archived';
  lockedAt?: string | null;
};

export type CalculatedPair = {
  teamAId: string;
  teamBId: string;
  teamAScoreForB: number;
  teamBScoreForA: number;
  combinedScore: number;
  isBloodFeud: boolean;
};

export type PairingResult = {
  pairs: CalculatedPair[];
  errors: PairingError[];
};

export type PairingError = {
  type:
    | 'missing_submissions'
    | 'invalid_ballot'
    | 'wrong_team_count'
    | 'duplicate_scores'
    | 'out_of_range'
    | 'wrong_total'
    | 'self_score';
  teamId?: string;
  message: string;
};
