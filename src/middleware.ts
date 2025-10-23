import { NextRequest, NextResponse } from 'next/server';

// Paths to protect (require session cookie)
const PROTECTED_PREFIXES = [
  '/trade-block',
  '/vote',
  '/api/trade-block',
  '/api/votes',
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function b64urlToUint8Array(b64url: string): Uint8Array {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function strToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

async function verifyToken(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.') as [string, string] | string[];
  if (parts.length !== 2) return null;
  const [data, sig] = parts as [string, string];
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      strToUint8Array(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, strToUint8Array(data));
    // Convert signature to base64url
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    if (sigB64 !== sig) return null;
    const json = JSON.parse(new TextDecoder().decode(b64urlToUint8Array(data))) as Record<string, unknown>;
    const exp = typeof json.exp === 'number' ? json.exp : 0;
    if (Date.now() > exp) return null;
    return json;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();

  const cookie = req.cookies.get('evw_session')?.value || '';
  if (!cookie) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname + (search || ''));
    return NextResponse.redirect(url);
  }

  const secret = process.env.AUTH_SECRET || 'dev-secret-please-change';
  const claims = await verifyToken(cookie, secret);
  if (!claims) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname + (search || ''));
    return NextResponse.redirect(url);
  }

  // Optionally: pinVersion enforcement can happen in API handlers/pages server-side.
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/trade-block/:path*',
    '/vote/:path*',
    '/api/trade-block/:path*',
    '/api/votes/:path*',
  ],
};
