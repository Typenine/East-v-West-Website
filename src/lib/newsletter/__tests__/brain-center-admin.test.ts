import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/admin/newsletter/brain-center/route';

describe('admin-only Bot Brain Center', () => {
  it('rejects unauthenticated memory reads before querying the character database', async () => {
    const result = await GET(new NextRequest('https://east-v-west.com/api/admin/newsletter/brain-center?bot=entertainer&season=2026'));
    expect(result.status).toBe(403);
    expect((await result.json()).error).toBe('Forbidden');
  });
  it('rejects unauthenticated editorial writes before parsing the body', async () => {
    const result = await POST(new NextRequest('https://east-v-west.com/api/admin/newsletter/brain-center', { method:'POST' }));
    expect(result.status).toBe(403);
  });
  it('does not rewrite published newsletter text or call Discord during editorial reviews', () => {
    const source = readFileSync('src/app/api/admin/newsletter/brain-center/route.ts','utf8');
    expect(source).toContain('loadPublishedTakeLedgerState');
    expect(source).toContain('brainAdmin:next');
    expect(source).toContain("COALESCE((${botMemory.enhancedData}->'brainAdmin'->>'revision')::int,0)");
    expect(source).not.toContain('publishNewsletter(');
    expect(source).not.toContain('sendDiscord');
    expect(source).not.toContain('savePublishedTakeLedgerState(');
    expect(source).toContain("reviewStatus:body.reviewStatus as Review");
  });
  it('keeps source receipts separate from corrections and voice examples', () => {
    const source=readFileSync('src/app/api/admin/newsletter/brain-center/route.ts','utf8');
    expect(source).toContain('sourceNewsletterId:receipt.sourceNewsletterId');
    expect(source).toContain('correction:cut(body.correction,600)');
    expect(source).toContain("status:'proposed' as const");
    expect(source).toContain('next.history=[{at:now,action');
  });
  it('preserves current controls and the separate memory health tab', () => {
    const page=readFileSync('src/app/admin/newsletter/personality/page.tsx','utf8');
    expect(page).toContain('<BotBrainCenter onEditSettings');
    for(const name of ['Bot Settings','Team Cards','Phrase Pools','Preview Tool','Memory Health']) expect(page).toContain(name);
  });
});
