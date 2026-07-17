/**
 * Team Name Resolver
 *
 * Resolves user-supplied team name strings to canonical East v. West team
 * names. Users type names in many ways — "double", "DT", "cake eaters",
 * "beer" — so every tool that accepts a team name passes through here before
 * touching Sleeper.
 *
 * Resolution order:
 *   1. Exact case-insensitive match against the available team list
 *   2. Alias map lookup (handles abbreviations and common nicknames)
 *   3. Substring partial match against canonical names
 *   4. No match — returns candidates for a helpful error
 */

/** Canonical alias map. Keys are lower-cased; values are exact canon names. */
const ALIASES: Record<string, string> = {
  // Double Trouble
  'double trouble':            'Double Trouble',
  'double':                    'Double Trouble',
  'dt':                        'Double Trouble',
  'trouble':                   'Double Trouble',

  // Belltown Raptors
  'belltown raptors':          'Belltown Raptors',
  'belltown':                  'Belltown Raptors',
  'raptors':                   'Belltown Raptors',

  // Belleview Badgers
  'belleview badgers':         'Belleview Badgers',
  'belleview':                 'Belleview Badgers',
  'badgers':                   'Belleview Badgers',
  'bb':                        'Belleview Badgers',

  // Mt. Lebanon Cake Eaters
  'mt. lebanon cake eaters':   'Mt. Lebanon Cake Eaters',
  'mt lebanon cake eaters':    'Mt. Lebanon Cake Eaters',
  'cake eaters':               'Mt. Lebanon Cake Eaters',
  'mt lebanon':                'Mt. Lebanon Cake Eaters',
  'mt. lebanon':               'Mt. Lebanon Cake Eaters',
  'lebanon':                   'Mt. Lebanon Cake Eaters',
  'cake':                      'Mt. Lebanon Cake Eaters',

  // The Lone Ginger
  'the lone ginger':           'The Lone Ginger',
  'lone ginger':               'The Lone Ginger',
  'lone':                      'The Lone Ginger',
  'ginger':                    'The Lone Ginger',

  // bop pop
  'bop pop':                   'bop pop',
  'bop':                       'bop pop',

  // Red Pandas
  'red pandas':                'Red Pandas',
  'pandas':                    'Red Pandas',

  // BeerNeverBrokeMyHeart
  'beerneverbrokedmyheart':    'BeerNeverBrokeMyHeart',
  'beer never broke my heart': 'BeerNeverBrokeMyHeart',
  'beer':                      'BeerNeverBrokeMyHeart',
  'bnbmh':                     'BeerNeverBrokeMyHeart',

  // Elemental Heroes
  'elemental heroes':          'Elemental Heroes',
  'elemental':                 'Elemental Heroes',
  'heroes':                    'Elemental Heroes',

  // Detroit Dawgs
  'detroit dawgs':             'Detroit Dawgs',
  'detroit':                   'Detroit Dawgs',
  'dawgs':                     'Detroit Dawgs',

  // Bimg Bamg Boomg
  'bimg bamg boomg':           'Bimg Bamg Boomg',
  'bimg bamg':                 'Bimg Bamg Boomg',
  'bimg':                      'Bimg Bamg Boomg',
  'bamg':                      'Bimg Bamg Boomg',
  'boomg':                     'Bimg Bamg Boomg',

  // Cascade Marauders and prior franchise names
  'cascade marauders':         'Cascade Marauders',
  'cascade':                   'Cascade Marauders',
  'marauders':                 'Cascade Marauders',
  "gardner's ghost":          'Cascade Marauders',
  'gardners ghost':            'Cascade Marauders',
  'gardner':                   'Cascade Marauders',
  'ghost':                     'Cascade Marauders',
  "minshew's maniacs":        'Cascade Marauders',
  'minshews maniacs':          'Cascade Marauders',
  'minshew':                   'Cascade Marauders',
  'maniacs':                   'Cascade Marauders',
};

export interface TeamMatch {
  requestedTeam: string;
  matchedTeam: string | null;
  confidence: 'exact' | 'alias' | 'partial' | 'none';
  aliasesMatched: string[];
  candidates: string[];
}

/**
 * Resolves a user-supplied team string to a canonical team name.
 * @param input - Raw user input (e.g. "double", "Cake Eaters", "dt")
 * @param availableTeams - Canonical team list from Sleeper (fallback: TEAM_NAMES)
 */
export function resolveTeam(input: string, availableTeams: string[]): TeamMatch {
  const q = input.trim().toLowerCase();

  // 1. Exact case-insensitive match
  const exact = availableTeams.find((t) => t.toLowerCase() === q);
  if (exact) {
    return { requestedTeam: input, matchedTeam: exact, confidence: 'exact', aliasesMatched: [], candidates: [] };
  }

  // 2. Alias map lookup
  const aliased = ALIASES[q];
  if (aliased && availableTeams.includes(aliased)) {
    return { requestedTeam: input, matchedTeam: aliased, confidence: 'alias', aliasesMatched: [q], candidates: [] };
  }

  // 3. Substring partial match against canonical names
  const partials = availableTeams.filter((t) => t.toLowerCase().includes(q));
  if (partials.length === 1) {
    return { requestedTeam: input, matchedTeam: partials[0], confidence: 'partial', aliasesMatched: [], candidates: [] };
  }
  if (partials.length > 1) {
    return { requestedTeam: input, matchedTeam: null, confidence: 'none', aliasesMatched: [], candidates: partials };
  }

  // 4. No match — return full list as candidates for error messaging
  return { requestedTeam: input, matchedTeam: null, confidence: 'none', aliasesMatched: [], candidates: availableTeams };
}