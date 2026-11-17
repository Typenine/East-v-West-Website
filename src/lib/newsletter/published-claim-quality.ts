/**
 * Deterministic, conservative claim classification.
 * A published statement is not automatically a scoreable prediction simply
 * because it mentions a champion, next week, or "going to".
 *
 * Keep original quotes when repairing old ledger records. No AI or network use.
 */
import type { EditorialClaimType } from './editorial-memory';

export const PUBLISHED_CLAIM_QUALITY_VERSION = 2;

export function cleanPublishedClaim(raw: string): string {
  return raw
    .replace(/\[\[(?:TEAM|SECTION):[^\]]+\]\]/gi, ' ')
    .replace(/^\s*(?:\[\d+\]\s*)+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasExplicitPrediction(raw: string): boolean {
  const text = cleanPublishedClaim(raw).toLowerCase().replace(/[’]/g, "'");
  // These expressions require an explicit commitment to a pick or an
  // observable future outcome. "could", "might", "can", "will be" and
  // "not going to" by themselves are not predictions.
  if (/\b(?:my|our)\s+(?:pick|prediction)\s+(?:is|:)\s+\S/i.test(text)) return true;
  if (/\b(?:is|are)\s+(?:my|our)\s+pick\b/i.test(text)) return true;
  if (/\b(?:i|we)\s+(?:predict|forecast)\s+(?:that\s+)?\S/i.test(text)) return true;
  if (/\b(?:i'm|i am|we're|we are)\s+(?:taking|picking|backing)\s+(?!(?:out|that|this|the lesson|a look|stock|notes|nothing)\b)\S/i.test(text)) return true;
  if (/\b(?:i'll|i will|we'll|we will)\s+(?:pick|take|back)\s+(?!(?:out|that|this)\b)\S/i.test(text)) return true;
  if (/\b(?:i|we)\s+(?:have|take)\s+[\w .'-]{3,70}\s+over\s+[\w .'-]{3,70}(?:\b|$)/i.test(text)) return true;
  if (/\b(?:will|won't|will not|is going to|are going to)\s+(?:(?:not|definitely|probably|certainly)\s+)?(?:win|lose|beat|finish|make|miss|reach|score|lead|claim|take)\s+(?:the\s+|a\s+|an\s+)?(?:playoffs?|title|championship|league|finals?|semifinals?|top[- ]?\d+|last place|first place|bye|at least \d+|under \d+|\d+(?:\.\d+)?\s+points?|[a-z])/i.test(text)) return true;
  if (/\b(?:will|is going to|are going to)\s+(?:be\s+)?(?:the\s+)?(?:champion|champions|runner[- ]up|top[- ]?\d+|last[- ]place|first[- ]place)\b/i.test(text)) return true;
  if (/\b(?:i|we)\s+(?:expect|project)\s+.{2,90}\s+to\s+(?:win|lose|beat|finish|make|miss|reach|score)\b/i.test(text)) return true;
  return false;
}

export function classifyPublishedClaim(raw: string, section?: string): EditorialClaimType {
  const text = cleanPublishedClaim(raw).toLowerCase().replace(/[’]/g, "'");
  if (/\b(?:i was wrong|i got (?:this|that|it) wrong|i missed on|i whiffed on|we were wrong|changed my mind|change my mind|walk that back|taking that back|take the l|own this l|wrong about|i retract)\b/i.test(text)) return 'reaction';
  if (hasExplicitPrediction(text)) return 'prediction';
  if (section && /OFFICIAL SEASON PICKS|BOLD PREDICTIONS/i.test(section) &&
      /\b(?:top[- ]?\d+|playoffs|championship|title|wins the league|finish(?:es)? (?:first|second|third|last))\b/i.test(text) &&
      /\b(?:i|we)\s+(?:have|expect|see|pick|predict|believe)\b/i.test(text)) return 'prediction';
  if (/\b(?:trade|deal|draft|asset|buy|sell|hold|rebuild|contend|roster construction|waiver|faab|allocation|cut|roster spot|trade[- ]?up|trade[- ]?down)\b/i.test(text)) return 'strategy';
  return 'evaluation';
}

export function predictionClassificationNeedsReview(raw: string): boolean {
  const claim = cleanPublishedClaim(raw);
  // Old sentence splitting could truncate Mt. Lebanon / decimal scores.
  return /\b(?:Mt|Mr|Dr)\.$/.test(claim) ||
    /(?:^|\s)(?:\d+)\.$/.test(claim) ||
    claim.length < 24;
}

export interface HistoricalQualityEntry {
  claim: string;
  claimType: EditorialClaimType;
  originalClaim?: string;
  originalClaimType?: EditorialClaimType;
  classificationVersion?: number;
  qualityReviewRequired?: boolean;
}

/** Non-destructive normalization: original quote/type survive for audit and rollback. */
export function reconcilePublishedClaim<T extends HistoricalQualityEntry>(entry: T): T {
  if ((entry.classificationVersion ?? 0) >= PUBLISHED_CLAIM_QUALITY_VERSION) return entry;
  const cleaned = cleanPublishedClaim(entry.claim);
  const conservative = classifyPublishedClaim(cleaned);
  // The historical repair is intentionally narrow: remove false prediction
  // labels, and promote unmistakable picks from generic evaluations. Keep
  // past editorial/reaction/strategy labels unless explicitly reviewed.
  const nextType = entry.claimType === 'prediction'
    ? conservative
    : entry.claimType === 'evaluation' && conservative === 'prediction'
      ? 'prediction'
      : entry.claimType;
  return {
    ...entry,
    ...(cleaned !== entry.claim && !entry.originalClaim ? { originalClaim: entry.claim } : {}),
    ...(nextType !== entry.claimType && !entry.originalClaimType ? { originalClaimType: entry.claimType } : {}),
    claim: cleaned,
    claimType: nextType,
    classificationVersion: PUBLISHED_CLAIM_QUALITY_VERSION,
    qualityReviewRequired: predictionClassificationNeedsReview(cleaned),
  };
}
