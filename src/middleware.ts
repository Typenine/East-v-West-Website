import { NextRequest, NextResponse } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { canonicalizeTeamName } from '@/lib/server/user-identity';

// Teams allowed to access draft room (for testing)
const DRAFT_ALLOWED_TEAMS = ['Belleview Badgers', 'Mt. Lebanon Cake Eaters', 'Bimg Bamg Boomg'];

// Paths that require a session cookie
const PROTECTED_PREFIXES = ['/trade-block', '/vote', '/api/trade-block', '/api/votes'];

function base64urlDecode(str: string): string {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return atob(b64);
}

async function getTeamFromSession(token: string): Promise<string | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const secret = process.env.AUTH_SECRET || 'evw-default-auth-secret-change-me';
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const sigBytes = new Uint8Array(signature);
  let sigStr = '';
  for (let i = 0; i < sigBytes.length; i++) sigStr += String.fromCharCode(sigBytes[i]);
  const expectedSig = btoa(sigStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (sig !== expectedSig) return null;
  try {
    const json = JSON.parse(base64urlDecode(data));
    if (typeof json.exp === 'number' && Date.now() > json.exp) return null;
    return typeof json.team === 'string' ? canonicalizeTeamName(json.team) : null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isAdmin = isAdminCookieValue(req.cookies.get('evw_admin')?.value);
  const sessionToken = req.cookies.get('evw_session')?.value || '';
  const userTeam = await getTeamFromSession(sessionToken);

  // Draft room/overlay: only admin or allowed teams (must be signed in)
  const isDraftRoomPath = pathname === '/draft/room' || pathname.startsWith('/draft/room/') || pathname === '/draft/overlay';
  if (isDraftRoomPath) {
    if (isAdmin) return NextResponse.next();
    if (!sessionToken) {
      const url = new URL('/login', req.url);
      url.searchParams.set('next', pathname + (search || ''));
      return NextResponse.redirect(url);
    }
    if (userTeam && DRAFT_ALLOWED_TEAMS.includes(userTeam)) return NextResponse.next();
    // Not authorized - redirect to home (not login, since they need to be a specific team)
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Admin draft page: admin only
  if (pathname === '/admin/draft') {
    if (isAdmin) return NextResponse.next();
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Other protected paths: require session
  const isProtected = PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (isProtected && !sessionToken) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', pathname + (search || ''));
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/trade-block/:path*',
    '/vote/:path*',
    '/api/trade-block/:path*',
    '/api/votes/:path*',
    '/draft/room',
    '/draft/room/:path*',
    '/draft/overlay',
    '/admin/draft',
  ],
};

