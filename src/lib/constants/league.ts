// League constants for East v. West fantasy football league

// Sleeper League IDs
export const LEAGUE_IDS = {
  CURRENT: '1312872384503484416', // 2026
  PREVIOUS: {
    '2025': '1205237529570193408',
    '2024': '1116504942988107776',
    '2023': '991521604930772992',
  }
};

// Canon Team Names - use these everywhere, never display Sleeper usernames or real names
export const TEAM_NAMES = [
  'Belltown Raptors',
  'Double Trouble',
  'Elemental Heroes',
  'Mt. Lebanon Cake Eaters',
  'Belleview Badgers',
  'BeerNeverBrokeMyHeart',
  'Detroit Dawgs',
  'bop pop',
  'Minshew\'s Maniacs',
  'Red Pandas',
  'The Lone Ginger',
  'Bimg Bamg Boomg'
];

// Current year for copyright and other displays
export const CURRENT_YEAR = new Date().getFullYear();

// Important dates
export const IMPORTANT_DATES = {
  NFL_WEEK_1_START: new Date('2025-09-04T20:20:00-04:00'), // NFL Week 1 kickoff
  // Trade deadline is end of the final game of Week 12 (approx end of MNF)
  // Week 12 Monday in 2025 is 2025-11-24; using ~11:45 PM ET to avoid overstating remaining time
  TRADE_DEADLINE: new Date('2025-11-24T23:45:00-05:00'),
  // Playoffs start at Week 15 kickoff (TNF)
  PLAYOFFS_START: new Date('2025-12-11T20:20:00-05:00'),
  NEW_LEAGUE_YEAR: new Date('2026-02-08T18:30:00-05:00'),
  NEXT_DRAFT: new Date('2026-07-18T13:00:00-04:00')        // Next draft date
};

// Champions by year
export const CHAMPIONS = {
  '2026': { champion: 'TBD', runnerUp: 'TBD', thirdPlace: 'TBD' },
  '2025': { champion: 'TBD', runnerUp: 'TBD', thirdPlace: 'TBD' },
  '2024': { champion: 'Belltown Raptors', runnerUp: 'TBD', thirdPlace: 'TBD' },
  '2023': { champion: 'Double Trouble', runnerUp: 'TBD', thirdPlace: 'TBD' }
};
