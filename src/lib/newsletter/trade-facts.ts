/**
 * Pure helpers for building the deterministic TRADE FACTS block and stripping
 * intro boilerplate from bot commentary.
 *
 * No LLM calls, no I/O. Safe to unit-test in isolation.
 */

export type ByTeam = Record<string, { gets?: string[]; gives?: string[] }>;

const FROM_SUFFIX_RE = /\s*\(from\s+([^)]+)\)\s*$/i;
const TO_SUFFIX_RE = /\s*→\s*(.+?)\s*$/;

/**
 * Pairwise asset flows for 3+ team trades — helps LLMs track who sent what to whom.
 * Parses (from X) / → Y suffixes produced by derive.ts for multi-team deals.
 */
export function buildTradeRoutingLedger(parties: string[], byTeam: ByTeam): string | null {
  if (parties.length < 3) return null;

  const edges: string[] = [];
  const seen = new Set<string>();

  const pushEdge = (from: string, to: string, asset: string) => {
    const key = `${from}→${to}:${asset}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(`${from} → ${to}: ${asset}`);
  };

  for (const team of parties) {
    const side = byTeam[team];
    if (!side) continue;

    for (const raw of side.gets ?? []) {
      const fromMatch = raw.match(FROM_SUFFIX_RE);
      if (!fromMatch) continue;
      const sender = fromMatch[1].trim();
      const asset = raw.replace(FROM_SUFFIX_RE, '').trim();
      pushEdge(sender, team, asset);
    }

    for (const raw of side.gives ?? []) {
      const toMatch = raw.match(TO_SUFFIX_RE);
      if (!toMatch) continue;
      const receiver = toMatch[1].trim();
      const asset = raw.replace(TO_SUFFIX_RE, '').trim();
      pushEdge(team, receiver, asset);
    }
  }

  if (edges.length === 0) return null;

  return [
    'PAIRWISE ROUTING (verified — each line is one direct transfer in this deal):',
    ...edges.map(line => `  • ${line}`),
  ].join('\n');
}

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

  const routingLedger = buildTradeRoutingLedger(parties, byTeam);

  const footer = teamCount > 2
    ? routingLedger
      ? 'NOTE: Use PAIRWISE ROUTING for who sent what to whom. Per-team Gave/Received is authoritative for grades — only penalize a team for assets under their Gave line.'
      : 'NOTE: Per-team Gave/Received is authoritative for grades — only penalize a team for assets under their Gave line. Do not invent transfers not listed above.'
    : 'NOTE: These facts are fixed. Do not contradict them or invent additional assets.';

  return [header, warnings.join('\n'), routingLedger, rows, footer].filter(Boolean).join('\n\n');
}

/**
 * Per-team scope block — prevents conflating "(from X)" on one asset with X sending everything,
 * and blocks inventing pre-trade pick inventory as part of this deal.
 */
export function buildTradePartyScopeBlock(
  focusTeam: string,
  parties: string[],
  byTeam: ByTeam,
  annotate: (assets: string[] | undefined) => string = defaultAnnotate,
): string {
  const side = byTeam[focusTeam];
  const received = annotate(side?.gets);
  const gave = annotate(side?.gives);
  const receivedN = side?.gets?.length ?? 0;
  const gaveN = side?.gives?.length ?? 0;

  const otherGives = parties
    .filter(p => p !== focusTeam)
    .map(p => {
      const g = byTeam[p]?.gives ?? [];
      if (g.length === 0) return `  • ${p} SENT: (nothing listed)`;
      return `  • ${p} SENT: ${annotate(g)}`;
    })
    .join('\n');

  return [
    '=== GRADING SCOPE (this transaction only) ===',
    `You are grading ${focusTeam} ONLY.`,
    `Assets ${focusTeam} acquired IN THIS TRADE (${receivedN}): ${received}`,
    `Assets ${focusTeam} gave up IN THIS TRADE (${gaveN}): ${gave}`,
    '',
    'Rules:',
    '• Do NOT count draft picks they already owned before this deal — only the Received line is new capital from this trade.',
    '• "(from Team X)" on one received asset means ONLY that asset came from X — not every asset they received.',
    `• Never list an asset under another team's SENT line as something ${focusTeam} gave up.`,
    '',
    'What other teams gave up (do NOT attribute these to ' + focusTeam + '):',
    otherGives,
    '===',
  ].join('\n');
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
/** Drop a leading sentence that recaps the whole trade instead of grading the focus team. */
export function stripTradeGradeLeadIn(text: string, tradeHeadline = ''): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const sentences = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) ?? [trimmed];
  if (sentences.length < 2) return trimmed;
  const first = sentences[0].toLowerCase();
  const headlineLower = tradeHeadline.toLowerCase();
  const looksLikeIntro =
    first.includes('trade') ||
    first.includes('deal') ||
    first.includes('three-team') ||
    first.includes('multi-team') ||
    first.includes("let's start") ||
    first.includes("let's break") ||
    first.includes('breaking this down') ||
    first.includes('when i first saw') ||
    first.includes("i'll be honest") ||
    first.includes('welcome to') ||
    first.includes('in this trade') ||
    first.includes('this week') ||
    (headlineLower.length > 0 && first.includes(headlineLower));
  return looksLikeIntro ? sentences.slice(1).join(' ').trim() : trimmed;
}

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
