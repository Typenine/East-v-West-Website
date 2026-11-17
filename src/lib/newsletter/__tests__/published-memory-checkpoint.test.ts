import { describe, expect, it, vi } from 'vitest';
import { checkpointPublishedMemory, checkpointAndRecordPublishedMemory } from '../published-memory-checkpoint';
import { readFileSync } from 'node:fs';

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
  it('records a durable failed checkpoint even after both ledgers were written',async()=>{
    const order:string[]=[];
    const persist=vi.fn(async (_id:string, result:{publishedLedgerSynced:boolean;characterMemorySynced:boolean;error:string|null})=>{
      order.push('persist:'+String(result.characterMemorySynced));
    });
    const outcome=await checkpointAndRecordPublishedMemory('saved-issue',{
      record:async()=>{order.push('ledger');return true},
      update:async()=>{order.push('characters');throw Error('simulated character write failure')},
    },persist);
    expect(outcome.publishedLedgerSynced).toBe(true);
    expect(outcome.characterMemorySynced).toBe(false);
    expect(outcome.error).toContain('simulated character write failure');
    expect(order).toEqual(['ledger','characters','persist:false']);
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it('reports a persistence failure instead of silently declaring green',async()=>{
    const outcome=await checkpointAndRecordPublishedMemory('saved-issue',{
      record:async()=>true, update:async()=>({}),
    },async()=>{throw Error('database did not accept status')});
    expect(outcome.characterMemorySynced).toBe(true);
    expect(outcome.error).toContain('Memory sync status could not be saved');
  });
  it('persists successful fully attributed updates as complete',async()=>{
    const persisted=vi.fn(async()=>{});
    const outcome=await checkpointAndRecordPublishedMemory('saved-issue',{
      record:async()=>true,update:async()=>({}),
    },persisted);
    expect(outcome).toEqual({publishedLedgerSynced:true,characterMemorySynced:true,error:null});
    expect(persisted).toHaveBeenCalledWith('saved-issue',outcome);
  });
  it('only treats issues as complete when both host ledgers contain them', () => {
    const source = readFileSync('src/lib/newsletter/published-take-ledger.ts', 'utf8');
    expect(source).toContain("entState.processedNewsletterIds.filter(id => anaState.processedNewsletterIds.includes(id))");
    expect(source).toContain("!recovered.entertainerText.trim() || !recovered.analystText.trim()");
    expect(source).toContain("issue.status !== 'published'");
    expect(source).toContain("Math.max(state.extractionVersion, PUBLISHED_CONTINUITY_VERSION)");
    expect(source).not.toContain("new Set([...entState.processedNewsletterIds, ...anaState.processedNewsletterIds])");
  });

});
