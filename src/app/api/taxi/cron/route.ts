import { getNFLState, getTeamsData } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS, TEAM_NAMES } from '@/lib/constants/league';
import { validateTaxiForRoster } from '@/lib/server/taxi-validator';
import { writeTaxiSnapshot } from '@/server/db/queries.fixed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function nowInET() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit', year: 'numeric' });
  const parts = fmt.formatToParts(now);
  const day = parts.find(p => p.type === 'weekday')?.value || '';
  const hour = Number(parts.find(p => p.type === 'hour')?.value || '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value || '0');
  return { day, hour, minute, now };
}

function pickRunType(day: string, hour: number, minute: number): 'wed_warn' | 'thu_warn' | 'sun_am_warn' | 'sun_pm_official' | null {
  // Allow a 5-minute grace window to tolerate trigger jitter
  const inGrace = minute >= 0 && minute <= 5;
  if (day === 'Wed' && hour === 17 && inGrace) return 'wed_warn';
  if (day === 'Thu' && hour === 15 && inGrace) return 'thu_warn';
  if (day === 'Sun' && hour === 11 && inGrace) return 'sun_am_warn';
  // Use SNF kickoff hour (top-of-hour) as the official run time
  if (day === 'Sun' && hour === 20 && inGrace) return 'sun_pm_official';
  return null;
}

async function handle(req: Request) {
  try {
    // Require cron secret for authorization via header
    const envSecret = process.env.CRON_SECRET;
    const incomingSecret = req.headers.get('x-cron-secret');
    if (!envSecret || !incomingSecret || incomingSecret !== envSecret) {
      return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    const { day, hour, minute, now } = nowInET();
    const runType = pickRunType(day, hour, minute);
    if (!runType) {
      return Response.json({ ok: true, skipped: 'not_window', et: { day, hour, minute } });
    }

    const st = await getNFLState().catch(() => ({ season: new Date().getFullYear(), week: 1 } as { season?: number; week?: number }));
    const season = Number(st.season || new Date().getFullYear());
    const week = Number(st.week || 1);

    const leagueId = LEAGUE_IDS.CURRENT;
    const teams = await getTeamsData(leagueId).catch(() => [] as Array<{ teamName: string; rosterId: number }>);
    // Fallback: if teams fail to load, still record a run with degraded rows for canonical team names
    const teamEntries = (teams && teams.length > 0)
      ? teams
      : TEAM_NAMES.map((name) => ({ teamName: name, rosterId: -1 }));
    const usedFallback = !teams || teams.length === 0;

    let processed = 0;
    for (const t of teamEntries) {
      try {
        if (usedFallback || t.rosterId < 0) {
          // Write a degraded placeholder so a run is recorded
          await writeTaxiSnapshot({
            season,
            week,
            runType,
            runTs: now,
            teamId: t.teamName,
            taxiIds: [],
            compliant: true,
            violations: [],
            degraded: true,
          });
          processed++;
        } else {
          const res = await validateTaxiForRoster(String(season), t.rosterId);
          if (!res) continue;
          const taxiIds = res.current.taxi.map((x) => x.playerId);
          const hasBoomerang = res.violations.some((v) => v.code === 'boomerang_active_player');
          const compliantOut = runType === 'sun_pm_official' ? (res.compliant && !hasBoomerang) : res.compliant;
          await writeTaxiSnapshot({
            season,
            week,
            runType,
            runTs: now,
            teamId: t.teamName,
            taxiIds,
            compliant: compliantOut,
            violations: res.violations,
            degraded: false,
          });
          processed++;
        }
      } catch {
        // degraded snapshot for this team
        await writeTaxiSnapshot({
          season,
          week,
          runType,
          runTs: now,
          teamId: t.teamName,
          taxiIds: [],
          compliant: true,
          violations: [],
          degraded: true,
        }).catch(() => null);
      }
    }

    return Response.json({ ok: true, runType, season, week, processed });
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
