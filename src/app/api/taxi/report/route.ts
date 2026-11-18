import { getNFLState, getTeamsData, getAllPlayersCached } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { writeTaxiSnapshot } from '@/server/db/queries.fixed';
import { validateTaxiForRoster } from '@/lib/server/taxi-validator';
import { createTaxiValidationRequestCache } from '@/lib/server/taxi-request-cache';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req) && !isAdminCookieValue(req.cookies.get('evw_admin')?.value)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const shared = createTaxiValidationRequestCache();
    const now = new Date();
    const runType = 'admin_rerun' as const;
    const st = await shared.once('nfl-state', () => getNFLState()).catch(() => ({ season: new Date().getFullYear(), week: 1 } as { season?: number; week?: number }));
    const season = Number(st.season || new Date().getFullYear());
    const week = Number(st.week || 1);

    const leagueId = LEAGUE_IDS.CURRENT;
    const teams = await shared.once('teams:' + leagueId, () => getTeamsData(leagueId)).catch(() => [] as Array<{ teamName: string; rosterId: number }>);

    type Flag = { team: string; type: 'violation' | 'warning'; message: string };
    const actual: Flag[] = [];
    const potential: Flag[] = [];
    const isOfficial = false;

    // Load player meta for ID->name mapping
    const players = await shared.once('all-players', () => getAllPlayersCached()).catch(() => ({} as Record<string, { first_name?: string; last_name?: string } >));
    const nameOf = (pid: string) => {
      const p = players[pid];
      if (!p) return pid;
      const name = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      return name || pid;
    };

    if (teams.length !== 12) return Response.json({ error: 'Incomplete team roster' }, { status: 503 });
    let checkedTeams = 0;
    for (const t of teams) {
      try {
        const res = await validateTaxiForRoster(String(season), t.rosterId, shared);
        if (!res) throw new Error('Missing taxi validation result');
        checkedTeams++;
        const msgParts: string[] = [];
        const nonCompliant = !res.compliant;
        for (const v of res.violations) {
          if (v.code === 'too_many_on_taxi') msgParts.push('>4 players on taxi');
          else if (v.code === 'too_many_qbs') msgParts.push('2+ QBs on taxi (limit 1)');
          else if (v.code === 'invalid_intake') msgParts.push('Taxi intake must be FA/Trade/Draft');
          else if (v.code === 'roster_inconsistent') msgParts.push('Taxi conflicts with starters/IR');
          else if (v.code === 'boomerang_active_player' || v.code === 'boomerang_reset_ineligible') {
            const names = (v.players || []).map(nameOf).slice(0, 3).join(', ');
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

        // Persist snapshot so homepage flags can reflect this run (especially for admin_rerun)
        try {
          const taxiIds = res.current.taxi.map((p) => p.playerId);
          const hasBoomerang = res.violations.some((v) => v.code === 'boomerang_active_player');
          const compliantOut = isOfficial ? (res.compliant && !hasBoomerang) : res.compliant;
          await writeTaxiSnapshot({
            season,
            week,
            runType,
            runTs: now,
            teamId: t.teamName,
            taxiIds,
            compliant: compliantOut,
            violations: res.violations as Array<{ code: string; detail?: string; players?: string[] }>,
            degraded: false,
          });
        } catch {}
      } catch (error) {
        console.error('[taxi-report] Team audit failed', t.teamName, error);
        return Response.json({ error: 'Incomplete taxi audit', checkedTeams, expectedTeams: teams.length }, { status: 503 });
      }
    }

    return Response.json({ generatedAt: now.toISOString(), lastRunAt: now.toISOString(), runType, season, week, actual, potential, complete: checkedTeams === teams.length, checkedTeams, expectedTeams: teams.length });
  } catch (error) {
    console.error('[taxi-report] Audit failed', error);
    return Response.json({ error: 'Taxi audit failed' }, { status: 500 });
  }
}
