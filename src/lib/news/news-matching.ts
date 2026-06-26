/**
 * Shared news-matching utilities.
 *
 * Imported by /api/roster-news and /api/league-news so both routes use
 * identical matching logic.
 */

const NFL_DEFENSE_TEAMS = new Map<string, string>([
  ['arizona cardinals', 'cardinals'],
  ['atlanta falcons', 'falcons'],
  ['baltimore ravens', 'ravens'],
  ['buffalo bills', 'bills'],
  ['carolina panthers', 'panthers'],
  ['chicago bears', 'bears'],
  ['cincinnati bengals', 'bengals'],
  ['cleveland browns', 'browns'],
  ['dallas cowboys', 'cowboys'],
  ['denver broncos', 'broncos'],
  ['detroit lions', 'lions'],
  ['green bay packers', 'packers'],
  ['houston texans', 'texans'],
  ['indianapolis colts', 'colts'],
  ['jacksonville jaguars', 'jaguars'],
  ['kansas city chiefs', 'chiefs'],
  ['las vegas raiders', 'raiders'],
  ['los angeles chargers', 'chargers'],
  ['los angeles rams', 'rams'],
  ['miami dolphins', 'dolphins'],
  ['minnesota vikings', 'vikings'],
  ['new england patriots', 'patriots'],
  ['new orleans saints', 'saints'],
  ['new york giants', 'giants'],
  ['new york jets', 'jets'],
  ['philadelphia eagles', 'eagles'],
  ['pittsburgh steelers', 'steelers'],
  ['san francisco 49ers', '49ers'],
  ['seattle seahawks', 'seahawks'],
  ['tampa bay buccaneers', 'buccaneers'],
  ['tennessee titans', 'titans'],
  ['washington commanders', 'commanders'],
]);

const NFL_DEFENSE_NICKNAMES = new Set(NFL_DEFENSE_TEAMS.values());
const NFL_TEAM_CODES = new Set([
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE',
  'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC',
  'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
  'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS',
]);

// A rostered DEF should only match stories that actually concern the defensive
// unit or special teams. The context must appear shortly after the club name.
const DEFENSE_CONTEXT_LOOKAHEAD =
  '(?=[\\s\\S]{0,80}\\b(?:defense|defensive|defender|defenders|secondary|pass rush|sack|sacks|interception|interceptions|turnover|turnovers|takeaway|takeaways|shutout|cornerback|cornerbacks|linebacker|linebackers|edge rusher|edge rushers|defensive line|special teams|pick six|fumble|fumbles|blitz|pressure|pressures|cb|db|de|dt|dl|lb|olb|ilb|nt|fs|ss)\\b)';

function normalizeText(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function literalEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape a value for use in a matcher RegExp.
 *
 * NFL defense names receive an additional context requirement. NFL team codes
 * are disabled because abbreviations such as NO and IND are ordinary words or
 * word fragments and caused widespread false matches.
 */
export function escapeRegExp(s: string): string {
  const normalized = normalizeText(s);
  const upper = (s || '').toUpperCase();

  if (NFL_TEAM_CODES.has(upper)) return '(?!)';

  const escaped = literalEscape(s);
  if (NFL_DEFENSE_TEAMS.has(normalized) || NFL_DEFENSE_NICKNAMES.has(normalized)) {
    return `${escaped}${DEFENSE_CONTEXT_LOOKAHEAD}`;
  }
  return escaped;
}

export function canonicalizeUrl(url: string | null | undefined): string | null {
  try {
    if (!url) return null;
    const u = new URL(url);
    const host = u.host.toLowerCase();
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${host}${path}`;
  } catch {
    const s = String(url || '').trim();
    return s ? s.toLowerCase() : null;
  }
}

export function containsPhrase(hayNorm: string, phraseNorm: string): boolean {
  if (!hayNorm || !phraseNorm) return false;
  const re = new RegExp(`(^|\\s)${literalEscape(phraseNorm)}(\\s|$)`);
  return re.test(hayNorm);
}

/**
 * Player names are normalized and suffixes removed as before. Defense entries
 * are reduced to a duplicated nickname so the existing route matcher builds
 * nickname-only tokens instead of dangerous city tokens such as "new".
 */
export function stripSuffixes(name: string): string {
  const normalized = normalizeText(name);
  const defenseNickname = NFL_DEFENSE_TEAMS.get(normalized);
  if (defenseNickname) return `${defenseNickname} ${defenseNickname}`;

  const parts = normalized.split(' ');
  const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
  return parts.filter((p) => !suffixes.has(p)).join(' ').trim();
}

export const NICKNAMES: Record<string, string[]> = {
  william:     ['bill', 'will', 'billy'],
  robert:      ['rob', 'bob', 'bobby', 'robbie'],
  richard:     ['rich', 'rick', 'ricky'],
  edward:      ['ed', 'eddie'],
  james:       ['jim', 'jimmy', 'jamie'],
  john:        ['jack', 'johnny'],
  matthew:     ['matt'],
  michael:     ['mike', 'mikey'],
  joseph:      ['joe', 'joey'],
  daniel:      ['dan', 'danny'],
  andrew:      ['andy', 'drew'],
  anthony:     ['tony'],
  nicholas:    ['nick', 'nico'],
  thomas:      ['tom', 'tommy'],
  patrick:     ['pat'],
  steven:      ['steve', 'stevie'],
  alexander:   ['alex'],
  samuel:      ['sam', 'sammy'],
  benjamin:    ['ben', 'benny'],
  christopher: ['chris'],
  nathaniel:   ['nate', 'nathan'],
  philip:      ['phil'],
  gregory:     ['greg'],
  kenneth:     ['ken', 'kenny'],
  ronald:      ['ron', 'ronnie'],
  timothy:     ['tim', 'timmy'],
};
