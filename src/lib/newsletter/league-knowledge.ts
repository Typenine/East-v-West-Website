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
    scoring: '0.5 PPR',
    superflex: true,
    teamCount: 12,
    divisions: false,
  },

  structure: {
    regularSeasonWeeks: 14,
    playoffTeams: 7,       // Seed 1 gets a first-round bye; 5 teams in Toilet Bowl
    toiletBowlTeams: 5,
    playoffStartWeek: 15,
    semifinalWeek: 16,
    championshipWeek: 17,
    tradeDeadlineWeek: 12,
  },

  description: `East v. West is a 12-team SuperFlex dynasty league (0.5 PPR) founded in 2023. Three different champions in three years — Double Trouble won in 2023, Belltown Raptors in 2024, BeerNeverBrokeMyHeart in 2025. Double Trouble has appeared in the championship every single year. Top 7 teams make playoffs; the top seed gets a first-round bye. Bottom 5 teams compete in the Toilet Bowl — the last-place finisher ships the league trophy to the new champion.`,
};

// ============ Champions & History ============

export const CHAMPIONS = {
  2023: {
    champion: 'Double Trouble',
    runnerUp: 'Elemental Heroes',
    thirdPlace: 'Detroit Dawgs',
    note: 'Inaugural season. Double Trouble won it all.',
  },
  2024: {
    champion: 'Belltown Raptors',
    runnerUp: 'Double Trouble',
    thirdPlace: 'Belleview Badgers',
    note: 'Belltown Raptors win their first championship.',
  },
  2025: {
    champion: 'BeerNeverBrokeMyHeart',
    runnerUp: 'Double Trouble',
    thirdPlace: 'Mt. Lebanon Cake Eaters',
    note: 'Third different champion in three years. Double Trouble is a perennial runner-up.',
  },
} as const;

export const CHAMPIONSHIP_APPEARANCES = {
  'Double Trouble': { appearances: 3, wins: 1, years: [2023, 2024, 2025] },
  'Belltown Raptors': { appearances: 2, wins: 1, years: [2023, 2024] },
  'BeerNeverBrokeMyHeart': { appearances: 1, wins: 1, years: [2025] },
  'Elemental Heroes': { appearances: 1, wins: 0, years: [2023] },
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
    championshipAppearances: 3,
    yearsInLeague: 3,
    notableFacts: ['Inaugural champion (2023)', 'Championship appearances every year (2023, 2024, 2025)', 'Runner-up in 2024 and 2025 — best team that never won it twice'],
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
    championshipAppearances: 0,
    yearsInLeague: 3,
    notableFacts: [],
  },
  'Elemental Heroes': {
    championships: 0,
    championshipAppearances: 1,
    yearsInLeague: 3,
    notableFacts: ['2023 runner-up (inaugural championship)'],
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
  { year: 2023, team1: 'Double Trouble', team2: 'Elemental Heroes', winner: 'Double Trouble', context: 'Inaugural championship' },
  { year: 2024, team1: 'Belltown Raptors', team2: 'Double Trouble', winner: 'Belltown Raptors', context: 'Belltown gets revenge' },
  { year: 2025, team1: 'BeerNeverBrokeMyHeart', team2: 'Double Trouble', winner: 'BeerNeverBrokeMyHeart', context: 'Third different champion; Double Trouble runner-up for the second time' },
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
    starters: 'QB, 2RB, 2WR, TE, FLEX (RB/WR/TE), SF (QB/RB/WR/TE), K, D/ST',
    bench: 7,
    ir: 4,
    taxi: 4,  // max 1 QB on taxi; rookies and 2nd-year players only
    mainRosterLimit: 17,  // starters + bench; IR and taxi are separate
  },
  scoring: {
    passingTD: 4,
    rushingTD: 6,
    receivingTD: 6,
    ppr: 0.5,
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
    maxPlayers: 4,
    maxQBs: 1,
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
    `- Founded: ${LEAGUE_IDENTITY.founded} | 12 teams, no divisions`,
    `- Format: ${LEAGUE_IDENTITY.format.type}, ${LEAGUE_IDENTITY.format.scoring}, SuperFlex`,
    `- Scoring: passing TD=4pts, rush/rec TD=6pts, 0.5pts per reception, 0.04pts/passing yard, 0.1pts/rush+rec yard`,
    `- Lineup: QB, 2RB, 2WR, TE, FLEX (RB/WR/TE), SuperFlex (QB/RB/WR/TE), K, D/ST`,
    `- Roster: 17 main (starters+bench), 4 IR, 4 Taxi (rookies/2nd-year only, max 1 QB on taxi)`,
    `- Regular Season: Weeks 1–14 | Playoffs: Top ${LEAGUE_IDENTITY.structure.playoffTeams} teams, Weeks ${LEAGUE_IDENTITY.structure.playoffStartWeek}-${LEAGUE_IDENTITY.structure.championshipWeek}`,
    `- Playoff format: 7 teams; Seed #1 gets first-round bye. Bottom 5 teams play Toilet Bowl — last-place team ships the trophy.`,
    `- Trade deadline: End of Week ${LEAGUE_IDENTITY.structure.tradeDeadlineWeek} | Waivers: FAAB ($100 budget, Wednesday processing)`,
    `- Rivalry Week: 2 designated weeks where teams play their assigned rival`,
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
  lines.push(`DYNASTY POSITIONAL SCARCITY (critical for trade grades and mock draft analysis):`);
  lines.push(`- QB: EXTREMELY scarce in SuperFlex. You start 2 QBs every week. Elite QBs (top-6) are the most valuable dynasty assets. Every team needs at least 2 startable QBs. Weak QB rooms are a massive liability.`);
  lines.push(`- RB: High scarcity. You start 2 RBs + FLEX + SF (can run a 3rd RB). Backfield depth and youth are premium. Aging RBs depreciate fast.`);
  lines.push(`- WR: Deepest position. You start 2 WRs + FLEX + SF. True WR1s are premium but WR3/WR4 are largely replaceable. Volume and target share matter most.`);
  lines.push(`- TE: LOW scarcity — you only START 1 TE per week (TE slot only; TE can also play FLEX but rarely worth it). Having two elite TEs is a luxury, not a need. One elite TE is sufficient; beyond that, BPA wins over TE depth. A team with Bowers has no TE need.`);
  lines.push(`- K/DEF: Near zero dynasty value — do not factor into draft grades or trade value.`);
  lines.push(``);
  lines.push(`NOTE: You assess rivalries and team tendencies yourself based on H2H data and results. Do not assume rivalries exist - identify them from the data.`);

  return lines.join('\n');
}
