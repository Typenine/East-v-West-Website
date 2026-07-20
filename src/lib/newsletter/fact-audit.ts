import { generateWithGeminiProvider } from './llm/providers/gemini-provider';
import { generateWithGemini20Provider } from './llm/providers/gemini20-provider';
import { extractText } from './coverage-report';

export type ClaimType = 'score' | 'record' | 'projection' | 'stat' | 'transaction' | 'other';
export type ClaimRisk = 'high' | 'medium' | 'low';
export type VerificationStatus = 'supported' | 'contradicted' | 'unverified' | 'not_applicable';

export interface FactClaim {
  section: string;
  claim: string;
  type: ClaimType;
  risk: ClaimRisk;
  reason: string;
  verification: VerificationStatus;
  evidence?: string;
  unsupportedNumbers?: string[];
  unsupportedEntities?: string[];
}

export interface FactAuditResult {
  claims: FactClaim[];
  highRiskCount: number;
  mediumRiskCount: number;
  supportedCount: number;
  contradictedCount: number;
  unverifiedCount: number;
  blockingContradictions: FactClaim[];
  sectionsAudited: number;
  model: string;
  generatedAt: string;
  referenceChars: number;
  error?: string;
}

export interface FactAuditOptions {
  referenceText?: string;
}

interface StructuredFactLine {
  path: string;
  value: string;
  raw: string;
}

const MAX_SECTION_CHARS = 6_000;
const MAX_TOTAL_CHARS = 40_000;
const MAX_REFERENCE_CHARS = 80_000;

const AUDIT_SYSTEM_PROMPT = `You extract factual claims from a fantasy football newsletter.
Do not verify them. Verification will be performed by deterministic code against the frozen source packet.

For each verifiable claim output:
- section
- claim (max 200 characters)
- type: score, record, projection, stat, transaction, or other
- risk: high for exact scores/records/stats/trade details; medium for rounded/ranked/directional facts; low for safe context
- reason: why the claim is fact-sensitive

Skip pure opinion, jokes, and predictions clearly framed as speculation.
Output ONLY a JSON array. No markdown.`;

const COMMENTARY_KEYS = new Set([
  'bot1', 'bot2', 'bot1_text', 'bot2_text', 'entertainer', 'analyst',
  'entertainer_paragraph', 'analyst_paragraph', 'commentary', 'analysis',
  'dialogue', 'take', 'reasoning', 'raw', 'text', 'summary', 'note_bot1', 'note_bot2',
]);

function parseClaimsJson(raw: string): Array<Omit<FactClaim, 'verification' | 'evidence'>> {
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
    .filter((value): value is Record<string, unknown> => value != null && typeof value === 'object')
    .map(value => ({
      section: String(value.section ?? 'unknown').slice(0, 128),
      claim: String(value.claim ?? '').slice(0, 300),
      type: (validTypes.has(String(value.type)) ? String(value.type) : 'other') as ClaimType,
      risk: (validRisks.has(String(value.risk)) ? String(value.risk) : 'medium') as ClaimRisk,
      reason: String(value.reason ?? '').slice(0, 300),
    }))
    .filter(value => value.claim.length > 0);
}

function collectStructuredFacts(value: unknown, path = '', depth = 0): StructuredFactLine[] {
  if (depth > 8 || value == null) return [];
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string' && (!value.trim() || value.length > 800)) return [];
    const rendered = String(value).trim();
    return [{ path, value: rendered, raw: `${path}: ${rendered}` }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectStructuredFacts(entry, `${path}[${index}]`, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !key.startsWith('_') && !COMMENTARY_KEYS.has(key))
      .flatMap(([key, child]) => collectStructuredFacts(child, path ? `${path}.${key}` : key, depth + 1));
  }
  return [];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9.'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberVariants(token: string): string[] {
  const parsed = Number(token.replace(/,/g, ''));
  if (!Number.isFinite(parsed)) return [token];
  const variants = new Set<string>([token, String(parsed)]);
  variants.add(parsed.toFixed(1));
  if (Number.isInteger(parsed)) variants.add(`${parsed}.0`);
  return [...variants];
}

function extractNumbers(claim: string): string[] {
  return [...new Set(claim.match(/\b\d{1,4}(?:,\d{3})*(?:\.\d+)?\b/g) ?? [])];
}

function extractEntities(claim: string): string[] {
  const stop = new Set(['Week', 'Season', 'The', 'This', 'That', 'Mason', 'Westy', 'East', 'West', 'Fantasy']);
  const matches = claim.match(/\b[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,4}\b/g) ?? [];
  return [...new Set(matches.map(value => value.trim()).filter(value => value.length >= 4 && !stop.has(value)))];
}

function findEvidence(reference: string, needles: string[]): string | undefined {
  const normalizedReference = normalize(reference);
  for (const needle of needles) {
    const normalizedNeedle = normalize(needle);
    const idx = normalizedReference.indexOf(normalizedNeedle);
    if (idx < 0) continue;
    const rawIdx = Math.max(0, Math.min(reference.length - 1, Math.round(idx / Math.max(1, normalizedReference.length) * reference.length)));
    return reference.slice(Math.max(0, rawIdx - 120), Math.min(reference.length, rawIdx + 260)).replace(/\s+/g, ' ').trim();
  }
  return undefined;
}

