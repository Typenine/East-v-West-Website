import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredAdminSecret, isAdminCookieValue } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSecret(): string {
  return getConfiguredAdminSecret() || '';
}

function isAdmin(req: NextRequest): boolean {
  const cookie = req.cookies.get('evw_admin')?.value;
  return isAdminCookieValue(cookie);
}

export async function GET(req: NextRequest) {
  const secret = getSecret();
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || '';
  if (secret && key === secret) {
    const res = NextResponse.json({ ok: true }, { status: 200 });
    res.cookies.set('evw_admin', secret, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
    return res;
  }
  return NextResponse.json({ isAdmin: isAdmin(req) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const secret = getSecret();
  const body = await req.json().catch(() => ({} as { key?: string }));
  const key = typeof body?.key === 'string' ? body.key : '';
  if (!secret || key !== secret) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set('evw_admin', secret, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set('evw_admin', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
