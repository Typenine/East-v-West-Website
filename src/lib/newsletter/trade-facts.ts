/**
 * Pure helpers for building the deterministic TRADE FACTS block and stripping
 * intro boilerplate from bot commentary.
 *
 * No LLM calls, no I/O. Safe to unit-test in isolation.
 */

export type ByTeam = Record<string, { gets?: string[]; gives?: string[] }>;

/**
 * Build the deterministic TRADE FACTS block from `by_team` data.
 *
 * This block is constructed entirely by code — it must be the first trade-specific
 * content the LLM sees and must not be contradicted by any constraint.
 */
export function buildTradeFacts(
  parties: string[],
  byTeam: ByTeam,
  /** Optional annotation callback applied to each asset string (e.g. dynasty rank). */
  annotate: (assets: string[] | undefined) => string = defaultAnnotate,
): string {
  const teamCount = parties.length;

  const header = [
    '═══════════════════════════════════════════════════',
    'TRADE FACTS — SOURCE OF TRUTH (system-generated, do not contradict)',
    teamCount > 2
      ? `This is a ${teamCount}-team trade between: ${parties.join(', ')}.`
      : `This is a ${teamCount}-team trade.`,
    '═══════════════════════════════════════════════════',
  ].join('\n');

  const warnings: string[] = [];
  if (Object.keys(byTeam).length < 2) {
    warnings.push('WARNING: by_team has fewer than 2 teams — trade data may be incomplete.');
  }
  if (parties.length < 2) {
    warnings.push('WARNING: parties list has fewer than 2 teams.');
  }

  const rows = parties.map(team => {
    const a = byTeam[team];
    const gave = (a?.gives?.length ?? 0) > 0 ? annotate(a!.gives) : '(no assets listed)';
    const received = (a?.gets?.length ?? 0) > 0 ? annotate(a!.gets) : '(no assets listed)';
    return `${team}\n  Gave:     ${gave}\n  Received: ${received}`;
  }).join('\n\n');

  const footer = teamCount > 2
    ? 'NOTE: Pick sender attribution is verified from full trade history. Do not attribute a pick to a team unless it appears under "Gave" above.'
    : 'NOTE: These facts are fixed. Do not contradict them or invent additional assets.';

  return [header, warnings.join('\n'), rows, footer].filter(Boolean).join('\n\n');
}

function defaultAnnotate(assets: string[] | undefined): string {
  if (!assets || assets.length === 0) return '(no assets listed)';
  return assets.join(', ');
}

/**
 * Known intro-boilerplate patterns that bots sometimes generate at the start of
 * trade commentary. These should be caught structurally by prompt design; this
 * sanitizer is a safety net.
 */
export const INTRO_BOILERPLATE_PATTERNS: RegExp[] = [
  /^welcome to the trade section[,.]?\s*/i,
  /^let['']s break down this trade[,.]?\s*/i,
  /^in this trade section[,.]?\s*/i,
  /^this week['']s trade[,.]?\s*/i,
  /^the trade section[,.]?\s*/i,
  /^alright[,.]?\s+let['']s (talk|break|look|dive)[^.]*\.\s*/i,
  /^today[,.]?\s+we['']re (looking at|breaking down|covering)[^.]*\.\s*/i,
];

/**
 * Strip known intro boilerplate from the start of bot commentary.
 * Returns the original string unchanged if no pattern matches.
 */
export function stripTradeIntroBoilerplate(
  text: string,
  onStripped?: (pattern: RegExp) => void,
): string {
  const trimmed = text.trimStart();
  for (const pat of INTRO_BOILERPLATE_PATTERNS) {
    if (pat.test(trimmed)) {
      const stripped = trimmed.replace(pat, '').trimStart();
      onStripped?.(pat);
      return stripped.charAt(0).toUpperCase() + stripped.slice(1);
    }
  }
  return text;
}
