export interface HallOfFameCareerSummary {
  seasons: string[];
  firstSeason: string | null;
  lastSeason: string | null;
  totalPoints: number;
  rosteredWeeks: number;
  starts: number;
}

export interface HallOfFameEntryPublic {
  id: string;
  franchiseId: string;
  franchiseName: string;
  playerId: string;
  playerName: string;
  position: string | null;
  nflTeam: string | null;
  headshotUrl: string | null;
  inductionYear: number;
  bio: string;
  createdAt: string;
  updatedAt: string;
  career: HallOfFameCareerSummary;
}

export interface HallOfFameFranchise {
  franchiseId: string;
  franchiseName: string;
}

export interface HallOfFameIndexResponse {
  franchises: HallOfFameFranchise[];
  entries: HallOfFameEntryPublic[];
}

export interface HallOfFameCandidate extends HallOfFameCareerSummary {
  playerId: string;
  playerName: string;
  position: string | null;
  nflTeam: string | null;
  headshotUrl: string | null;
  currentlyOnFranchise: boolean;
}

export interface PlayerHallOfFameHonor {
  id: string;
  franchiseId: string;
  franchiseName: string;
  inductionYear: number;
  bio: string;
}
