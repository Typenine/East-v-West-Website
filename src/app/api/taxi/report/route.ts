import { getNFLState, getTeamsData } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { validateTaxiForRoster } from '@/lib/server/taxi-validator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function nowInET() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const parts = fmt.formatToParts(now);
  const day = parts.find(p => p.type === 'weekday')?.value || '';
  const hour = Number(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value || '0');
  return { day, hour, minute, now };
}

function pickRunType(day: string, hour: number, minute: number): 'wed_warn' | 'thu_warn' | 'sun_am_warn' | 'sun_pm_official' | 'admin_rerun' {
  if (day === 'Wed' && hour === 17 && minute === 0) return 'wed_warn';
  if (day === 'Thu' && hour === 15 && minute === 0) return 'thu_warn';
  if (day === 'Sun' && hour === 11 && minute === 0) return 'sun_am_warn';
  if (day === 'Sun' && hour === 20 && minute === 0) return 'sun_pm_official';
  return 'admin_rerun';
}

export async function GET() {
  try {
    const { day, hour, minute, now } = nowInET();
    const runType = pickRunType(day, hour, minute);
    const st = await getNFLState().catch(() => ({ season: new Date().getFullYear(), week: 1 } as { season?: number; week?: number }));
    const season = Number(st.season || new Date().getFullYear());
    const week = Number(st.week || 1);

    const leagueId = LEAGUE_IDS.CURRENT;
    const teams = await getTeamsData(leagueId).catch(() => [] as Array<{ teamName: string; rosterId: number }>);

    type Flag = { team: string; type: 'violation' | 'warning'; message: string };
    const actual: Flag[] = [];
    const potential: Flag[] = [];
    const isOfficial = runType === 'sun_pm_official';

    for (const t of teams) {
      try {
        const res = await validateTaxiForRoster(String(season), t.rosterId);
        if (!res) continue;
        const msgParts: string[] = [];
        const nonCompliant = !res.compliant;
        for (const v of res.violations) {
          if (v.code === 'too_many_on_taxi') msgParts.push('>3 players on taxi');
          else if (v.code === 'too_many_qbs') msgParts.push('2+ QBs on taxi (limit 1)');
          else if (v.code === 'invalid_intake') msgParts.push('Taxi intake must be FA/Trade/Draft');
          else if (v.code === 'roster_inconsistent') msgParts.push('Taxi conflicts with starters/IR');
          else if (v.code === 'boomerang_active_player') {
            const names = (v.players || []).slice(0, 3).join(', ');
            msgParts.push(`Previously active this tenure on taxi${names ? `: ${names}` : ''}`);
          }
        }
        // On official run type, boomerang converts to violation; otherwise, treat as warning
        // mid-week: keep res.compliant as-is for nonCompliant flag
        const msg = msgParts.join('; ');
        if (msg) {
          const entry = { team: t.teamName, type: isOfficial ? 'violation' : 'warning', message: `${t.teamName}: ${msg}` } as Flag;
          if (isOfficial || nonCompliant) actual.push(entry); else potential.push(entry);
        }
      } catch {}
    }

    return Response.json({ generatedAt: now.toISOString(), runType, season, week, actual, potential });
  } catch {
    return Response.json({ generatedAt: new Date().toISOString(), actual: [], potential: [] });
  }
}