function parentPath(path: string): string {
  const lastDot = path.lastIndexOf('.');
  const lastBracket = path.lastIndexOf('[');
  const cut = Math.max(lastDot, lastBracket);
  return cut > 0 ? path.slice(0, cut) : path;
}

function relatedStructuredGroup(entity: string, lines: StructuredFactLine[]): StructuredFactLine[] {
  const entityNorm = normalize(entity);
  const matches = lines.filter(line => normalize(`${line.path} ${line.value}`).includes(entityNorm));
  const parents = new Set(matches.map(line => parentPath(line.path)));
  const expanded = lines.filter(line => [...parents].some(parent => line.path === parent || line.path.startsWith(`${parent}.`) || line.path.startsWith(`${parent}[`)));
  return expanded.length > 0 ? expanded : matches;
}

function valuesContainNumber(lines: StructuredFactLine[], token: string): boolean {
  const haystack = normalize(lines.map(line => line.raw).join(' '));
  return numberVariants(token).some(variant => haystack.includes(normalize(variant)));
}

function findNumericContradiction(
  claim: Omit<FactClaim, 'verification' | 'evidence'>,
  unsupportedNumbers: string[],
  supportedEntities: string[],
  structuredLines: StructuredFactLine[],
): string | undefined {
  if (unsupportedNumbers.length === 0 || supportedEntities.length === 0) return undefined;
  if (!['score', 'record', 'stat'].includes(claim.type)) return undefined;

  const fieldPattern = claim.type === 'score'
    ? /score|points|winner_score|loser_score|margin/i
    : claim.type === 'record'
      ? /record|wins|losses|ties/i
      : /points|faab|rank|pick|age|yards|touchdowns|tds|receptions|attempts|targets|carries|wins|losses/i;

  for (const entity of supportedEntities) {
    const group = relatedStructuredGroup(entity, structuredLines).filter(line => fieldPattern.test(line.path));
    if (group.length === 0) continue;
    const knownNumbers = extractNumbers(group.map(line => line.raw).join(' '));
    if (knownNumbers.length === 0) continue;
    const claimNumbersAbsent = unsupportedNumbers.every(number => !valuesContainNumber(group, number));
    const enoughStructure = claim.type === 'stat' ? group.length >= 1 : knownNumbers.length >= Math.min(2, unsupportedNumbers.length);
    if (claimNumbersAbsent && enoughStructure) return group.slice(0, 8).map(line => line.raw).join(' | ');
  }
  return undefined;
}

function transactionDirection(claim: string): 'gets' | 'gives' | null {
  const value = claim.toLowerCase();
  if (/\b(received|receives|acquired|acquires|got|gets|landed|added)\b/.test(value)) return 'gets';
  if (/\b(sent|sends|gave|gives|traded away|moved out|dealt away)\b/.test(value)) return 'gives';
  return null;
}

function findTransactionContradiction(
  claimText: string,
  entities: string[],
  structuredLines: StructuredFactLine[],
): string | undefined {
  const direction = transactionDirection(claimText);
  if (!direction || entities.length < 2) return undefined;
  const opposite = direction === 'gets' ? 'gives' : 'gets';

  for (const team of entities) {
    const teamNorm = normalize(team);
    const teamLines = structuredLines.filter(line => normalize(line.path).includes(teamNorm) && /\.teams\.|\.analysis\./i.test(line.path));
    if (teamLines.length === 0) continue;
    const assets = entities.filter(entity => entity !== team);
    for (const asset of assets) {
      const assetNorm = normalize(asset);
      const expected = teamLines.some(line => line.path.toLowerCase().includes(`.${direction}`) && normalize(line.value).includes(assetNorm));
      const reversed = teamLines.some(line => line.path.toLowerCase().includes(`.${opposite}`) && normalize(line.value).includes(assetNorm));
      if (!expected && reversed) {
        return teamLines.filter(line => normalize(line.value).includes(assetNorm) || line.path.toLowerCase().includes(`.${direction}`) || line.path.toLowerCase().includes(`.${opposite}`)).slice(0, 8).map(line => line.raw).join(' | ');
      }
    }
  }
  return undefined;
}

