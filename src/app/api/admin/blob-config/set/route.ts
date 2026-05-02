import { NextRequest, NextResponse } from 'next/server';
import { getKV } from '@/lib/server/kv';
import { getConfiguredAdminSecret } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function okKey(key: string | null): boolean {
  const primary = getConfiguredAdminSecret();
  const fallback = process.env.EVW_ADMIN_SECRET_FALLBACK?.trim() || null;
  if (!key) return false;
  return key === primary || key === fallback;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!okKey(key)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const token = url.searchParams.get('token') || '';
  const host = url.searchParams.get('host') || '';
  const kv = await getKV().catch(() => null);
  if (!kv) return NextResponse.json({ error: 'kv_unavailable' }, { status: 500 });
  const out: Record<string, boolean> = {};
  if (token) { await kv.set('blob:token', token); out.token = true; }
  if (host) { await kv.set('blob:public_host', host); out.host = true; }
  return NextResponse.json({ ok: true, ...out });
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!okKey(key)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({} as { token?: string; host?: string }));
  const token = typeof body?.token === 'string' ? body.token : '';
  const host = typeof body?.host === 'string' ? body.host : '';
  const kv = await getKV().catch(() => null);
  if (!kv) return NextResponse.json({ error: 'kv_unavailable' }, { status: 500 });
  const out: Record<string, boolean> = {};
  if (token) { await kv.set('blob:token', token); out.token = true; }
  if (host) { await kv.set('blob:public_host', host); out.host = true; }
  return NextResponse.json({ ok: true, ...out });
}
