import { NextRequest } from 'next/server';
import { listKeys, getObjectText } from '@/server/storage/r2';

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
    const days = Math.max(1, Math.min(365, Number(daysParam) || 30));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    type AuthLog = { ts: string; type: string; team?: string; ip?: string; ok?: boolean };

    type Agg = { team: string; loginCount: number; lastSeen: string | null; lastIp: string | null };
    const byTeam = new Map<string, Agg>();
    const datesByTeam = new Map<string, Set<string>>();

    // List all auth logs (they are small JSON)
    const keys = await listKeys({ prefix: 'logs/auth/', max: 5000 });
    for (const k of keys) {
      try {
        const txt = await getObjectText({ key: k });
        if (!txt) continue;
        const log = JSON.parse(txt) as AuthLog;
        if (!log || !log.ts || !log.team || log.type !== 'login_success' || log.ok !== true) continue;
        const tsNum = Date.parse(log.ts);
        if (Number.isNaN(tsNum) || tsNum < since) continue;
        const team = log.team;
        const prev = (byTeam.get(team) || { team, loginCount: 0, lastSeen: null, lastIp: null }) as Agg;
        prev.loginCount += 1;
        const set = datesByTeam.get(team) || new Set<string>();
        const dayKey = new Date(tsNum).toISOString().slice(0, 10);
        set.add(dayKey);
        datesByTeam.set(team, set);
        if (!prev.lastSeen || tsNum > Date.parse(prev.lastSeen)) {
          prev.lastSeen = new Date(tsNum).toISOString();
          prev.lastIp = log.ip || null;
        }
        byTeam.set(team, prev);
      } catch {}
    }

    // finalize daysActive and emit list
    const rows = Array.from(byTeam.values())
      .map((v) => {
        const dates = datesByTeam.get(v.team);
        return {
          team: v.team,
          loginCount: v.loginCount,
          daysActive: dates ? dates.size : 0,
          lastSeen: v.lastSeen,
          lastIp: v.lastIp,
        };
      })
      .sort((a, b) => (Date.parse(b.lastSeen || '1970-01-01') - Date.parse(a.lastSeen || '1970-01-01')));

    return Response.json({ since: new Date(since).toISOString(), days, rows });
  } catch {
    return Response.json({ error: 'Failed to load audit logs' }, { status: 500 });
  }
}
