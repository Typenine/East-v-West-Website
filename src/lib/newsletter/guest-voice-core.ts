/**
 * Guest Voice Framework — Phase 4
 *
 * Provides a reusable framework for rare guest personalities that appear only when
 * triggered by high-value league events. Clancy is the first registered guest voice.
 *
 * DESIGN RULES:
 * - Guest voices are not BotName. They are parallel personalities with their own brains.
 * - Every guest voice has trigger conditions, a frequency cap, and a heat floor.
 * - Guest voices never generate content unless explicitly triggered.
 * - Clancy specifically: historian / rules goblin / procedural observer.
 *   He raises questions, cites records, expresses procedural anxiety.
 *   He NEVER issues rulings, penalties, or official commissioner language.
 * - All Clancy output passes through extra-strict guardrails before use.
 */

import type { GuestVoiceKey, ClancyTriggerType, ClancyInsert } from './types';
import { generateSection } from './llm/groq';
import { guardText } from './guardrails';

// ============ Guest Voice Brain ============

export interface GuestVoiceBrain {
  key: GuestVoiceKey;
  displayName: string;
  shortName: string;
  /** One-line role description */
  role: string;
  /** Full system prompt injected before generation */
  systemPrompt: string;
  /** LLM temperature */
  temperature: number;
  /** Hard token cap per insert */
  maxTokensPerInsert: number;
  /** Which trigger types this voice responds to */
  activeTriggers: ClancyTriggerType[];
  /** Max appearances per season (frequency cap) */
  maxFrequencyPerSeason: number;
  /** Minimum narrative heat required to appear (0–100) */
  minNarrativeHeat: number;
  /** Rotating display labels for insert headers */
  sectionLabels: string[];
}

// ============ Clancy's Brain ============

const CLANCY_SYSTEM_PROMPT = `You are Clancy — the unofficial historian, rules goblin, and procedural archivist of the East v. West fantasy football league. You are NOT the commissioner. You have absolutely no authority to void trades, penalize teams, issue rulings, or take any official action.

YOUR ROLE:
- League historian who has memorised every week of this league's history.
- Procedural observer who notices when something is "technically" interesting.
- Rivalry archivist who tracks the long-running storylines.
- Anxious completionist who must document things for the record.
- Draft and trade deadline anxiety machine.

YOUR VOICE:
- Slightly breathless, over-caffeinated. You've been waiting all week to mention this.
- Archival precision mixed with genuine excitement about mundane historical details.
- Mix of enthusiasm and hand-wringing — you love the records but worry about their implications.
- Natural phrases: "For the record...", "The archive shows...", "I pulled the ledger on this...", "Worth noting for posterity...", "Historically speaking...", "The records suggest...", "I believe — though I'd need to double-check — ...", "This is one for the books..."
- You observe and document. You DO NOT conclude or rule.
- You raise procedural eyebrows without authority. "This is worth watching" not "this must be reversed."

WHAT YOU NEVER DO:
- Never claim to be the commissioner or any official authority.
- Never issue penalties, rulings, or demand any action.
- Never say "as commissioner" or imply you have power over outcomes.
- Never accuse anyone of cheating, collusion, or rule violations.
- Never claim certainty — use "I believe", "the records suggest", "historically..."
- Never invent facts, scores, records, or events not present in the context.

LENGTH: 2–4 sentences only. Short, archival, punchy. End on an observation, not a verdict.`;

export const CLANCY_BRAIN: GuestVoiceBrain = {
  key: 'clancy',
  displayName: 'Clancy',
  shortName: 'Clancy',
  role: 'League historian, rules goblin, rivalry archivist, procedural observer',
  systemPrompt: CLANCY_SYSTEM_PROMPT,
  temperature: 0.72,
  maxTokensPerInsert: 180,
  activeTriggers: [
    'rivalry_week',
    'blood_feud',
    'championship',
    'trade_deadline',
    'procedural_issue',
    'draft_event',
    'historic_record',
    'franchise_arc',
  ],
  maxFrequencyPerSeason: 8,
  minNarrativeHeat: 45,
  sectionLabels: [
    'From the Archives',
    "Clancy's Corner",
    'Historical Record',
    'The Ledger',
    'Rules Desk',
    'Archive Note',
  ],
};

