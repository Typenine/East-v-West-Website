/**
 * Stance Selector — Phase 1
 *
 * Selects an explicit stance for each bot before it writes a section.
 * The stance is layered ON TOP of the existing tone/style system — it does
 * not replace STYLE_SLIDERS, TONE_RULES, or the LLM system prompt. It
 * appends a short directive to the section constraints.
 *
 * Stances are personality-expressive frames that prevent the bots from
 * defaulting to the same neutral-observer voice every week.
 *
 * Mason and Westy may — and often will — pick different stances for the
 * same event, which creates natural disagreement without forcing it.
 */

import type { BotName, BotMemory } from './types';
import type { EventJudgment } from './judgment';
import { recordStanceUsed } from './memory';
import { getPhaseRules } from './episodes';

// ============ Stance catalog ============

export type Stance =
  | 'Historian'         // Pull from the past — precedent, patterns, franchise arcs
  | 'Prosecutor'        // Build the case against a team's decision or performance
  | 'Defense Attorney'  // Defend the underdog or the unpopular take
  | 'Rivalry Arsonist'  // Pour fuel on a real or emerging rivalry
  | 'Undertaker'        // Eulogize a team's season, a hot streak, a roster decision
  | 'Accountant'        // Pure value / efficiency analysis — no narrative fluff
  | 'Sicko Scout'       // Deep positional / dynasty angle; see what others miss
  | 'Hype Man'          // Pure energy — championship belt territory
  | 'Town Crier';       // Breaking news urgency; alarm bells; "everyone needs to hear this"

// ============ Selection inputs ============

export interface StanceSelectionInput {
  sectionType: string;
  episodeType: string;
  bot: BotName;
  judgment: EventJudgment;
  week: number;
  // Optional personality modifiers from evolved BotMemory
  personality?: {
    riskTolerance: number;
    dramaAppreciation: number;
    grudgeLevel: number;
    analyticalTrust: number;
    underdogAffinity: number;
    contrarianism: number;
  };
  // What stance was used for this team last week (avoid repeating)
  priorStance?: string;
}

// ============ Selection logic ============

/**
 * Select a stance for a bot given the section context.
 * Mason and Westy have different personalities so the same judgment input
 * can legitimately produce different stances.
 *
 * Priority order:
 *   1. Avoid repeating last week's stance for this team
 *   2. Let judgment's recommendedStance guide the choice
 *   3. Bot personality biases may override toward their natural voice
 *   4. Fallback = Town Crier (always safe, always has energy)
 */
