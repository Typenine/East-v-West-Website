/**
 * Coverage & Repetition Report
 *
 * Pure-code post-assembly checks:
 *  1. Analytical team coverage — distinguishes substantive analysis from a score,
 *     roster, ranking, or passing name mention.
 *  2. Cross-section repetition — repeated long phrases across sections.
 *
 * Warning-only by design. The report helps the editor see who received actual
 * analysis without forcing filler into an issue where a team was not newsworthy.
 */

export type CoverageLevel = 'substantive' | 'passing' | 'factual_only' | 'omitted';

export interface TeamCoverage {
  team: string;
  mentions: number;
  /** Sections containing any mention of the team. */
  sections: string[];
  /** Sections containing explanatory/evaluative analysis of the team. */
  analyticalSections: string[];
  factualMentions: number;
  analyticalMentions: number;
  analysisScore: number;
  coverage: CoverageLevel;
}

export interface RepetitionWarning {
  phrase: string;
  sections: string[];
}

export interface CoverageReport {
  teams: TeamCoverage[];
  /** Teams receiving no substantive or passing analysis. */
  omittedTeams: string[];
  factualOnlyTeams: string[];
  repetition: RepetitionWarning[];
  warnings: string[];
  generatedAt: string;
}

/** Recursively pull all string values out of a section's data payload. */
export function extractText(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return [];
  if (typeof value === 'string') return value.length > 10 ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(v => extractText(v, depth + 1));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !k.startsWith('_'))
      .flatMap(([, v]) => extractText(v, depth + 1));
  }
  return [];
}

