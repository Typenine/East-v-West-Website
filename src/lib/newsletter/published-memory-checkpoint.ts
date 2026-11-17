/**
 * One publication checkpoint, separated from the public publish/Discord route
 * so it can be tested with inert adapters without posting any real issue.
 * A failure here does not roll back public publication, but it is visible.
 */
import { recordPublishedTakeLedger } from './published-take-ledger';
import { updateBotMemoryFromPublish } from './publish-memory';

export interface PublishedMemoryCheckpointResult {
  publishedLedgerSynced: boolean;
  characterMemorySynced: boolean;
  error: string | null;
}

type CheckpointDependencies = {
  record: (id: string) => Promise<boolean>;
  update: (id: string) => Promise<unknown>;
};

export async function checkpointPublishedMemory(
  issueId: string,
  deps: CheckpointDependencies = { record: recordPublishedTakeLedger, update: updateBotMemoryFromPublish },
): Promise<PublishedMemoryCheckpointResult> {
  let publishedLedgerSynced = false;
  try {
    publishedLedgerSynced = await deps.record(issueId);
    if (!publishedLedgerSynced) {
      return {
        publishedLedgerSynced: false,
        characterMemorySynced: false,
        error: 'No attributable host dialogue recovered',
      };
    }
    await deps.update(issueId);
    return { publishedLedgerSynced: true, characterMemorySynced: true, error: null };
  } catch (error) {
    return {
      publishedLedgerSynced,
      characterMemorySynced: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Write the result of BOTH memory phases to the issue row. A successfully
 * processed take ledger is not proof that character relationships were saved.
 *
 * Kept separate from the pure checkpoint for isolated regression testing.
 * No publish/Discord operation occurs here.
 */
export async function checkpointAndRecordPublishedMemory(
  issueId: string,
  deps?: CheckpointDependencies,
  persist?: (id: string, result: PublishedMemoryCheckpointResult) => Promise<void>,
): Promise<PublishedMemoryCheckpointResult> {
  const result = deps ? await checkpointPublishedMemory(issueId, deps) : await checkpointPublishedMemory(issueId);
  try {
    if (persist) {
      await persist(issueId, result);
    } else {
      const { getDb } = await import('@/server/db/client');
      const { newsletters } = await import('@/server/db/schema');
      const { eq } = await import('drizzle-orm');
      const changed = await getDb().update(newsletters).set({
        memorySyncStatus: result.error ? 'failed' : 'synced',
        memorySyncError: result.error ? result.error.slice(0, 1600) : null,
        memorySyncCheckedAt: new Date(),
      }).where(eq(newsletters.id, issueId)).returning({ id: newsletters.id });
      if (!changed.length) throw new Error('Published newsletter no longer exists');
    }
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[NewsletterMemory] Cannot persist character sync status', issueId, detail);
    return { ...result,
      error: [result.error, 'Memory sync status could not be saved: ' + detail].filter(Boolean).join('; '),
    };
  }
}