export function selectStance(input: StanceSelectionInput): Stance {
  const {
    bot,
    judgment,
    sectionType,
    episodeType,
    personality,
    priorStance,
  } = input;

  // Phase 2: consult phase rules for preferred stances
  const phaseRules = getPhaseRules(episodeType);
  const phasePrefers = phaseRules.preferredStances as Stance[];

  const isEntertainer = bot === 'entertainer';
  const isAnalyst = bot === 'analyst';

  // Start from the judgment's recommendation
  let candidate = judgment.recommendedStance as Stance;

  // ── Bot-specific personality overrides ────────────────────────────────────

  // Phase 2: blood feud override — if rivalry is intense, push toward Rivalry Arsonist
  // regardless of bot personality (unless championship demands gravitas)
  const bloodFeud = judgment.rivalryScore >= 7;
  const highRivalry = judgment.rivalryScore >= 5;
  if (bloodFeud && judgment.stakes !== 'critical' && candidate !== 'Historian') {
    candidate = 'Rivalry Arsonist';
  }

  // Phase 2: if phase preferred stances exist and candidate is generic, prefer one
  if (phasePrefers.length > 0 && candidate === 'Town Crier' && !bloodFeud) {
    const notPrior = phasePrefers.find(s => s !== priorStance);
    if (notPrior) candidate = notPrior;
  }

  if (isEntertainer) {
    const drama = personality?.dramaAppreciation ?? 50;
    const grudge = personality?.grudgeLevel ?? 30;
    const risk = personality?.riskTolerance ?? 50;
    const contrarian = personality?.contrarianism ?? 40;

    // Entertainer loves drama and will amp it up
    if (!bloodFeud && drama > 60 && ['Town Crier', 'Prosecutor'].includes(candidate)) {
      candidate = highRivalry ? 'Rivalry Arsonist' : 'Hype Man';
    }
    // Grudge-holding entertainer becomes a prosecutor when frustrated
    if (grudge > 60 && judgment.sensitivity < 6) {
      candidate = 'Prosecutor';
    }
    // Contrarian entertainer takes the opposite stance when confident
    if (contrarian > 50 && risk > 60 && candidate === 'Prosecutor') {
      candidate = 'Defense Attorney'; // defend the unpopular team
    }
    // Low comedy + high stakes → historian (the entertainer can do gravitas)
    if (judgment.comedyValue <= 2 && judgment.stakes === 'critical') {
      candidate = 'Historian';
    }
    // High comedy → lean into Hype Man or Undertaker
    if (judgment.comedyValue >= 8 && candidate === 'Town Crier') {
      candidate = drama > 60 ? 'Undertaker' : 'Hype Man';
    }
  }

  if (isAnalyst) {
    const analytical = personality?.analyticalTrust ?? 60;
    const underdog = personality?.underdogAffinity ?? 0;
    const contrarian = personality?.contrarianism ?? -10;

    // Analyst defaults toward data-driven stances
    if (analytical > 70 && ['Town Crier', 'Hype Man'].includes(candidate)) {
      candidate = 'Accountant';
    }
    // Analyst takes the Defense Attorney stance when defending an underdog they believe in
    if (underdog < -10 && candidate === 'Defense Attorney') {
      candidate = 'Prosecutor'; // analyst is skeptical of underdogs
    }
    // Mildly contrarian analyst digs deeper than the obvious read
    if (contrarian > 30 && candidate === 'Accountant') {
      candidate = 'Sicko Scout';
    }
    // Championship → Historian; analyst loves precedent
    if (episodeType === 'championship') {
      candidate = 'Historian';
    }
    // Draft sections → always Sicko Scout for the analyst
    if (sectionType.includes('DraftGrade') || sectionType.includes('MockDraft')) {
      candidate = 'Sicko Scout';
    }
  }

  // ── Avoid repeating last week's stance ──────────────────────────────────
  if (priorStance && priorStance === candidate) {
    candidate = rotateStance(candidate, isEntertainer);
  }

  // ── Fallback guard ───────────────────────────────────────────────────────
  const VALID_STANCES: Stance[] = [
    'Historian', 'Prosecutor', 'Defense Attorney', 'Rivalry Arsonist',
    'Undertaker', 'Accountant', 'Sicko Scout', 'Hype Man', 'Town Crier',
  ];
  if (!VALID_STANCES.includes(candidate)) {
    candidate = 'Town Crier';
  }

  return candidate as Stance;
}

/** Rotate to an adjacent stance when the prior stance would repeat */
function rotateStance(current: Stance, preferDrama: boolean): Stance {
  const map: Record<Stance, Stance> = {
    'Historian':        'Prosecutor',
    'Prosecutor':       'Defense Attorney',
    'Defense Attorney': 'Rivalry Arsonist',
    'Rivalry Arsonist': 'Town Crier',
    'Undertaker':       preferDrama ? 'Rivalry Arsonist' : 'Historian',
    'Accountant':       'Sicko Scout',
    'Sicko Scout':      'Accountant',
    'Hype Man':         'Town Crier',
    'Town Crier':       preferDrama ? 'Hype Man' : 'Undertaker',
  };
  return map[current];
}

// ============ Stance instructions ============

/**
 * Returns 1-3 concise sentences the LLM should treat as additional constraints.
 * Appended to (not replacing) the existing constraints string.
 */