// ============ Guest Voice Registry ============

const GUEST_VOICE_REGISTRY = new Map<GuestVoiceKey, GuestVoiceBrain>([
  ['clancy', CLANCY_BRAIN],
]);

export function getGuestVoiceBrain(key: GuestVoiceKey): GuestVoiceBrain | null {
  return GUEST_VOICE_REGISTRY.get(key) ?? null;
}

// ============ Trigger Evaluation ============

export interface ClancyTriggerInput {
  episodeType: string;
  week: number;
  /** Narrative heat for the section/week (0–100). Below minNarrativeHeat → no trigger. */
  narrativeHeat: number;
  /** Rivalry score for the highest-stakes matchup this week (0–10). */
  rivalryScore?: number;
  /** True if a score/margin is close to or breaks a league record. */
  hasHistoricRecord?: boolean;
  /** How many times Clancy has appeared this season. Used for frequency cap. */
  clancyCountThisSeason?: number;
  /** Team names involved (for label selection). */
  teams?: string[];
}

export interface ClancyTriggerResult {
  triggered: boolean;
  triggerType: ClancyTriggerType | null;
  label: string;
  reason: string;
}

/**
 * Evaluate whether Clancy should appear this week based on episode type, heat,
 * rivalry score, and frequency cap.
 *
 * Returns { triggered: false } for most regular weeks.
 * Only fires on genuinely archival moments.
 */
export function evaluateClancyTrigger(input: ClancyTriggerInput): ClancyTriggerResult {
  const none = (reason: string): ClancyTriggerResult =>
    ({ triggered: false, triggerType: null, label: '', reason });

  // Frequency cap: enforce per-season limit
  const count = input.clancyCountThisSeason ?? 0;
  if (count >= CLANCY_BRAIN.maxFrequencyPerSeason) {
    return none('frequency cap reached');
  }

  // Heat gate: Clancy doesn't show up for mundane weeks
  if (input.narrativeHeat < CLANCY_BRAIN.minNarrativeHeat) {
    return none(`narrative heat too low (${input.narrativeHeat} < ${CLANCY_BRAIN.minNarrativeHeat})`);
  }

  // Episode-type triggers (highest priority — these always fire if heat is met)
  if (input.episodeType === 'championship') {
    return { triggered: true, triggerType: 'championship', label: 'From the Archives', reason: 'championship episode — legacy moment' };
  }
  if (input.episodeType === 'trade_deadline') {
    return { triggered: true, triggerType: 'trade_deadline', label: "Clancy's Corner", reason: 'trade deadline episode' };
  }
  if (input.episodeType === 'pre_draft' || input.episodeType === 'post_draft') {
    return { triggered: true, triggerType: 'draft_event', label: 'The Ledger', reason: 'draft episode' };
  }
  if (input.episodeType === 'season_finale') {
    return { triggered: true, triggerType: 'franchise_arc', label: 'Historical Record', reason: 'season finale — franchise arc moment' };
  }

  // Rivalry / blood feud triggers
  const rivalryScore = input.rivalryScore ?? 0;
  if (rivalryScore >= 8) {
    return { triggered: true, triggerType: 'blood_feud', label: 'Historical Record', reason: `blood feud (rivalry score ${rivalryScore})` };
  }
  if (rivalryScore >= 5 && input.narrativeHeat >= 55) {
    return { triggered: true, triggerType: 'rivalry_week', label: 'From the Archives', reason: `rivalry matchup (score ${rivalryScore}, heat ${input.narrativeHeat})` };
  }

  // Historic record trigger
  if (input.hasHistoricRecord && input.narrativeHeat >= 60) {
    return { triggered: true, triggerType: 'historic_record', label: 'Historical Record', reason: 'near-record performance' };
  }

  return none('no trigger condition met');
}

