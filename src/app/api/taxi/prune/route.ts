import { getNFLState } from '@/lib/utils/sleeper-api';
import { prunePriorSeasonsKeepOfficial } from '@/server/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
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
