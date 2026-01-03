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
  // Optional: draft preview lock using EVW_PREVIEW_SECRET
  const previewSecret = process.env.EVW_PREVIEW_SECRET || '';
  const isDraftFeaturePath = pathname === '/draft/room' || pathname === '/draft/overlay' || pathname === '/admin/draft' || pathname.startsWith('/api/draft');
  if (previewSecret && isDraftFeaturePath) {
    // Allow admin cookie
    const adminCookie = req.cookies.get('evw_admin')?.value || '';
    if (adminCookie === (process.env.EVW_ADMIN_SECRET || '002023')) {
      // admin allowed
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
