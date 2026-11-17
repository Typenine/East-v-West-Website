from __future__ import annotations

from pathlib import Path

STORE = Path('src/lib/newsletter/published-take-store.ts')
LEDGER = Path('src/lib/newsletter/published-take-ledger.ts')
RECEIPTS = Path('src/lib/newsletter/receipt-desk.ts')
SOURCE_PACK = Path('src/app/api/admin/newsletter/external-export/route-core.ts')
INTELLIGENCE = Path('src/lib/newsletter/memory-intelligence.ts')
TEST = Path('src/lib/newsletter/__tests__/post-draft-readiness.test.ts')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one anchor, found {count}')
    return text.replace(old, new, 1)


MEMORY_INTELLIGENCE_TS = r'''import { and, desc, eq, lte } from 'drizzle-orm';
import type { BotMemory, BotName } from './types';
import type { PublishedTakeLedgerEntry } from './published-take-store';
import { getDb } from '@/server/db/client';
import { botMemory } from '@/server/db/schema';

type EnhancedData = Record<string, unknown>;

export interface SeasonSelfReviewCall {
  week: number;
  summary: string;
  confidence?: string;
  subject?: string;
}

export interface SeasonSelfReview {
  season: number;
  generatedAt: string;
  predictionRecord: { correct: number; wrong: number; winRate: number };
  bestCalls: SeasonSelfReviewCall[];
  worstCalls: SeasonSelfReviewCall[];
  majorReversals: Array<{
    week: number;
    subject: string;
    from: string;
    to: string;
    reason?: PublishedTakeLedgerEntry['changeReason'];
  }>;
  lessons: string[];
  recognizedBiases: string[];
  personalitySnapshot: BotMemory['personality'] | null;
  strongestTeamRelationships: Array<{ team: string; stance: string; trustLevel: number }>;
  strongestPlayerRelationships: Array<{ player: string; sentiment: string; trustLevel: number }>;
  signatureMemories: Array<{
    week: number;
    subject: string;
    claim: string;
    status: PublishedTakeLedgerEntry['status'];
    salience: number;
  }>;
}

export interface ClancyCareerReceipt {
  id: string;
  season: number;
  week: number;
  speaker: 'Mason Reed' | 'Westy';
  subject: string;
  receiptType: string;
  summary: string;
  salience: number;
  changeReason?: PublishedTakeLedgerEntry['changeReason'];
}

export interface ClancySubjectThread {
  subject: string;
  count: number;
  lastSeenSeason: number;
  lastSeenWeek: number;
  speakers: Array<'Mason Reed' | 'Westy'>;
  lastSummary: string;
}

export interface ClancyCareerMemory {
  version: 1;
  updatedAt: string | null;
  totalReceiptsObserved: number;
  seenReceiptIds: string[];
  subjectThreads: Record<string, ClancySubjectThread>;
  famousReceipts: ClancyCareerReceipt[];
}

function emptyClancyMemory(): ClancyCareerMemory {
  return { version: 1, updatedAt: null, totalReceiptsObserved: 0, seenReceiptIds: [], subjectThreads: {}, famousReceipts: [] };
}

function predictionRank(confidence: string): number {
  return confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
}

function compactPrediction(memory: BotMemory, result: 'correct' | 'wrong'): SeasonSelfReviewCall[] {
  return (memory.predictions ?? [])
    .filter(row => row.result === result)
    .sort((a, b) => predictionRank(b.confidence) - predictionRank(a.confidence) || b.week - a.week)
    .slice(0, 5)
    .map(row => ({
      week: row.week,
      summary: `Picked ${row.pick} in ${row.team1} vs ${row.team2}${row.actualWinner ? `; ${row.actualWinner} won` : ''}.`,
      confidence: row.confidence,
      subject: row.pick,
    }));
}

export function buildSeasonSelfReview(
  bot: BotName,
  season: number,
  memory: BotMemory,
  entries: PublishedTakeLedgerEntry[],
): SeasonSelfReview {
  void bot;
  const seasonEntries = entries.filter(entry => entry.season === season);
  const bestCalls = compactPrediction(memory, 'correct');
  const worstCalls = compactPrediction(memory, 'wrong');

  for (const entry of [...seasonEntries]
    .filter(row => row.status === 'strengthened' || (row.memorable && row.status === 'active'))
    .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0))) {
    if (bestCalls.length >= 5) break;
    bestCalls.push({ week: entry.week, summary: entry.claim, subject: entry.subject });
  }

  for (const entry of [...seasonEntries]
    .filter(row => row.status === 'wrong' || row.status === 'reversed')
    .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0))) {
    if (worstCalls.length >= 5) break;
    if (worstCalls.some(call => call.summary === entry.claim)) continue;
    worstCalls.push({ week: entry.week, summary: entry.claim, subject: entry.subject });
  }

  const majorReversals = seasonEntries
    .filter(entry => Boolean(entry.previousClaim) && (entry.status === 'reversed' || entry.status === 'weakened'))
    .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0))
    .slice(0, 6)
    .map(entry => ({ week: entry.week, subject: entry.subject, from: entry.previousClaim!, to: entry.claim, reason: entry.changeReason }));

  const lessons = (memory.personalGrowth?.hardLessons ?? [])
    .filter(row => row.season === season || row.season === 0)
    .slice(-8)
    .map(row => row.lesson);
  const recognizedBiases = (memory.personalGrowth?.recognizedBiases ?? []).slice(-8).map(row => row.bias);

  const strongestTeamRelationships = Object.values(memory.deepTeamRelationships ?? {})
    .sort((a, b) => Math.abs(b.trustLevel) - Math.abs(a.trustLevel))
    .slice(0, 5)
    .map(row => ({ team: row.teamName, stance: row.stance, trustLevel: row.trustLevel }));

  const strongestPlayerRelationships = Object.values(memory.deepPlayerRelationships ?? {})
    .sort((a, b) => Math.abs(b.trustLevel) - Math.abs(a.trustLevel))
    .slice(0, 5)
    .map(row => ({ player: row.playerName, sentiment: row.sentiment, trustLevel: row.trustLevel }));

  const signatureMemories = [...seasonEntries]
    .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0))
    .slice(0, 8)
    .map(entry => ({ week: entry.week, subject: entry.subject, claim: entry.claim, status: entry.status, salience: entry.salience ?? 0 }));

  const stats = memory.predictionStats ?? { correct: 0, wrong: 0, winRate: 0, hotStreak: 0, bestStreak: 0, worstStreak: 0 };
  return {
    season,
    generatedAt: new Date().toISOString(),
    predictionRecord: { correct: stats.correct, wrong: stats.wrong, winRate: stats.winRate },
    bestCalls,
    worstCalls,
    majorReversals,
    lessons,
    recognizedBiases,
    personalitySnapshot: memory.personality ?? null,
    strongestTeamRelationships,
    strongestPlayerRelationships,
    signatureMemories,
  };
}

async function currentEnhancedData(bot: BotName, season: number): Promise<{ id: string; data: EnhancedData } | null> {
  const db = getDb();
  const rows = await db
    .select({ id: botMemory.id, enhancedData: botMemory.enhancedData })
    .from(botMemory)
    .where(and(eq(botMemory.bot, bot), eq(botMemory.season, season)))
    .limit(1);
  if (!rows.length) return null;
  return { id: rows[0].id, data: ((rows[0].enhancedData as EnhancedData | null) ?? {}) };
}

async function saveEnhancedKey(bot: BotName, season: number, key: string, value: unknown): Promise<boolean> {
  const db = getDb();
  const current = await currentEnhancedData(bot, season);
  if (!current) return false;
  await db.update(botMemory).set({ enhancedData: { ...current.data, [key]: value }, updatedAt: new Date() }).where(eq(botMemory.id, current.id));
  return true;
}

export async function saveSeasonSelfReview(bot: BotName, season: number, review: SeasonSelfReview): Promise<boolean> {
  return saveEnhancedKey(bot, season, 'seasonSelfReview', review);
}

export async function loadCareerSeasonReviews(bot: BotName, throughSeason: number, limit = 6): Promise<SeasonSelfReview[]> {
  const db = getDb();
  const rows = await db
    .select({ season: botMemory.season, enhancedData: botMemory.enhancedData })
    .from(botMemory)
    .where(and(eq(botMemory.bot, bot), lte(botMemory.season, throughSeason)))
    .orderBy(desc(botMemory.season))
    .limit(Math.max(limit * 2, 8));

  const reviews: SeasonSelfReview[] = [];
  for (const row of rows) {
    const data = ((row.enhancedData as EnhancedData | null) ?? {});
    const review = data.seasonSelfReview as SeasonSelfReview | undefined;
    if (!review || typeof review.season !== 'number') continue;
    reviews.push(review);
    if (reviews.length >= limit) break;
  }
  return reviews;
}

export async function loadClancyCareerMemory(throughSeason: number): Promise<ClancyCareerMemory> {
  const db = getDb();
  const rows = await db
    .select({ enhancedData: botMemory.enhancedData })
    .from(botMemory)
    .where(and(eq(botMemory.bot, 'entertainer'), lte(botMemory.season, throughSeason)))
    .orderBy(desc(botMemory.season))
    .limit(8);

  for (const row of rows) {
    const data = ((row.enhancedData as EnhancedData | null) ?? {});
    const memory = data.clancyCareerMemory as ClancyCareerMemory | undefined;
    if (memory?.version === 1) return memory;
  }
  return emptyClancyMemory();
}

export async function updateClancyCareerMemory(input: {
  season: number;
  week: number;
  entries: Array<{ speaker: 'Mason Reed' | 'Westy'; entry: PublishedTakeLedgerEntry }>;
}): Promise<ClancyCareerMemory> {
  const memory = await loadClancyCareerMemory(input.season);
  const seen = new Set(memory.seenReceiptIds);
  const candidates = input.entries
    .filter(({ entry }) => entry.status !== 'active' || entry.memorable || entry.claimType === 'prediction' || (entry.salience ?? 0) >= 65)
    .sort((a, b) => (b.entry.salience ?? 0) - (a.entry.salience ?? 0))
    .slice(0, 4);

  for (const { speaker, entry } of candidates) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    memory.totalReceiptsObserved += 1;
    const threadKey = `${entry.subjectType}:${entry.subject.toLowerCase()}`;
    const existing = memory.subjectThreads[threadKey];
    memory.subjectThreads[threadKey] = {
      subject: entry.subject,
      count: (existing?.count ?? 0) + 1,
      lastSeenSeason: input.season,
      lastSeenWeek: input.week,
      speakers: [...new Set([...(existing?.speakers ?? []), speaker])],
      lastSummary: entry.claim.slice(0, 360),
    };

    const receipt: ClancyCareerReceipt = {
      id: entry.id,
      season: input.season,
      week: input.week,
      speaker,
      subject: entry.subject,
      receiptType: entry.status === 'wrong' ? 'miss' : entry.status,
      summary: entry.previousClaim
        ? `${speaker} moved from "${entry.previousClaim}" to "${entry.claim}".`
        : `${speaker} put "${entry.claim}" on the record.`,
      salience: entry.salience ?? 0,
      changeReason: entry.changeReason,
    };
    memory.famousReceipts = [...memory.famousReceipts.filter(item => item.id !== receipt.id), receipt]
      .sort((a, b) => b.salience - a.salience || b.season - a.season || b.week - a.week)
      .slice(0, 40);
  }

  memory.seenReceiptIds = [...seen].slice(-160);
  memory.updatedAt = new Date().toISOString();
  await saveEnhancedKey('entertainer', input.season, 'clancyCareerMemory', memory);
  return memory;
}
'''


