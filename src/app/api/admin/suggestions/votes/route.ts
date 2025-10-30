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
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: 'auth/users/' });
    type BlobMeta = { pathname: string; url: string };
    const metas: BlobMeta[] = (blobs as unknown as BlobMeta[]).filter((b) => b.pathname.startsWith('auth/users/'));

    const votesBySuggestion: Record<string, { up: string[]; down: string[] }> = {};

    await Promise.all(
      metas.map(async (m) => {
        try {
          const r = await fetch(m.url, { cache: 'no-store' });
          if (!r.ok) return;
          const doc = (await r.json()) as { team?: string; votes?: Record<string, Record<string, number>> };
          const team = typeof doc.team === 'string' ? doc.team : undefined;
          const vs = doc.votes?.['suggestions'] as Record<string, number> | undefined;
          if (!team || !vs) return;
          for (const [sid, val] of Object.entries(vs)) {
            if (!votesBySuggestion[sid]) votesBySuggestion[sid] = { up: [], down: [] };
            if (val === 1) {
              if (!votesBySuggestion[sid].up.includes(team)) votesBySuggestion[sid].up.push(team);
            } else if (val === -1) {
              if (!votesBySuggestion[sid].down.includes(team)) votesBySuggestion[sid].down.push(team);
            }
          }
        } catch {}
      })
    );

    // Sort team lists for stable UI
    for (const sid of Object.keys(votesBySuggestion)) {
      votesBySuggestion[sid].up.sort((a, b) => a.localeCompare(b));
      votesBySuggestion[sid].down.sort((a, b) => a.localeCompare(b));
    }

    return Response.json({ votes: votesBySuggestion });
  } catch {
    return Response.json({ error: 'Failed to load votes' }, { status: 500 });
  }
}
