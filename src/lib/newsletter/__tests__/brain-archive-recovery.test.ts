import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { GET as getBrainExport } from '@/app/api/admin/newsletter/brain-export/route';
import { POST as retryMemory } from '@/app/api/admin/newsletter/memory-health/route';

const read=(path:string)=>readFileSync(path,'utf8');

describe('permanent archive and safe publication recovery',()=>{
  it('keeps previously published host receipts in an append-only archive',()=>{
    const migration=read('drizzle/0025_bot_take_archive.sql');
    const store=read('src/lib/newsletter/published-take-store.ts');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS bot_take_archive');
    expect(migration).toContain('ON CONFLICT (bot,season,receipt_id) DO NOTHING');
    expect(migration).toContain("enhanced_data->'publishedTakeLedgerState'->'entries'");
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM|UPDATE bot_memory/i);
    expect(store).toContain('botTakeArchive.payload');
    expect(store).toContain('FROM jsonb_array_elements(');
    expect(store).toContain('ON CONFLICT (bot,season,receipt_id) DO NOTHING');
    expect(store).toContain('const completeEntries=JSON.stringify(state.entries)');
    expect(store).not.toContain('MAX_PROCESSED_ISSUES');
  });
  it('uses stable claim identities on an issue replay',()=>{
    const source=read('src/lib/newsletter/published-take-ledger.ts');
    expect(source).toContain("createHash('sha256')");
    expect(source).toContain('previousIssue.find(');
    expect(source).not.toContain('ledger.length + 1');
    expect(source).not.toContain('return ledger.slice(-480)');
  });
  it('requires admin access when retrying a saved issue',async()=>{
    const req=new NextRequest('https://east-v-west.com/api/admin/newsletter/memory-health',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({action:'retry_issue',issueId:'00000000-0000-4000-8000-000000000001',season:2026}),
    });
    const response=await retryMemory(req);
    expect(response.status).toBe(403);
  });
  it('retrying never publishes or sends Discord',()=>{
    const route=read('src/app/api/admin/newsletter/memory-health/route.ts');
    expect(route).toContain("body?.action === 'retry_issue'");
    expect(route).toContain('checkpointPublishedMemory(issueId)');
    expect(route).toContain('discordSent:false');
    expect(route).not.toContain('publishNewsletter(');
    expect(route).not.toContain('postDiscord');
  });
  it('uses a durable status column rather than only a transient publish response',()=>{
    const migration=read('drizzle/0026_newsletter_memory_sync_status.sql');
    const schema=read('src/server/db/schema.ts');
    const health=read('src/app/api/admin/newsletter/memory-health/route.ts');
    const checkpoint=read('src/lib/newsletter/published-memory-checkpoint.ts');
    expect(migration).toContain('memory_sync_status');
    expect(migration).not.toMatch(/DROP|DELETE|TRUNCATE/i);
    expect(schema).toContain('memorySyncStatus:');
    expect(checkpoint).toContain('memorySyncStatus: result.error');
    expect(health).toContain("memorySyncStatus === 'failed'");
    expect(health).toContain('checkpointAndRecordPublishedMemory(issueId)');
  });
  it('shows failed character memory to the main generator and saved newsletter list',()=>{
    const generator=read('src/app/admin/newsletter/page.tsx');
    const saved=read('src/app/admin/newsletter/SavedNewsletters.tsx');
    expect(generator).toContain('!data.memoryWarning');
    expect(saved).toContain('memoryWarningMessage');
    expect(read('src/app/api/newsletter/publish/route.ts')).toContain('checkpointAndRecordPublishedMemory(target.id)');
  });
  it('warns when either host fails to ingest a published issue',()=>{
    const route=read('src/app/api/newsletter/publish/route.ts');
    const editor=read('src/app/admin/newsletter/EditorialWorkspace.tsx');
    expect(route).toContain('memoryWarning');
    expect(route).toContain('announcementPending || memoryWarning ? 202 : 200');
    expect(editor).toContain('ok: !data.memoryWarning');
  });
  it('requires the existing admin cookie on all brain downloads',async()=>{
    for(const depth of ['full','active']){
      const response=await getBrainExport(new NextRequest(
        'https://east-v-west.com/api/admin/newsletter/brain-export?bot=mason&depth='+depth));
      expect(response.status).toBe(403);
    }
  });
});
