/**
 * Archive Voice — Phase 4
 *
 * A special generation mode for ceremonial, legacy-focused content:
 * - Championship coronations and season-end retrospectives
 * - Hall of Fame blurbs and franchise history pages
 * - Record-book entries and rivalry retrospectives
 * - Award ceremony language
 *
 * DESIGN RULES:
 * - Uses verified facts from the context only. No hallucinated records or scores.
 * - More ceremonial and less joke-heavy than regular bot sections.
 * - Guardrails are active and treat factual inaccuracies as blocking.
 * - Can be voiced by Mason, Westy, Clancy, or a neutral Archivist voice.
 * - Never issues rulings or commissioner-sounding language.
 */

import { generateSection } from './llm/groq';
import { guardText } from './guardrails';
import type { BotName } from './types';

// ============ Archive Subject Types ============

export type ArchiveSubjectType =
  | 'championship'         // Season champion coronation
  | 'season_recap'         // Full season in review
  | 'record_entry'         // A league record being documented
  | 'rivalry_retrospective'// Historical look at a rivalry
  | 'franchise_arc'        // A team's multi-season story
  | 'hall_of_fame'         // HOF induction blurb for a player/team/moment
  | 'award_citation';      // Season award (MVP, ROY, etc.)

export interface ArchiveSubject {
  type: ArchiveSubjectType;
  /** Short title for this archive entry (used in prompts and headers) */
  title: string;
  /** Teams or players involved */
  subjects: string[];
  /**
   * Verified facts about this subject — ONLY include things that are confirmed
   * in the league data. The LLM is instructed to use ONLY these facts.
   */
  verifiedFacts: string;
  /** Optional season year for context */
  season?: number;
  /** Optional week number */
  week?: number;
}

export type ArchiveVoice = BotName | 'archivist';

// ============ System Prompts ============

const ARCHIVE_SYSTEM_PROMPTS: Record<ArchiveVoice, string> = {
  entertainer: `You are Mason Reed writing in archive/ceremonial mode. Dial back the hot takes. This is a permanent record — write with the gravitas of a Sports Illustrated cover story, not a hot-take radio show. You're still Mason, but you're speaking for history here. Be vivid, but be accurate. Only cite facts from the context.`,

  analyst: `You are Trent Weston (Westy) writing in archive/ceremonial mode. This is not a weekly take — this is for the permanent record. Write with the precision of an official statistical entry. Be analytical but allow yourself some genuine feeling — great moments deserve acknowledgment. Only cite facts from the context. No invented numbers.`,

  archivist: `You are the East v. West League Archivist — a neutral, official-sounding documentation voice. You are not Mason Reed or Trent Weston. You document events for the permanent record with authority and precision. You are thorough, accurate, and measured. You do NOT editorialize beyond what the record supports. You do NOT invent facts, scores, or records. You cite only what is present in the context provided. Your tone is ceremonial without being overwrought.`,
};

const ARCHIVE_TEMPERATURE: Record<ArchiveVoice, number> = {
  entertainer: 0.65, // Lower than normal Mason — more deliberate
  analyst: 0.50,     // Lower than normal Westy — archival precision
  archivist: 0.45,   // Most controlled voice
};

// ============ Archive Subject Prompts ============

const SUBJECT_PROMPTS: Record<ArchiveSubjectType, string> = {
  championship: `Document the championship. Name the champion, reference their path, note any records broken or history made. This is their crowning moment — honor it without exaggerating what the context supports.`,

  season_recap: `Provide a season-in-review entry. Summarize the arc of the season — who emerged, who faded, key turning points, and what this season added to the league's story. Reference only events that appear in the context.`,

  record_entry: `Document this record for the league archive. State what the record is, who set it, and when. Note whether it broke a previous record and what the new benchmark is. Be precise. Use only numbers from the context.`,

  rivalry_retrospective: `Write a retrospective on this rivalry. Reference their head-to-head record, defining moments, and how the rivalry has evolved. This should read like a chapter in a league history book. Use only facts from the context.`,

  franchise_arc: `Document this franchise's arc through the period covered in the context. Note their highs, lows, championships, and defining characteristics. This is their entry in the league's historical record.`,

  hall_of_fame: `Write a Hall of Fame induction entry — either for a player, a team's season, or a specific performance. Lead with the achievement, then explain its significance in league history. Short, precise, earned. No hyperbole beyond what the record supports.`,

  award_citation: `Write a formal award citation. State what the award is, who won it, and the specific statistical or narrative case for their selection. This will be read at the awards ceremony. Reference only facts from the context.`,
};

// ============ Core Generation Function ============

/**
 * Generate an archive blurb for a specific subject.
 *
 * @param subject  The verified facts and type of archive entry
 * @param context  The full league context string (standings, H2H, history)
 * @param voice    Which voice to use ('archivist' is default for neutrality)
 * @param maxTokens  Token limit — defaults conservatively to avoid length inflation
 * @returns  The generated archive text, or null if generation/guardrails fail
 */
