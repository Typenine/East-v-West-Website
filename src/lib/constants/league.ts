// League constants for East v. West fantasy football league

import { LEAGUE_CALENDARS } from './league-calendar';

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

export const RIVALRY_WEEKS = [3, 14] as const;

export function isRivalryWeek(week: number): boolean {
  return RIVALRY_WEEKS.some((rivalryWeek) => rivalryWeek === week);
}

export type GameweekModeTone =
  | 'opening'
  | 'rivalry'
  | 'east-west'
  | 'deadline'
  | 'playoffs'
  | 'championship';

export type GameweekMode = {
  label: string;
  subtitle: string;
  href: string;
  tone: GameweekModeTone;
};

const GAMEWEEK_MODES: Partial<Record<number, GameweekMode>> = {
  1: {
    label: 'Opening Week',
    subtitle: 'A new East v. West season begins.',
    href: '/matchups',
    tone: 'opening',
  },
  3: {
    label: 'Rivalry Week',
    subtitle: 'Rivals meet across the league. Bragging rights are on the line.',
    href: '/rivalries',
    tone: 'rivalry',
  },
  8: {
    label: 'East vs. West Week',
    subtitle: 'East and West collide in the league-wide conference showcase.',
    href: '/matchups',
    tone: 'east-west',
  },
  12: {
    label: 'Trade Deadline Week',
    subtitle: 'The final week to reshape a contender before the trade deadline closes.',
    href: '/trades',
    tone: 'deadline',
  },
  14: {
    label: 'Rivalry Week',
    subtitle: 'Rivalries return for the regular-season finale, with playoff positioning on the line.',
    href: '/rivalries',
    tone: 'rivalry',
  },
  15: {
    label: 'Playoffs Begin',
    subtitle: 'Seven teams enter the bracket. The No. 1 seed has the first-round bye.',
    href: '/standings',
    tone: 'playoffs',
  },
  16: {
    label: 'Semifinal Week',
    subtitle: 'Four teams remain in the championship chase.',
    href: '/standings',
    tone: 'playoffs',
  },
  17: {
    label: 'Championship Week',
    subtitle: 'The East v. West title is decided this week.',
    href: '/standings',
    tone: 'championship',
  },
};

export function getGameweekMode(week: number): GameweekMode | null {
  return GAMEWEEK_MODES[week] ?? null;
}

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
  'Cascade Marauders',
  'Red Pandas',
  'The Lone Ginger',
  'Bimg Bamg Boomg'
];

// Current year for copyright and other displays
export const CURRENT_YEAR = new Date().getFullYear();

// IMPORTANT_DATES is retained for existing consumers, but all values now come
// from the same year-aware calendar used by the homepage countdown resolver.
// This prevents Draft Central, APIs, newsletters, and homepage phases from
// drifting onto separate hardcoded dates.
const currentCalendar =
  LEAGUE_CALENDARS.find((calendar) => calendar.season === Number(CURRENT_SEASON)) ??
  LEAGUE_CALENDARS[0];
const nextCalendar =
  LEAGUE_CALENDARS.find((calendar) => calendar.season === Number(CURRENT_SEASON) + 1) ??
  currentCalendar;

export const IMPORTANT_DATES = {
  NFL_WEEK_1_START: currentCalendar.regularSeasonStart,
  TRADE_DEADLINE: currentCalendar.tradeDeadline,
  PLAYOFFS_START: currentCalendar.postseasonStart,
  NEW_LEAGUE_YEAR: currentCalendar.nextLeagueYearStart,
  NEXT_DRAFT: currentCalendar.rookieDraft,
  FA_BIDDING_START: currentCalendar.faBiddingStart,
  NEXT_LEAGUE_YEAR_DRAFT: nextCalendar.rookieDraft,
  NEXT_LEAGUE_YEAR_SEASON_START: nextCalendar.regularSeasonStart,
};

// Champions by year
export const CHAMPIONS = {
  '2026': { champion: 'TBD',                    runnerUp: 'TBD',              thirdPlace: 'TBD' },
  '2025': { champion: 'BeerNeverBrokeMyHeart',  runnerUp: 'Double Trouble',   thirdPlace: 'Mt. Lebanon Cake Eaters' },
  '2024': { champion: 'Belltown Raptors',       runnerUp: 'Double Trouble',   thirdPlace: 'Belleview Badgers' },
  '2023': { champion: 'Double Trouble',         runnerUp: 'Elemental Heroes', thirdPlace: 'Detroit Dawgs' },
};