def patch_store() -> None:
    text = STORE.read_text(encoding='utf-8')
    if 'PublishedTakeChangeReason' in text and 'computePublishedTakeSalience' in text:
        return
    text = replace_once(text,
        "// Increment when deterministic extraction changes require a one-time historical rebuild. Version 7 also rejects cached PDFs that predate structured season-pick receipts.\nexport const PUBLISHED_CONTINUITY_VERSION = 7;",
        "// Increment when deterministic extraction changes require a one-time historical rebuild. Version 8 adds deterministic salience and change-reason continuity.\nexport const PUBLISHED_CONTINUITY_VERSION = 8;",
        'continuity version')
    text = replace_once(text,
        "export type PublishedTakeStatus = 'active' | 'strengthened' | 'weakened' | 'reversed' | 'resolved' | 'wrong';\n",
        """export type PublishedTakeStatus = 'active' | 'strengthened' | 'weakened' | 'reversed' | 'resolved' | 'wrong';\n\nexport type PublishedTakeChangeReasonCategory =\n  | 'injury_availability'\n  | 'role_usage_change'\n  | 'transaction_roster_change'\n  | 'performance_evidence'\n  | 'new_information'\n  | 'admitted_miss'\n  | 'process_correction'\n  | 'explicit_reassessment';\n\nexport interface PublishedTakeChangeReason {\n  category: PublishedTakeChangeReasonCategory;\n  nature: 'circumstances_changed' | 'evaluation_updated' | 'admitted_miss';\n  note: string;\n}\n""",
        'change reason type')
    text = replace_once(text,
        "  status: PublishedTakeStatus;\n  previousClaim?: string;\n  publishedAt: string;\n}",
        """  status: PublishedTakeStatus;\n  previousClaim?: string;\n  changeReason?: PublishedTakeChangeReason;\n  emotionalWeight?: number;\n  referenceCount?: number;\n  lastReferencedAt?: string;\n  salience?: number;\n  publishedAt: string;\n}""",
        'ledger fields')
    text = replace_once(text,
        "export interface PublishedTakeLedgerState {\n  entries: PublishedTakeLedgerEntry[];\n  processedNewsletterIds: string[];\n  updatedAt: string | null;\n  extractionVersion: number;\n}\n",
        """export interface PublishedTakeLedgerState {\n  entries: PublishedTakeLedgerEntry[];\n  processedNewsletterIds: string[];\n  updatedAt: string | null;\n  extractionVersion: number;\n}\n\nfunction normalizedWeek(week: number): number {\n  return week > 30 ? 18 : Math.max(1, week || 1);\n}\n\nexport function computePublishedTakeSalience(\n  entry: PublishedTakeLedgerEntry,\n  currentSeason: number,\n  currentWeek: number,\n): number {\n  const ageWeeks = Math.max(0, (currentSeason - entry.season) * 18 + normalizedWeek(currentWeek) - normalizedWeek(entry.week));\n  let score = 18;\n  score += Math.round(Math.max(0, Math.min(1, entry.confidence ?? 0)) * 14);\n  score += entry.memorable ? 14 : 0;\n  score += entry.claimType === 'prediction' ? 12 : entry.claimType === 'reaction' ? 10 : entry.claimType === 'strategy' ? 6 : 3;\n  score += Math.round(Math.max(0, Math.min(10, entry.emotionalWeight ?? 0)) * 1.4);\n  score += Math.min(15, Math.max(0, entry.referenceCount ?? 0) * 5);\n  if (entry.status === 'wrong' || entry.status === 'reversed') score += 14;\n  else if (entry.status === 'weakened' || entry.status === 'strengthened') score += 9;\n  else if (entry.status === 'resolved') score += 6;\n  if (ageWeeks <= 2) score += 16;\n  else if (ageWeeks <= 6) score += 11;\n  else if (ageWeeks <= 13) score += 7;\n  else if (ageWeeks <= 20) score += 3;\n  return Math.max(0, Math.min(100, Math.round(score)));\n}\n""",
        'salience helper')
    STORE.write_text(text, encoding='utf-8')


