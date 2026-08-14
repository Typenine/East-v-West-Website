/**
 * Shared types for the canonical East v. West player profile system.
 *
 * These types deliberately separate two distinct statistical systems:
 *  - NFL fantasy production (`PlayerNFLSeasonStat`): a player's real-world NFL production
 *    scored under East v. West league rules, independent of who owned the player.
 *  - East v. West franchise-attributed production (`PlayerWeeklyHistoryEntry` and everything
 *    built from it): only the points actually scored while a specific EVW franchise owned
 *    the player, derived from weekly Sleeper matchup `players_points`.
 *
 * Do not conflate the two — see PlayerProfileService for how each is computed.
 */

export interface PlayerIdentity {
  playerId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  position: string | null;
  nflTeam: string | null;
  jerseyNumber: number | null;
  status: string | null;
  age: number | null;
  birthDate: string | null;
  yearsExp: number | null;
  college: string | null;
  /** Sleeper CDN headshot URL. Not guaranteed to resolve for every player. */
  headshotUrl: string | null;
}

export type RosterStatus = 'active' | 'taxi' | 'ir' | null;

export interface PlayerCurrentStatus {
  isRostered: boolean;
  franchiseName: string | null;
  rosterId: number | null;
  ownerId: string | null;
  rosterStatus: RosterStatus;
  /** Season this status reflects (usually the current season). */
  season: string;
}

/** NFL-season fantasy production under East v. West scoring — ownership-independent. */
export interface PlayerNFLSeasonStat {
  season: string;
  totalPoints: number;
  gamesPlayed: number | null;
  ppg: number | null;
}

/** One week of East v. West franchise-attributed production. */
export interface PlayerWeeklyHistoryEntry {
  season: string;
  week: number;
  franchiseName: string | null;
  rosterId: number | null;
  points: number;
  rostered: boolean;
  started: boolean;
}

/** One franchise's stint within a single season (a midseason trade produces two of these). */
export interface PlayerFranchiseSeasonStint {
  season: string;
  franchiseName: string;
  totalPoints: number;
  rosteredWeeks: number;
  starts: number;
  weeklyPoints: PlayerWeeklyHistoryEntry[];
}

export interface PlayerSeasonHistoryEntry {
  season: string;
  /** Franchise names in the order they first appear this season. */
  franchises: string[];
  stints: PlayerFranchiseSeasonStint[];
  totalPoints: number;
  rosteredWeeks: number;
  starts: number;
}

/**
 * Consolidated career record for one canonical franchise. A player who leaves and later
 * returns to the same franchise has exactly one of these, with `seasonBreakdown` covering
 * every stint underneath it.
 */
export interface PlayerFranchiseCareer {
  franchiseName: string;
  seasons: string[];
  firstSeason: string;
  lastSeason: string;
  totalPoints: number;
  rosteredWeeks: number;
  starts: number;
  seasonBreakdown: PlayerFranchiseSeasonStint[];
  // Hooks for future Hall of Fame / achievement work — left undefined until reliably computable.
  playoffPoints?: number;
  playoffStarts?: number;
  championships?: number;
  championshipAppearances?: number;
}

export interface PlayerEVWCareer {
  seasonsRepresented: string[];
  totalPoints: number;
  rosteredWeeks: number;
  starts: number;
  franchiseCount: number;
  franchises: PlayerFranchiseCareer[];
  // Hooks for future Hall of Fame / achievement work.
  playoffPoints?: number;
  playoffStarts?: number;
  championships?: number;
  championshipAppearances?: number;
}

export interface PlayerDraftHistoryEntry {
  year: string;
  franchiseName: string | null;
  round: number;
  /** Pick number within the round (1-based). */
  pick: number;
  /** Overall pick number in the draft. */
  overall: number;
}

export type PlayerTransactionType =
  | 'drafted'
  | 'traded'
  | 'added'
  | 'dropped'
  | 'waiver'
  | 'free_agent'
  | 'reacquired';

export interface PlayerTransactionEntry {
  id: string;
  type: PlayerTransactionType;
  season: string;
  week: number | null;
  /** ISO timestamp, if known. */
  date: string | null;
  fromFranchise: string | null;
  toFranchise: string | null;
  details?: string;
}

export interface PlayerProfile {
  identity: PlayerIdentity;
  currentStatus: PlayerCurrentStatus;
  /** NFL fantasy production by season, independent of East v. West ownership. */
  nflSeasons: PlayerNFLSeasonStat[];
  /** East v. West career totals + franchise breakdown. */
  evwCareer: PlayerEVWCareer;
  /** East v. West production by season (may include multiple franchises per season). */
  seasonHistory: PlayerSeasonHistoryEntry[];
  /** Full weekly East v. West attribution, for detailed views. */
  weeklyHistory: PlayerWeeklyHistoryEntry[];
  draftHistory: PlayerDraftHistoryEntry[];
  transactions: PlayerTransactionEntry[];
  dataCoverage: {
    seasonsAvailable: string[];
    /**
     * Whether transaction history is believed complete for the covered seasons. Kept
     * explicit so missing historical data is never silently mistaken for "no transactions".
     */
    transactionsComplete: boolean;
    notes?: string[];
  };
}
