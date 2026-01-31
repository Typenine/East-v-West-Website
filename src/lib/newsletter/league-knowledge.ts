/**
 * Static League Knowledge
 * 
 * This file contains permanent league information that the bots should "just know"
 * without needing to fetch it each time. This is Tier 1 of the memory system.
 * 
 * Update this file when:
 * - A new champion is crowned
 * - League rules change
 * - New records are set
 * - Team identities/rivalries evolve
 */

// ============ League Identity ============

export const LEAGUE_IDENTITY = {
  name: 'East v. West',
  shortName: 'EvW',
  founded: 2023,
  
  format: {
    type: 'Dynasty',
    scoring: 'PPR',
    superflex: true,
    teamCount: 12,
    divisions: false, // No divisions - all 12 teams compete in one pool
  },
  
  structure: {
    regularSeasonWeeks: 14,
    playoffTeams: 6,
    playoffStartWeek: 15,
    semifinalWeek: 16,
    championshipWeek: 17,
    tradeDeadlineWeek: 12,
  },
  
  description: `East v. West is a 12-team dynasty superflex league founded in 2023. 
Known for aggressive trading and competitive balance, the league has seen three different champions in its first three years.
Top 6 teams make playoffs (50% playoff rate). Dynasty format means rookie picks and long-term roster building are crucial.`,
};

// ============ Champions & History ============

export const CHAMPIONS = {
  2023: {
    champion: 'Double Trouble',
    runnerUp: 'Belltown Raptors',
    thirdPlace: 'bop pop',
    note: 'Inaugural season. Double Trouble dominated with a loaded roster from the auction draft.',
  },
  2024: {
    champion: 'Belltown Raptors',
    runnerUp: 'Double Trouble',
    thirdPlace: 'BeerNeverBrokeMyHeart',
    note: 'Revenge season for Belltown after losing the inaugural championship. Championship rematch.',
  },
  2025: {
    champion: 'BeerNeverBrokeMyHeart',
    runnerUp: 'bop pop',
    thirdPlace: 'Double Trouble',
    note: 'Third different champion in three years. Dynasty parity at its finest.',
  },
} as const;

export const CHAMPIONSHIP_APPEARANCES = {
  'Double Trouble': { appearances: 2, wins: 1, years: [2023, 2024] },
  'Belltown Raptors': { appearances: 2, wins: 1, years: [2023, 2024] },
  'BeerNeverBrokeMyHeart': { appearances: 1, wins: 1, years: [2025] },
  'bop pop': { appearances: 1, wins: 0, years: [2025] },
} as const;

// ============ Team Facts (Objective Only) ============
// These are FACTS the bots know. Each bot forms their OWN opinions about teams.
// Do NOT put subjective assessments here - let the bots evaluate teams themselves.
// All 12 teams in the league:

export const TEAM_FACTS: Record<string, {
  championships: number;
  championshipAppearances: number;
  yearsInLeague: number;
  notableFacts: string[];
}> = {
  'Double Trouble': {
    championships: 1,
    championshipAppearances: 2,
    yearsInLeague: 3,
    notableFacts: ['Inaugural champion (2023)', 'Back-to-back championship appearances (2023-2024)'],
  },
  'Belltown Raptors': {
    championships: 1,
    championshipAppearances: 2,
    yearsInLeague: 3,
    notableFacts: ['2024 champion', 'Lost to Double Trouble in 2023 championship'],
  },
  'BeerNeverBrokeMyHeart': {
    championships: 1,
    championshipAppearances: 1,
    yearsInLeague: 3,
    notableFacts: ['2025 champion', 'Third different champion in three years'],
  },
  'bop pop': {
    championships: 0,
    championshipAppearances: 1,
    yearsInLeague: 3,
    notableFacts: ['2025 runner-up', 'Consistent playoff contender'],
  },
  'Elemental Heroes': {
    championships: 0,
    championshipAppearances: 0,
    yearsInLeague: 3,
    notableFacts: [],
  },
  'Mt. Lebanon Cake Eaters': {
    championships: 0,
    championshipAppearances: 0,
    yearsInLeague: 3,
    notableFacts: [],
  },
  'Belleview Badgers': {
    championships: 0,
    championshipAppearances: 0,
    yearsInLeague: 3,
    notableFacts: [],
  },
  'Detroit Dawgs': {
    championships: 0,
    championshipAppearances: 0,
    yearsInLeague: 3,
    notableFacts: [],
  },
  "Minshew's Maniacs": {
    championships: 0,
    championshipAppearances: 0,
    yearsInLeague: 3,
    notableFacts: [],
  },
  'Red Pandas': {
    championships: 0,
    championshipAppearances: 0,
    yearsInLeague: 3,
    notableFacts: [],
  },
  'The Lone Ginger': {
    championships: 0,
    championshipAppearances: 0,
    yearsInLeague: 3,
    notableFacts: [],
  },
  'Bimg Bamg Boomg': {
    championships: 0,
    championshipAppearances: 0,
    yearsInLeague: 3,
    notableFacts: [],
  },
};

// ============ Notable Matchup History (Facts Only) ============
// Rivalries are NOT hardcoded - bots assess them from H2H data.
// This section only contains FACTUAL championship/playoff meeting history.

