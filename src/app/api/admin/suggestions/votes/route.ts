import { NextRequest } from 'next/server';
import { listAllUserDocs } from '@/server/db/queries';

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
    const votesBySuggestion: Record<string, { up: string[]; down: string[] }> = {};
    const rows = await listAllUserDocs().catch(() => [] as Array<{ team: string; votes: unknown }>);
    for (const r of rows) {
      const team = (r as any).team as string;
      const votes = (r as any).votes as Record<string, Record<string, number>> | null | undefined;
      const vs = votes?.['suggestions'] as Record<string, number> | undefined;
      if (!team || !vs) continue;
      for (const [sid, val] of Object.entries(vs)) {
        if (!votesBySuggestion[sid]) votesBySuggestion[sid] = { up: [], down: [] };
        if (val === 1) {
          if (!votesBySuggestion[sid].up.includes(team)) votesBySuggestion[sid].up.push(team);
        } else if (val === -1) {
          if (!votesBySuggestion[sid].down.includes(team)) votesBySuggestion[sid].down.push(team);
        }
      }
    }

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