def patch_ledger() -> None:
    text = LEDGER.read_text(encoding='utf-8')
    if 'inferChangeReason' in text and 'updateClancyCareerMemory' in text:
        return
    text = replace_once(text,
        "  PUBLISHED_CONTINUITY_VERSION,\n  loadPublishedTakeLedgerState,\n  savePublishedTakeLedgerState,\n  type PublishedTakeLedgerEntry,\n  type PublishedTakeLedgerState,\n  type PublishedTakeStatus,\n} from '@/lib/newsletter/published-take-store';",
        """  PUBLISHED_CONTINUITY_VERSION,\n  computePublishedTakeSalience,\n  loadPublishedTakeLedgerState,\n  savePublishedTakeLedgerState,\n  type PublishedTakeChangeReason,\n  type PublishedTakeLedgerEntry,\n  type PublishedTakeLedgerState,\n  type PublishedTakeStatus,\n} from '@/lib/newsletter/published-take-store';\nimport {\n  buildSeasonSelfReview,\n  saveSeasonSelfReview,\n  updateClancyCareerMemory,\n} from '@/lib/newsletter/memory-intelligence';""",
        'ledger imports')
    text = replace_once(text,
        "function statusForClaim(claim: EditorialClaim, previous?: PublishedTakeLedgerEntry): PublishedTakeStatus {",
        """function emotionalWeightForClaim(claim: EditorialClaim): number {\n  const text = claim.claim.toLowerCase();\n  let weight = claim.memorable ? 5 : 2;\n  if (claim.claimType === 'reaction') weight += 2;\n  if (/\\b(love|hate|furious|disaster|embarrassing|all in|out on|never again|burned|vindicated|humbled|stunned)\\b/.test(text)) weight += 2;\n  if (/\\b(championship|playoffs?|eliminated|historic|record|season[- ]ending)\\b/.test(text)) weight += 1;\n  return Math.max(0, Math.min(10, weight));\n}\n\nfunction inferChangeReason(\n  claim: EditorialClaim,\n  status: PublishedTakeStatus,\n  previous?: PublishedTakeLedgerEntry,\n): PublishedTakeChangeReason | undefined {\n  if (!previous || status === 'active') return undefined;\n  const text = claim.claim.toLowerCase();\n  if (/\\b(injur|ir\\b|out for|availability|healthy|return(?:ed|ing)? from)\\b/.test(text)) {\n    return { category: 'injury_availability', nature: 'circumstances_changed', note: 'The later published take points to injury or availability changing the underlying situation.' };\n  }\n  if (/\\b(role|usage|snap|touch|target share|depth chart|starter|backup|committee)\\b/.test(text)) {\n    return { category: 'role_usage_change', nature: 'circumstances_changed', note: 'The later published take points to a role or usage change.' };\n  }\n  if (/\\b(trade|traded|waiver|signed|released|cut|roster move|acquired)\\b/.test(text)) {\n    return { category: 'transaction_roster_change', nature: 'circumstances_changed', note: 'The roster context changed after the earlier take.' };\n  }\n  if (/\\b(last \\d+|straight|since then|production|performance|scoring|efficiency|trend|sample|games?)\\b/.test(text)) {\n    return { category: 'performance_evidence', nature: 'evaluation_updated', note: 'Subsequent performance supplied new evidence for the updated evaluation.' };\n  }\n  if (/\\b(report|reported|news|new information|new evidence|learned|now know)\\b/.test(text)) {\n    return { category: 'new_information', nature: 'circumstances_changed', note: 'New information changed the factual basis for the take.' };\n  }\n  if (status === 'wrong' || /\\b(i was wrong|i got this wrong|i missed|i whiffed|take the l|own this l)\\b/.test(text)) {\n    return { category: 'admitted_miss', nature: 'admitted_miss', note: 'The later published language explicitly acknowledges that the earlier take missed.' };\n  }\n  if (/\\b(process|model|method|assumption|overvalued|undervalued|too much weight|not enough weight)\\b/.test(text)) {\n    return { category: 'process_correction', nature: 'evaluation_updated', note: 'The later take identifies a flaw in the earlier evaluation process.' };\n  }\n  return { category: 'explicit_reassessment', nature: 'evaluation_updated', note: 'The later published position explicitly reassesses the earlier take.' };\n}\n\nfunction statusForClaim(claim: EditorialClaim, previous?: PublishedTakeLedgerEntry): PublishedTakeStatus {""",
        'reason helpers')
    old_func = r'''function addLedgerEntries(
  existing: PublishedTakeLedgerEntry[],
  digest: EditorialMemoryDigest,
  bot: BotName,
  source: { newsletterId: string; title: string | null; episodeType: string | null; season: number; week: number; publishedAt: string },
): PublishedTakeLedgerEntry[] {
  const ledger = existing.filter(entry => entry.sourceNewsletterId !== source.newsletterId);
  const candidates = candidateClaims(digest, bot);

  for (const claim of candidates) {
    const cleanedClaim = normalize(claim.claim).slice(0, 520);
    if (cleanedClaim.length < 20) continue;
    if (ledger.some(entry =>
      entry.sourceNewsletterId === source.newsletterId &&
      entry.subjectType === claim.subjectType &&
      entry.subject.toLowerCase() === claim.subject.toLowerCase() &&
      entry.claim.toLowerCase() === cleanedClaim.toLowerCase()
    )) continue;

    const key = `${claim.subjectType}:${claim.subject.toLowerCase()}:${claim.claimType}`;
    const previous = [...ledger].reverse().find(entry =>
      claimKey(entry) === key && entry.sourceNewsletterId !== source.newsletterId && entry.publishedAt < source.publishedAt
    );
    const status = statusForClaim(claim, previous);

    ledger.push({
      id: `${source.newsletterId}:${bot}:${ledger.length + 1}`,
      sourceNewsletterId: source.newsletterId,
      title: source.title,
      episodeType: source.episodeType,
      season: source.season,
      week: source.week,
      subjectType: claim.subjectType,
      subject: claim.subject,
      relatedTeam: claim.relatedTeam,
      claim: cleanedClaim,
      claimType: claim.claimType,
      stance: claim.stance,
      confidence: claim.confidence,
      memorable: claim.memorable,
      status,
      previousClaim: status === 'active' ? undefined : previous?.claim,
      publishedAt: source.publishedAt,
    });
  }

  return ledger.slice(-480);
}'''
    new_func = r'''function addLedgerEntries(
  existing: PublishedTakeLedgerEntry[],
  digest: EditorialMemoryDigest,
  bot: BotName,
  source: { newsletterId: string; title: string | null; episodeType: string | null; season: number; week: number; publishedAt: string },
): PublishedTakeLedgerEntry[] {
  const previousIssue = existing.filter(entry => entry.sourceNewsletterId === source.newsletterId);
  const ledger = existing.filter(entry => entry.sourceNewsletterId !== source.newsletterId);
  const candidates = candidateClaims(digest, bot);

  for (const claim of candidates) {
    const cleanedClaim = normalize(claim.claim).slice(0, 520);
    if (cleanedClaim.length < 20) continue;
    if (ledger.some(entry =>
      entry.sourceNewsletterId === source.newsletterId &&
      entry.subjectType === claim.subjectType &&
      entry.subject.toLowerCase() === claim.subject.toLowerCase() &&
      entry.claim.toLowerCase() === cleanedClaim.toLowerCase()
    )) continue;

    const key = `${claim.subjectType}:${claim.subject.toLowerCase()}:${claim.claimType}`;
    const previous = [...ledger].reverse().find(entry =>
      claimKey(entry) === key && entry.sourceNewsletterId !== source.newsletterId && entry.publishedAt < source.publishedAt
    );
    const status = statusForClaim(claim, previous);
    if (previous) {
      previous.referenceCount = (previous.referenceCount ?? 0) + 1;
      previous.lastReferencedAt = source.publishedAt;
      previous.salience = computePublishedTakeSalience(previous, source.season, source.week);
    }

    const entry: PublishedTakeLedgerEntry = {
      id: previousIssue.find(entry => entry.subjectType === claim.subjectType &&
        entry.subject.toLowerCase() === claim.subject.toLowerCase() &&
        (entry.claim.toLowerCase() === cleanedClaim.toLowerCase() ||
         entry.originalClaim?.toLowerCase() === cleanedClaim.toLowerCase()))?.id ??
        `${source.newsletterId}:${bot}:`+createHash('sha256')
          .update(`${claim.subjectType}|${claim.subject}|${cleanedClaim}`).digest('hex').slice(0,20),
      sourceNewsletterId: source.newsletterId,
      title: source.title,
      episodeType: source.episodeType,
      season: source.season,
      week: source.week,
      subjectType: claim.subjectType,
      subject: claim.subject,
      relatedTeam: claim.relatedTeam,
      claim: cleanedClaim,
      claimType: claim.claimType,
      stance: claim.stance,
      confidence: claim.confidence,
      memorable: claim.memorable,
      status,
      previousClaim: status === 'active' ? undefined : previous?.claim,
      changeReason: inferChangeReason(claim, status, previous),
      emotionalWeight: emotionalWeightForClaim(claim),
      referenceCount: 0,
      publishedAt: source.publishedAt,
    };
    entry.salience = computePublishedTakeSalience(entry, source.season, source.week);
    ledger.push(entry);
  }

  return ledger.map(entry => ({
    ...entry,
    salience: computePublishedTakeSalience(entry, source.season, source.week),
  }));
}'''
    # The canonical ledger may include the newer conservative claim-quality
    # normalization. Preserve that feature while installing salience and change
    # reasons instead of expecting a byte-for-byte copy of an older function.
    if 'reconcilePublishedClaim' in text:
        old_return = """  return ledger.map(entry => ({
    ...entry,
    salience: computePublishedTakeSalience(entry, source.season, source.week),
  }));"""
        new_return = """  return ledger.map(entry => reconcilePublishedClaim({
    ...entry,
    salience: computePublishedTakeSalience(entry, source.season, source.week),
  }));"""
        if new_func.count(old_return) != 1:
            raise RuntimeError('Cannot locate ledger salience return for quality integration')
        new_func = new_func.replace(old_return, new_return, 1)
        start = text.find('function addLedgerEntries(')
        end = text.find('\nfunction applySharedAssessments(', start)
        if start < 0 or end < 0:
            raise RuntimeError('Cannot locate the existing ledger entry function')
        text = text[:start] + new_func + '\n' + text[end:]
    else:
        text = replace_once(text, old_func, new_func, 'addLedgerEntries')
    text = replace_once(text,
        """  await savePublishedTakeLedgerState('entertainer', issue.season, updatedEntState);\n  await savePublishedTakeLedgerState('analyst', issue.season, updatedAnaState);\n  await persistLocalPdfExtractionMetadata(issue.id, issue.newsletter as NewsletterShape, recovered).catch(error => {""",
        """  await savePublishedTakeLedgerState('entertainer', issue.season, updatedEntState);\n  await savePublishedTakeLedgerState('analyst', issue.season, updatedAnaState);\n\n  const issueEntEntries = updatedEntState.entries.filter(entry => entry.sourceNewsletterId === issue.id);\n  const issueAnaEntries = updatedAnaState.entries.filter(entry => entry.sourceNewsletterId === issue.id);\n  await updateClancyCareerMemory({\n    season: issue.season,\n    week: issue.week,\n    entries: [\n      ...issueEntEntries.map(entry => ({ speaker: 'Mason Reed' as const, entry })),\n      ...issueAnaEntries.map(entry => ({ speaker: 'Westy' as const, entry })),\n    ],\n  }).catch(error => {\n    console.warn('[TakeLedger] Clancy career memory update failed:', error instanceof Error ? error.message : String(error));\n  });\n\n  if (issue.episodeType === 'championship' || issue.episodeType === 'season_finale') {\n    const masonReview = buildSeasonSelfReview('entertainer', issue.season, entMem, updatedEntState.entries);\n    const westyReview = buildSeasonSelfReview('analyst', issue.season, anaMem, updatedAnaState.entries);\n    await Promise.all([\n      saveSeasonSelfReview('entertainer', issue.season, masonReview),\n      saveSeasonSelfReview('analyst', issue.season, westyReview),\n    ]).catch(error => {\n      console.warn('[TakeLedger] season self-review save failed:', error instanceof Error ? error.message : String(error));\n    });\n  }\n\n  await persistLocalPdfExtractionMetadata(issue.id, issue.newsletter as NewsletterShape, recovered).catch(error => {""",
        'post-ledger memory intelligence')
    LEDGER.write_text(text, encoding='utf-8')


