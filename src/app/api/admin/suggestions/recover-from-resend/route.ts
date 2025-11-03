import { NextRequest } from 'next/server';
import { getKV } from '@/lib/server/kv';
import { Suggestion } from '@/app/api/suggestions/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  const adminSecret = process.env.EVW_ADMIN_SECRET || '002023';
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) return auth.slice('Bearer '.length) === adminSecret;
  const hdr = req.headers.get('x-admin-key');
  if (hdr && hdr === adminSecret) return true;
  const cookie = req.cookies.get('evw_admin')?.value;
  if (cookie && cookie === adminSecret) return true;
  return false;
}

function getResendKey(req: NextRequest): string | undefined {
  const url = new URL(req.url);
  const q = url.searchParams.get('rkey');
  if (q && q.trim()) return q.trim();
  const h = req.headers.get('x-resend-key');
  if (h && h.trim()) return h.trim();
  return process.env.RESEND_API_KEY;
}

async function fetchResendEmails(req: NextRequest, limit = 1000): Promise<Array<{ id: string; created_at?: string; subject?: string; to?: string[]; from?: string; text?: string; html?: string }>> {
  const key = getResendKey(req);
  if (!key) throw new Error('RESEND_API_KEY missing');
  const url = `https://api.resend.com/emails?limit=${limit}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`Resend list failed: ${r.status}`);
  const j = (await r.json()) as { data?: Array<Record<string, unknown>> };
  const arr = (j?.data || []) as Array<Record<string, unknown>>;
  return arr.map((o) => ({
    id: String(o['id'] || ''),
    created_at: typeof o['created_at'] === 'string' ? (o['created_at'] as string) : undefined,
    subject: typeof o['subject'] === 'string' ? (o['subject'] as string) : undefined,
    to: Array.isArray(o['to']) ? (o['to'] as string[]) : undefined,
    from: typeof o['from'] === 'string' ? (o['from'] as string) : undefined,
    text: typeof o['text'] === 'string' ? (o['text'] as string) : undefined,
    html: typeof o['html'] === 'string' ? (o['html'] as string) : undefined,
  }));
}

function parseSuggestionFromEmail(e: { created_at?: string; subject?: string; text?: string; html?: string }): Suggestion | null {
  const subj = e.subject || '';
  if (!subj.toLowerCase().startsWith('new suggestion')) return null;
  const createdAt = e.created_at || new Date().toISOString();
  // Try to parse category from subject: "New suggestion (Category)"
  let category: string | undefined;
  const m = subj.match(/New suggestion\s*\(([^)]+)\)/i);
  if (m) category = m[1];
  // Extract content from text fallback; html variant is also present
  let content = e.text || '';
  if (!content && e.html) {
    content = e.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // The API email text format we send is known; trim header lines
  // Keep everything after two blank lines if present
  const parts = content.split(/\n\s*\n/);
  if (parts.length >= 2) content = parts.slice(-1)[0].trim();
  if (!content) return null;
  // Generate a deterministic id from timestamp+hash of content
  const id = `${Date.parse(createdAt) || Date.now()}-${Buffer.from(content).toString('base64').slice(0,6)}`;
  return { id, content, category, createdAt };
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const emails = await fetchResendEmails(req, 1000);
    const items: Suggestion[] = [];
    for (const e of emails) {
      const s = parseSuggestionFromEmail(e);
      if (s) items.push(s);
    }
    if (items.length === 0) return Response.json({ ok: true, recovered: 0 });

    // De-dup by id, prefer earliest createdAt order
    items.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const map = new Map<string, Suggestion>();
    for (const it of items) map.set(it.id, it);
    const deduped = Array.from(map.values());

    // Write through existing admin import path (ensures dual write)
    const r = await fetch(`${new URL(req.url).origin}/api/admin/suggestions/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': req.headers.get('x-admin-key') || '' },
      body: JSON.stringify({ items: deduped }),
    });
    const j = await r.json().catch(() => ({}));
    return Response.json({ ok: r.ok, recovered: deduped.length, import: j }, { status: r.ok ? 200 : 500 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'server_error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get('key') || '';
    const adminSecret = process.env.EVW_ADMIN_SECRET || '002023';
    if (!key || key !== adminSecret) return Response.json({ error: 'forbidden' }, { status: 403 });

    // Same flow as POST
    const emails = await fetchResendEmails(req, 1000);
    const items: Suggestion[] = [];
    for (const e of emails) {
      const s = parseSuggestionFromEmail(e);
      if (s) items.push(s);
    }
    if (items.length === 0) return Response.json({ ok: true, recovered: 0 });

    items.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const map = new Map<string, Suggestion>();
    for (const it of items) map.set(it.id, it);
    const deduped = Array.from(map.values());

    const r = await fetch(`${new URL(req.url).origin}/api/admin/suggestions/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-key': adminSecret },
      body: JSON.stringify({ items: deduped }),
    });
    const j = await r.json().catch(() => ({}));
    return Response.json({ ok: r.ok, recovered: deduped.length, import: j }, { status: r.ok ? 200 : 500 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'server_error' }, { status: 500 });
  }
}
