import Image from 'next/image';
import Link from 'next/link';
import CountdownTimer from '@/components/ui/countdown-timer';
import MatchupCard from '@/components/ui/matchup-card';
import { IMPORTANT_DATES, LEAGUE_IDS } from '@/lib/constants/league';
import { getLeagueMatchups, getTeamsData, getNFLState, getAllPlayersCached } from '@/lib/utils/sleeper-api';
import EmptyState from '@/components/ui/empty-state';
import SectionHeader from '@/components/ui/SectionHeader';
import LinkButton from '@/components/ui/LinkButton';
import Card, { CardContent } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import HeadToHeadGrid from '@/components/headtohead/HeadToHeadGrid';
import NeverBeatenTracker from '@/components/headtohead/NeverBeatenTracker';
import { getHeadToHeadAllTime } from '@/lib/utils/headtohead';
import { validateTaxiForRoster } from '@/lib/server/taxi-validator';

export const dynamic = 'force-dynamic';
export const revalidate = 20; // ISR: refresh at most every 20s to reduce API churn and flakiness

export default async function Home({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const leagueId = LEAGUE_IDS.CURRENT;
  const currentWeekMatchups: Array<{
    homeTeam: string;
    awayTeam: string;
    homeRosterId: number;
    awayRosterId: number;
    homeScore?: number;
    awayScore?: number;
    week: number;
    matchupId: number;
    kickoffTime?: string;
  }> = [];
  const MAX_REGULAR_WEEKS = 14;
  let defaultWeek = 1;
  const sp = (await (searchParams ?? Promise.resolve({}))) as Record<string, string | string[] | undefined>;
  const requestedWeekRaw = sp.week;
  const requestedWeekStr = Array.isArray(requestedWeekRaw) ? requestedWeekRaw[0] : requestedWeekRaw;
  const requestedWeekNum = typeof requestedWeekStr === 'string' ? Number(requestedWeekStr) : NaN;
  const hasUserOverride = Number.isFinite(requestedWeekNum) && requestedWeekNum >= 1 && requestedWeekNum <= MAX_REGULAR_WEEKS;
  let selectedWeek = 1;
  try {
    // Get current NFL state and teams in parallel
    const [nflState, teams] = await Promise.all([
      getNFLState().catch(() => ({ week: 1, display_week: 1, season_type: 'regular' })),
      getTeamsData(leagueId).catch(() => [] as Array<{ rosterId: number; teamName: string }>),
    ]);
    const seasonType = (nflState as { season_type?: string }).season_type ?? 'regular';
    const hasScores = (nflState as { season_has_scores?: boolean }).season_has_scores;
    const week1Ts = new Date(IMPORTANT_DATES.NFL_WEEK_1_START).getTime();
    const beforeWeek1 = Number.isFinite(week1Ts) && Date.now() < week1Ts;
    if (seasonType !== 'regular' || beforeWeek1 || hasScores === false) {
      defaultWeek = 1;
    } else {
      const now = new Date();
      const dowET = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(now);
      const raw = Number(((nflState as { week?: number }).week ?? (nflState as { display_week?: number }).display_week ?? 1));
      const baseWeek = Number.isFinite(raw) ? raw : 1;
      if (dowET === 'Mon' || dowET === 'Tue') {
        defaultWeek = Math.max(1, baseWeek - 1);
      } else {
        defaultWeek = baseWeek; // Wed–Sun follow Sleeper's week/display_week
      }
    }
    // Clamp default to regular-season bounds
    defaultWeek = Math.min(Math.max(1, defaultWeek), MAX_REGULAR_WEEKS);
    // Apply user override if valid
    selectedWeek = hasUserOverride ? (requestedWeekNum as number) : defaultWeek;

    const matchups = await getLeagueMatchups(leagueId, selectedWeek);
    // If the current week hasn't started (all 0-0) OR Sleeper returns empty, show previous week's matchups instead
    const hasAnyPoints = matchups.some((m) => ((m as { custom_points?: number; points?: number }).custom_points ?? m.points ?? 0) > 0);
    let mus = matchups;
    // Only allow fallback to previous week on Mon/Tue Eastern, and only if we advanced past defaultWeek
    if (!hasUserOverride) {
      const now = new Date();
      const dowET = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(now);
      const allowFallbackToPrev = dowET === 'Mon' || dowET === 'Tue';
      if (allowFallbackToPrev && selectedWeek > defaultWeek && (matchups.length === 0 || !hasAnyPoints) && selectedWeek > 1) {
        const prevWeek = selectedWeek - 1;
        const prev = await getLeagueMatchups(leagueId, prevWeek);
        // Use previous only if it has any entries
        if (prev.length > 0) {
          selectedWeek = prevWeek;
          mus = prev;
        }
      }
    }
    const rosterIdToName = new Map<number, string>(
      teams.map((t) => [t.rosterId, t.teamName])
    );
    const groups = new Map<number, { roster_id: number; points: number; matchup_id: number }[]>();
    for (const m of mus) {
      const arr = groups.get(m.matchup_id) || [];
      // Use points reported by Sleeper
      const pts = (m.custom_points ?? m.points ?? 0);
      arr.push({ roster_id: m.roster_id, points: pts, matchup_id: m.matchup_id });
      groups.set(m.matchup_id, arr);
    }
    for (const arr of groups.values()) {
      if (arr.length >= 2) {
        const [a, b] = arr; // arbitrary away/home
        const includeScores = (b.points ?? 0) > 0 || (a.points ?? 0) > 0;
        currentWeekMatchups.push({
          homeTeam: rosterIdToName.get(b.roster_id) ?? `Roster ${b.roster_id}`,
          awayTeam: rosterIdToName.get(a.roster_id) ?? `Roster ${a.roster_id}`,
          homeRosterId: b.roster_id,
          awayRosterId: a.roster_id,
          homeScore: includeScores ? b.points : undefined,
          awayScore: includeScores ? a.points : undefined,
          week: selectedWeek,
          matchupId: a.matchup_id,
        });
      }
    }
  } catch {
    // If Sleeper data isn't available yet, render with empty state below
  }
  // Taxi flags (league-wide): fetch both sources and choose best
  let taxiFlags: { generatedAt: string; lastRunAt?: string; runType?: string; season?: number; week?: number; actual: Array<{ team: string; type: string; message: string }>; potential: Array<{ team: string; type: string; message: string }> } = { generatedAt: '', actual: [], potential: [] };
  // Build base URL from env for server-side fetches
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  try {
    const [rf, rr] = await Promise.all([
      fetch(`${base}/api/taxi/flags`, { cache: 'no-store' }).catch(() => null),
      fetch(`${base}/api/taxi/report`, { cache: 'no-store' }).catch(() => null),
    ]);
    let flags: null | { generatedAt?: string; lastRunAt?: string; runType?: string; season?: number; week?: number; actual?: Array<{ team: string; type: string; message: string }>; potential?: Array<{ team: string; type: string; message: string }> } = null;
    let report: null | { generatedAt?: string; lastRunAt?: string; runType?: string; season?: number; week?: number; actual?: Array<{ team: string; type: string; message: string }>; potential?: Array<{ team: string; type: string; message: string }> } = null;
    if (rf && rf.ok) flags = await rf.json().catch(() => null);
    if (rr && rr.ok) report = await rr.json().catch(() => null);
    const pick = () => {
      const fGood = flags && (Array.isArray(flags.actual) || Array.isArray(flags.potential)) && (flags.runType || '').length > 0;
      const rGood = report && (Array.isArray(report.actual) || Array.isArray(report.potential));
      if (fGood && flags!.runType && flags!.runType !== 'admin_rerun') return flags!; // prefer scheduled/official
      if (rGood) return report!; // otherwise prefer admin on-demand for immediacy
      if (fGood) return flags!; // last resort if report missing
      return null;
    };
    const chosen = pick();
    if (chosen) {
      taxiFlags = {
        generatedAt: chosen.generatedAt || new Date().toISOString(),
        lastRunAt: chosen.lastRunAt,
        runType: chosen.runType,
        season: chosen.season,
        week: chosen.week,
        actual: Array.isArray(chosen.actual) ? chosen.actual : [],
        potential: Array.isArray(chosen.potential) ? chosen.potential : [],
      };
    }
  } catch {}
  // Final fallback: compute on-demand directly so the banner is never blank
  try {
    if ((!taxiFlags.runType || typeof taxiFlags.runType !== 'string') && taxiFlags.actual.length === 0 && taxiFlags.potential.length === 0) {
      const st = await getNFLState().catch(() => ({ season: new Date().getFullYear(), week: 1 } as { season?: number; week?: number }));
      const season = Number(st.season || new Date().getFullYear());
      const week = Number(st.week || 1);
      const teams = await getTeamsData(leagueId).catch(() => [] as Array<{ rosterId: number; teamName: string }>);
      const players = await getAllPlayersCached().catch(() => ({} as Record<string, { first_name?: string; last_name?: string }>));
      const nameOf = (pid: string) => {
        const p = players[pid];
        if (!p) return pid;
        const nm = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        return nm || pid;
      };
      const actual: Array<{ team: string; type: string; message: string }> = [];
      const potential: Array<{ team: string; type: string; message: string }> = [];
      for (const t of teams) {
        try {
          const res = await validateTaxiForRoster(String(season), t.rosterId);
          if (!res) continue;
          const nonCompliant = !res.compliant;
          const msgParts: string[] = [];
          for (const v of res.violations) {
            if (v.code === 'too_many_on_taxi') msgParts.push('>3 players on taxi');
            else if (v.code === 'too_many_qbs') msgParts.push('2+ QBs on taxi (limit 1)');
            else if (v.code === 'invalid_intake') msgParts.push('Taxi intake must be FA/Trade/Draft');
            else if (v.code === 'roster_inconsistent') msgParts.push('Taxi conflicts with starters/IR');
            else if (v.code === 'boomerang_active_player') {
              const names = (v.players || []).map(nameOf).slice(0, 3).join(', ');
              msgParts.push(`Previously active this tenure on taxi${names ? `: ${names}` : ''}`);
            }
          }
          const msg = msgParts.join('; ');
          if (msg) {
            const entry = { team: t.teamName, type: nonCompliant ? 'violation' : 'warning', message: `${t.teamName}: ${msg}` };
            if (nonCompliant) actual.push(entry); else potential.push(entry);
          }
        } catch {}
      }
      const ts = new Date().toISOString();
      taxiFlags = { generatedAt: ts, lastRunAt: ts, runType: 'admin_rerun', season, week, actual, potential };
    }
  } catch {}
  // Head-to-head all-time data
  let h2h: { teams: string[]; matrix: Record<string, Record<string, import("@/lib/utils/headtohead").H2HCell>>; neverBeaten: Array<{ team: string; vs: string; meetings: number; lastMeeting?: { year: string; week: number } }> } = { teams: [], matrix: {}, neverBeaten: [] };
  try {
    h2h = await getHeadToHeadAllTime();
  } catch {}
  // Build highlight keys for pairs playing this week where the row team has never beaten the opponent (but have met before)
  const h2hHighlightKeys: string[] = [];
  const key = (a: string, b: string) => `${a}||${b}`;
  for (const mu of currentWeekMatchups) {
    const a = mu.awayTeam;
    const b = mu.homeTeam;
    const c1 = h2h.matrix[a]?.[b];
    const c2 = h2h.matrix[b]?.[a];
    if (c1 && c1.meetings > 0 && c1.wins.total === 0) h2hHighlightKeys.push(key(a, b));
    if (c2 && c2.meetings > 0 && c2.wins.total === 0) h2hHighlightKeys.push(key(b, a));
  }
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col items-center gap-4 mb-8">
        <Image
          src="/assets/teams/East v West Logos/Official East v. West Logo.png"
          alt="East v. West League Logo"
          width={200}
          height={200}
          priority
          className="h-24 w-auto object-contain"
        />
        <SectionHeader title="East v. West Fantasy Football" className="mx-auto max-w-fit" />
      </div>
      
      {/* Countdowns Section */}
      <section className="mb-12">
        <SectionHeader title="Key dates" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CountdownTimer 
            targetDate={IMPORTANT_DATES.TRADE_DEADLINE} 
            title="Trade deadline in"
          />
          <CountdownTimer 
            targetDate={IMPORTANT_DATES.PLAYOFFS_START} 
            title="Playoffs start in"
          />
        </div>
      </section>
      
      {/* Taxi Tracker summary */}
      <section className="mb-6" aria-label="Taxi tracker summary">
        {taxiFlags.actual.length > 0 && (
          <div className="mb-2 evw-surface border border-[var(--border)] rounded-md p-3" style={{ backgroundColor: 'color-mix(in srgb, var(--danger) 10%, transparent)' }}>
            <div className="font-semibold mb-1">Taxi violations</div>
            <div className="text-xs opacity-80 mb-1">Run: {taxiFlags.runType || '—'} • Last run at: {new Date(taxiFlags.lastRunAt || taxiFlags.generatedAt).toLocaleString()}</div>
            <ul className="list-disc pl-5 text-sm">
              {taxiFlags.actual.slice(0, 3).map((f, i) => (
                <li key={`act-${i}`}>{f.message}</li>
              ))}
              {taxiFlags.actual.length > 3 && (
                <li className="opacity-80">+{taxiFlags.actual.length - 3} more…</li>
              )}
            </ul>
          </div>
        )}
        {taxiFlags.potential.length > 0 && (
          <div className="evw-surface border border-[var(--border)] rounded-md p-3" style={{ backgroundColor: 'color-mix(in srgb, var(--gold) 12%, transparent)' }}>
            <div className="font-semibold mb-1">Potential taxi issues (pending games)</div>
            <div className="text-xs opacity-80 mb-1">Run: {taxiFlags.runType || '—'} • Last run at: {new Date(taxiFlags.lastRunAt || taxiFlags.generatedAt).toLocaleString()}</div>
            <ul className="list-disc pl-5 text-sm">
              {taxiFlags.potential.slice(0, 3).map((f, i) => (
                <li key={`pot-${i}`}>{f.message}</li>
              ))}
              {taxiFlags.potential.length > 3 && (
                <li className="opacity-80">+{taxiFlags.potential.length - 3} more…</li>
              )}
            </ul>
          </div>
        )}
        {taxiFlags.actual.length === 0 && taxiFlags.potential.length === 0 && taxiFlags.runType && (
          <div className="evw-surface border border-[var(--border)] rounded-md p-3" style={{ backgroundColor: 'color-mix(in srgb, #10b981 12%, transparent)' }}>
            <div className="font-semibold mb-1">All teams compliant</div>
            <div className="text-sm">As of {new Date(taxiFlags.lastRunAt || taxiFlags.generatedAt).toLocaleString()} (run: {taxiFlags.runType}).</div>
          </div>
        )}
        {taxiFlags.actual.length === 0 && taxiFlags.potential.length === 0 && !taxiFlags.runType && (
          <div className="evw-surface border border-[var(--border)] rounded-md p-3" style={{ backgroundColor: 'color-mix(in srgb, #93c5fd 12%, transparent)' }}>
            <div className="font-semibold mb-1">Taxi tracker</div>
            <div className="text-sm">No scheduled report recorded yet.</div>
            <div className="text-xs opacity-80">Last checked: {taxiFlags.generatedAt ? new Date(taxiFlags.generatedAt).toLocaleString() : '—'}</div>
          </div>
        )}
      </section>

      {/* Current Week Preview */}
      <section className="mb-12">
        <SectionHeader title={`Week ${selectedWeek} matchups`} />
        {/* Week selector: 1..14 clickable links */}
        <div className="mb-6 flex flex-wrap gap-2" aria-label="Select week">
          {Array.from({ length: MAX_REGULAR_WEEKS }, (_, i) => i + 1).map((w) => {
            const isActive = w === selectedWeek;
            return (
              <Link
                key={w}
                href={`/?week=${w}`}
                prefetch={false}
                aria-label={`Show Week ${w}`}
                className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                  isActive
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'evw-surface text-[var(--text)] border-[var(--border)] hover:bg-[color-mix(in_srgb,white_5%,transparent)]'
                }`}
              >
                {w}
              </Link>
            );
          })}
        </div>
        {currentWeekMatchups.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentWeekMatchups.map((matchup, index) => (
              <MatchupCard 
                key={index}
                homeTeam={matchup.homeTeam}
                awayTeam={matchup.awayTeam}
                homeRosterId={matchup.homeRosterId}
                awayRosterId={matchup.awayRosterId}
                homeScore={matchup.homeScore}
                awayScore={matchup.awayScore}
                kickoffTime={matchup.kickoffTime}
                week={matchup.week}
                matchupId={matchup.matchupId}
              />
            ))}
          </div>
        ) : (
          <EmptyState 
            title={`No Week ${selectedWeek} matchups`}
            message={`Matchups for Week ${selectedWeek} are not yet available from Sleeper. Check back closer to kickoff.`}
          />
        )}
      </section>
      
      {/* Head-to-Head (All-time) */}
      <section className="mb-12">
        <SectionHeader title="Head-to-head (All-time)" subtitle="* = no regular-season wins yet; blue = playing this week" />
        <Card className="mt-4">
          <CardContent>
            <Tabs
              initialId="grid"
              tabs={[
                { id: 'grid', label: 'Grid', content: <HeadToHeadGrid teams={h2h.teams} matrix={h2h.matrix} highlightKeys={h2hHighlightKeys} /> },
                { id: 'tracker', label: 'Tracker', content: <NeverBeatenTracker list={h2h.neverBeaten} /> },
              ]}
            />
          </CardContent>
        </Card>
      </section>
      
      {/* Quick Links */}
      <section>
        <SectionHeader title="Quick links" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <LinkButton href="/teams" aria-label="View all teams">Teams</LinkButton>
          <LinkButton href="/standings" aria-label="View league standings">Standings</LinkButton>
          <LinkButton href="/history" aria-label="View league history">History</LinkButton>
          <LinkButton href="/draft" aria-label="View draft information">Draft</LinkButton>
          <LinkButton href="/suggestions" aria-label="Submit anonymous suggestions">Suggestions</LinkButton>
        </div>
      </section>
    </div>
  );
}