export function getStanceInstructions(stance: Stance, bot: BotName): string {
  const isEntertainer = bot === 'entertainer';

  const instructions: Record<Stance, { entertainer: string; analyst: string }> = {
    'Historian': {
      entertainer: `Frame this through the lens of history — what does this remind you of from previous seasons? What precedent does it set? Let the past make the present feel bigger.`,
      analyst:     `Ground your analysis in historical context. Reference prior-season patterns, franchise arcs, or statistical precedent. The past illuminates the present.`,
    },
    'Prosecutor': {
      entertainer: `Build the case. Present evidence, find the flaws, and deliver a verdict. Don't be a fair witness — pick a side and argue it with conviction.`,
      analyst:     `Systematically evaluate what went wrong or what the decision cost. Structure your critique: premise → evidence → verdict. No hedging.`,
    },
    'Defense Attorney': {
      entertainer: `Take the unpopular side. Defend the team or decision that everyone else is piling on. Find the mitigating factors and argue for reasonable doubt.`,
      analyst:     `Counter the prevailing narrative with data. What are people missing? What context exonerates or softens the verdict? Make the case the critics won't.`,
    },
    'Rivalry Arsonist': {
      entertainer: `Stoke the fire. Reference what's happened between these teams before, remind everyone why this one matters more than it looks, and make this feel personal. Great rivalries are built one grudge at a time. If there's championship history or a series being settled, name it.`,
      analyst:     `Surface the structural tension — H2H records, prior playoff meetings, contrasting win rates, and what the pattern says about how these franchises match up. Rivalries aren't accidents; explain what the data shows about why these teams keep finding each other in big spots.`,
    },
    'Undertaker': {
      entertainer: `Deliver the eulogy. A hot streak ended, a season is over, a trade cost too much — mourn it properly. Make it dramatic. Give it the sendoff it deserves.`,
      analyst:     `Diagnose the cause of death. What metrics pointed to this before it happened? What does this mean for the trajectory going forward? Be clinical, not mournful.`,
    },
    'Accountant': {
      entertainer: `Skip the drama — just do the math. What did each side actually pay? What's the projected return? Give the grade and move on. Let the numbers tell the story.`,
      analyst:     `Pure value analysis. Break down assets moved, project win-curve impact, assess opportunity cost. No narrative flourishes — just the ledger.`,
    },
    'Sicko Scout': {
      entertainer: `See what others missed. Find the overlooked player, the depth move that matters, the waiver add that shifts the season. Be the one who noticed.`,
      analyst:     `Go deep on dynasty implications. Age curves, positional scarcity, contract windows, draft capital value. This is the detailed stuff most analysts skip.`,
    },
    'Hype Man': {
      entertainer: `Championship belt energy. This team, this player, this decision deserves hype — give it to them. Celebrate what's working. Be genuinely excited.`,
      analyst:     `When the data backs the hype, say so without caveats. This is the rare moment where the numbers and the vibes align — acknowledge it clearly.`,
    },
    'Town Crier': {
      entertainer: `Breaking news energy. Urgency, alarms, everyone needs to hear this. What's the most important thing happening right now and why does it matter more than people realize?`,
      analyst:     `Lead with the signal, not the noise. Identify the most important data point of the week and make sure the audience understands why they should care.`,
    },
  };

  const entry = instructions[stance];
  return isEntertainer ? entry.entertainer : entry.analyst;
}

// ============ Full context builder ============

/**
 * Build the stance block to append to section constraints.
 * Records the stance in memory for next-week dedupe.
 */
export function buildStanceContext(
  stance: Stance,
  bot: BotName,
  mem: BotMemory,
  teamName?: string,
): string {
  // Persist for dedupe
  if (teamName) {
    recordStanceUsed(mem, teamName, stance);
  }

  const instructions = getStanceInstructions(stance, bot);
  return `\nYOUR STANCE THIS SECTION — ${stance.toUpperCase()}: ${instructions}`;
}

/**
 * Convenience: select a stance AND build the prompt block in one call.
 */
export function selectAndBuildStance(
  input: StanceSelectionInput,
  mem: BotMemory,
  teamName?: string,
): { stance: Stance; context: string } {
  const stance = selectStance(input);
  const context = buildStanceContext(stance, input.bot, mem, teamName);
  return { stance, context };
}
