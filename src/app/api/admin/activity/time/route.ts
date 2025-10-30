import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSecret(): string {
  return process.env.EVW_ADMIN_SECRET || '002023';
}

function isAdmin(req: NextRequest): boolean {
  try {
    const cookie = req.cookies.get('evw_admin')?.value;
    return cookie === getSecret();
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  try {
    const url = new URL(req.url);
    const daysParam = url.searchParams.get('days');
    const days = Math.max(1, Math.min(365, Number(daysParam) || 7));
    const sinceTs = Date.now() - days * 24 * 60 * 60 * 1000;

    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: 'logs/activity/heartbeats/' });
    type BlobMeta = { pathname: string; url: string };
    const metas: BlobMeta[] = (blobs as unknown as BlobMeta[]).filter((b) => b.pathname.startsWith('logs/activity/heartbeats/'));

    type Beat = { ts: string; team: string; userId: string };

    const counts = new Map<string, { team: string; beats: number; lastSeen: string | null }>();

    await Promise.all(
      metas.map(async (m) => {
        try {
          const r = await fetch(m.url, { cache: 'no-store' });
          if (!r.ok) return;
          const beat = (await r.json()) as Beat;
          if (!beat || !beat.ts || !beat.team) return;
          const tsNum = Date.parse(beat.ts);
          if (Number.isNaN(tsNum) || tsNum < sinceTs) return;
          const team = beat.team;
          const prev = counts.get(team) || { team, beats: 0, lastSeen: null };
          prev.beats += 1;
          if (!prev.lastSeen || tsNum > Date.parse(prev.lastSeen)) prev.lastSeen = new Date(tsNum).toISOString();
          counts.set(team, prev);
        } catch {}
      })
    );

    const rows = Array.from(counts.values())
      .map((v) => ({
        team: v.team,
        minutesEst: Math.round(v.beats * 0.5),
        lastSeen: v.lastSeen,
      }))
      .sort((a, b) => (b.minutesEst - a.minutesEst));

    return Response.json({ days, since: new Date(sinceTs).toISOString(), rows });
  } catch {
    return Response.json({ error: 'Failed to load activity' }, { status: 500 });
  }
}
