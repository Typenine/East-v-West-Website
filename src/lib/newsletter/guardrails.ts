/**
 * Guardrails Module — Phase 1
 *
 * Soft validation of LLM output before it is used in the newsletter.
 * Phase 1 is warning-only: output is never silently discarded unless a
 * high-severity block rule fires. All warnings are logged to the server console.
 *
 * Integration: call checkOutput() after generateSection() in compose.ts /
 * compose-step.ts. No extra LLM calls; all checks are heuristic.
 */

// ============ Types ============

export type GuardrailSeverity = 'low' | 'medium' | 'high';

export interface GuardrailWarning {
  rule: string;
  severity: GuardrailSeverity;
  /** The offending snippet (truncated to 120 chars) */
  snippet: string;
  suggestion?: string;
}

export interface GuardrailResult {
  /** The (possibly unchanged) output text */
  text: string;
  warnings: GuardrailWarning[];
  /** True only when a high-severity block fires and the text was replaced */
  blocked: boolean;
}

// ============ Phase 3: Runtime banned phrases ============
// Loaded from the DB phrase_pools table (pool key 'banned_global') at generation time.
// Checked as a low-severity rule alongside the hardcoded rules.

let _runtimeBannedPhrases: string[] = [];

/**
 * Set the runtime banned phrase list from admin phrase pool settings.
 * Called by the newsletter API route after loading from DB.
 * Empty array or null clears any previously set list.
 */
export function setRuntimeBannedPhrases(phrases: string[] | null | undefined): void {
  _runtimeBannedPhrases = phrases ?? [];
}

/** Returns the current runtime banned phrases (for testing/inspection). */
export function getRuntimeBannedPhrases(): string[] {
  return _runtimeBannedPhrases;
}

// ============ Rule definitions ============

interface Rule {
  id: string;
  severity: GuardrailSeverity;
  description: string;
  // Return the offending snippet, or null if clean
  check: (text: string, sectionType?: string) => string | null;
  suggestion?: string;
}

