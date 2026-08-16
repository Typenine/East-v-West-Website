export type StatsGameType = 'regular' | 'playoffs' | 'toilet' | 'postseason';

export interface StatsPlayerFranchiseSplit {
  teamName: string;
  points: number;
  rosteredWeeks: number;
  starts: number;
}

export interface StatsPlayerSeasonRow {
  season: string;
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  points: number;
  rosteredWeeks: number;
  starts: number;
  ppg: number;
  franchises: StatsPlayerFranchiseSplit[];
  bestGamePoints: number | null;
  bestGameWeek: number | null;
  bestGameFranchise: string | null;
}

export interface StatsPlayerCareerRow {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  seasons: string[];
  firstSeason: string;
  lastSeason: string;
  points: number;
  rosteredWeeks: number;
  starts: number;
  ppg: number;
  franchises: StatsPlayerFranchiseSplit[];
  bestSeason: string | null;
  bestSeasonPoints: number | null;
  bestGamePoints: number | null;
  bestGameSeason: string | null;
  bestGameWeek: number | null;
  bestGameFranchise: string | null;
}

export interface StatsSeasonTeamRow {
  season: string;
  teamName: string;
  ownerId: string;
  rosterId: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  avgScore: number;
}

export interface StatsFranchiseRow {
  teamName: string;
  seasons: string[];
  firstSeason: string;
  lastSeason: string;
  currentRosterId: number | null;
  regularWins: number;
  regularLosses: number;
  regularTies: number;
  regularWinPct: number;
  regularPointsFor: number;
  regularPointsAgainst: number;
  avgScore: number;
  playoffWins: number;
  playoffLosses: number;
  playoffTies: number;
  titles: number;
  championshipAppearances: number;
  bestSeason: string | null;
  bestSeasonWins: number | null;
  bestSeasonLosses: number | null;
  bestSeasonPointsFor: number | null;
}

export interface StatsGameRow {
  id: string;
  season: string;
  week: number;
  gameType: StatsGameType;
  teamA: string;
  teamB: string;
  rosterA: number;
  rosterB: number;
  scoreA: number;
  scoreB: number;
  winner: string | null;
  loser: string | null;
  margin: number;
  combined: number;
  tie: boolean;
}

export interface StatsPlayerGameRow {
  id: string;
  playerId: string;
  name: string;
  position: string;
  season: string;
  week: number;
  franchiseName: string;
  points: number;
  started: boolean;
}

export interface StatsRecordEntry {
  id: string;
  label: string;
  holder: string;
  value: number;
  valueDisplay: string;
  season?: string | null;
  week?: number | null;
  playerId?: string | null;
  teamName?: string | null;
  opponent?: string | null;
}

export interface StatsRecordBook {
  franchise: StatsRecordEntry[];
  games: StatsRecordEntry[];
  seasons: StatsRecordEntry[];
  playerCareer: StatsPlayerCareerRow[];
  playerSeason: StatsPlayerSeasonRow[];
  playerGame: StatsPlayerGameRow[];
}

export interface StatsChampionRow {
  champion: string;
  runnerUp: string;
  thirdPlace: string;
}

export interface LeagueStatsDataset {
  generatedAt: string;
  seasons: string[];
  latestSeasonWithGames: string | null;
  players: StatsPlayerCareerRow[];
  playerSeasons: StatsPlayerSeasonRow[];
  franchises: StatsFranchiseRow[];
  seasonTeams: StatsSeasonTeamRow[];
  games: StatsGameRow[];
  playerGames: StatsPlayerGameRow[];
  records: StatsRecordBook;
  champions: Record<string, StatsChampionRow>;
  coverageNotes: string[];
}
