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
  const startTime = Date.now();
  const logContext: Record<string, unknown> = { timestamp: new Date().toISOString() };
  
  try {
    // Require cron secret for authorization via header
    const envSecret = process.env.CRON_SECRET;
    const incomingSecret = req.headers.get('x-cron-secret');
    if (!envSecret || !incomingSecret || incomingSecret !== envSecret) {
      console.error('[taxi-cron] Unauthorized access attempt', logContext);
      return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    const { day, hour, minute, now } = nowInET();
    const runType = pickRunType(day, hour, minute);
    if (!runType) {
      console.log('[taxi-cron] Skipped - not in run window', { ...logContext, et: { day, hour, minute } });
      return Response.json({ ok: true, skipped: 'not_window', et: { day, hour, minute } });
    }
    
    console.log('[taxi-cron] Starting taxi validation run', { ...logContext, runType, et: { day, hour, minute } });

    const st = await getNFLState().catch((err) => {
      console.warn('[taxi-cron] Failed to get NFL state, using fallback', { ...logContext, error: String(err) });
      return { season: new Date().getFullYear(), week: 1 } as { season?: number; week?: number };
    });
    const season = Number(st.season || new Date().getFullYear());
    const week = Number(st.week || 1);

    const leagueId = LEAGUE_IDS.CURRENT;
    console.log('[taxi-cron] Using league ID', { ...logContext, leagueId, season, week });
    
    const teams = await getTeamsData(leagueId).catch((err) => {
      console.error('[taxi-cron] Failed to load teams data', { ...logContext, error: String(err) });
      return [] as Array<{ teamName: string; rosterId: number }>;
    });
    // Fallback: if teams fail to load, still record a run with degraded rows for canonical team names
    const teamEntries = (teams && teams.length > 0)
      ? teams
      : TEAM_NAMES.map((name) => ({ teamName: name, rosterId: -1 }));
    const usedFallback = !teams || teams.length === 0;
    
    if (usedFallback) {
      console.warn('[taxi-cron] Using fallback team names (teams data unavailable)', { ...logContext, teamCount: TEAM_NAMES.length });
    } else {
      console.log('[taxi-cron] Loaded teams data', { ...logContext, teamCount: teams.length });
    }

    let processed = 0;
    let violations = 0;
    const teamResults: Array<{ team: string; compliant: boolean; violationCount: number }> = [];
    
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
          teamResults.push({ team: t.teamName, compliant: true, violationCount: 0 });
        } else {
          const res = await validateTaxiForRoster(String(season), t.rosterId);
          if (!res) {
            console.warn('[taxi-cron] No validation result for team', { ...logContext, team: t.teamName, rosterId: t.rosterId });
            continue;
          }
          const taxiIds = res.current.taxi.map((x) => x.playerId);
          
          // For official Sunday run, enforce boomerang violations
          // For warning runs, only check hard violations (capacity, QB limit, invalid intake)
          const hasBoomerang = res.violations.some((v) => v.code === 'boomerang_active_player' || v.code === 'boomerang_reset_ineligible');
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
          
          const violationCount = res.violations.length;
          if (violationCount > 0) violations++;
          teamResults.push({ team: t.teamName, compliant: compliantOut, violationCount });
          
          if (!compliantOut) {
            console.warn('[taxi-cron] Team has violations', {
              ...logContext,
              team: t.teamName,
              violations: res.violations.map(v => ({ code: v.code, detail: v.detail, playerCount: v.players?.length || 0 }))
            });
          }
        }
      } catch (err) {
        console.error('[taxi-cron] Error processing team', { ...logContext, team: t.teamName, error: String(err) });
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
        }).catch((writeErr) => {
          console.error('[taxi-cron] Failed to write degraded snapshot', { ...logContext, team: t.teamName, error: String(writeErr) });
        });
      }
    }

    const duration = Date.now() - startTime;
    const summary = {
      ok: true,
      runType,
      season,
      week,
      processed,
      teamsWithViolations: violations,
      durationMs: duration,
      leagueId,
      usedFallback
    };
    
    console.log('[taxi-cron] Run completed successfully', { ...logContext, ...summary, teamResults });
    return Response.json(summary);
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('[taxi-cron] Run failed with error', { ...logContext, error: String(err), stack: err instanceof Error ? err.stack : undefined, durationMs: duration });
    return Response.json({ error: 'server_error', message: String(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