def patch_receipts() -> None:
    text = RECEIPTS.read_text(encoding='utf-8')
    if 'clancyHistoryAside' in text:
        return
    text = replace_once(text,
        "import { loadPublishedTakeLedgerState } from './published-take-store';",
        "import { computePublishedTakeSalience, loadPublishedTakeLedgerState } from './published-take-store';\nimport { loadClancyCareerMemory, type ClancyCareerMemory } from './memory-intelligence';",
        'receipt imports')
    text = replace_once(text,
        """function handoff(speaker: 'Mason Reed' | 'Westy' | 'Mason Reed & Westy' | 'Editorial'): string {\n  if (speaker === 'Mason Reed & Westy') return 'Gentlemen?';\n  if (speaker === 'Editorial') return 'The corrected record stands.';\n  return `${speaker}?`;\n}\n""",
        """function handoff(speaker: 'Mason Reed' | 'Westy' | 'Mason Reed & Westy' | 'Editorial'): string {\n  if (speaker === 'Mason Reed & Westy') return 'Gentlemen?';\n  if (speaker === 'Editorial') return 'The corrected record stands.';\n  return `${speaker}?`;\n}\n\nfunction clancyHistoryAside(memory: ClancyCareerMemory | null, subject?: string): string {\n  if (!memory || !subject) return '';\n  const target = normalize(subject);\n  const thread = Object.values(memory.subjectThreads).find(row => normalize(row.subject) === target);\n  if (!thread || thread.count < 2) return '';\n  return ` ${subject} has found its way back to this desk ${thread.count} times already.`;\n}\n""",
        'clancy aside helper')
    text = replace_once(text,
        "  const receipts: ReceiptItem[] = [];\n  const priorIssue = await latestPriorIssue(input.season, input.week - 1);\n",
        "  const receipts: ReceiptItem[] = [];\n  const priorIssue = await latestPriorIssue(input.season, input.week - 1);\n  const clancyMemory = await loadClancyCareerMemory(input.season).catch(() => null);\n",
        'clancy load')
    text = text.replace("The archive is annoyingly cooperative for once. ${handoff(speaker)}`", "The archive is annoyingly cooperative for once.${clancyHistoryAside(clancyMemory, chosen)} ${handoff(speaker)}`")
    text = text.replace("I checked twice; the result remained uncooperative. ${handoff(speaker)}`", "I checked twice; the result remained uncooperative.${clancyHistoryAside(clancyMemory, chosen)} ${handoff(speaker)}`")
    text = replace_once(text,
        ".filter(entry => (entry.status === 'reversed' || entry.status === 'weakened') && entry.previousClaim);\n    const reversal = reversals[0];",
        ".filter(entry => (entry.status === 'reversed' || entry.status === 'weakened') && entry.previousClaim)\n      .sort((a, b) => computePublishedTakeSalience(b, input.season, input.week) - computePublishedTakeSalience(a, input.season, input.week));\n    const reversal = reversals[0];",
        'reversal salience')
    text = text.replace("The archive has a long memory and very little tact. ${handoff(speaker)}`", "The archive has a long memory and very little tact.${clancyHistoryAside(clancyMemory, reversal.subject)}${reversal.changeReason ? ` Recorded reason: ${reversal.changeReason.note}` : ''} ${handoff(speaker)}`")
    text = replace_once(text,
        "      .filter(entry => entry.memorable || entry.claimType === 'prediction' || entry.claimType === 'reaction')\n      .reverse();\n",
        "      .filter(entry => entry.memorable || entry.claimType === 'prediction' || entry.claimType === 'reaction')\n      .sort((a, b) => computePublishedTakeSalience(b, input.season, input.week) - computePublishedTakeSalience(a, input.season, input.week));\n",
        'take salience ordering')
    text = text.replace("The calendar moved on; the quote declined to. ${handoff(speaker)}`", "The calendar moved on; the quote declined to.${clancyHistoryAside(clancyMemory, entry.subject)} ${handoff(speaker)}`")
    text = text.replace("One of those numbers was always going to age loudly. ${handoff('Mason Reed & Westy')}`", "One of those numbers was always going to age loudly.${clancyHistoryAside(clancyMemory, biggest.westy.team)} ${handoff('Mason Reed & Westy')}`")
    text = text.replace("The ranking has been invited back for questioning. ${handoff(list.speaker)}`", "The ranking has been invited back for questioning.${clancyHistoryAside(clancyMemory, ranking.team)} ${handoff(list.speaker)}`")
    RECEIPTS.write_text(text, encoding='utf-8')


