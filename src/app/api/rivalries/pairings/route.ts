import { cookies } from 'next/headers';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { getLatestCycle, getPairsForCycle } from '@/server/db/rivalry-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const cycle = await getLatestCycle();
  if (!cycle) return Response.json({ pairs: [] });

  const jar = await cookies();
  const isAdmin = isAdminCookieValue(jar.get('evw_admin')?.value);

  // Only admins can see pairs before they're published
  if (cycle.status !== 'published' && !isAdmin) {
    return Response.json({ pairs: [] });
  }

  const pairs = await getPairsForCycle(cycle.id);
  return Response.json({ pairs, cycle });
}
