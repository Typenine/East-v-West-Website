import { NextRequest } from 'next/server';
import { requireTeamUser } from '@/lib/server/session';
import { readUserDoc, writeUserDoc, TradeAsset, TradeWants } from '@/lib/server/user-store';
import { getTeamAssets } from '@/lib/server/trade-assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ident = await requireTeamUser();
  if (!ident) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const doc = await readUserDoc(ident.userId, ident.team);
  return Response.json({ tradeBlock: doc.tradeBlock || [], tradeWants: doc.tradeWants || { text: '', positions: [] } });
}

export async function PUT(req: NextRequest) {
  const ident = await requireTeamUser();
  if (!ident) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body?.tradeBlock) ? (body.tradeBlock as TradeAsset[]) : null;
  const wants = (body?.tradeWants ?? {}) as TradeWants;
  if (!items) return Response.json({ error: 'tradeBlock array required' }, { status: 400 });

  const assets = await getTeamAssets(ident.team);
  const allowedPickYears = new Set(assets.picks.map((p) => p.year));

  const filtered: TradeAsset[] = [];
  const isPlayer = (x: unknown): x is { type: 'player'; playerId: string } => !!x && typeof x === 'object' && (x as Record<string, unknown>).type === 'player' && typeof (x as Record<string, unknown>).playerId === 'string';
  const isPick = (x: unknown): x is { type: 'pick'; year: number; round: number; originalTeam?: string } => {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    return o.type === 'pick' && typeof o.year === 'number' && typeof o.round === 'number';
  };
  const isFaab = (x: unknown): x is { type: 'faab'; amount?: number } => !!x && typeof x === 'object' && (x as Record<string, unknown>).type === 'faab';

  for (const it of items.slice(0, 200)) {
    if (isPlayer(it)) {
      const pid = it.playerId;
      if (pid && assets.players.includes(pid)) filtered.push({ type: 'player', playerId: pid });
    } else if (isPick(it)) {
      const yr = it.year;
      const rd = it.round;
      // Allow picks for years the team actually owns (current + next two years)
      if (Number.isFinite(yr) && allowedPickYears.has(yr) && Number.isFinite(rd) && rd >= 1 && rd <= 10) {
        const reqOrig = typeof (it as { originalTeam?: string }).originalTeam === 'string' ? (it as { originalTeam?: string }).originalTeam : undefined;
        let owned = reqOrig
          ? assets.picks.find((p) => p.year === yr && p.round === rd && p.originalTeam === reqOrig)
          : undefined;
        if (!owned) owned = assets.picks.find((p) => p.year === yr && p.round === rd);
        if (owned) filtered.push({ type: 'pick', year: yr, round: rd, originalTeam: owned.originalTeam });
      }
    } else if (isFaab(it)) {
      const amtRaw = (it as Record<string, unknown>).amount;
      const amt = typeof amtRaw === 'number' ? amtRaw : assets.faab;
      const safe = Math.max(0, Math.min(assets.faab, Number.isFinite(amt) ? amt : 0));
      filtered.push({ type: 'faab', amount: safe });
    }
  }

  const doc = await readUserDoc(ident.userId, ident.team);
  const oldBlock = doc.tradeBlock || [];
  const oldWants = doc.tradeWants || null;
  
  doc.tradeBlock = filtered;
  const pos = Array.isArray(wants.positions) ? wants.positions.map(String).slice(0, 12) : [];
  const text = typeof wants.text === 'string' ? wants.text.slice(0, 300) : undefined;
  // Validate contact preferences
  const mRaw = typeof wants.contactMethod === 'string' ? wants.contactMethod.toLowerCase() : undefined;
  const allowed = new Set(['text', 'discord', 'snap', 'sleeper']);
  const contactMethod = allowed.has(mRaw as string) ? (mRaw as 'text' | 'discord' | 'snap' | 'sleeper') : undefined;
  let phone: string | undefined;
  let snap: string | undefined;
  if (contactMethod === 'text') {
    const raw = typeof wants.phone === 'string' ? wants.phone : '';
    const digits = raw.replace(/[^0-9+]/g, '');
    // Keep a leading + if present, otherwise just digits
    phone = digits.slice(0, 20);
  } else if (contactMethod === 'snap') {
    const raw = typeof wants.snap === 'string' ? wants.snap : '';
    // Snap usernames: letters, numbers, underscore, dot; 3-15 typical but we allow up to 30
    const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '');
    snap = cleaned.slice(0, 30);
  }
  const newWants: TradeWants = { text, positions: pos, contactMethod, phone, snap };
  doc.tradeWants = newWants;
  doc.version = (doc.version || 0) + 1;
  const updatedAt = new Date().toISOString();
  doc.updatedAt = updatedAt;
  const ok = await writeUserDoc(doc);
  if (!ok) return Response.json({ error: 'Persist failed' }, { status: 500 });
  
  // Post trade block update immediately to Discord (best-effort, don't block response)
  try {
    const { computeDiff, buildTradeBlockReport, getTradeBlockBaseUrl } = await import('@/lib/server/trade-block-narrative');
    const diff = await computeDiff(oldBlock as TradeAsset[], filtered, oldWants as TradeWants | null, newWants);
    const baseUrl = getTradeBlockBaseUrl();
    
    const currentPlayers = filtered.filter((a) => a.type === 'player');
    
    const message = await buildTradeBlockReport({
      teamName: ident.team,
      diff,
      currentPlayers,
      baseUrl,
      updatedAt,
    });
    
    if (message) {
      const webhookUrl = process.env.DISCORD_TRADE_BLOCK_WEBHOOK_URL;
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: message }),
        }).catch((e) => console.error('Discord webhook error:', e));
      }
    }
  } catch (e) {
    console.error('Trade block webhook error:', e);
  }
  
  return Response.json({ ok: true, tradeBlock: doc.tradeBlock, tradeWants: doc.tradeWants });
}
