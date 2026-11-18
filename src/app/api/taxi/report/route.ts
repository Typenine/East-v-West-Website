import { NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { runTaxiReport } from '@/lib/server/run-taxi-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  return isCronAuthorized(req) || isAdminCookieValue(req.cookies.get('evw_admin')?.value);
}

/** Manual commissioner rerun. Also preserve authorized GET for existing admin UI. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return runTaxiReport();
}
export async function POST(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return runTaxiReport();
}
