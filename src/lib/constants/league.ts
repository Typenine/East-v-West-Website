// League constants for East v. West fantasy football league

// Sleeper League IDs
export const LEAGUE_IDS = {
  CURRENT: '1205237529570193408', // 2025
  PREVIOUS: {
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
  TRADE_DEADLINE: new Date('2025-11-15T23:59:59-05:00'),   // League trade deadline
  NEXT_DRAFT: new Date('2026-07-18T13:00:00-04:00')        // Next draft date
};

// Champions by year
export const CHAMPIONS = {
  '2025': { champion: 'TBD', runnerUp: 'TBD', thirdPlace: 'TBD' },
  '2024': { champion: 'Belltown Raptors', runnerUp: 'TBD', thirdPlace: 'TBD' },
  '2023': { champion: 'Double Trouble', runnerUp: 'TBD', thirdPlace: 'TBD' }
};
