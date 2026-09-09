import { and, eq } from 'drizzle-orm';
import type { BotName } from '@/lib/newsletter/types';
import { getDb } from '@/server/db/client';
import { botMemory } from '@/server/db/schema';
import type {
  EditorialClaimType,
  EditorialStance,
} from '@/lib/newsletter/editorial-memory';

// Increment when deterministic extraction changes require a one-time historical rebuild.
export const PUBLISHED_CONTINUITY_VERSION = 6;
const MAX_LEDGER_ENTRIES = 480;
const MAX_PROCESSED_ISSUES = 240;

export type PublishedTakeStatus = 'active' | 'strengthened' | 'weakened' | 'reversed' | 'resolved' | 'wrong';

export interface PublishedTakeLedgerEntry {
  id: string;
  sourceNewsletterId: string;
  title: string | null;
  episodeType: string | null;
  season: number;
  week: number;
  subjectType: 'team' | 'player' | 'league';
  subject: string;
  relatedTeam?: string;
  claim: string;
  claimType: EditorialClaimType;
  stance: EditorialStance;
  confidence: number;
  memorable: boolean;
  status: PublishedTakeStatus;
  previousClaim?: string;
  publishedAt: string;
}

export interface PublishedTakeLedgerState {
  entries: PublishedTakeLedgerEntry[];
  processedNewsletterIds: string[];
  updatedAt: string | null;
  extractionVersion: number;
}

type EnhancedData = Record<string, unknown>;

function normalizeState(enhancedData: EnhancedData): PublishedTakeLedgerState {
  const rawState = enhancedData.publishedTakeLedgerState as Partial<PublishedTakeLedgerState> | undefined;
  const legacyEntries = Array.isArray(enhancedData.publishedTakeLedger)
    ? enhancedData.publishedTakeLedger as PublishedTakeLedgerEntry[]
    : [];
  const entries = Array.isArray(rawState?.entries) ? rawState.entries : legacyEntries;
  const processed = Array.isArray(rawState?.processedNewsletterIds)
    ? rawState.processedNewsletterIds.filter((value): value is string => typeof value === 'string')
    : [...new Set(entries.map(entry => entry.sourceNewsletterId).filter(Boolean))];
  const extractionVersion = typeof rawState?.extractionVersion === 'number'
    ? rawState.extractionVersion
    : entries.length > 0
      ? 1
      : PUBLISHED_CONTINUITY_VERSION;

  return {
    entries: entries.slice(-MAX_LEDGER_ENTRIES),
    processedNewsletterIds: [...new Set(processed)].slice(-MAX_PROCESSED_ISSUES),
    updatedAt: typeof rawState?.updatedAt === 'string' ? rawState.updatedAt : null,
    extractionVersion,
  };
}

export async function loadPublishedTakeLedgerState(
  bot: BotName,
  season: number,
): Promise<PublishedTakeLedgerState> {
  const db = getDb();
  const rows = await db
    .select({ enhancedData: botMemory.enhancedData })
    .from(botMemory)
    .where(and(eq(botMemory.bot, bot), eq(botMemory.season, season)))
    .limit(1);

  if (!rows.length) {
    return { entries: [], processedNewsletterIds: [], updatedAt: null, extractionVersion: PUBLISHED_CONTINUITY_VERSION };
  }

  return normalizeState((rows[0].enhancedData as EnhancedData | null) ?? {});
}

export async function savePublishedTakeLedgerState(
  bot: BotName,
  season: number,
  state: PublishedTakeLedgerState,
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: botMemory.id, enhancedData: botMemory.enhancedData })
    .from(botMemory)
    .where(and(eq(botMemory.bot, bot), eq(botMemory.season, season)))
    .limit(1);

  if (!rows.length) {
    throw new Error(`Cannot save published take ledger before ${bot} ${season} memory exists.`);
  }

  const current = ((rows[0].enhancedData as EnhancedData | null) ?? {});
  const updatedAt = new Date().toISOString();
  const normalized: PublishedTakeLedgerState = {
    entries: state.entries.slice(-MAX_LEDGER_ENTRIES),
    processedNewsletterIds: [...new Set(state.processedNewsletterIds)].slice(-MAX_PROCESSED_ISSUES),
    updatedAt,
    extractionVersion: state.extractionVersion,
  };

  await db
    .update(botMemory)
    .set({
      enhancedData: {
        ...current,
        publishedTakeLedgerState: normalized,
        publishedTakeLedger: normalized.entries,
      },
      updatedAt: new Date(),
    })
    .where(eq(botMemory.id, rows[0].id));
}
