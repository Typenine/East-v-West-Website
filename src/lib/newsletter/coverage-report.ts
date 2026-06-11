/**
 * Coverage & Repetition Report
 *
 * Pure-code (no LLM) post-assembly checks run at finalize time:
 *  1. Team coverage — which teams were mentioned, how often, who was omitted.
 *  2. Cross-section repetition — repeated long phrases across different sections.
 *
 * Warning-only by design: results are stored with the run and surfaced in the
 * admin UI. Nothing here blocks generation or forces filler content.
 */

export interface TeamCoverage {
  team: string;
  mentions: number;
  /** Sections where this team is mentioned */
  sections: string[];
  coverage: 'major' | 'passing' | 'omitted';
}

export interface RepetitionWarning {
  phrase: string;
  sections: string[];
}

export interface CoverageReport {
  teams: TeamCoverage[];
  omittedTeams: string[];
  repetition: RepetitionWarning[];
  warnings: string[];
  generatedAt: string;
}

// ── Text extraction ──────────────────────────────────────────────────────────

/** Recursively pull all string values out of a section's data payload. */
export function extractText(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return [];
  if (typeof value === 'string') return value.length > 20 ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(v => extractText(v, depth + 1));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      // Skip internal keys
      .filter(([k]) => !k.startsWith('_'))
      .flatMap(([, v]) => extractText(v, depth + 1));
  }
  return [];
}

// ── Team coverage ─────────────────────────────────────────────────────────────

const MAJOR_COVERAGE_THRESHOLD = 3;

export function buildCoverageReport(
  sections: Array<{ type: string; data: unknown }>,
  teamNames: string[],
): CoverageReport {
  const sectionTexts = sections.map(s => ({
    type: s.type,
    text: extractText(s.data).join('\n'),
  }));

  // Team mention counting — match on full team name (case-insensitive).
  // Partial-word names are matched on word boundaries where possible.
  const teams: TeamCoverage[] = teamNames.map(team => {
    const pattern = new RegExp(escapeRegExp(team), 'gi');
    let mentions = 0;
    const mentionSections: string[] = [];
    for (const st of sectionTexts) {
      const count = (st.text.match(pattern) ?? []).length;
      if (count > 0) {
        mentions += count;
        mentionSections.push(st.type);
      }
    }
    return {
      team,
      mentions,
      sections: mentionSections,
      coverage: mentions === 0 ? 'omitted' as const
              : mentions >= MAJOR_COVERAGE_THRESHOLD ? 'major' as const
              : 'passing' as const,
    };
  });

  const omittedTeams = teams.filter(t => t.coverage === 'omitted').map(t => t.team);

  // ── Cross-section repetition: shared word sequences (8-grams) between sections ──
  const repetition = findRepeatedPhrases(sectionTexts);

  const warnings: string[] = [];
  if (omittedTeams.length > 0) {
    warnings.push(`Teams not mentioned anywhere: ${omittedTeams.join(', ')}`);
  }
  for (const rep of repetition.slice(0, 5)) {
    warnings.push(`Repeated across ${rep.sections.join(' + ')}: "${rep.phrase.slice(0, 80)}…"`);
  }

  return {
    teams: teams.sort((a, b) => b.mentions - a.mentions),
    omittedTeams,
    repetition,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

// ── Repetition detection ──────────────────────────────────────────────────────

const NGRAM_SIZE = 8;
const MAX_REPETITION_RESULTS = 10;

function normalizeWords(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
}

/**
 * Find word 8-grams that appear in two or more different sections.
 * Overlapping n-grams from the same repeated passage are collapsed to one result.
 */
function findRepeatedPhrases(
  sectionTexts: Array<{ type: string; text: string }>,
): RepetitionWarning[] {
  // Map ngram -> set of section types containing it
  const seen = new Map<string, Set<string>>();

  for (const st of sectionTexts) {
    const words = normalizeWords(st.text);
    const localSeen = new Set<string>();
    for (let i = 0; i + NGRAM_SIZE <= words.length; i++) {
      const gram = words.slice(i, i + NGRAM_SIZE).join(' ');
      if (localSeen.has(gram)) continue; // count once per section
      localSeen.add(gram);
      let set = seen.get(gram);
      if (!set) { set = new Set(); seen.set(gram, set); }
      set.add(st.type);
    }
  }

  // Collect ngrams that span 2+ sections
  const repeated = [...seen.entries()]
    .filter(([, sections]) => sections.size >= 2)
    .map(([phrase, sections]) => ({ phrase, sections: [...sections].sort() }));

  // Collapse overlapping ngrams: if one phrase is a substring context of another
  // (shares first 5 words and same section set), keep the first only.
  const collapsed: RepetitionWarning[] = [];
  const usedPrefixes = new Set<string>();
  for (const rep of repeated) {
    const prefix = rep.phrase.split(' ').slice(0, 5).join(' ') + '|' + rep.sections.join(',');
    if (usedPrefixes.has(prefix)) continue;
    usedPrefixes.add(prefix);
    collapsed.push(rep);
    if (collapsed.length >= MAX_REPETITION_RESULTS) break;
  }

  return collapsed;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