def patch_source_pack() -> None:
    text = SOURCE_PACK.read_text(encoding='utf-8')
    if 'careerContinuity' in text and 'topSalientMemories' in text:
        return
    text = replace_once(text,
        "import { loadPublishedTakeLedgerState } from '@/lib/newsletter/published-take-store';",
        "import { computePublishedTakeSalience, loadPublishedTakeLedgerState } from '@/lib/newsletter/published-take-store';\nimport { loadCareerSeasonReviews, loadClancyCareerMemory } from '@/lib/newsletter/memory-intelligence';",
        'source-pack imports')
    text = replace_once(text,
        "    masonTakeState,\n    westyTakeState,\n  ] = await Promise.all([",
        "    masonTakeState,\n    westyTakeState,\n    masonSeasonReviews,\n    westySeasonReviews,\n    clancyCareerMemory,\n  ] = await Promise.all([",
        'source pack destructuring')
    text = replace_once(text,
        "    loadPublishedTakeLedgerState('entertainer', season).catch(() => ({ entries: [], processedNewsletterIds: [], updatedAt: null, extractionVersion: 0 })),\n    loadPublishedTakeLedgerState('analyst', season).catch(() => ({ entries: [], processedNewsletterIds: [], updatedAt: null, extractionVersion: 0 })),\n  ]);\n",
        "    loadPublishedTakeLedgerState('entertainer', season).catch(() => ({ entries: [], processedNewsletterIds: [], updatedAt: null, extractionVersion: 0 })),\n    loadPublishedTakeLedgerState('analyst', season).catch(() => ({ entries: [], processedNewsletterIds: [], updatedAt: null, extractionVersion: 0 })),\n    loadCareerSeasonReviews('entertainer', season, 6).catch(() => []),\n    loadCareerSeasonReviews('analyst', season, 6).catch(() => []),\n    loadClancyCareerMemory(season).catch(() => null),\n  ]);\n\n  const masonSalientMemories = masonTakeState.entries\n    .map(entry => ({ ...entry, salience: computePublishedTakeSalience(entry, season, snapshotWeek) }))\n    .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0))\n    .slice(0, 40);\n  const westySalientMemories = westyTakeState.entries\n    .map(entry => ({ ...entry, salience: computePublishedTakeSalience(entry, season, snapshotWeek) }))\n    .sort((a, b) => (b.salience ?? 0) - (a.salience ?? 0))\n    .slice(0, 40);\n",
        'source pack promises')
    text = replace_once(text,
        "      continuity: 'Use publishedContinuity as the primary receipt system for what Mason and Westy previously argued. Use botContinuity.currentSeason for each host\\'s evolving personality, learned lessons, team/player relationships, co-host dynamics, and earned recurring bits. Preserve each host\\'s individual history. When new evidence changes a take, acknowledge the prior position and explain why it strengthened, weakened, or reversed. Do not force callbacks where they are not relevant.',\n      finalOutput: 'Return a polished PDF with no AI/process/meta language inside the newsletter.',\n",
        "      continuity: 'Use publishedContinuity as the primary receipt system for what Mason and Westy previously argued. Use botContinuity.currentSeason for each host\\'s evolving personality, learned lessons, team/player relationships, co-host dynamics, and earned recurring bits. Preserve each host\\'s individual history. When new evidence changes a take, acknowledge the prior position and explain why it strengthened, weakened, or reversed. Do not force callbacks where they are not relevant.',\n      characterMemory: 'Use careerContinuity for long-term growth. Season self-reviews are durable lessons and career context, not weekly talking points. Clancy career memory lets him recognize recurring receipts and running accountability threads without becoming a third football pundit.',\n      finalOutput: 'Return a polished PDF with no AI/process/meta language inside the newsletter.',\n",
        'source pack directive')
    text = replace_once(text,
        "      'Take-ledger entries preserve host attribution, source issue, subject, stance, confidence, and whether the position strengthened, weakened, reversed, resolved, or proved wrong.',\n",
        "      'Take-ledger entries preserve host attribution, source issue, subject, stance, confidence, and whether the position strengthened, weakened, reversed, resolved, or proved wrong.',\n      'Each take now carries deterministic salience. Higher scores deserve priority based on recency, importance, emotional weight, confidence, later references, and whether the take materially changed or failed.',\n      'When a take changes, changeReason distinguishes a true miss or evaluation update from changed circumstances such as injury, role, transaction, performance evidence, or new information.',\n",
        'source pack data notes')
    text = replace_once(text,
        "      westy: westyTakeState.entries,\n      processedNewsletterIds: {\n",
        "      westy: westyTakeState.entries,\n      topSalientMemories: {\n        mason: masonSalientMemories,\n        westy: westySalientMemories,\n      },\n      processedNewsletterIds: {\n",
        'salient pack')
    text = replace_once(text,
        "        'A callback should identify the prior position accurately and then connect it to the current evidence.',\n      ],\n    },\n    botContinuity: {\n",
        "        'A callback should identify the prior position accurately and then connect it to the current evidence.',\n        'Use topSalientMemories first when choosing long-term callbacks. Low-salience history should stay in the background unless directly relevant.',\n        'If changeReason says circumstances_changed, do not frame the update as hypocrisy or a prediction miss.',\n      ],\n    },\n    careerContinuity: {\n      seasonSelfReviews: { mason: masonSeasonReviews, westy: westySeasonReviews },\n      clancy: clancyCareerMemory,\n      instructions: [\n        'Season self-reviews summarize what each pundit actually learned, missed, got right, and carried forward. Use them to make growth gradual and consistent across years.',\n        'Clancy remembers recurring subjects, famous receipts, and prior accountability threads. He may make a dry callback when it earns one, but he remains a moderator/historian rather than a third fantasy analyst.',\n      ],\n    },\n    botContinuity: {\n",
        'career continuity pack')
    SOURCE_PACK.write_text(text, encoding='utf-8')


