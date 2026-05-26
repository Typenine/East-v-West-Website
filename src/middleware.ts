import { NextRequest, NextResponse } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';

// Paths to protect (require session cookie)
const PROTECTED_PREFIXES = [
  '/trade-block',
  '/vote',
  '/api/trade-block',
  '/api/votes',
  '/draft/room',
];

// Teams allowed to access draft system (team view + presentation view)
const DRAFT_ALLOWED_TEAMS = [
  'Belleview Badgers',
  'Mt. Lebanon Cake Eaters',
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * Decode session token and extract team claim (Edge-compatible).
 * Returns null if token is invalid or expired.
 */
async function getTeamFromSession(token: string): Promise<string | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  // Verify signature using Web Crypto API (Edge-compatible)
  const secret = process.env.AUTH_SECRET || 'evw-default-auth-secret-change-me';
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const sigBytes = new Uint8Array(signature);
  let sigStr = '';
  for (let i = 0; i < sigBytes.length; i++) sigStr += String.fromCharCode(sigBytes[i]);
  const expectedSig = btoa(sigStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (sig !== expectedSig) return null;
  try {
    const json = JSON.parse(atob(data.replace(/-/g, '+').replace(/_/g, '/')));
    const exp = typeof json.exp === 'number' ? json.exp : 0;
    if (Date.now() > exp) return null;
    return typeof json.team === 'string' ? json.team : null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const adminCookie = req.cookies.get('evw_admin')?.value || '';
  const isAdmin = isAdminCookieValue(adminCookie);
  const sessionToken = req.cookies.get('evw_session')?.value || '';

  // Check if user belongs to an allowed team for draft access
  const userTeam = await getTeamFromSession(sessionToken);
  const isAllowedTeam = userTeam !== null && DRAFT_ALLOWED_TEAMS.includes(userTeam);

  // Optional: draft preview lock using EVW_PREVIEW_SECRET
  const previewSecret = process.env.EVW_PREVIEW_SECRET || '';
  const isDraftFeaturePath = pathname === '/draft/room' || pathname.startsWith('/draft/room/') || pathname === '/draft/overlay' || pathname === '/admin/draft' || pathname.startsWith('/api/draft');
  if (previewSecret && isDraftFeaturePath) {
    // Allow admin cookie
    const adminCookie = req.cookies.get('evw_admin')?.value || '';
    if (isAdminCookieValue(adminCookie)) {
      // admin allowed
    } else if (isAllowedTeam) {
      // allowed team can access draft/room and draft/overlay
    } else {
      // Support one-time unlock via query param ?preview_key=SECRET (sets evw_preview cookie)
      const key = req.nextUrl.searchParams.get('preview_key');
      if (key && key === previewSecret) {
        const url = new URL(req.url);
        url.searchParams.delete('preview_key');
        const res = NextResponse.redirect(url);
        res.cookies.set('evw_preview', previewSecret, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
        return res;
      }
      const cookie = req.cookies.get('evw_preview')?.value || '';
      if (cookie !== previewSecret) {
        const res = NextResponse.redirect(new URL('/', req.url));
        return res;
      }
    }
  }

  // Allow admin or allowed teams to access Draft Room/Overlay without additional checks
  if ((pathname === '/draft/room' || pathname.startsWith('/draft/room/') || pathname === '/draft/overlay') && (isAdmin || isAllowedTeam)) {
    return NextResponse.next();
  }

  if (!isProtectedPath(pathname)) return NextResponse.next();

  const cookie = req.cookies.get('evw_session')?.value || '';
  if (!cookie) {
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
    '/draft/:path*',
    '/admin/draft',
    '/api/draft/:path*',
  ],
};
