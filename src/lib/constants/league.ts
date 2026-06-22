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

export const CURRENT_SEASON = '2026';

// Accepts a string or number season. Coerces internally so callers can pass a
// numeric season (e.g. a DB integer column) without silently getting null — the
// comparison against CURRENT_SEASON (a string) is otherwise strict and would fail
// for the current season when given a number. See run-newsletter.mjs queue path.
export function getLeagueIdForSeason(season: string | number): string | null {
  const s = String(season);
  if (s === CURRENT_SEASON) return LEAGUE_IDS.CURRENT;
  const prev = LEAGUE_IDS.PREVIOUS[s as keyof typeof LEAGUE_IDS.PREVIOUS];
  return prev || null;
}

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

// Important dates - UPDATE THESE ANNUALLY
export const IMPORTANT_DATES = {
  NFL_WEEK_1_START: new Date('2026-09-10T20:20:00-04:00'), // NFL Week 1 kickoff (2026 season)
  // Trade deadline is end of the final game of Week 12 (approx end of MNF)
  TRADE_DEADLINE: new Date('2026-11-30T23:45:00-05:00'), // Week 12 Monday 2026
  // Playoffs start at Week 15 kickoff (TNF)
  PLAYOFFS_START: new Date('2026-12-17T20:20:00-05:00'), // Week 15 TNF 2026
  NEW_LEAGUE_YEAR: new Date('2027-02-07T18:30:00-05:00'), // After Super Bowl LXI
  NEXT_DRAFT: new Date('2026-07-18T13:00:00-04:00'),       // Next draft date
  // FA bidding reopens first Monday after all NFL preseason Week 1 games conclude (rulebook §4.5(b))
  FA_BIDDING_START: new Date('2026-08-17T00:00:00-05:00'), // First Monday after preseason Week 1 2026
  // The following league-year values are used by the countdown resolver to roll forward correctly
  NEXT_LEAGUE_YEAR_DRAFT: new Date('2027-07-18T13:00:00-04:00'), // Placeholder; update when 2027 draft is set
};

// Champions by year
export const CHAMPIONS = {
  '2026': { champion: 'TBD',                    runnerUp: 'TBD',              thirdPlace: 'TBD' },
  '2025': { champion: 'BeerNeverBrokeMyHeart',  runnerUp: 'Double Trouble',   thirdPlace: 'Mt. Lebanon Cake Eaters' },
  '2024': { champion: 'Belltown Raptors',       runnerUp: 'Double Trouble',   thirdPlace: 'Belleview Badgers' },
  '2023': { champion: 'Double Trouble',         runnerUp: 'Elemental Heroes', thirdPlace: 'Detroit Dawgs' },
};
