import { NextRequest, NextResponse } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';

// Paths that require a team session cookie.
const PROTECTED_PREFIXES = ['/trade-block', '/vote', '/api/trade-block', '/api/votes'];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isAdmin = isAdminCookieValue(req.cookies.get('evw_admin')?.value);
  const sessionToken = req.cookies.get('evw_session')?.value || '';

  // The public Draft Room and presentation overlay are intentionally not gated here.
  // Draft API handlers still require a valid team session for picks, private queues,
  // trades, and other team-specific or mutating actions.

  // Admin draft page: admin only.
  if (pathname === '/admin/draft') {
    if (isAdmin) return NextResponse.next();
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Other protected paths require a team session. Admins may manage polls via API
  // without assuming a team identity.
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  const isVotesApi = pathname === '/api/votes' || pathname.startsWith('/api/votes/');
  if (isProtected && !sessionToken) {
    if (isAdmin && isVotesApi) return NextResponse.next();
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
    '/api/votes',
    '/api/votes/:path*',
    '/admin/draft',
  ],
};
