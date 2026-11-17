import { and, eq, sql } from 'drizzle-orm';
import type { BotName } from '@/lib/newsletter/types';
import { getDb } from '@/server/db/client';
import { botMemory, botTakeArchive } from '@/server/db/schema';
import type {
  EditorialClaimType,
  EditorialStance,
} from '@/lib/newsletter/editorial-memory';

// Increment when deterministic extraction changes require a one-time historical rebuild. Version 7 also rejects cached PDFs that predate structured season-pick receipts.
export const PUBLISHED_CONTINUITY_VERSION = 7;
const MAX_LEDGER_ENTRIES = 480;
// Processed issue IDs must not age out of the history manifest.

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
  // Original published wording and classification remain auditable after repair.
  originalClaim?: string;
  originalClaimType?: EditorialClaimType;
  classificationVersion?: number;
  qualityReviewRequired?: boolean;
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
    processedNewsletterIds: [...new Set(processed)],
    updatedAt: typeof rawState?.updatedAt === 'string' ? rawState.updatedAt : null,
    extractionVersion,
  };
}

export async function loadPublishedTakeLedgerState(
  bot: BotName,
  season: number,
): Promise<PublishedTakeLedgerState> {
  const db = getDb();
  const [rows, archive] = await Promise.all([
    db.select({enhancedData:botMemory.enhancedData}).from(botMemory)
      .where(and(eq(botMemory.bot,bot),eq(botMemory.season,season))).limit(1),
    db.select({payload:botTakeArchive.payload}).from(botTakeArchive)
      .where(and(eq(botTakeArchive.bot,bot),eq(botTakeArchive.season,season))),
  ]);
  const state=normalizeState((rows[0]?.enhancedData as EnhancedData|null)??{});
  // Original archived receipts are retained indefinitely. Any currently cached
  // reviewed classification/correction wins over its original archived copy.
  const all=new Map<string,PublishedTakeLedgerEntry>();
  for(const row of archive) {
    const claim=row.payload as unknown as PublishedTakeLedgerEntry;
    if(claim?.id)all.set(claim.id,claim);
  }
  for(const claim of state.entries)if(claim.id)all.set(claim.id,claim);
  state.entries=[...all.values()].sort((a,b)=>
    a.publishedAt.localeCompare(b.publishedAt)||a.id.localeCompare(b.id));
  return state;
}

export async function savePublishedTakeLedgerState(
  bot: BotName,
  season: number,
  state: PublishedTakeLedgerState,
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: botMemory.id })
    .from(botMemory)
    .where(and(eq(botMemory.bot, bot), eq(botMemory.season, season)))
    .limit(1);

  if (!rows.length) {
    throw new Error(`Cannot save published take ledger before ${bot} ${season} memory exists.`);
  }

  const updatedAt = new Date().toISOString();
  const normalized: PublishedTakeLedgerState = {
    entries: state.entries.slice(-MAX_LEDGER_ENTRIES),
    processedNewsletterIds: [...new Set(state.processedNewsletterIds)],
    updatedAt,
    extractionVersion: state.extractionVersion,
  };

  const completeEntries=JSON.stringify(state.entries);
  const cachePatch=JSON.stringify({
    publishedTakeLedgerState:normalized,
    publishedTakeLedger:normalized.entries,
  });
  // One atomic SQL statement writes original receipts to the immutable archive
  // and updates the compatibility cache without replacing unrelated bot fields.
  await db.execute(sql`WITH archived AS (
    INSERT INTO bot_take_archive (bot,season,receipt_id,source_newsletter_id,published_at,payload)
    SELECT ${bot}::bot_name,${season},take->>'id',take->>'sourceNewsletterId',
           COALESCE(NULLIF(take->>'publishedAt','')::timestamptz,NOW()),take
    FROM jsonb_array_elements(${completeEntries}::jsonb) take
    WHERE NULLIF(take->>'id','') IS NOT NULL
      AND NULLIF(take->>'sourceNewsletterId','') IS NOT NULL
    ON CONFLICT (bot,season,receipt_id) DO NOTHING
    RETURNING receipt_id
  ), updated_cache AS (
    UPDATE bot_memory SET
      enhanced_data=COALESCE(enhanced_data,'{}'::jsonb)||${cachePatch}::jsonb,
      updated_at=NOW()
    WHERE id=${rows[0].id}
    RETURNING id
  )
  SELECT (SELECT COUNT(*) FROM archived) AS newly_archived,
         (SELECT COUNT(*) FROM updated_cache) AS updated_rows`);
}
