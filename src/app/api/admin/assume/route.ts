import { NextRequest, NextResponse } from 'next/server';
import { signSession } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || '';
  const team = url.searchParams.get('team') || '';
  const adminSecret = process.env.EVW_ADMIN_SECRET || '002023';
  if (!key || key !== adminSecret) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!team) return NextResponse.json({ error: 'team required' }, { status: 400 });
  const ttlDays = 30;
  const token = signSession({ sub: team, team, pv: 999999, exp: Date.now() + ttlDays * 24 * 60 * 60 * 1000 });
  const res = NextResponse.json({ ok: true, team }, { status: 200 });
  res.cookies.set('evw_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: ttlDays * 24 * 60 * 60 });
  return res;
}
