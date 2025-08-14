// Mapping canonical team names to Sleeper accounts
// IMPORTANT: Fill CANONICAL_TEAM_BY_USER_ID with your league's Sleeper user_id -> canonical name mapping.
// You can get user_id values from the Sleeper API or temporary console logs we emit in getTeamsData when unknown.

export const CANONICAL_TEAM_BY_USER_ID: Record<string, string> = {
  // 'user_id_here': 'Belltown Raptors',
  // 'user_id_here': 'Double Trouble',
  // ...
};

// Optional: map Sleeper-visible team/display names to your canonical names.
// This helps auto-resolve without user_id when names match or are known aliases.
export const TEAM_ALIASES: Record<string, string> = {
  // Usernames (owner usernames)
  'jbrichards77': 'Belltown Raptors',
  'noahjankowski': 'Double Trouble',
  'jdeschaine4': 'Elemental Heroes',
  'pensrock8711': 'Mt. Lebanon Cake Eaters',
  'typenine': 'Belleview Badgers',
  'mb48': 'BeerNeverBrokeMyHeart',
  'conor1440': 'Detroit Dawgs',
  'jfrank4': 'bop pop',
  'mattminshew15': "Minshew's Maniacs",
  'songofthepanda': 'Red Pandas',
  'ryannmidolflynns': 'The Lone Ginger',
  'ratpickle': 'Bimg Bamg Boomg',

  // Prior or alternate team/display names (past seasons)
  'hurts so good': 'Belltown Raptors',
  'the reigning champs': 'Double Trouble',
  'frank gore = hof': 'Belleview Badgers',
  'k9 minshew ii': "Minshew's Maniacs",
  'ryanmi dolflynns': 'The Lone Ginger',
  'maholmes and watson': 'Bimg Bamg Boomg',
};

// Normalize a name for alias matching
export function normalizeName(s?: string | null): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
