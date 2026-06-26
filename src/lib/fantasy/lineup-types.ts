export type WeeklyProjectionBaseline = {
  mean: number;
  stddev: number;
  games: number;
  last3Avg: number;
  decayedMean: number;
};

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
};

export type WeeklyLineupEntry = {
  slot: string;
  slotIndex: number;
  player: WeeklyProjectedPlayer | null;
  changed: boolean;
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
};
