/**
 * Fact-Audit Pass
 *
 * Post-generation LLM pass that extracts factual claims from a staged
 * newsletter (scores, records, projections, transactions) and classifies
 * each by risk so a human can spot-check the high-risk ones before publish.
 *
 * Uses Gemini Flash (2.5, falling back to 2.0) — cheap, fast, and a
 * different model family than the one that wrote the content, which makes
 * it less likely to rubber-stamp its own hallucinations.
 *
 * Advisory-only by design: never blocks publish, never edits content.
 * The result is stored on the generation run (generation_runs.fact_audit)
 * and surfaced in the admin editor.
 */

import { generateWithGeminiProvider } from './llm/providers/gemini-provider';
import { generateWithGemini20Provider } from './llm/providers/gemini20-provider';
import { extractText } from './coverage-report';

export type ClaimType = 'score' | 'record' | 'projection' | 'stat' | 'transaction' | 'other';
export type ClaimRisk = 'high' | 'medium' | 'low';

export interface FactClaim {
  /** Section type the claim came from (e.g. "recaps", "powerRankings") */
  section: string;
  /** The claim text, quoted or closely paraphrased from the newsletter */
  claim: string;
  type: ClaimType;
  risk: ClaimRisk;
  /** Why the auditor flagged this risk level */
  reason: string;
}

export interface FactAuditResult {
  claims: FactClaim[];
  highRiskCount: number;
  mediumRiskCount: number;
  sectionsAudited: number;
  model: string;
  generatedAt: string;
  /** Set when the audit itself failed — claims will be empty */
  error?: string;
}

// Keep the prompt within Gemini Flash's comfortable context and our token budget.
const MAX_SECTION_CHARS = 6_000;
const MAX_TOTAL_CHARS = 40_000;

const AUDIT_SYSTEM_PROMPT = `You are a meticulous fact-checking assistant for a fantasy football newsletter.
Your job is to EXTRACT and CLASSIFY factual claims — not to verify them against external data.

For each verifiable factual claim in the newsletter, output:
- "section": the section name it appears in (given in the input headers)
- "claim": the claim, quoted or closely paraphrased (max 200 chars)
- "type": one of "score" (game/matchup scores), "record" (W-L records, standings), "projection" (predicted outcomes/points), "stat" (player stats, points scored), "transaction" (trades, waivers, draft picks), "other"
- "risk": one of:
    "high"   — specific numbers or named outcomes that would embarrass the newsletter if wrong (exact scores, exact records, specific stat lines, trade details)
    "medium" — directional or rounded claims (roughly correct numbers, "top-3", "winless streak")
    "low"    — opinion-adjacent or trivially safe claims
- "reason": one short sentence on why you assigned that risk

Skip pure opinion, jokes, and predictions clearly framed as speculation.
Output ONLY a JSON array of claim objects. No markdown fences, no commentary. If there are no claims, output [].`;

/** Strip markdown fences and find the outermost JSON array. */
function parseClaimsJson(raw: string): FactClaim[] {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];

  const parsed = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (!Array.isArray(parsed)) return [];

  const validTypes = new Set<string>(['score', 'record', 'projection', 'stat', 'transaction', 'other']);
  const validRisks = new Set<string>(['high', 'medium', 'low']);

  return parsed
    .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object')
    .map((c) => ({
      section: String(c.section ?? 'unknown').slice(0, 128),
      claim: String(c.claim ?? '').slice(0, 300),
      type: (validTypes.has(String(c.type)) ? String(c.type) : 'other') as ClaimType,
      risk: (validRisks.has(String(c.risk)) ? String(c.risk) : 'medium') as ClaimRisk,
      reason: String(c.reason ?? '').slice(0, 300),
    }))
    .filter((c) => c.claim.length > 0);
}

/**
 * Run the fact-audit over assembled newsletter sections.
 * Never throws — failures come back as a result with `error` set.
 */
export async function runFactAudit(
  sections: Array<{ type: string; data: unknown }>,
): Promise<FactAuditResult> {
  const generatedAt = new Date().toISOString();

  // Assemble one prompt with per-section headers so a single Gemini call covers everything.
  const parts: string[] = [];
  let total = 0;
  let sectionsAudited = 0;
  for (const s of sections) {
    const text = extractText(s.data).join('\n').slice(0, MAX_SECTION_CHARS);
    if (!text.trim()) continue;
    if (total + text.length > MAX_TOTAL_CHARS) break;
    parts.push(`=== SECTION: ${s.type} ===\n${text}`);
    total += text.length;
    sectionsAudited++;
  }

  if (parts.length === 0) {
    return { claims: [], highRiskCount: 0, mediumRiskCount: 0, sectionsAudited: 0, model: 'none', generatedAt };
  }

  const req = {
    systemPrompt: AUDIT_SYSTEM_PROMPT,
    userPrompt: `Audit the following newsletter sections:\n\n${parts.join('\n\n')}`,
    temperature: 0.1,
    maxTokens: 8_000,
    thinkingBudget: 0,
    sectionName: 'fact-audit',
  };

  let raw: string | null = null;
  let model = 'gemini-2.5-flash';
  try {
    raw = await generateWithGeminiProvider(req);
  } catch (err25) {
    console.warn('[FactAudit] gemini-2.5 failed, trying 2.0:', err25 instanceof Error ? err25.message : String(err25));
    try {
      raw = await generateWithGemini20Provider(req);
      model = 'gemini-2.0-flash';
    } catch (err20) {
      const msg = err20 instanceof Error ? err20.message : String(err20);
      return { claims: [], highRiskCount: 0, mediumRiskCount: 0, sectionsAudited, model: 'none', generatedAt, error: msg };
    }
  }

  try {
    const claims = parseClaimsJson(raw);
    return {
      claims,
      highRiskCount: claims.filter((c) => c.risk === 'high').length,
      mediumRiskCount: claims.filter((c) => c.risk === 'medium').length,
      sectionsAudited,
      model,
      generatedAt,
    };
  } catch (err) {
    return {
      claims: [],
      highRiskCount: 0,
      mediumRiskCount: 0,
      sectionsAudited,
      model,
      generatedAt,
      error: `Failed to parse audit response: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
