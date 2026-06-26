/**
 * Shared news classification and quality filters.
 *
 * Categories are intentionally conservative. The headline is the primary source
 * of truth. A short description excerpt is only allowed to supply medical,
 * availability, suspension, or retirement context.
 */

export type StoryCategory =
  | 'injury'
  | 'practice_availability'
  | 'nfl_transaction'
  | 'contract'
  | 'trade'
  | 'trade_rumor'
  | 'suspension'
  | 'depth_chart_role'
  | 'retirement'
  | 'rookie_development'
  | 'performance'
  | 'general_analysis';

type CategoryRule = { category: StoryCategory; patterns: RegExp[] };

export const CATEGORY_RULES: readonly CategoryRule[] = [
  {
    category: 'injury',
    patterns: [
      /\b(injur|injured|injury|hurt|fracture|sprain|torn|tear(?:s|ing)?|surgery|hamstring|achilles|concussion|placed on ir|ir list|out for season|diagnosed with|season.ending)\b/i,
    ],
  },
  {
    category: 'practice_availability',
    patterns: [
      /\b(limited (?:in )?practice|did not practice|dnp|full practice|returned to practice|practice report|game.?time decision|gtd|questionable|probable|doubtful|ruled out)\b/i,
    ],
  },
  {
    category: 'suspension',
    patterns: [/\b(suspend|suspension|banned|ban|discipline|violation)\b/i],
  },
  {
    category: 'retirement',
    patterns: [/\b(retire|retirement|retires|retiring|call it a career|hang up his cleats)\b/i],
  },
  {
    category: 'trade',
    patterns: [
      /\btraded\b/i,
      /\btrade (?:complete|completed|official|agreed|agreement)\b/i,
      /\b(?:acquire[sd]?|land(?:s|ed)?|obtain(?:s|ed)?)\b.{0,60}\b(?:via|in)\s+(?:a\s+)?trade\b/i,
      /\btrades?\b.{1,80}\bto\b/i,
      /\bdealt to\b/i,
      /\bacquired via trade\b/i,
      /\bexchange\b/i,
      /\bswap(?:ped)?\b/i,
    ],
  },
  {
    category: 'trade_rumor',
    patterns: [
      /\b(trade rumors?|trade talks?|exploring a trade|on the trade block|could be traded|being shopped|trade interest|trade candidate|trade target|linked to)\b/i,
    ],
  },
  {
    category: 'nfl_transaction',
    patterns: [
      /\b(practice squad|promoted to active|signed to practice|activated from ir|claimed on waivers|waiver claim|waived|released|release|ir activation|reserve\/?left squad|reserve left squad|reserve list)\b/i,
      /\b(?:cuts|cut by|was cut|has been cut|have been cut|got cut)\b/i,
      /\bcut (?:the|a|an|veteran|rookie|receiver|quarterback|running back|wide receiver|tight end|player|defender|linebacker|cornerback|safety|offensive lineman)\b/i,
    ],
  },
  {
    category: 'contract',
    patterns: [
      /\b(signed|re-signed|contract extension|new contract|multi.year deal|agreement|free agent signing|one.year deal|two.year deal|three.year deal)\b/i,
      /\b(?:agree|agrees|agreed) to (?:a )?(?:\d+[- ]year )?extension\b/i,
      /\bextension worth\b/i,
    ],
  },
  {
    category: 'depth_chart_role',
    patterns: [
      /\b(starter|starting role|depth chart|benched|named starter|will start|lead back|target share|snap count|usage|taking over|replacing|backup|third.string|roster bubble|roster spot)\b/i,
    ],
  },
  {
    category: 'rookie_development',
    patterns: [/\b(rookie|first.year|draft pick|undrafted|making his nfl|nfl debut)\b/i],
  },
  {
    category: 'performance',
    patterns: [
      /\b(touchdown|100 yards|career.high|breakout|struggled|dominant|fantasy points|big game|stat line|multi.?touchdown|three.?touchdown)\b/i,
    ],
  },
];

function classifyText(text: string): StoryCategory {
  for (const { category, patterns } of CATEGORY_RULES) {
    if (patterns.some((re) => re.test(text))) return category;
  }
  return 'general_analysis';
}

function descriptionExcerpt(description: string, maxChars = 360): string {
  const clean = (description || '').replace(/\s+/g, ' ').trim();
  return clean.slice(0, maxChars);
}

const SAFE_DESCRIPTION_FALLBACKS = new Set<StoryCategory>([
  'injury',
  'practice_availability',
  'suspension',
  'retirement',
]);

/**
 * Classify a story with the headline as the source of truth.
 *
 * Full RSS article bodies often contain related links and navigation text. To
 * avoid false tags, only a short description excerpt can provide a fallback,
 * and only for medical/status categories.
 */
export function classifyStory(title: string, description: string): StoryCategory {
  if (isPromotionalOrPoll(title, description)) return 'general_analysis';

  const headlineCategory = classifyText(title || '');
  if (headlineCategory !== 'general_analysis') return headlineCategory;

  const fallbackCategory = classifyText(descriptionExcerpt(description));
  return SAFE_DESCRIPTION_FALLBACKS.has(fallbackCategory)
    ? fallbackCategory
    : 'general_analysis';
}

// ── Noise and quality filters ──────────────────────────────────────────────────

export function normalizeText(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/**
 * Fan polls, contests, and vote prompts are promotional engagement content, not
 * roster news. These stories frequently mention a team defense and caused false
 * fantasy-owner tags.
 */
export function isPromotionalOrPoll(title: string, description: string): boolean {
  const t = normalizeText(title);
  const hay = `${t} ${normalizeText(description).slice(0, 240)}`;

  return [
    /^vote for\b/,
    /^vote now\b/,
    /^poll\b/,
    /^fan vote\b/,
    /\bvote for (?:the|your|a)\b/,
    /\bchoose (?:the|your) (?:top|best|favorite|favourite)\b/,
    /\bwhich play\b.{0,60}\b(best|favorite|favourite|top)\b/,
    /\bplay of the (?:week|game)\b.{0,60}\bvote\b/,
    /\bfan of the year\b/,
    /\bsweepstakes\b/,
    /\benter to win\b/,
    /^quiz\b/,
    /^photo gallery\b/,
  ].some((pattern) => pattern.test(hay));
}

export function isListicleOrRoundup(title: string): boolean {
  const t = normalizeText(title);
  return /\b(top \d+|best \d+|\d+ players|\d+ things|rankings|ranked|mock draft|power rankings|grades|report card|every team|all 32|nfl picks)\b/.test(t);
}

export function isWatchOrTVGuide(title: string, description: string): boolean {
  const hay = `${normalizeText(title)} ${normalizeText(description)}`;
  return [
    'how to watch', 'what channel', 'tv channel', 'watch live', 'live stream',
    'streaming info', 'stream info', 'tv info', 'time tv streaming', 'broadcast info',
    'radio broadcast', 'start time and tv', 'where to watch',
  ].some((p) => hay.includes(p));
}

export function isBettingContent(title: string, description: string): boolean {
  const hay = `${normalizeText(title)} ${normalizeText(description)}`;
  return [
    'betting', 'odds', 'parlay', 'parlays', 'spread', 'point spread', 'prop bet',
    'prop bets', 'props', 'lines', 'moneyline', 'over under', 'gambling',
  ].some((p) => hay.includes(p));
}
