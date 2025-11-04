import { cookies } from 'next/headers';
import { requireTeamUser } from '@/lib/server/session';
import { putObjectText } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdminSecret(): string {
  return process.env.EVW_ADMIN_SECRET || '002023';
}

export async function POST() {
  try {
    const ident = await requireTeamUser();
    let team: string | null = null;
    let userId: string | null = null;
    if (ident) {
      team = ident.team;
      userId = ident.userId;
    } else {
      // Allow admin heartbeat
      try {
        const jar = await cookies();
        const admin = jar.get('evw_admin')?.value;
        if (admin && admin === getAdminSecret()) {
          team = 'ADMIN';
          userId = 'admin';
        }
      } catch {}
    }
    if (!team || !userId) return Response.json({ ok: false }, { status: 200 });

    const ts = new Date().toISOString();
    const day = ts.slice(0, 10);
    const key = `logs/activity/heartbeats/${day}/${team}-${Date.now()}-${Math.random().toString(36).slice(2,8)}.json`;
    const payload = { ts, team, userId };

    try {
      await putObjectText({ key, text: JSON.stringify(payload) });
    } catch {}

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 200 });
  }
}
