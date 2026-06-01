/**
 * Admin Bot Settings API
 * GET  /api/admin/newsletter/bot-settings?bot=entertainer|analyst
 * POST /api/admin/newsletter/bot-settings  { bot, ...fields }
 * DELETE /api/admin/newsletter/bot-settings?bot=  (reset to defaults)
 */

import { NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import {
  loadBotSettings,
  saveBotSettings,
  resetBotSettings,
} from '@/server/db/personality-queries';
import { ENTERTAINER_BRAIN, ANALYST_BRAIN } from '@/lib/newsletter/bot-brain';
import type { BotName } from '@/lib/newsletter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  try {
    return isAdminCookieValue(req.cookies.get('evw_admin')?.value);
  } catch {
    return false;
  }
}

function validBot(raw: unknown): BotName | null {
  if (raw === 'entertainer' || raw === 'analyst') return raw;
  return null;
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const bot = validBot(new URL(req.url).searchParams.get('bot'));
  if (!bot) return Response.json({ error: 'bot param required (entertainer|analyst)' }, { status: 400 });

  const [dbSettings, hardcoded] = await Promise.all([
    loadBotSettings(bot),
    Promise.resolve(bot === 'entertainer' ? ENTERTAINER_BRAIN : ANALYST_BRAIN),
  ]);

  return Response.json({
    bot,
    hardcodedDefaults: {
      displayName: hardcoded.displayName,
      role: hardcoded.role,
      voice: hardcoded.voice,
      safetyBoundaries: hardcoded.safetyBoundaries,
      blindSpots: hardcoded.blindSpots,
    },
    dbOverrides: dbSettings ?? null,
    effectiveDisplayName: dbSettings?.displayName ?? hardcoded.displayName,
  });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const bot = validBot(body.bot);
  if (!bot) return Response.json({ error: 'bot field required (entertainer|analyst)' }, { status: 400 });

  // Only accept known safe fields — never forward arbitrary data
  const data: Parameters<typeof saveBotSettings>[1] = {};

  if (typeof body.displayName === 'string' && body.displayName.trim()) {
    data.displayName = body.displayName.trim().slice(0, 255);
  }
  if (typeof body.roleDescription === 'string') {
    data.roleDescription = body.roleDescription.trim() || null;
  }
  if (body.voiceConfig && typeof body.voiceConfig === 'object') {
    const vc = body.voiceConfig as Record<string, unknown>;
    data.voiceConfig = {
      sarcasm:      typeof vc.sarcasm === 'number'      ? Math.min(10, Math.max(0, vc.sarcasm))      : undefined,
      excitability: typeof vc.excitability === 'number' ? Math.min(10, Math.max(0, vc.excitability)) : undefined,
      depth:        typeof vc.depth === 'number'        ? Math.min(10, Math.max(0, vc.depth))        : undefined,
      snark:        typeof vc.snark === 'number'        ? Math.min(10, Math.max(0, vc.snark))        : undefined,
    };
  }
  if (Array.isArray(body.bannedPhrases)) {
    data.bannedPhrases = (body.bannedPhrases as unknown[])
      .filter((p): p is string => typeof p === 'string' && p.trim().length >= 3)
      .map(p => p.trim())
      .slice(0, 100);
  }
  if (Array.isArray(body.safetyBoundaries)) {
    data.safetyBoundaries = (body.safetyBoundaries as unknown[])
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map(s => s.trim())
      .slice(0, 20);
  }
  if (typeof body.adminNotes === 'string') {
    data.adminNotes = body.adminNotes.trim() || null;
  }

  try {
    await saveBotSettings(bot, data);
    return Response.json({ ok: true, bot });
  } catch (err) {
    console.error('[admin/bot-settings] save failed:', err);
    return Response.json({ error: 'save failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const bot = validBot(new URL(req.url).searchParams.get('bot'));
  if (!bot) return Response.json({ error: 'bot param required' }, { status: 400 });

  try {
    await resetBotSettings(bot);
    return Response.json({ ok: true, bot, message: 'Settings reset to hardcoded defaults' });
  } catch (err) {
    console.error('[admin/bot-settings] reset failed:', err);
    return Response.json({ error: 'reset failed' }, { status: 500 });
  }
}
