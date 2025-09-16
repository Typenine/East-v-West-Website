import { NextRequest, NextResponse } from 'next/server';
import * as VercelKV from '@vercel/kv';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

// Optional: Vercel KV if configured
type KVType = { get: <T = unknown>(key: string) => Promise<T | null>; set: (key: string, val: unknown) => Promise<void> };
const kv: KVType | null = (VercelKV && typeof (VercelKV as unknown as Record<string, unknown>).kv === 'object')
  ? ((VercelKV as unknown as { kv: KVType }).kv)
  : null;

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

const KV_KEY = 'evw:manual_trades:v1';

// GitHub Content API config
const GH_TOKEN = process.env.GITHUB_CONTENT_TOKEN || '';
const GH_REPO = process.env.GITHUB_CONTENT_REPO || '';
const GH_BRANCH = process.env.GITHUB_CONTENT_BRANCH || 'main';
const GH_PATH = process.env.GITHUB_CONTENT_PATH || 'data/manual_trades.json';
const GH_API_BASE = 'https://api.github.com';

function ghEnabled() {
  return Boolean(GH_TOKEN && GH_REPO && GH_PATH);
}

async function ghReadFile(): Promise<{ json: ManualTrade[]; sha?: string } | null> {
  if (!ghEnabled()) return null;
  const url = `${GH_API_BASE}/repos/${GH_REPO}/contents/${encodeURIComponent(GH_PATH)}?ref=${encodeURIComponent(GH_BRANCH)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (res.status === 404) return { json: [], sha: undefined };
  if (!res.ok) return null;
  const data = await res.json() as { content?: string; sha?: string; encoding?: string };
  const b64 = data.content || '';
  const raw = b64 ? Buffer.from(b64, 'base64').toString('utf-8') : '[]';
  try {
    const json = JSON.parse(raw) as ManualTrade[];
    return { json: Array.isArray(json) ? json : [], sha: data.sha };
  } catch {
    return { json: [], sha: data.sha };
  }
}

async function ghWriteFile(trades: ManualTrade[]) {
  if (!ghEnabled()) return false;
  // Get current sha (create if missing)
  let sha: string | undefined;
  try {
    const cur = await ghReadFile();
    sha = cur?.sha;
  } catch {}
  const url = `${GH_API_BASE}/repos/${GH_REPO}/contents/${encodeURIComponent(GH_PATH)}`;
  const content = Buffer.from(JSON.stringify(trades, null, 2), 'utf-8').toString('base64');
  const body = {
    message: 'chore(manual-trades): update manual trades via admin API',
    content,
    branch: GH_BRANCH,
    sha,
  };
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}

async function loadAll(): Promise<ManualTrade[]> {
  // 1) GitHub
  try {
    const gh = await ghReadFile();
    if (gh) return gh.json;
  } catch {}
  // 2) Vercel KV
  try {
    if (kv) {
      const arr = (await kv.get<ManualTrade[] | null>(KV_KEY)) || [];
      if (Array.isArray(arr)) return arr;
    }
  } catch {}
  // 3) Local file (dev)
  try {
    const p = join(process.cwd(), 'data', 'manual_trades.json');
    const raw = await readFile(p, 'utf-8');
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j as ManualTrade[];
  } catch {}
  // 4) In-memory
  return memoryStore.trades || [];
}

async function saveAll(trades: ManualTrade[]) {
  // 1) GitHub
  try {
    if (await ghWriteFile(trades)) return;
  } catch {}
  // 2) Vercel KV
  try {
    if (kv) {
      await kv.set(KV_KEY, trades);
      return;
    }
  } catch {}
  // 3) Local file (dev)
  try {
    const p = join(process.cwd(), 'data', 'manual_trades.json');
    await writeFile(p, JSON.stringify(trades, null, 2), 'utf-8');
    return;
  } catch {}
  // 4) In-memory
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
