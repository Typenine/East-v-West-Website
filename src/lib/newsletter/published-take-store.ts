import { and, eq } from 'drizzle-orm';
import type { BotName } from '@/lib/newsletter/types';
import { getDb } from '@/server/db/client';
import { botMemory } from '@/server/db/schema';
import type {
  EditorialClaimType,
  EditorialStance,
} from '@/lib/newsletter/editorial-memory';

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

  return {
    entries: entries.slice(-160),
    processedNewsletterIds: [...new Set(processed)].slice(-200),
    updatedAt: typeof rawState?.updatedAt === 'string' ? rawState.updatedAt : null,
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
    return { entries: [], processedNewsletterIds: [], updatedAt: null };
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
    entries: state.entries.slice(-160),
    processedNewsletterIds: [...new Set(state.processedNewsletterIds)].slice(-200),
    updatedAt,
  };

  await db
    .update(botMemory)
    .set({
      enhancedData: {
        ...current,
        publishedTakeLedgerState: normalized,
        // Keep the old key populated for compatibility with any code or old exports
        // that started reading the first ledger implementation.
        publishedTakeLedger: normalized.entries,
      },
      updatedAt: new Date(),
    })
    .where(eq(botMemory.id, rows[0].id));
}