const ANALYTICAL_MARKERS = /\b(?:because|which means|that means|why|therefore|however|but|despite|although|going forward|rest of season|long[- ]term|short[- ]term|sustainable|unsustainable|regression|ceiling|floor|process|roster construction|lineup|depth|advantage|weakness|strength|risk|opportunity|impact|changes?|matters?|suggests?|indicates?|explains?|outlook|value|trend|trajectory|expectation|overperformed|underperformed)\b/i;
const OPINION_MARKERS = /\b(?:i think|i believe|i'm buying|i'm selling|i trust|i don't trust|should|needs? to|has to|favorite|contender|pretender|dangerous|overrated|underrated|winner|loser|steal|reach|fade|bet on)\b/i;
const FACT_ONLY_PATTERNS = /\b\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\s*(?:pts?|points?|faab)\b|\b(?:qb|rb|wr|te)\d?\s*:/i;
const ANALYTICAL_SECTION_TYPES = /Recap|Trades|Waivers|Spotlight|PowerRankings|Forecast|DraftGrade|SeasonPreview|FinalWord|Intro/i;

function sentenceFragments(text: string): string[] {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+|\s+[—–-]\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function occurrences(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function classifyFragment(fragment: string, sectionType: string): { analytical: boolean; factual: boolean; score: number } {
  const words = fragment.split(/\s+/).filter(Boolean).length;
  const hasAnalysisMarker = ANALYTICAL_MARKERS.test(fragment) || OPINION_MARKERS.test(fragment);
  const factual = FACT_ONLY_PATTERNS.test(fragment);
  const inAnalyticalSection = ANALYTICAL_SECTION_TYPES.test(sectionType);

  let score = 0;
  if (hasAnalysisMarker) score += 2;
  if (inAnalyticalSection && words >= 16) score += 1;
  if (words >= 28) score += 1;
  if (factual && !hasAnalysisMarker && words <= 18) score = Math.max(0, score - 1);

  return { analytical: score >= 2, factual, score };
}

export function buildCoverageReport(
  sections: Array<{ type: string; data: unknown }>,
  teamNames: string[],
): CoverageReport {
  const sectionTexts = sections.map((section, index) => ({
    key: `${section.type}#${index}`,
    type: section.type,
    text: extractText(section.data).join('\n'),
  }));

  const teams: TeamCoverage[] = teamNames.map(team => {
    const teamPattern = new RegExp(escapeRegExp(team), 'gi');
    const sectionsMentioned = new Set<string>();
    const analyticalSections = new Set<string>();
    let mentions = 0;
    let factualMentions = 0;
    let analyticalMentions = 0;
    let analysisScore = 0;

    for (const section of sectionTexts) {
      const count = occurrences(section.text, teamPattern);
      if (count === 0) continue;
      mentions += count;
      sectionsMentioned.add(section.type);

      for (const fragment of sentenceFragments(section.text)) {
        if (!teamPattern.test(fragment)) {
          teamPattern.lastIndex = 0;
          continue;
        }
        teamPattern.lastIndex = 0;
        const classification = classifyFragment(fragment, section.type);
        if (classification.factual) factualMentions++;
        if (classification.analytical) {
          analyticalMentions++;
          analysisScore += classification.score;
          analyticalSections.add(section.type);
        }
      }
    }

    const coverage: CoverageLevel = analyticalMentions >= 2 || analysisScore >= 5
      ? 'substantive'
      : analyticalMentions === 1
        ? 'passing'
        : mentions > 0
          ? 'factual_only'
          : 'omitted';

    return {
      team,
      mentions,
      sections: [...sectionsMentioned],
      analyticalSections: [...analyticalSections],
      factualMentions,
      analyticalMentions,
      analysisScore,
      coverage,
    };
  });

  const omittedTeams = teams
    .filter(t => t.coverage === 'omitted')
    .map(t => t.team);
  const factualOnlyTeams = teams
    .filter(t => t.coverage === 'factual_only')
    .map(t => t.team);
  const repetition = findRepeatedPhrases(sectionTexts.map(({ type, text }) => ({ type, text })));

  const warnings: string[] = [];
  if (omittedTeams.length > 0) warnings.push(`No coverage at all: ${omittedTeams.join(', ')}`);
  if (factualOnlyTeams.length > 0) {
    warnings.push(`Named but not analyzed: ${factualOnlyTeams.join(', ')}`);
  }
  for (const rep of repetition.slice(0, 5)) {
    warnings.push(`Repeated across ${rep.sections.join(' + ')}: "${rep.phrase.slice(0, 80)}…"`);
  }

  const coverageOrder: Record<CoverageLevel, number> = {
    substantive: 0,
    passing: 1,
    factual_only: 2,
    omitted: 3,
  };

  return {
    teams: teams.sort((a, b) => coverageOrder[a.coverage] - coverageOrder[b.coverage] || b.analysisScore - a.analysisScore || b.mentions - a.mentions),
    omittedTeams,
    factualOnlyTeams,
    repetition,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

const NGRAM_SIZE = 8;
const MAX_REPETITION_RESULTS = 10;

function normalizeWords(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
}

function findRepeatedPhrases(
  sectionTexts: Array<{ type: string; text: string }>,
): RepetitionWarning[] {
  const seen = new Map<string, Set<string>>();

  for (const section of sectionTexts) {
    const words = normalizeWords(section.text);
    const localSeen = new Set<string>();
    for (let i = 0; i + NGRAM_SIZE <= words.length; i++) {
      const gram = words.slice(i, i + NGRAM_SIZE).join(' ');
      if (localSeen.has(gram)) continue;
      localSeen.add(gram);
      const set = seen.get(gram) ?? new Set<string>();
      set.add(section.type);
      seen.set(gram, set);
    }
  }

  const repeated = [...seen.entries()]
    .filter(([, sectionSet]) => sectionSet.size >= 2)
    .map(([phrase, sectionSet]) => ({ phrase, sections: [...sectionSet].sort() }));

  const collapsed: RepetitionWarning[] = [];
  const usedPrefixes = new Set<string>();
  for (const rep of repeated) {
    const prefix = `${rep.phrase.split(' ').slice(0, 5).join(' ')}|${rep.sections.join(',')}`;
    if (usedPrefixes.has(prefix)) continue;
    usedPrefixes.add(prefix);
    collapsed.push(rep);
    if (collapsed.length >= MAX_REPETITION_RESULTS) break;
  }
  return collapsed;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
