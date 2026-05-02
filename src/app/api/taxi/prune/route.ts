import { getNFLState } from '@/lib/utils/sleeper-api';
import { prunePriorSeasonsKeepOfficial } from '@/server/db/queries';
import { isCronAuthorized } from '@/lib/server/cron-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let seasonNum = new Date().getFullYear();
    try {
      const st = await getNFLState();
      const s = Number((st as { season?: string | number }).season || seasonNum);
      if (Number.isFinite(s)) seasonNum = s;
    } catch {}

    const result = await prunePriorSeasonsKeepOfficial(seasonNum);
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: 500 });
    return Response.json({ ok: true, season: seasonNum });
  } catch {
    return Response.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