def patch_test() -> None:
    if not TEST.exists():
        return
    text = TEST.read_text(encoding='utf-8')
    if 'long-term newsletter memory intelligence' in text:
        return
    import_line = "import { readFileSync as readMemoryIntelligenceFile } from 'node:fs';\n"
    if import_line not in text:
        text = import_line + text
    text += r'''

describe('long-term newsletter memory intelligence', () => {
  it('keeps salience, season reviews, Clancy career memory, and change reasons model-free', () => {
    const store = readMemoryIntelligenceFile('src/lib/newsletter/published-take-store.ts', 'utf8');
    const ledger = readMemoryIntelligenceFile('src/lib/newsletter/published-take-ledger.ts', 'utf8');
    const intelligence = readMemoryIntelligenceFile('src/lib/newsletter/memory-intelligence.ts', 'utf8');
    const sourcePack = readMemoryIntelligenceFile('src/app/api/admin/newsletter/external-export/route-core.ts', 'utf8');
    expect(store).toContain('computePublishedTakeSalience');
    expect(store).toContain('PublishedTakeChangeReason');
    expect(ledger).toContain('inferChangeReason');
    expect(ledger).toContain('buildSeasonSelfReview');
    expect(intelligence).toContain('updateClancyCareerMemory');
    expect(intelligence).toContain('seasonSelfReview');
    expect(sourcePack).toContain('topSalientMemories');
    expect(sourcePack).toContain('careerContinuity');
  });
});
'''
    TEST.write_text(text, encoding='utf-8')


def main() -> None:
    for path in (STORE, LEDGER, RECEIPTS, SOURCE_PACK):
        if not path.exists():
            raise RuntimeError(f'Missing required newsletter memory file: {path}')
    INTELLIGENCE.write_text(MEMORY_INTELLIGENCE_TS, encoding='utf-8')
    patch_store()
    patch_ledger()
    patch_receipts()
    patch_source_pack()
    patch_test()
    print('[newsletter-memory-intelligence] Added salience, season self-reviews, Clancy career memory, and change reasons without paid memory services.')


if __name__ == '__main__':
    main()
