export const WEEKLY_RECAP_VISIBLE_ORDER = [
  'Intro',
  'WeeklyTransactions',
  'MatchupRecaps',
  'PowerRankings',
  'LeaguePulse',
  'StockWatch',
  'ReceiptDesk',
  'Forecast',
  'FinalWord',
] as const;

export const WEEKLY_PLAYOFF_SPOTS = 7;
export const WEEKLY_FIRST_ROUND_BYES = 1;

export type WeeklyTransactionKind = 'trade' | 'waiver' | 'free_agent' | 'taxi' | 'ir' | 'other';

export interface WeeklyTransactionItem {
  id: string;
  timestamp: number;
  happenedAt: string;
  kind: WeeklyTransactionKind;
  headline: string;
  detail: string;
  teams: string[];
  players: string[];
  major: boolean;
  mason?: string;
  westy?: string;
}

export interface WeeklyTransactionsSection {
  cutoff: string;
  cutoffIssueId?: string;
  cutoffIssueTitle?: string | null;
  items: WeeklyTransactionItem[];
  slotSnapshot?: Record<string, { team: string; player: string; slot: 'active' | 'IR' | 'taxi' }>;
  note?: string;
}

export interface IndependentRankingItem {
  rank: number;
  team: string;
  record: string;
  pointsFor: number;
  previousRank?: number;
  movement: 'up' | 'down' | 'same' | 'new';
  movementAmount: number;
  blurb: string;
}

export interface IndependentPowerRankingsSection {
  rankings: Array<{
    rank: number;
    team: string;
    record: string;
    pointsFor: number;
    trend: 'up' | 'down' | 'steady';
    trendAmount?: number;
    bot1_blurb: string;
    bot2_blurb: string;
  }>;
  masonRankings: IndependentRankingItem[];
  westyRankings: IndependentRankingItem[];
  bot1_intro: string;
  bot2_intro: string;
  previousIssueId?: string;
  previousIssueTitle?: string | null;
}

export interface LeaguePulseRow {
  rank: number;
  team: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
}

export interface LeaguePulseSection {
  rows: LeaguePulseRow[];
  playoffSpots: 7;
  firstRoundByes: 1;
  showPlayoffRace: boolean;
  raceNote?: string;
}

export interface StockWatchItem {
  subject: string;
  category: 'player' | 'team' | 'position_group' | 'narrative';
  direction: 'up' | 'down';
  evidence: string;
  mason?: string;
  westy?: string;
}

export interface StockWatchSection {
  items: StockWatchItem[];
  note?: string;
}

export type ReceiptType = 'prediction_result' | 'take_check' | 'ranking_receipt' | 'factual_correction';

export interface ReceiptSource {
  speaker: 'Mason Reed' | 'Westy' | 'Mason Reed & Westy' | 'Editorial';
  season: number;
  week: number;
  issueId?: string;
  issueTitle?: string | null;
}

export interface ReceiptItem {
  id: string;
  receiptType: ReceiptType;
  source: ReceiptSource;
  originalTake: string;
  whatHappenedAfterward: string;
  team?: string;
  player?: string;
  clancy: string;
  masonResponse?: string;
  westyResponse?: string;
}

export interface ReceiptDeskSection {
  mode: 'receipt_desk';
  audited: true;
  receipts: ReceiptItem[];
  note?: string;
}
