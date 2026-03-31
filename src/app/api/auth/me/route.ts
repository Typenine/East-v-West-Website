import { cookies } from 'next/headers';
import { verifySession } from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const jar = await cookies();
  const adminSecret = process.env.EVW_ADMIN_SECRET || '002023';
  const isAdmin = jar.get('evw_admin')?.value === adminSecret;
  const token = jar.get('evw_session')?.value || '';
  if (!token) return Response.json({ authenticated: false, isAdmin }, { status: isAdmin ? 200 : 401 });
  const claims = verifySession(token);
  if (!claims) return Response.json({ authenticated: false, isAdmin }, { status: isAdmin ? 200 : 401 });
  return Response.json({ authenticated: true, isAdmin, claims });
}
