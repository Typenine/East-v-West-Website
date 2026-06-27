import { isCronAuthorized } from '@/lib/server/cron-auth';
import { runProjectionSnapshotJob } from '@/lib/fantasy/projection-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return Response.json(await runProjectionSnapshotJob());
  } catch (error) {
    console.error('[projection-snapshot-job] failed', error);
    return Response.json({ error: error instanceof Error ? error.message : 'server_error' }, { status: 500 });
  }
}
