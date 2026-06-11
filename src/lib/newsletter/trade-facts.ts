/**
 * Pure helpers for building the deterministic TRADE FACTS block and stripping
 * intro boilerplate from bot commentary.
 *
 * No LLM calls, no I/O. Safe to unit-test in isolation.
 */

export type ByTeam = Record<string, { gets?: string[]; gives?: string[] }>;

/** One direct transfer inside a trade (mirrors TradeRoutingEdge in types.ts). */
export type RoutingEdge = { from: string; to: string; asset: string };

const FROM_SUFFIX_RE = /\s*\(from\s+([^)]+)\)\s*$/i;
const TO_SUFFIX_RE = /\s*→\s*(.+?)\s*$/;

/**
 * Pairwise asset flows for 3+ team trades — helps LLMs track who sent what to whom.
 *
 * Preferred source is the structured `routing` edges built in derive.ts
 * directly from Sleeper's sender/receiver ids. When absent (older cached
 * events), falls back to parsing the (from X) / → Y string suffixes.
 */
export function buildTradeRoutingLedger(
  parties: string[],
  byTeam: ByTeam,
  routing?: RoutingEdge[],
): string | null {
  if (parties.length < 3) return null;

  const edges: string[] = [];
  const seen = new Set<string>();

  const pushEdge = (from: string, to: string, asset: string) => {
    const key = `${from}→${to}:${asset}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(`${from} → ${to}: ${asset}`);
  };

  if (routing && routing.length > 0) {
    for (const edge of routing) {
      pushEdge(edge.from, edge.to, edge.asset);
    }
  } else {
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
  /** Structured routing edges from derive.ts — preferred over string parsing. */
  routing?: RoutingEdge[],
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

  const routingLedger = buildTradeRoutingLedger(parties, byTeam, routing);

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

// ─── Attribution lint ────────────────────────────────────────────────────────
// Prompt-level constraints alone have repeatedly failed to stop bots from
// flipping trade direction on multi-team trades ("the Badgers traded Thomas"
// when the Lone Ginger sent him). This is a deterministic post-generation
// check: scan the generated paragraph for direction-flipped claims about the
// focus team and report them so the caller can regenerate with corrections.

export type AttributionViolation = {
  /** The offending sentence (trimmed). */
  sentence: string;
  /** The asset (player) whose direction was flipped. */
  asset: string;
  kind: 'sent-what-they-received' | 'sent-another-teams-asset' | 'received-what-they-sent' | 'wrong-sender';
  /** Human-readable correction, suitable for a retry prompt. */
  correction: string;
};

const SENDING_VERBS =
  '(?:trad(?:es?|ed|ing)(?:\\s+away)?|g[ai]v(?:es?|ing)\\s+up|gave\\s+up|s(?:ent|ends?|ending)(?:\\s+(?:away|off|out))?|ship(?:s|ped|ping)?(?:\\s+(?:off|out|away))?|deal(?:s|t)\\s+away|los(?:es|ing|t)|surrender(?:s|ed|ing)?|part(?:s|ed|ing)\\s+with|mov(?:es?|ed|ing)\\s+on\\s+from|say(?:s|ing)?\\s+goodbye\\s+to|said\\s+goodbye\\s+to|offload(?:s|ed|ing)?|gives?\\s+away|flip(?:s|ped|ping))';

const RECEIVING_VERBS =
  '(?:receiv(?:es?|ed|ing)|land(?:s|ed|ing)|acquir(?:es?|ed|ing)|get(?:s|ting)|got|gain(?:s|ed|ing)|add(?:s|ed|ing)|bring(?:s|ing)\\s+in|brought\\s+in|brings?\\s+(?:in|aboard)|pick(?:s|ed)?\\s+up|welcom(?:es?|ed|ing)|haul(?:s|ed)?\\s+in|scoop(?:s|ed)?\\s+up|net(?:s|ted)|import(?:s|ed)|walk(?:s|ed)?\\s+away\\s+with|com(?:es?|ing)\\s+away\\s+with|came\\s+away\\s+with|steal(?:s|ing)?|stole|grab(?:s|bed|bing))';

/** Strip routing suffixes + annotations from a by_team asset string. */
function cleanAssetName(raw: string): string {
  return raw
    .replace(FROM_SUFFIX_RE, '')
    .replace(TO_SUFFIX_RE, '')
    .replace(/\s*\[Dynasty #\d+\]\s*/gi, ' ')
    .trim();
}

/** True when the asset string names a player (not a pick or FAAB). */
function isPlayerAsset(name: string): boolean {
  return !/\b(?:pick|round|rd|faab|slot)\b|\$/i.test(name);
}

/** Sender of a received-asset string: prefer routing edges, else "(from X)" suffix. */
function senderFor(assetName: string, receiver: string, routing?: RoutingEdge[], rawGet?: string): string | null {
  if (routing) {
    const edge = routing.find(
      (r) => r.to === receiver && cleanAssetName(r.asset).toLowerCase() === assetName.toLowerCase(),
    );
    if (edge) return edge.from;
  }
  const m = rawGet?.match(FROM_SUFFIX_RE);
  return m ? m[1].trim() : null;
}

/** Significant tokens of a team name (length ≥ 4, skips generic words). */
function teamTokens(team: string): string[] {
  const SKIP = new Set(['team', 'the', 'club', 'squad']);
  return team
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z'.-]/g, ''))
    .filter((w) => w.length >= 4 && !SKIP.has(w.toLowerCase()));
}

/**
 * Scan `text` (a grade paragraph written about `focusTeam`) for claims that
 * contradict the trade's actual asset routing. Conservative by design — it
 * anchors on the claimed subject of each verb, so legitimate sentences about
 * other teams' sends are not flagged.
 */
export function findTradeAttributionViolations(
  focusTeam: string,
  parties: string[],
  byTeam: ByTeam,
  text: string,
  routing?: RoutingEdge[],
): AttributionViolation[] {
  const side = byTeam[focusTeam];
  if (!side) return [];

  type AssetRef = { name: string; last: string; raw: string };
  const toRefs = (assets: string[] | undefined): AssetRef[] =>
    (assets ?? [])
      .map((raw) => ({ raw, name: cleanAssetName(raw) }))
      .filter((a) => isPlayerAsset(a.name) && a.name.length >= 4)
      .map((a) => ({ ...a, last: a.name.split(/\s+/).pop() ?? '' }));

  const received = toRefs(side.gets);
  const gave = toRefs(side.gives);
  const othersGave: Array<AssetRef & { sender: string }> = [];
  for (const p of parties) {
    if (p === focusTeam) continue;
    for (const ref of toRefs(byTeam[p]?.gives)) othersGave.push({ ...ref, sender: p });
  }

  // Last names that map to more than one distinct player are ambiguous — match
  // those only by full name.
  const lastNameCounts = new Map<string, Set<string>>();
  for (const ref of [...received, ...gave, ...othersGave]) {
    const set = lastNameCounts.get(ref.last.toLowerCase()) ?? new Set<string>();
    set.add(ref.name.toLowerCase());
    lastNameCounts.set(ref.last.toLowerCase(), set);
  }
  const matchable = (ref: AssetRef): string[] => {
    const names = [ref.name];
    if (ref.last.length >= 4 && (lastNameCounts.get(ref.last.toLowerCase())?.size ?? 0) <= 1) {
      names.push(ref.last);
    }
    return names;
  };

  const tokensByTeam = new Map<string, string[]>(parties.map((p) => [p, teamTokens(p)]));

  /** The team a sentence segment most recently named, or null. */
  const lastTeamNamed = (segment: string): string | null => {
    let best: { team: string; idx: number } | null = null;
    for (const [team, tokens] of tokensByTeam) {
      for (const tok of tokens) {
        const idx = segment.toLowerCase().lastIndexOf(tok.toLowerCase());
        if (idx >= 0 && (!best || idx > best.idx)) best = { team, idx };
      }
    }
    return best?.team ?? null;
  };

  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const violations: AttributionViolation[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    const checkDirection = (
      verbs: string,
      refs: Array<AssetRef & { sender?: string }>,
      makeViolation: (ref: AssetRef & { sender?: string }, s: string) => AttributionViolation | null,
    ) => {
      for (const ref of refs) {
        for (const name of matchable(ref)) {
          // Window stops at clause boundaries (, ; :) so a verb in one clause
          // can't claim an asset mentioned in the next ("gave up X, but landed Y").
          const re = new RegExp(`\\b${verbs}\\b[^.!?,;:]{0,60}?\\b${escapeRe(name)}\\b`, 'i');
          const m = re.exec(sentence);
          if (!m) continue;
          // Subject anchor: the team named most recently before the verb. In a
          // paragraph graded for focusTeam, no explicit subject means focusTeam.
          const before = sentence.slice(0, m.index);
          const subject = lastTeamNamed(before) ?? focusTeam;
          if (subject !== focusTeam) continue;
          const v = makeViolation(ref, sentence);
          if (v) violations.push(v);
          break;
        }
      }
    };

    // 1. Focus team "sent" an asset they actually received.
    checkDirection(SENDING_VERBS, received, (ref, s) => ({
      sentence: s.trim(),
      asset: ref.name,
      kind: 'sent-what-they-received',
      correction: `${focusTeam} RECEIVED ${ref.name}${(() => {
        const from = senderFor(ref.name, focusTeam, routing, ref.raw);
        return from ? ` from ${from}` : '';
      })()} in this trade — they did NOT give him up.`,
    }));

    // 2. Focus team "sent" an asset that another team actually sent
    //    (and that the focus team neither gave nor received).
    const notTheirs = othersGave.filter(
      (o) =>
        !gave.some((g) => g.name.toLowerCase() === o.name.toLowerCase()) &&
        !received.some((r) => r.name.toLowerCase() === o.name.toLowerCase()),
    );
    checkDirection(SENDING_VERBS, notTheirs, (ref, s) => ({
      sentence: s.trim(),
      asset: ref.name,
      kind: 'sent-another-teams-asset',
      correction: `${ref.name} was sent by ${(ref as { sender?: string }).sender ?? 'another team'}, not by ${focusTeam}. ${focusTeam} was not involved in moving this player.`,
    }));

    // 3. Focus team "received" an asset they actually gave up.
    checkDirection(RECEIVING_VERBS, gave, (ref, s) => ({
      sentence: s.trim(),
      asset: ref.name,
      kind: 'received-what-they-sent',
      correction: `${focusTeam} GAVE UP ${ref.name} in this trade — they did NOT acquire him.`,
    }));

    // 4. Right asset, wrong sender: "got X from Team B" when Team A sent X.
    for (const ref of received) {
      const actualSender = senderFor(ref.name, focusTeam, routing, ref.raw);
      if (!actualSender) continue;
      for (const name of matchable(ref)) {
        const re = new RegExp(`\\b${escapeRe(name)}\\b[^.!?]{0,30}?\\bfrom\\b([^.!?]{0,50})`, 'i');
        const m = re.exec(sentence);
        if (!m) continue;
        const claimed = lastTeamNamed(m[1]);
        if (claimed && claimed !== actualSender) {
          violations.push({
            sentence: sentence.trim(),
            asset: ref.name,
            kind: 'wrong-sender',
            correction: `${focusTeam} received ${ref.name} from ${actualSender}, not from ${claimed}.`,
          });
        }
        break;
      }
    }
  }

  return violations;
}

/** Remove the sentences flagged by the lint — last-resort deterministic cleanup. */
export function stripViolatingSentences(text: string, violations: AttributionViolation[]): string {
  if (violations.length === 0) return text;
  const bad = new Set(violations.map((v) => v.sentence));
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !bad.has(s.trim()))
    .join(' ')
    .trim();
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
/**
 * Drop leading sentences that recap/introduce the whole trade instead of
 * grading the focus team. Strips up to three consecutive intro sentences, but
 * never strips a sentence that already carries a verdict (grade letter,
 * win/lose language) — that's the content we want to lead with.
 */
export function stripTradeGradeLeadIn(text: string, tradeHeadline = ''): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const sentences = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) ?? [trimmed];
  const headlineLower = tradeHeadline.toLowerCase();

  const hasVerdict = (s: string): boolean =>
    /\bgrade\b|\b[A-F][+-](?=[\s.,!;:)]|$)|\bgive\s+(?:this|them|it)\s+an?\s+[A-F](?=[\s.,!;:)+-]|$)|\bwin(?:s|ner)?\b|\bwon\b|\blos(?:es?|er|t)\b|\bsteal\b|\bheist\b|\bfleec/i.test(s) ||
    /\b[A-F][+-]?\s*[.!]?\s*$/.test(s);

  const looksLikeIntro = (s: string): boolean => {
    const first = s.toLowerCase();
    return (
      first.includes('trade') ||
      first.includes('deal') ||
      first.includes('three-team') ||
      first.includes('multi-team') ||
      first.includes('blockbuster') ||
      first.includes("let's start") ||
      first.includes("let's break") ||
      first.includes("let's talk") ||
      first.includes("let's dive") ||
      first.includes('breaking this down') ||
      first.includes('when i first saw') ||
      first.includes("i'll be honest") ||
      first.includes('welcome to') ||
      first.includes('in this trade') ||
      first.includes('this week') ||
      first.includes('what a ') ||
      first.includes('buckle up') ||
      (headlineLower.length > 0 && first.includes(headlineLower))
    );
  };

  let start = 0;
  while (
    start < Math.min(3, sentences.length - 1) &&
    looksLikeIntro(sentences[start]) &&
    !hasVerdict(sentences[start])
  ) {
    start++;
  }
  return sentences.slice(start).join(' ').trim();
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
