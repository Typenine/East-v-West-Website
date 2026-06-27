export type ProjectionConfidence = 'low' | 'medium' | 'high';
export type ProjectionPhase = 'preseason' | 'in_season';

export type WeeklyProjectionBaseline = {
  mean: number;
  stddev: number;
  games: number;
  last3Avg: number;
  decayedMean: number;
};

export type ProjectedStatLine = Record<string, number>;

export type WeeklyProjectedPlayer = {
  id: string;
  name: string;
  position: string;
  nflTeam: string | null;
  opponent: string | null;
  projection: number;
  baseline: number;
  matchupFactor: number;
  availabilityWeight: number;
  isBye: boolean;
  confidence: ProjectionConfidence;
  rangeLow: number;
  rangeHigh: number;
  expectedRole: string;
  workload: string;
  assumption: string | null;
  startProbability: number;
  activeProbability: number;
  statLine: ProjectedStatLine;
};

export type WeeklyLineupEntry = {
  slot: string;
  slotIndex: number;
  player: WeeklyProjectedPlayer | null;
  changed: boolean;
};

export type ProjectionValidationSummary = {
  sampleSize: number;
  meanAbsoluteError: number | null;
  bias: number | null;
  byPosition: Record<string, { sampleSize: number; meanAbsoluteError: number; bias: number }>;
  optimalBeatSubmitted: boolean | null;
  submittedLineupActual: number | null;
  optimalLineupActual: number | null;
  startSitAccuracy: number | null;
  confidenceRangeCoverage: number | null;
};

export type LineupOptimizerResponse = {
  generatedAt: string;
  teamName: string;
  season: string;
  week: number;
  available: boolean;
  reason: string | null;
  currentTotal: number | null;
  optimalTotal: number | null;
  potentialGain: number | null;
  currentLineup: WeeklyLineupEntry[];
  optimalLineup: WeeklyLineupEntry[];
  projectedPlayers: WeeklyProjectedPlayer[];
  modelVersion: string;
  projectionPhase: ProjectionPhase;
  confidence: ProjectionConfidence;
  confidenceNote: string;
};
