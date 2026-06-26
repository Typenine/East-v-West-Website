import type { HomepagePhase } from '@/lib/utils/countdown-resolver';
import type { SleeperPlayer } from '@/lib/utils/sleeper-api';

export type TeamDashboardSeverity = 'critical' | 'warning' | 'info' | 'good';

export type TeamDashboardAlert = {
  severity: TeamDashboardSeverity;
  title: string;
  detail: string;
};

export type TeamDashboardPlayer = {
  id: string;
  name: string;
  position: string;
  nflTeam: string | null;
  age: number | null;
  yearsExp: number | null;
  injuryStatus: string | null;
  isStarter: boolean;
  onTaxi: boolean;
  onIR: boolean;
};

export type TeamDashboardDraftPick = {
  year: number;
  round: number;
  label: string;
  originalTeam: string | null;
  exact: boolean;
};

export type TeamDashboardPositionAges = {
  QB: number | null;
  RB: number | null;
  WR: number | null;
  TE: number | null;
};

export type TeamDashboardAgePosition = keyof TeamDashboardPositionAges;

export type TeamDashboardComparisonRow = {
  team: string;
  rank: number | null;
  value: number | null;
  count?: number;
};

export type TeamDashboardLeagueComparisons = {
  averageAge: TeamDashboardComparisonRow[];
  positionAges: Record<TeamDashboardAgePosition, TeamDashboardComparisonRow[]>;
  draftCapital: TeamDashboardComparisonRow[];
};

export type TeamDashboardRanks = {
  record: number | null;
  points: number | null;
  maxPoints: number | null;
  youth: number | null;
  draftCapital: number | null;
  leagueSize: number;
};

export type TeamDashboardResponse = {
  generatedAt: string;
  teamName: string;
  rosterId: number;
  phase: HomepagePhase;
  status: TeamDashboardSeverity;
  roster: {
    active: number;
    activeLimit: number;
    openSpots: number;
    cutsRequired: number;
    taxi: number;
    taxiLimit: number;
    ir: number;
    irLimit: number;
    irIneligible: number;
    emptyLineupSlots: number;
    positionCounts: Record<string, number>;
    players: TeamDashboardPlayer[];
    rookies: TeamDashboardPlayer[];
    corePlayers: TeamDashboardPlayer[];
  };
  standings: {
    season: number;
    wins: number;
    losses: number;
    pointsFor: number;
    maxPoints: number | null;
    seed: number | null;
    averageAge: number | null;
    positionAges: TeamDashboardPositionAges;
    leagueAverages: {
      pointsFor: number | null;
      maxPoints: number | null;
      averageAge: number | null;
      positionAges: TeamDashboardPositionAges;
    };
    ranks: TeamDashboardRanks;
    leagueComparisons: TeamDashboardLeagueComparisons;
  };
  matchup: null | {
    week: number;
    opponent: string;
    opponentRosterId: number;
    opponentWins: number;
    opponentLosses: number;
    teamScore: number | null;
    opponentScore: number | null;
    recentForm: Array<'W' | 'L' | 'T'>;
    postseasonPath: string | null;
  };
  draft: {
    picks: TeamDashboardDraftPick[];
    exactCurrentYear: boolean;
    rank: number | null;
  };
  alerts: TeamDashboardAlert[];
  recentTransactions: Array<{
    id: string;
    type: string;
    summary: string;
    timestamp: string | null;
  }>;
};

export type TeamDashboardLoosePlayer = SleeperPlayer & {
  age?: number | string | null;
  years_exp?: number | string | null;
  injury_status?: string | null;
  status?: string | null;
  bye_week?: number | string | null;
};

export type TeamDashboardLooseRoster = {
  roster_id: number;
  players?: string[];
  starters?: string[];
  taxi?: string[];
  reserve?: string[];
  settings?: Record<string, unknown>;
};

export type TeamDashboardLooseTeam = {
  rosterId: number;
  teamName: string;
  wins?: number;
  losses?: number;
  fpts?: number;
};

export type TeamDashboardLooseTransaction = {
  transaction_id?: string;
  type?: string;
  status?: string;
  status_updated?: number;
  created?: number;
  roster_ids?: number[];
  adds?: Record<string, number> | null;
  drops?: Record<string, number> | null;
  draft_picks?: Array<{
    season?: string;
    round?: number;
    roster_id?: number;
    owner_id?: number;
    previous_owner_id?: number;
  }>;
};
