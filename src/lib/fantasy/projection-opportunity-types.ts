import type { WeeklyProjectedPlayer } from '@/lib/fantasy/lineup-types';
import type { PlayerGameSample } from '@/lib/fantasy/projection-model';
import type { SleeperPlayer } from '@/lib/utils/sleeper-api';
import type { ProjectionOverrideRecord } from '@/lib/fantasy/projection-overrides';

export type PlayerProjectionCandidate = {
  id: string;
  player: SleeperPlayer | undefined;
  games: PlayerGameSample[];
  base: WeeklyProjectedPlayer;
  override?: ProjectionOverrideRecord;
  projectionSeason?: number;
};

export type TeamOpportunityPlan = {
  team: string;
  passAttempts: number;
  rushAttempts: number;
  targetPool: number;
  passingEfficiencyFactor: number;
  rushingEfficiencyFactor: number;
  passingTouchdownFactor: number;
  rushingTouchdownFactor: number;
  quarterbackStability: number;
  uncertaintyMultiplier: number;
  source: 'current-season' | 'blended' | 'preseason-prior' | 'league-prior' | 'manual';
};

export type UsageProfile = {
  sampleGames: number;
  recentTargets: number;
  recentCarries: number;
  recentPassAttempts: number;
  latestTeam: string | null;
  changedTeams: boolean;
  rookie: boolean;
  historyTrust: number;
};
