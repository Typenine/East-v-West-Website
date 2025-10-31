import { NextRequest, NextResponse } from 'next/server';
import { list, put } from '@vercel/blob';

// In-memory fallback (dev/local only)
let memoryStore: { trades: ManualTrade[]; ts: number } = { trades: [], ts: 0 };

export type ManualTradeAsset =
  | { type: 'player'; name: string; position?: string; team?: string; playerId?: string }
  | { type: 'pick'; name: string; year?: string; round?: number; draftSlot?: number; originalOwner?: string; pickInRound?: number; became?: string; becamePosition?: string; becameTeam?: string; becamePlayerId?: string }
  | { type: 'cash'; name: string; amount?: number };

export type ManualTradeTeam = {
  name: string;
  assets: ManualTradeAsset[];
};

export type ManualTrade = {
  id: string;                // manual-<timestamp>-<rand> or override target id
  date: string;              // YYYY-MM-DD
  status: 'completed' | 'pending' | 'vetoed';
  teams: ManualTradeTeam[];
  notes?: string;
  overrideOf?: string | null; // Sleeper transaction_id if overriding
  active?: boolean;           // soft delete flag
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

const BLOB_PATH = 'evw/manual_trades.json';

async function loadAll(): Promise<ManualTrade[]> {
  // Blob primary
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, token: process.env.BLOB_READ_WRITE_TOKEN });
    const entry = blobs.find(b => b.pathname === BLOB_PATH) || null;
    if (entry) {
      const res = await fetch(entry.url, { cache: 'no-store' });
      if (res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          if (Array.isArray(json)) return json as ManualTrade[];
        } catch {}
      }
    }
  } catch {}
  // In-memory fallback (local only)
  return memoryStore.trades || [];
}

async function saveAll(trades: ManualTrade[]) {
  // Blob primary
  try {
    await put(BLOB_PATH, JSON.stringify(trades, null, 2), {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return;
  } catch {}
  // In-memory fallback
  memoryStore = { trades: trades.slice(), ts: Date.now() };
}

function isAdmin(req: NextRequest): boolean {
  const adminSecret = process.env.EVW_ADMIN_SECRET || '002023';
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length) === adminSecret;
  }
  const hdr = req.headers.get('x-admin-key');
  if (hdr && hdr === adminSecret) return true;
  const cookie = req.cookies.get('evw_admin')?.value;
  if (cookie && cookie === adminSecret) return true;
  return false;
}

function validateTradePayload(body: unknown): { ok: true; data: ManualTrade } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Invalid payload' };
  const b = body as Partial<ManualTrade>;
  if (!b.date || typeof b.date !== 'string') return { ok: false, error: 'Missing date' };
  if (!b.status || !['completed', 'pending', 'vetoed'].includes(b.status)) return { ok: false, error: 'Invalid status' };
  if (!Array.isArray(b.teams) || b.teams.length < 1) return { ok: false, error: 'At least one team required' };
  const id = b.id && typeof b.id === 'string' ? b.id : `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  const data: ManualTrade = {
    id,
    date: b.date,
    status: b.status as ManualTrade['status'],
    teams: (b.teams as ManualTradeTeam[]) || [],
    notes: b.notes || '',
    overrideOf: b.overrideOf || null,
    active: b.active !== false,
    createdBy: b.createdBy || 'admin',
    createdAt: b.createdAt || nowIso,
    updatedAt: nowIso,
  };
  return { ok: true, data };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const year = url.searchParams.get('year');
  const allParam = url.searchParams.get('all');
  const all = await loadAll();
  const active = all.filter(t => t.active !== false);
  const filtered = year ? active.filter(t => (t.date || '').startsWith(year)) : active;
  const payload = allParam ? active : filtered;
  return NextResponse.json({ trades: payload }, { status: 200 });
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const body = await req.json();
    const v = validateTradePayload(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const all = await loadAll();
    // If overriding, set id to override target for seamless routing
    if (v.data.overrideOf && typeof v.data.overrideOf === 'string') {
      v.data.id = v.data.overrideOf;
    }
    const existsIdx = all.findIndex(t => t.id === v.data.id);
    if (existsIdx >= 0) all.splice(existsIdx, 1);
    all.push(v.data);
    await saveAll(all);
    return NextResponse.json({ ok: true, trade: v.data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const body = await req.json();
    const v = validateTradePayload(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const all = await loadAll();
    const idx = all.findIndex(t => t.id === v.data.id);
    if (idx < 0) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    all[idx] = { ...all[idx], ...v.data, updatedAt: new Date().toISOString() };
    await saveAll(all);
    return NextResponse.json({ ok: true, trade: all[idx] }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const hard = url.searchParams.get('hard') === 'true';
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
    const all = await loadAll();
    const idx = all.findIndex(t => t.id === id);
    if (idx < 0) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (hard) {
      all.splice(idx, 1);
    } else {
      all[idx].active = false;
      all[idx].updatedAt = new Date().toISOString();
    }
    await saveAll(all);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