export const CHAMPIONSHIP_MEETINGS: Array<{
  year: number;
  team1: string;
  team2: string;
  winner: string;
  context: string;
}> = [
  { year: 2023, team1: 'Double Trouble', team2: 'Belltown Raptors', winner: 'Double Trouble', context: 'Inaugural championship' },
  { year: 2024, team1: 'Double Trouble', team2: 'Belltown Raptors', winner: 'Belltown Raptors', context: 'Championship rematch' },
  { year: 2025, team1: 'BeerNeverBrokeMyHeart', team2: 'bop pop', winner: 'BeerNeverBrokeMyHeart', context: 'Third different champion' },
];

// ============ League Records ============

export const LEAGUE_RECORDS = {
  singleWeekHigh: {
    record: 'Highest single-week score',
    holder: 'Belltown Raptors',
    value: 212.54,
    week: 14,
    season: 2024,
  },
  singleWeekLow: {
    record: 'Lowest winning score',
    holder: 'Double Trouble',
    value: 89.12,
    week: 3,
    season: 2023,
  },
  longestWinStreak: {
    record: 'Longest win streak',
    holder: 'Belltown Raptors',
    value: 8,
    season: 2024,
  },
  biggestBlowout: {
    record: 'Largest margin of victory',
    holder: 'Belltown Raptors',
    value: 98.42,
    week: 14,
    season: 2024,
  },
  closestGame: {
    record: 'Smallest margin of victory',
    holder: 'bop pop',
    value: 0.24,
    week: 7,
    season: 2024,
  },
};

// ============ League Rules & Quirks ============

export const LEAGUE_RULES = {
  roster: {
    starters: 'QB, 2RB, 3WR, TE, 2FLEX, SF',
    bench: 15,
    ir: 3,
    taxi: 5,
  },
  scoring: {
    passingTD: 4,
    rushingTD: 6,
    receivingTD: 6,
    ppr: 1.0,
    passingYards: '0.04/yard',
    rushingYards: '0.1/yard',
    receivingYards: '0.1/yard',
  },
  waivers: {
    type: 'FAAB',
    budget: 100,
    processDay: 'Wednesday',
  },
  trades: {
    deadline: 'End of Week 12',
    reviewPeriod: '24 hours',
    vetoSystem: 'Commissioner review only',
  },
  taxi: {
    maxYears: 2,
    eligibility: 'Rookies and second-year players only',
  },
};

// ============ Helper Functions ============

export function getTeamFacts(teamName: string) {
  return TEAM_FACTS[teamName] || null;
}

export function getChampionshipHistory(teamName: string) {
  return CHAMPIONSHIP_APPEARANCES[teamName as keyof typeof CHAMPIONSHIP_APPEARANCES] || null;
}

export function getChampionshipMeetings(team1: string, team2: string) {
  return CHAMPIONSHIP_MEETINGS.filter(m => 
    (m.team1 === team1 && m.team2 === team2) || (m.team1 === team2 && m.team2 === team1)
  );
}

export function isDefendingChampion(teamName: string, currentSeason: number): boolean {
  const lastSeason = currentSeason - 1;
  const lastChamp = CHAMPIONS[lastSeason as keyof typeof CHAMPIONS];
  return lastChamp?.champion === teamName;
}

export function getChampion(season: number) {
  return CHAMPIONS[season as keyof typeof CHAMPIONS] || null;
}

// ============ Context Builder for LLM ============

export function buildStaticLeagueContext(): string {
  const lines: string[] = [
    `LEAGUE KNOWLEDGE (${LEAGUE_IDENTITY.name}):`,
    ``,
    `LEAGUE INFO:`,
    `- Founded: ${LEAGUE_IDENTITY.founded}`,
    `- Format: ${LEAGUE_IDENTITY.format.teamCount}-team ${LEAGUE_IDENTITY.format.type} ${LEAGUE_IDENTITY.format.scoring}${LEAGUE_IDENTITY.format.superflex ? ' Superflex' : ''}`,
    `- NO divisions - all 10 teams compete in one pool`,
    `- Playoffs: Top ${LEAGUE_IDENTITY.structure.playoffTeams} teams, Weeks ${LEAGUE_IDENTITY.structure.playoffStartWeek}-${LEAGUE_IDENTITY.structure.championshipWeek}`,
    `- Trade deadline: End of Week ${LEAGUE_IDENTITY.structure.tradeDeadlineWeek}`,
    ``,
    `CHAMPIONS:`,
  ];

  for (const [year, data] of Object.entries(CHAMPIONS)) {
    lines.push(`- ${year}: ${data.champion} (beat ${data.runnerUp})`);
  }

  lines.push(``);
  lines.push(`CHAMPIONSHIP HISTORY:`);
  for (const meeting of CHAMPIONSHIP_MEETINGS) {
    lines.push(`- ${meeting.year}: ${meeting.winner} beat ${meeting.team1 === meeting.winner ? meeting.team2 : meeting.team1} (${meeting.context})`);
  }

  lines.push(``);
  lines.push(`NOTE: You assess rivalries and team tendencies yourself based on H2H data and results. Do not assume rivalries exist - identify them from the data.`);

  return lines.join('\n');
}
