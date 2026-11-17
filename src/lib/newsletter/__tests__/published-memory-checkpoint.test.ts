import { describe, expect, it, vi } from 'vitest';
import { checkpointPublishedMemory } from '../published-memory-checkpoint';

describe('published newsletter memory checkpoint', () => {
  it('processes the exact issue ledger before character memory with no publishing or Discord calls', async () => {
    const order: string[] = [];
    const record = vi.fn(async (id: string) => { order.push('ledger:' + id); return true; });
    const update = vi.fn(async (id: string) => { order.push('characters:' + id); return { masonClaims: 5, westyClaims: 6 }; });
    const first = await checkpointPublishedMemory('archived-week-9', { record, update });
    expect(first).toEqual({ publishedLedgerSynced: true, characterMemorySynced: true, error: null });
    expect(order).toEqual(['ledger:archived-week-9', 'characters:archived-week-9']);
    const replay = await checkpointPublishedMemory('archived-week-9', { record, update });
    expect(replay).toEqual(first);
    expect(record).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('never updates character state if extraction cannot attribute host dialogue', async () => {
    const update = vi.fn(async () => {});
    const result = await checkpointPublishedMemory('missing', { record: async () => false, update });
    expect(result).toEqual({
      publishedLedgerSynced: false, characterMemorySynced: false,
      error: 'No attributable host dialogue recovered',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('reports partial failure without pretending memory was updated', async () => {
    const result = await checkpointPublishedMemory('week-4', {
      record: async () => true,
      update: async () => { throw new Error('simulated storage outage'); },
    });
    expect(result.publishedLedgerSynced).toBe(true);
    expect(result.characterMemorySynced).toBe(false);
    expect(result.error).toContain('simulated storage outage');
  });
});