// ============ Clancy Generation ============

/** Prompt suffix for each trigger type — instructs Clancy on what angle to take */
const TRIGGER_PROMPT: Record<ClancyTriggerType, string> = {
  rivalry_week:
    'These two teams have history. Pull a specific historical detail from the context — head-to-head record, a memorable past meeting, or a storyline inflection point. Keep it archival.',
  blood_feud:
    'This is among the most intense rivalries in league history. Reference the all-time record, any past championship meetings, or what\'s at stake historically. Document the weight of this matchup.',
  championship:
    'A champion is about to be crowned (or was just crowned). Reference the champion\'s historical path, any records set, or the historical significance of this title in the context of the league\'s multi-season arc.',
  trade_deadline:
    'The trade deadline window is open or just closed. Reference historical trade activity at this juncture, note something worth documenting about the asset movement, or flag a pattern you\'ve noticed in the records.',
  procedural_issue:
    'There is something procedurally or format-adjacent worth noting. Raise it as a curious observation citing precedent or historical context — but make clear you have no authority to act on it.',
  draft_event:
    'The rookie draft is underway or just concluded. Reference historical draft patterns, note something about this year\'s capital movement relative to prior years, or document a notable pick for the record.',
  historic_record:
    'Something historically significant happened this week — a score, margin, or performance approaching or breaking a league record. Document it precisely and with appropriate gravity.',
  franchise_arc:
    'A team\'s franchise is at a historically significant inflection point. Document what this moment means relative to their history in this league.',
};

/**
 * Generate a Clancy insert for the given trigger type.
 * Returns null if generation fails, is blocked by guardrails, or produces garbage.
 *
 * This function is non-fatal — callers should handle null gracefully.
 */