function verifyClaim(
  claim: Omit<FactClaim, 'verification' | 'evidence'>,
  reference: string,
  structuredLines: StructuredFactLine[],
): FactClaim {
  if (claim.type === 'projection') {
    return { ...claim, verification: 'not_applicable', evidence: 'Prediction/projection, not an assertion of an already completed fact.' };
  }

  const referenceNorm = normalize(reference);
  const numbers = extractNumbers(claim.claim);
  const unsupportedNumbers = numbers.filter(number => !numberVariants(number).some(variant => referenceNorm.includes(normalize(variant))));
  const entities = extractEntities(claim.claim);
  const unsupportedEntities = entities.filter(entity => !referenceNorm.includes(normalize(entity)));
  const supportedNumbers = numbers.length - unsupportedNumbers.length;
  const supportedEntities = entities.filter(entity => !unsupportedEntities.includes(entity));

  const numericContradiction = findNumericContradiction(claim, unsupportedNumbers, supportedEntities, structuredLines);
  const transactionContradiction = claim.type === 'transaction'
    ? findTransactionContradiction(claim.claim, entities, structuredLines)
    : undefined;
  const contradictionEvidence = transactionContradiction ?? numericContradiction;

  let verification: VerificationStatus;
  if (contradictionEvidence) {
    verification = 'contradicted';
  } else if (numbers.length > 0 && supportedNumbers === numbers.length && (entities.length === 0 || supportedEntities.length > 0)) {
    verification = 'supported';
  } else if (numbers.length === 0 && entities.length > 0 && supportedEntities.length === entities.length) {
    verification = 'supported';
  } else if (unsupportedNumbers.length === 0 && unsupportedEntities.length === 0) {
    verification = 'supported';
  } else {
    verification = 'unverified';
  }

  const evidenceNeedles = [...numbers.flatMap(numberVariants), ...entities];
  return {
    ...claim,
    verification,
    evidence: contradictionEvidence ?? findEvidence(reference, evidenceNeedles),
    ...(unsupportedNumbers.length > 0 ? { unsupportedNumbers } : {}),
    ...(unsupportedEntities.length > 0 ? { unsupportedEntities } : {}),
  };
}

export async function runFactAudit(
  sections: Array<{ type: string; data: unknown }>,
  options: FactAuditOptions = {},
): Promise<FactAuditResult> {
  const generatedAt = new Date().toISOString();
  const promptParts: string[] = [];
  const structuredLines: StructuredFactLine[] = [];
  let total = 0;
  let sectionsAudited = 0;

  for (const section of sections) {
    const text = extractText(section.data).join('\n').slice(0, MAX_SECTION_CHARS);
    if (text.trim() && total + text.length <= MAX_TOTAL_CHARS) {
      promptParts.push(`=== SECTION: ${section.type} ===\n${text}`);
      total += text.length;
      sectionsAudited++;
    }
    structuredLines.push(...collectStructuredFacts(section.data, section.type));
  }

  const reference = [options.referenceText ?? '', structuredLines.map(line => line.raw).join('\n')]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_REFERENCE_CHARS);

  if (promptParts.length === 0) {
    return {
      claims: [], highRiskCount: 0, mediumRiskCount: 0, supportedCount: 0,
      contradictedCount: 0, unverifiedCount: 0, blockingContradictions: [],
      sectionsAudited: 0, model: 'none', generatedAt, referenceChars: reference.length,
    };
  }

  const request = {
    systemPrompt: AUDIT_SYSTEM_PROMPT,
    userPrompt: `Extract factual claims from these newsletter sections:\n\n${promptParts.join('\n\n')}`,
    temperature: 0.1,
    maxTokens: 8_000,
    thinkingBudget: 0,
    sectionName: 'fact-audit',
  };

  let raw: string;
  let model = 'gemini-2.5-flash';
  try {
    raw = await generateWithGeminiProvider(request);
  } catch (error25) {
    console.warn('[FactAudit] Gemini 2.5 failed, trying 2.0:', error25 instanceof Error ? error25.message : String(error25));
    try {
      raw = await generateWithGemini20Provider(request);
      model = 'gemini-2.0-flash';
    } catch (error20) {
      const message = error20 instanceof Error ? error20.message : String(error20);
      return {
        claims: [], highRiskCount: 0, mediumRiskCount: 0, supportedCount: 0,
        contradictedCount: 0, unverifiedCount: 0, blockingContradictions: [],
        sectionsAudited, model: 'none', generatedAt, referenceChars: reference.length, error: message,
      };
    }
  }

  try {
    const claims = parseClaimsJson(raw).map(claim => verifyClaim(claim, reference, structuredLines));
    const blockingContradictions = claims.filter(claim => claim.risk === 'high' && claim.verification === 'contradicted');
    return {
      claims,
      highRiskCount: claims.filter(claim => claim.risk === 'high').length,
      mediumRiskCount: claims.filter(claim => claim.risk === 'medium').length,
      supportedCount: claims.filter(claim => claim.verification === 'supported').length,
      contradictedCount: claims.filter(claim => claim.verification === 'contradicted').length,
      unverifiedCount: claims.filter(claim => claim.verification === 'unverified').length,
      blockingContradictions,
      sectionsAudited,
      model,
      generatedAt,
      referenceChars: reference.length,
    };
  } catch (error) {
    return {
      claims: [], highRiskCount: 0, mediumRiskCount: 0, supportedCount: 0,
      contradictedCount: 0, unverifiedCount: 0, blockingContradictions: [],
      sectionsAudited, model, generatedAt, referenceChars: reference.length,
      error: `Failed to parse or verify audit response: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
