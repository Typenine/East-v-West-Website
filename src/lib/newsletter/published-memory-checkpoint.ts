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