export async function generateArchiveBlurb(
  subject: ArchiveSubject,
  context: string,
  voice: ArchiveVoice = 'archivist',
  maxTokens = 350,
): Promise<string | null> {
  const subjectPrompt = SUBJECT_PROMPTS[subject.type];
  const subjectRef = subject.subjects.length > 0
    ? `Subjects: ${subject.subjects.join(', ')}.`
    : '';
  const seasonRef = subject.season ? ` Season: ${subject.season}.` : '';
  const weekRef = subject.week ? ` Week: ${subject.week}.` : '';

  // Compact verified-facts block placed at the TOP of context so it's not buried
  const factsBlock = subject.verifiedFacts.trim()
    ? `\n=== VERIFIED FACTS FOR THIS ENTRY (use ONLY these) ===\n${subject.verifiedFacts.trim()}\n=== END VERIFIED FACTS ===\n`
    : '';

  const fullContext = `${factsBlock}\n${context.slice(0, 4000)}`;

  const constraints =
    `ARCHIVE ENTRY: "${subject.title}"\n` +
    `${subjectRef}${seasonRef}${weekRef}\n\n` +
    `${subjectPrompt}\n\n` +
    `CRITICAL: Use ONLY facts present in the VERIFIED FACTS block and the context above. ` +
    `Do NOT invent scores, records, statistics, or events. ` +
    `Do NOT claim things happened that are not in the context. ` +
    `Length: 3–5 sentences for most entry types. Championship entries may run 4–6 sentences. ` +
    `Write in archive/ceremonial register — measured, precise, historically aware.`;

  try {
    // For 'archivist' voice, we use analyst as the base persona (measured temp)
    // and override via system context. Mason/Westy voices use their own personas.
    const persona: BotName = voice === 'archivist' || voice === 'analyst' ? 'analyst' : 'entertainer';

    const raw = await generateSection({
      persona,
      sectionType: 'ArchiveBlurb',
      context: fullContext,
      constraints,
      maxTokens,
      thinkingBudget: 1024, // Light analysis — factual recall
    });

    const guarded = guardText(raw, { sectionType: 'ArchiveBlurb', logPrefix: `[Archive:${voice}]` });

    // Archive guardrail: reject if output is suspiciously short (< 60 chars = likely failure)
    if (guarded.trim().length < 60) {
      console.warn(`[Archive] Output too short (${guarded.length} chars) — rejecting`);
      return null;
    }

    // Archive guardrail: reject if output contains obvious hallucination markers
    // (specific numbers that couldn't have been in context given context length)
    const yearPattern = /\b(19\d{2}|20[0-1]\d|202[0-9])\b/g;
    const yearsInContext = (fullContext.match(yearPattern) ?? []).map(Number);
    const yearsInOutput = (guarded.match(yearPattern) ?? []).map(Number);
    const hallucinatedYears = yearsInOutput.filter(y => !yearsInContext.includes(y));
    if (hallucinatedYears.length > 0) {
      console.warn(`[Archive] Possible year hallucination detected: ${hallucinatedYears.join(', ')} — rejecting`);
      return null;
    }

    return guarded;
  } catch (err) {
    console.warn('[Archive] Generation failed (non-fatal):', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ============ Convenience: Championship Coronation ============

/**
 * Generate a championship coronation blurb — the highest-stakes archive entry.
 * Called automatically after championship week generation to document the champion.
 */
export async function generateChampionshipCoronation(
  champion: string,
  runnerUp: string,
  finalScore: { winner: number; loser: number },
  season: number,
  additionalFacts: string,
  voice: ArchiveVoice = 'archivist',
): Promise<string | null> {
  const subject: ArchiveSubject = {
    type: 'championship',
    title: `${season} East v. West Champion: ${champion}`,
    subjects: [champion, runnerUp],
    verifiedFacts: [
      `${champion} defeated ${runnerUp} in the ${season} championship.`,
      `Final score: ${champion} ${finalScore.winner.toFixed(1)}, ${runnerUp} ${finalScore.loser.toFixed(1)}.`,
      `Margin of victory: ${(finalScore.winner - finalScore.loser).toFixed(1)} points.`,
      additionalFacts,
    ].filter(Boolean).join('\n'),
    season,
  };

  return generateArchiveBlurb(subject, additionalFacts, voice, 400);
}

// ============ Convenience: Season Award Citation ============

/**
 * Generate a brief award citation for a season award.
 */
export async function generateAwardCitation(
  award: string,
  winner: string,
  verifiedFacts: string,
  season: number,
): Promise<string | null> {
  const subject: ArchiveSubject = {
    type: 'award_citation',
    title: `${season} ${award}: ${winner}`,
    subjects: [winner],
    verifiedFacts,
    season,
  };

  return generateArchiveBlurb(subject, verifiedFacts, 'archivist', 200);
}
