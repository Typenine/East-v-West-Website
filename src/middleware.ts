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

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
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
  ],
};
