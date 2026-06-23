/**
 * Shared news classification module.
 *
 * Imported by /api/roster-news and /api/league-news so both routes use
 * identical classification rules. Tests import from here too — no duplicate
 * implementations in test files.
 *
 * Category precedence (first match wins):
 *   injury             – actual injury terms (torn, surgery, placed on IR…)
 *   practice_availability – practice status terms only (DNP, limited, GTD…)
 *   suspension
 *   retirement
 *   trade              – completed trades
 *   trade_rumor        – rumour / speculation
 *   nfl_transaction    – PS moves, waivers, releases, activations, cuts
 *   contract           – signings, extensions, multi-year deals
 *   depth_chart_role
 *   rookie_development
 *   performance
 *   general_analysis   – fallback
 *
 * Key design choices:
 *   - practice terms (DNP, limited, GTD, questionable…) are NOT in the injury
 *     rule. A story about "knee injury AND did not practice" still classifies
 *     as injury because the injury term fires first.
 *   - nfl_transaction precedes contract so roster releases, waivers, and PS
 *     moves are not mislabelled as contract stories.
 *   - Released/Waived in nfl_transaction; Contract extension/Re-signed in contract.
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
    // Actual injury terms only — practice-status words deliberately excluded
    // so "limited practice" alone does not fire this rule.
    category: 'injury',
    patterns: [
      /\b(injur|injured|injury|hurt|fracture|sprain|torn|surgery|hamstring|achilles|concussion|placed on ir|ir list|out for season|diagnosed with|season.ending)\b/i,
    ],
  },
  {
    // Practice-status terms reach this rule only when no injury keyword matched.
    // "questionable / doubtful / ruled out" are game-status designations that
    // belong here rather than under injury when no explicit injury term is present.
    category: 'practice_availability',
    patterns: [
      /\b(limited practice|did not practice|dnp|full practice|returned to practice|practice report|game.?time decision|gtd|questionable|probable|doubtful|ruled out)\b/i,
    ],
  },
  {
    category: 'suspension',
    patterns: [
      /\b(suspend|suspension|banned|ban|discipline|violation)\b/i,
    ],
  },
  {
    category: 'retirement',
    patterns: [
      /\b(retire|retirement|retires|retiring|call it a career|hang up his cleats)\b/i,
    ],
  },
  {
    // Completed trades — checked before trade_rumor
    category: 'trade',
    patterns: [
      /\b(traded|trade complete|acquired via trade|dealt to|exchange|swap)\b/i,
    ],
  },
  {
    // Rumour / speculation — only reached when no completed-trade keyword matched
    category: 'trade_rumor',
    patterns: [
      /\b(trade rumors?|trade talks?|exploring a trade|on the trade block|could be traded|being shopped|trade interest|trade candidate|trade target|linked to)\b/i,
    ],
  },
  {
    // PS moves, waivers, releases, activations, IR activations — before contract
    // so a normal roster release is not mislabelled as a contract story.
    category: 'nfl_transaction',
    patterns: [
      /\b(practice squad|promoted to active|signed to practice|activated from ir|claimed on waivers|waiver claim|waived|released|release|cut|ir activation)\b/i,
    ],
  },
  {
    // Signings, extensions, deals — reached only when no nfl_transaction keyword matched.
    // "released" and "waived" are intentionally absent here; they belong in nfl_transaction.
    category: 'contract',
    patterns: [
      /\b(signed|re-signed|contract extension|new contract|multi.year deal|agreement|free agent signing)\b/i,
    ],
  },
  {
    category: 'depth_chart_role',
    patterns: [
      /\b(starter|starting role|depth chart|benched|named starter|will start|lead back|target share|snap count|usage|taking over|replacing|backup|third.string)\b/i,
    ],
  },
  {
    category: 'rookie_development',
    patterns: [
      /\b(rookie|first.year|draft pick|undrafted|making his nfl|nfl debut)\b/i,
    ],
  },
  {
    category: 'performance',
    patterns: [
      /\b(touchdown|100 yards|career.high|breakout|struggled|dominant|fantasy points|big game|stat line)\b/i,
    ],
  },
];

/**
 * Classify a news story. Returns the first matching category or 'general_analysis'.
 *
 * @param title       Story headline.
 * @param description Story body / summary.
 */
export function classifyStory(title: string, description: string): StoryCategory {
  const hay = `${title} ${description}`;
  for (const { category, patterns } of CATEGORY_RULES) {
    if (patterns.some((re) => re.test(hay))) return category;
  }
  return 'general_analysis';
}

// ── Noise filters (exported for reuse in routes and tests) ────────────────────

export function normalizeText(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/**
 * Returns true for listicle/roundup headlines where player mentions are
 * incidental rather than the primary subject.
 */
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
