// src/ingest/team-names.js
// Canonical team name resolution — mirrors the main site's team-mapping.ts.
// Bots must ALWAYS refer to canonical team names, never Sleeper usernames or display names.

export const CANONICAL_TEAM_BY_USER_ID = {
  '603801140211027968': 'Belltown Raptors',
  '600107096758870016': 'Double Trouble',
  '604014218504630272': 'Elemental Heroes',
  '869614030313136128': 'Mt. Lebanon Cake Eaters',
  '866793409938104320': 'Belleview Badgers',
  '871107865686020096': 'BeerNeverBrokeMyHeart',
  '603802414381879296': 'Detroit Dawgs',
  '870841561565544448': 'bop pop',
  '234898221262958592': 'Cascade Marauders',
  '866824942002487296': 'Red Pandas',
  '867644621516353536': 'The Lone Ginger',
  '741241996198469632': 'Bimg Bamg Boomg',
};

export const TEAM_ALIASES = {
  // Usernames (owner usernames)
  'jbrichards77': 'Belltown Raptors',
  'noahjankowski': 'Double Trouble',
  'jdeschaine4': 'Elemental Heroes',
  'pensrock8711': 'Mt. Lebanon Cake Eaters',
  'typenine': 'Belleview Badgers',
  'mb48': 'BeerNeverBrokeMyHeart',
  'conor1440': 'Detroit Dawgs',
  'jfrank4': 'bop pop',
  'mattminshew15': 'Cascade Marauders',
  'songofthepanda': 'Red Pandas',
  'ryannmidolflynns': 'The Lone Ginger',
  'ryanmidolflynns': 'The Lone Ginger',
  'ratpickle': 'Bimg Bamg Boomg',

  // Prior or alternate team/display names (past seasons)
  'hurts so good': 'Belltown Raptors',
  'the reigning champs': 'Double Trouble',
  'frank gore = hof': 'Belleview Badgers',
  "minshew's maniacs": 'Cascade Marauders',
  'minshews maniacs': 'Cascade Marauders',
  "gardner's ghost": 'Cascade Marauders',
  'gardners ghost': 'Cascade Marauders',
  'k9 minshew ii': 'Cascade Marauders',
  'ryanmi dolflynns': 'The Lone Ginger',
  'the lone ginger': 'The Lone Ginger',
  'the lone gingeer': 'The Lone Ginger',
  'the lone gingerr': 'The Lone Ginger',
  'the lone gingerrr': 'The Lone Ginger',
  'maholmes and watson': 'Bimg Bamg Boomg',
};

export function normalizeName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const ALIAS_BY_NORMALIZED = new Map(
  Object.entries(TEAM_ALIASES).map(([alias, canonical]) => [normalizeName(alias), canonical])
);
const CANONICAL_BY_NORMALIZED = new Map(
  Object.values(CANONICAL_TEAM_BY_USER_ID).map((n) => [normalizeName(n), n])
);

/**
 * Resolve a canonical team name. Priority:
 * 1) Sleeper user_id mapping (source of truth across seasons)
 * 2) Sleeper roster/team display name via alias table
 * 3) display_name / username via alias table
 * Falls back to the raw team name (never username) or a generic placeholder.
 */
export function resolveCanonicalTeamName({ userId, teamName, displayName, username } = {}) {
  if (userId && CANONICAL_TEAM_BY_USER_ID[userId]) {
    return CANONICAL_TEAM_BY_USER_ID[userId];
  }
  const tryMap = (name) => {
    if (!name) return undefined;
    const key = normalizeName(name);
    return ALIAS_BY_NORMALIZED.get(key) || CANONICAL_BY_NORMALIZED.get(key);
  };
  const mapped = tryMap(teamName) || tryMap(displayName) || tryMap(username);
  if (mapped) return mapped;

  // Last resort: prefer a Sleeper team name over any username
  const raw = String(teamName || '').trim();
  if (raw) return raw;
  console.warn('[team-names] Unknown team mapping — add it to CANONICAL_TEAM_BY_USER_ID or TEAM_ALIASES', {
    userId, teamName, displayName, username,
  });
  return `Team ${String(userId || 'unknown').slice(-4)}`;
}