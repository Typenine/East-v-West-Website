/**
 * Admin Phrase Pools API
 * GET    /api/admin/newsletter/phrase-pools              — list all pools
 * GET    /api/admin/newsletter/phrase-pools?key=poolKey — single pool
 * POST   /api/admin/newsletter/phrase-pools             { poolKey, phrases, adminNotes? }
 * DELETE /api/admin/newsletter/phrase-pools?key=poolKey — remove pool
 *
 * Well-known pool keys:
 *   banned_global     — phrases blocked in all guardrail checks
 *   mason_openers     — extra openers for Mason Reed
 *   westy_closers     — extra closers for Westy
 *   team:{Name}:bits  — team-specific approved bits
 *   phase:{type}:hints — per-episode-type behavioral hints
 */

import { NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import {
  loadPhrasePool,
  loadAllPhrasePools,
  savePhrasePool,
  deletePhrasePool,
} from '@/server/db/personality-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KNOWN_POOL_KEYS = [
  'banned_global',
  'mason_openers',
  'mason_closers',
  'westy_openers',
  'westy_closers',
];

function isAdmin(req: NextRequest): boolean {
  try {
    return isAdminCookieValue(req.cookies.get('evw_admin')?.value);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const keyParam = new URL(req.url).searchParams.get('key');
  if (keyParam) {
    const phrases = await loadPhrasePool(keyParam);
    return Response.json({ poolKey: keyParam, phrases: phrases ?? [] });
  }

  const pools = await loadAllPhrasePools();
  return Response.json({ pools, wellKnownKeys: KNOWN_POOL_KEYS });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const poolKey = typeof body.poolKey === 'string' ? body.poolKey.trim() : '';
  if (!poolKey || poolKey.length < 2 || poolKey.length > 128) {
    return Response.json({ error: 'poolKey required (2-128 chars)' }, { status: 400 });
  }

  if (!Array.isArray(body.phrases)) {
    return Response.json({ error: 'phrases array required' }, { status: 400 });
  }

  const phrases = (body.phrases as unknown[])
    .filter((p): p is string => typeof p === 'string' && p.trim().length >= 2)
    .map(p => p.trim())
    .slice(0, 200);

  const adminNotes = typeof body.adminNotes === 'string' ? body.adminNotes.trim() : undefined;

  try {
    await savePhrasePool(poolKey, phrases, adminNotes);
    return Response.json({ ok: true, poolKey, count: phrases.length });
  } catch (err) {
    console.error('[admin/phrase-pools] save failed:', err);
    return Response.json({ error: 'save failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const key = new URL(req.url).searchParams.get('key');
  if (!key) return Response.json({ error: 'key param required' }, { status: 400 });

  try {
    await deletePhrasePool(key);
    return Response.json({ ok: true, key });
  } catch (err) {
    console.error('[admin/phrase-pools] delete failed:', err);
    return Response.json({ error: 'delete failed' }, { status: 500 });
  }
}