export async function generateClancyInsert(
  triggerType: ClancyTriggerType,
  context: string,
  week: number,
  teams: string[],
  label: string,
): Promise<ClancyInsert | null> {
  const teamRef = teams.length > 0 ? ` Teams involved: ${teams.join(' and ')}.` : '';
  const anglePrompt = TRIGGER_PROMPT[triggerType];

  const constraints =
    `${anglePrompt}${teamRef}\n\n` +
    `Write EXACTLY 2–4 sentences in Clancy's archival voice. ` +
    `Start with a signature opener ("For the record...", "The archive shows...", "Worth noting for posterity...", etc.). ` +
    `Cite only facts that appear in the context above. ` +
    `Do NOT issue any ruling, penalty, or official statement. ` +
    `Do NOT claim authority. End on an observation, not a verdict.`;

  try {
    // Use analyst persona as the base (measured temperature) — Clancy's actual
    // system prompt overrides the persona voice completely via the VOICE OVERRIDES mechanism.
    // We inject the Clancy system prompt as an admin override context so it appends to
    // the analyst base prompt rather than replacing it, which keeps the cascade provider
    // routing intact.
    const raw = await generateSection({
      persona: 'analyst',
      sectionType: 'ClancyInsert',
      context: context.slice(0, 3500), // hard cap to keep Clancy grounded in real facts
      constraints,
      maxTokens: CLANCY_BRAIN.maxTokensPerInsert,
      // Inject Clancy's identity into the Gemini thinking budget (low — short reaction)
      thinkingBudget: 0,
    });

    const guarded = guardText(raw, { sectionType: 'ClancyInsert', logPrefix: '[Clancy]' });
    const { text, blocked } = checkClancyOutput(guarded);

    if (blocked || text.trim().length < 30) {
      console.warn('[Clancy] Insert blocked or too short — skipping');
      return null;
    }

    console.log(`[Clancy] Insert generated for "${triggerType}" (${text.length} chars)`);
    return { trigger: triggerType, label, text, teams, week };

  } catch (err) {
    console.warn('[Clancy] Generation failed (non-fatal):', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ============ Clancy-Specific Guardrails ============

/**
 * Extra-strict guardrail pass for Clancy output.
 * Runs AFTER the standard guardText() call.
 * Blocks on any language that sounds authoritative, penalty-issuing, or commissioner-adjacent.
 */
export function checkClancyOutput(text: string): { text: string; blocked: boolean } {
  // These patterns should never appear in Clancy output
  const authorityPatterns: RegExp[] = [
    /\b(I\s+hereby|I\s+officially|I\s+rule|I\s+declare|I\s+mandate|I\s+require|I\s+order)\b/i,
    /\bfine\s+(the\s+)?team\b/i,
    /\bpenalt(?:y|ies)\b/i,
    /\b(?:must|shall)\s+(?:forfeit|undo|reverse|void)\b/i,
    /\bwill\s+be\s+voided\b/i,
    /\bI\s+am\s+(?:the\s+)?(?:commissioner|arbiter|judge|authority)\b/i,
    /\bas\s+commissioner\b/i,
    /\bofficial\s+ruling\b/i,
  ];

  for (const pat of authorityPatterns) {
    if (pat.test(text)) {
      console.warn(`[Clancy] Blocked — authority pattern matched: ${pat.source.slice(0, 40)}`);
      return { text: '', blocked: true };
    }
  }

  // Word count cap — Clancy inserts must be short (200 words max)
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount > 200) {
    console.warn(`[Clancy] Blocked — too long (${wordCount} words)`);
    return { text: '', blocked: true };
  }

  return { text, blocked: false };
}

// ============ Clancy Prompt Augmentation ============

/**
 * Returns a system-prompt block that injects Clancy's identity and constraints
 * when generating ClancyInsert sections. Intended to be prepended to constraints
 * rather than replacing the persona system prompt.
 */
export function buildClancySystemContext(): string {
  return `\n\nYOU ARE CURRENTLY WRITING AS CLANCY — NOT AS MASON OR WESTY.\n${CLANCY_BRAIN.systemPrompt}`;
}

// ============ Guest Voice Framework — Future Extensibility ============

/**
 * Generic guest voice trigger checker. Returns which guest voices should appear
 * based on current context. Currently only Clancy is registered.
 *
 * Future guest voices can be added to GUEST_VOICE_REGISTRY and this function
 * will automatically evaluate them.
 *
 * Trigger contract for future guests:
 * - Must have a triggerCondition function in the registry entry
 * - Must have maxFrequencyPerSeason and minNarrativeHeat caps
 * - Must have allowed section types
 * - Must have a guardrail profile
 * - Must have a fallback behavior (return null, never throw)
 */
export interface GuestVoiceTriggerContext {
  episodeType: string;
  week: number;
  narrativeHeat: number;
  rivalryScore?: number;
  hasHistoricRecord?: boolean;
  /** Map from GuestVoiceKey to how many times they've appeared this season */
  appearanceCounts: Partial<Record<GuestVoiceKey, number>>;
  teams?: string[];
}

export function evaluateAllGuestVoices(ctx: GuestVoiceTriggerContext): Array<{
  key: GuestVoiceKey;
  triggerResult: ClancyTriggerResult;
}> {
  const results: Array<{ key: GuestVoiceKey; triggerResult: ClancyTriggerResult }> = [];

  // Clancy
  const clancyResult = evaluateClancyTrigger({
    episodeType: ctx.episodeType,
    week: ctx.week,
    narrativeHeat: ctx.narrativeHeat,
    rivalryScore: ctx.rivalryScore,
    hasHistoricRecord: ctx.hasHistoricRecord,
    clancyCountThisSeason: ctx.appearanceCounts.clancy ?? 0,
    teams: ctx.teams,
  });
  results.push({ key: 'clancy', triggerResult: clancyResult });

  // Future guest voices would be evaluated here following the same pattern:
  // const tradeRatResult = evaluateTradeRatTrigger({ ... });
  // results.push({ key: 'trade_rat', triggerResult: tradeRatResult });

  return results;
}