// Regex helpers
const COMMISSIONER_PATTERNS = [
  /\bofficial\s+ruling\b/i,
  /\bas\s+commissioner\b/i,
  /\bi('m|\sam)\s+penaliz/i,
  /\bcommissioner\s+(has|will|should|must)\b/i,
  /\bvoid\s+(?:the\s+)?trade\b/i,
  /\bforce\s+(?:a\s+)?trade\b/i,
];

const COLLUSION_PATTERNS = [
  /\b(collud(ing|e|ed)|colluded)\b/i,
  /\bcheating\b/i,
  /\b(rigged|rigging)\b/i,
  /\bsuspicious\s+(deal|trade|activity)\b/i,
  /\bunder\s+the\s+table\b/i,
];

const RULE_CLAIM_PATTERNS = [
  /\bthe\s+rules?\s+(say|state|require|mandate|forbid)\b/i,
  /\bper\s+(?:the\s+)?(?:league\s+)?rules?\b/i,
  /\brule\s+\d+\b/i,
];

const PERSONAL_ATTACK_PATTERNS = [
  /\b(?:the\s+)?owner\s+is\s+(?:a\s+)?(idiot|moron|terrible|incompetent|clueless|dumb)\b/i,
  /\b(stupidest?|dumbest?|worst)\s+(?:owner|manager|team|move)\b/i,
];

const SECTION_WORD_LIMITS: Record<string, number> = {
  Intro: 450,
  FinalWord: 350,
  Blurt: 80,
  'Hot Take': 100,
  'Trade Grade': 400,
  'Matchup Recap': 300,
  WaiversAndFA: 350,
  Spotlight: 400,
  Forecast: 400,
};

const ALL_CAPS_THRESHOLD = 5; // consecutive all-caps words that flag abuse

const RULES: Rule[] = [
  {
    id: 'commissioner-language',
    severity: 'high',
    description: 'Sounds like an official commissioner ruling',
    check: (text) => {
      for (const pat of COMMISSIONER_PATTERNS) {
        const m = text.match(pat);
        if (m) return m[0];
      }
      return null;
    },
    suggestion: 'Remove language that implies official authority over the league.',
  },
  {
    id: 'collusion-accusation',
    severity: 'high',
    description: 'Unsupported cheating or collusion accusation',
    check: (text) => {
      for (const pat of COLLUSION_PATTERNS) {
        const m = text.match(pat);
        if (m) return m[0];
      }
      return null;
    },
    suggestion: 'Drop the accusation. Commentary on suspicious-looking trades should stay speculative ("eyebrow-raising" vs "cheating").',
  },
  {
    id: 'unsupported-rule-claim',
    severity: 'medium',
    description: 'Makes a specific rule claim that may be unsupported',
    check: (text) => {
      for (const pat of RULE_CLAIM_PATTERNS) {
        const m = text.match(pat);
        if (m) return m[0];
      }
      return null;
    },
    suggestion: 'Only cite rules that were explicitly provided in the context string.',
  },
  {
    id: 'personal-attack',
    severity: 'high',
    description: 'Direct personal attack on a manager/owner',
    check: (text) => {
      for (const pat of PERSONAL_ATTACK_PATTERNS) {
        const m = text.match(pat);
        if (m) return m[0];
      }
      return null;
    },
    suggestion: 'Criticize the team or decision, not the person.',
  },
  {
    id: 'excessive-length',
    severity: 'low',
    description: 'Section output exceeds recommended word count',
    check: (text, sectionType) => {
      if (!sectionType) return null;
      const limit = SECTION_WORD_LIMITS[sectionType];
      if (!limit) return null;
      const words = text.trim().split(/\s+/).length;
      if (words > limit) return `${words} words (limit ${limit})`;
      return null;
    },
    suggestion: 'Trim to fit the section word budget.',
  },
  {
    id: 'all-caps-abuse',
    severity: 'low',
    description: 'Excessive consecutive ALL CAPS words',
    check: (text) => {
      const m = text.match(/\b([A-Z]{3,}\s+){5,}/);
      if (m) return m[0].trim().slice(0, 60);
      return null;
    },
    suggestion: 'Use italics/emphasis sparingly; all-caps shouting degrades readability.',
  },
  {
    id: 'pile-on',
    severity: 'medium',
    description: 'Single team mentioned negatively 4+ times in short text',
    check: (text) => {
      // Extract all team-like capitalized names followed by negative language
      const negative = /\b(lost|struggling|bad|terrible|awful|cooked|imploding|falling apart|collapse)\b/gi;
      const negMatches = [...text.matchAll(negative)];
      if (negMatches.length >= 4 && text.length < 600) {
        return `${negMatches.length} negative mentions in ${text.length} chars`;
      }
      return null;
    },
    suggestion: 'Spread attention across multiple teams or soften repeated negative takes.',
  },
];

// ============ Core checker ============

/**
 * Run all guardrail rules against generated text.
 * Never throws. Returns the original text unless a high-severity block fires,
 * in which case `blocked` is true and `text` becomes an empty fallback marker.
 */
export function checkOutput(
  text: string,
  opts: { sectionType?: string; logPrefix?: string } = {},
): GuardrailResult {
  const { sectionType, logPrefix = '[Guardrails]' } = opts;
  const warnings: GuardrailWarning[] = [];

  for (const rule of RULES) {
    try {
      const snippet = rule.check(text, sectionType);
      if (snippet) {
        const w: GuardrailWarning = {
          rule: rule.id,
          severity: rule.severity,
          snippet: snippet.slice(0, 120),
          suggestion: rule.suggestion,
        };
        warnings.push(w);
        console.warn(
          `${logPrefix} [${rule.severity.toUpperCase()}] ${rule.id}: "${w.snippet}"${rule.suggestion ? ` — ${rule.suggestion}` : ''}`,
        );
      }
    } catch {
      // Never let a guardrail bug break generation
    }
  }

  // Phase 3: check admin-defined banned phrases (low severity, non-blocking)
  if (_runtimeBannedPhrases.length > 0) {
    const lower = text.toLowerCase();
    for (const banned of _runtimeBannedPhrases) {
      if (banned.trim().length < 3) continue;
      if (lower.includes(banned.toLowerCase().trim())) {
        warnings.push({
          rule: 'admin-banned-phrase',
          severity: 'low',
          snippet: banned.slice(0, 80),
          suggestion: `Admin has flagged this phrase as banned: "${banned}". Rephrase.`,
        });
        console.warn(`${logPrefix} [LOW] admin-banned-phrase: "${banned.slice(0, 60)}"`);
        break; // one warning per call — don't flood logs
      }
    }
  }

  const hasHighBlock = warnings.some(
    w => w.severity === 'high' && (w.rule === 'commissioner-language' || w.rule === 'collusion-accusation'),
  );

  if (hasHighBlock) {
    console.error(`${logPrefix} HIGH-SEVERITY block fired — replacing output with safe fallback.`);
    return {
      text: '[Content removed by guardrails — please regenerate this section.]',
      warnings,
      blocked: true,
    };
  }

  return { text, warnings, blocked: false };
}

/**
 * Convenience wrapper: run guardrails and return the (possibly blocked) text.
 * Warnings are already logged inside checkOutput().
 */
export function guardText(
  text: string,
  opts: { sectionType?: string; logPrefix?: string } = {},
): string {
  return checkOutput(text, opts).text;
}

/**
 * Returns a compact summary of warnings for storage/debugging (no secrets).
 */
export function summarizeWarnings(warnings: GuardrailWarning[]): string {
  if (warnings.length === 0) return 'clean';
  return warnings
    .map(w => `${w.rule}(${w.severity})`)
    .join(', ');
}
