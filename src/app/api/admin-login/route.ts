import { NextRequest, NextResponse } from 'next/server';

function isAdmin(req: NextRequest): boolean {
  const secret = process.env.EVW_ADMIN_SECRET || '';
  const cookie = req.cookies.get('evw_admin')?.value;
  if (secret && cookie === secret) return true;
  // Dev fallback only if no secret configured and not in production
  if (!secret && process.env.NODE_ENV !== 'production' && cookie && cookie.length > 0) return true;
  return false;
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ isAdmin: isAdmin(req) }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const secret = process.env.EVW_ADMIN_SECRET || '';
  const body = await req.json().catch(() => ({} as { key?: string }));
  const key = typeof body?.key === 'string' ? body.key : '';

  if (secret) {
    if (key !== secret) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  } else {
    // Dev fallback: allow any non-empty key when no secret configured and not production
    if (process.env.NODE_ENV === 'production' || !key) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set('evw_admin', key || secret, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set('evw_admin', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
