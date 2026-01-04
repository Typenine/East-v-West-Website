import Image from 'next/image';
import Link from 'next/link';
import CountdownTimer from '@/components/ui/countdown-timer';
import MatchupCard from '@/components/ui/matchup-card';
import { IMPORTANT_DATES, LEAGUE_IDS, CHAMPIONS } from '@/lib/constants/league';
import { getLeagueMatchups, getTeamsData, getNFLState, derivePodiumFromWinnersBracketByYear, getSeasonAwardsUsingLeagueScoring, getWeeklyHighsBySeason, getLeaguePlayoffBracketsWithScores, getRosterIdToTeamNameMap, buildYearToLeagueMapUnique, type SleeperBracketGameWithScore, type WeeklyHighByWeekEntry } from '@/lib/utils/sleeper-api';
import EmptyState from '@/components/ui/empty-state';
import SectionHeader from '@/components/ui/SectionHeader';
import LinkButton from '@/components/ui/LinkButton';
import Card, { CardContent } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import HeadToHeadGrid from '@/components/headtohead/HeadToHeadGrid';
import NeverBeatenTracker from '@/components/headtohead/NeverBeatenTracker';
import { getHeadToHeadAllTime } from '@/lib/utils/headtohead';
import TaxiBanner from '@/components/taxi/TaxiBanner';
import { getTeamLogoPath, getTeamColors } from '@/lib/utils/team-utils';

export const revalidate = 20; // ISR: refresh at most every 20s to reduce API churn and flakiness

export default async function Home({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  let leagueId = LEAGUE_IDS.CURRENT;
  let yearMap: Record<string, string> = {};
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
  let isRegularSeason = true;
  let seasonYear = '2025';
  let seasonTypeStr = 'regular';
  let isPlayoffs = false;
  let winnersBracket: SleeperBracketGameWithScore[] = [];
  let bracketNameMap = new Map<number, string>();
  let losersBracket: SleeperBracketGameWithScore[] = [];
  const sp = (await (searchParams ?? Promise.resolve({}))) as Record<string, string | string[] | undefined>;
  const requestedWeekRaw = sp.week;
  const requestedWeekStr = Array.isArray(requestedWeekRaw) ? requestedWeekRaw[0] : requestedWeekRaw;
  const requestedWeekNum = typeof requestedWeekStr === 'string' ? Number(requestedWeekStr) : NaN;
  const hasUserOverride = Number.isFinite(requestedWeekNum) && requestedWeekNum >= 1 && requestedWeekNum <= MAX_REGULAR_WEEKS;
  let selectedWeek = 1;
  try {
    // Get current NFL state first, then resolve the active league ID dynamically for that season
    const nflState = await getNFLState().catch(() => ({ week: 1, display_week: 1, season_type: 'regular' }));
    const seasonType = (nflState as { season_type?: string }).season_type ?? 'regular';
    seasonTypeStr = seasonType;
    const hasScores = (nflState as { season_has_scores?: boolean }).season_has_scores;
    seasonYear = String((nflState as { season?: string | number }).season ?? seasonYear);
    try {
      yearMap = await buildYearToLeagueMapUnique().catch(() => ({} as Record<string, string>));
      leagueId = yearMap[seasonYear] || leagueId;
    } catch {}
    const teams = await getTeamsData(leagueId).catch(() => [] as Array<{ rosterId: number; teamName: string }>);
    const week1Ts = new Date(IMPORTANT_DATES.NFL_WEEK_1_START).getTime();
    const playoffsStartTs = new Date(IMPORTANT_DATES.PLAYOFFS_START).getTime();
    const newYearTs = new Date(IMPORTANT_DATES.NEW_LEAGUE_YEAR).getTime();
    const now = new Date();
    const nowTs = now.getTime();
    const beforeWeek1 = Number.isFinite(week1Ts) && nowTs < week1Ts;
    const afterPlayoffsStart = Number.isFinite(playoffsStartTs) && nowTs >= playoffsStartTs;
    const withinSeasonWindow = Number.isFinite(newYearTs) && nowTs < (newYearTs + 48 * 60 * 60 * 1000);
    isPlayoffs = seasonTypeStr === 'post' || (afterPlayoffsStart && withinSeasonWindow);
    isRegularSeason = seasonType === 'regular' && !beforeWeek1 && !afterPlayoffsStart;
    if (!isRegularSeason || hasScores === false) {
      defaultWeek = 1;
    } else {
      const dowET = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(now);
      const raw = Number(((nflState as { week?: number }).week ?? (nflState as { display_week?: number }).display_week ?? 1));
      const baseWeek = Number.isFinite(raw) ? raw : 1;
      if (dowET === 'Mon' || dowET === 'Tue') {
        defaultWeek = Math.max(1, baseWeek - 1);
      } else {
        defaultWeek = baseWeek; // Wed–Sun follow Sleeper's week/display_week
      }
    if (isPlayoffs) {
      try {
        const [brackets, nameMap] = await Promise.all([
          getLeaguePlayoffBracketsWithScores(leagueId, { forceFresh: true }).catch(() => ({ winners: [], losers: [] })),
          getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
        ]);
        winnersBracket = (brackets as { winners?: SleeperBracketGameWithScore[] }).winners || [];
        losersBracket = (brackets as { losers?: SleeperBracketGameWithScore[] }).losers || [];
        bracketNameMap = nameMap as Map<number, string>;
        // If the playoffs window is active but no bracket data exists, fall back to offseason recap display
        if ((winnersBracket.length === 0) && (losersBracket.length === 0)) {
          isPlayoffs = false;
        }
      } catch {}
    }
    }
    // If we are in playoffs and brackets haven't been loaded (due to gating), load them now and fall back if empty
    if (isPlayoffs && winnersBracket.length === 0 && losersBracket.length === 0) {
      try {
        const [brackets, nameMap] = await Promise.all([
          getLeaguePlayoffBracketsWithScores(leagueId, { forceFresh: true }).catch(() => ({ winners: [], losers: [] })),
          getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
        ]);
        winnersBracket = (brackets as { winners?: SleeperBracketGameWithScore[] }).winners || [];
        losersBracket = (brackets as { losers?: SleeperBracketGameWithScore[] }).losers || [];
        bracketNameMap = nameMap as Map<number, string>;
        if ((winnersBracket.length === 0) && (losersBracket.length === 0)) {
          isPlayoffs = false;
        }
      } catch {}
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
    const now = new Date();
    const nowTs = now.getTime();
    const week1Ts = new Date(IMPORTANT_DATES.NFL_WEEK_1_START).getTime();
    const playoffsStartTs = new Date(IMPORTANT_DATES.PLAYOFFS_START).getTime();
    const newYearTs = new Date(IMPORTANT_DATES.NEW_LEAGUE_YEAR).getTime();
    const beforeWeek1 = Number.isFinite(week1Ts) && nowTs < week1Ts;
    const afterPlayoffsStart = Number.isFinite(playoffsStartTs) && nowTs >= playoffsStartTs;
    const withinSeasonWindow = Number.isFinite(newYearTs) && nowTs < (newYearTs + 48 * 60 * 60 * 1000);
    isPlayoffs = afterPlayoffsStart && withinSeasonWindow;
    isRegularSeason = !beforeWeek1 && !afterPlayoffsStart;
  }
  // Seeds by rosterId (based on final regular-season standings for current league)
  const seedByRosterId = new Map<number, number>();
  try {
    const sortedForSeeds = [...(await getTeamsData(leagueId).catch(() => [] as Array<{ rosterId: number; wins?: number; fpts?: number }>))]
      .sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.fpts ?? 0) - (a.fpts ?? 0));
    sortedForSeeds.forEach((t, i) => seedByRosterId.set(t.rosterId, i + 1));
  } catch {}
  // Recap brackets and seeding for offseason view
  let recapWinnersBracket: SleeperBracketGameWithScore[] = [];
  let recapLosersBracket: SleeperBracketGameWithScore[] = [];
  let recapBracketNameMap = new Map<number, string>();
  const seedByRosterIdRecap = new Map<number, number>();
  const recap: {
    podium?: { champion: string; runnerUp: string; thirdPlace: string };
    awards?: { mvp?: { name: string; points: number; teamName?: string }; roy?: { name: string; points: number; teamName?: string } };
    weeklyHighsLeader?: { teamName: string; count: number };
    toiletChampion?: string;
    regularSeasonWinner?: { teamName: string; rosterId: number; wins: number; fpts: number };
    pfLeader?: { teamName: string; rosterId: number; fpts: number };
    topWeek?: { teamName: string; rosterId: number; week: number; points: number; opponentTeamName: string; opponentRosterId: number };
  } = {};
  if (!isRegularSeason) {
    try {
      const leagueIdRecap = yearMap[seasonYear] || LEAGUE_IDS.PREVIOUS[seasonYear as keyof typeof LEAGUE_IDS.PREVIOUS];
      const [podiumDerived, awards, weeklyHighs, recapBrackets, recapNameMap] = await Promise.all([
        derivePodiumFromWinnersBracketByYear(seasonYear).catch(() => null),
        getSeasonAwardsUsingLeagueScoring(seasonYear, leagueIdRecap ?? leagueId, 14).catch(() => null),
        getWeeklyHighsBySeason(seasonYear).catch(() => [] as WeeklyHighByWeekEntry[]),
        leagueIdRecap ? getLeaguePlayoffBracketsWithScores(leagueIdRecap, { forceFresh: true }).catch(() => ({ winners: [] as SleeperBracketGameWithScore[], losers: [] as SleeperBracketGameWithScore[] })) : Promise.resolve({ winners: [] as SleeperBracketGameWithScore[], losers: [] as SleeperBracketGameWithScore[] }),
        leagueIdRecap ? getRosterIdToTeamNameMap(leagueIdRecap).catch(() => new Map<number, string>()) : Promise.resolve(new Map<number, string>()),
      ]);
      recapWinnersBracket = (recapBrackets?.winners || []) as SleeperBracketGameWithScore[];
      recapLosersBracket = (recapBrackets?.losers || []) as SleeperBracketGameWithScore[];
      recapBracketNameMap = recapNameMap as Map<number, string>;
      if (leagueIdRecap) {
        const teamsRecap = await getTeamsData(leagueIdRecap).catch(() => [] as Array<{ rosterId: number; wins?: number; fpts?: number }>);
        const sortedRecap = [...teamsRecap].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.fpts ?? 0) - (a.fpts ?? 0));
        sortedRecap.forEach((t, i) => seedByRosterIdRecap.set(t.rosterId, i + 1));
      }
      const base = (CHAMPIONS as Record<string, { champion?: string; runnerUp?: string; thirdPlace?: string }>)[seasonYear] || {};
      const mergedPodium = {
        champion: (podiumDerived?.champion ?? base.champion ?? 'TBD') as string,
        runnerUp: (podiumDerived?.runnerUp ?? base.runnerUp ?? 'TBD') as string,
        thirdPlace: (podiumDerived?.thirdPlace ?? base.thirdPlace ?? 'TBD') as string,
      };
      recap.podium = mergedPodium;
      if (awards) {
        recap.awards = {
          mvp: awards.mvp && awards.mvp[0] ? { name: awards.mvp[0].name, points: awards.mvp[0].points, teamName: (awards.mvp[0].teamName ?? undefined) as string | undefined } : undefined,
          roy: awards.roy && awards.roy[0] ? { name: awards.roy[0].name, points: awards.roy[0].points, teamName: (awards.roy[0].teamName ?? undefined) as string | undefined } : undefined,
        };
      }
      const weeklyHighsRows = (weeklyHighs as WeeklyHighByWeekEntry[]) || [];
      if (weeklyHighsRows.length > 0) {
        const counts = new Map<string, number>();
        for (const row of weeklyHighsRows) {
          const key = row.teamName || 'Unknown Team';
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        let bestTeam = '—';
        let bestCount = 0;
        for (const [tn, c] of counts.entries()) {
          if (c > bestCount) {
            bestTeam = tn;
            bestCount = c;
          }
        }
        recap.weeklyHighsLeader = { teamName: bestTeam, count: bestCount };
      }
      // Additional recap stats
      if (leagueIdRecap) {
        try {
          const teamsRecap = await getTeamsData(leagueIdRecap).catch(() => [] as Array<{ rosterId: number; teamName: string; wins?: number; fpts?: number }>);
          if (teamsRecap.length > 0) {
            const sortedByRecord = [...teamsRecap].sort((a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.fpts ?? 0) - (a.fpts ?? 0));
            const rw = sortedByRecord[0];
            if (rw) recap.regularSeasonWinner = { teamName: rw.teamName, rosterId: rw.rosterId, wins: rw.wins ?? 0, fpts: rw.fpts ?? 0 };
            const pfTop = [...teamsRecap].sort((a, b) => (b.fpts ?? 0) - (a.fpts ?? 0))[0];
            if (pfTop) recap.pfLeader = { teamName: pfTop.teamName, rosterId: pfTop.rosterId, fpts: pfTop.fpts ?? 0 };
          }
        } catch {}
      }
      if (weeklyHighsRows.length > 0) {
        const top = [...weeklyHighsRows].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
        if (top) recap.topWeek = { teamName: top.teamName, rosterId: top.rosterId, week: top.week, points: top.points, opponentTeamName: top.opponentTeamName, opponentRosterId: top.opponentRosterId };
      }
      // Toilet Bowl champion (losers bracket final winner)
      if (recapBrackets && (recapBrackets.losers || []).length > 0) {
        const lb = recapBrackets.losers as SleeperBracketGameWithScore[];
        const byRound: Record<number, SleeperBracketGameWithScore[]> = {};
        for (const g of lb) {
          const r = g.r ?? 0;
          if (!byRound[r]) byRound[r] = [];
          byRound[r].push(g);
        }
        const rounds = Object.keys(byRound).map((n) => Number(n));
        if (rounds.length > 0) {
          const maxRound = Math.max(...rounds);
          const last = byRound[maxRound] || [];
          const final: SleeperBracketGameWithScore | undefined = last.find((g) => g.w != null);
          const champRid = final?.w ?? null;
          if (champRid != null && recapNameMap) {
            const nm = recapNameMap as Map<number, string>;
            const name = nm.get(champRid) || `Roster ${champRid}`;
            recap.toiletChampion = name;
          }
        }
      }
    } catch {}
  }
  // Offseason primary countdown selection after Super Bowl hold window (48h)
  const nowTs = Date.now();
  const sbTs = new Date(IMPORTANT_DATES.NEW_LEAGUE_YEAR).getTime();
  const showSuperBowl = Number.isFinite(sbTs) && nowTs < sbTs + 48 * 60 * 60 * 1000;
  const offPrimaryDate = showSuperBowl ? IMPORTANT_DATES.NEW_LEAGUE_YEAR : IMPORTANT_DATES.NFL_WEEK_1_START;
  const offPrimaryTitle = showSuperBowl ? 'Super Bowl in' : 'Season starts in';
  // Taxi flags (league-wide): fetch lightweight flags on SSR for speed
  let taxiFlags: { generatedAt: string; lastRunAt?: string; runType?: string; season?: number; week?: number; actual: Array<{ team: string; type: string; message: string }>; potential: Array<{ team: string; type: string; message: string }> } = { generatedAt: '', actual: [], potential: [] };
  try {
    const rf = await fetch('/api/taxi/flags', { next: { revalidate: 20 } });
    if (rf.ok) {
      const j = await rf.json().catch(() => null) as null | { generatedAt?: string; lastRunAt?: string; runType?: string; season?: number; week?: number; actual?: Array<{ team: string; type: string; message: string }>; potential?: Array<{ team: string; type: string; message: string }> };
      if (j) {
        taxiFlags = {
          generatedAt: j.generatedAt || new Date().toISOString(),
          lastRunAt: j.lastRunAt,
          runType: j.runType,
          season: j.season,
          week: j.week,
          actual: Array.isArray(j.actual) ? j.actual : [],
          potential: Array.isArray(j.potential) ? j.potential : [],
        };
      }
    }
  } catch {}
  // Final fallback removed to keep SSR fast. Client will refresh banner post-hydration if needed.
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
          {isRegularSeason ? (
            <>
              <CountdownTimer 
                targetDate={IMPORTANT_DATES.TRADE_DEADLINE} 
                title="Trade deadline in"
              />
              <CountdownTimer 
                targetDate={IMPORTANT_DATES.PLAYOFFS_START} 
                title="Playoffs start in"
              />
            </>
          ) : (
            <>
              <CountdownTimer targetDate={offPrimaryDate} title={offPrimaryTitle} />
              <CountdownTimer 
                targetDate={IMPORTANT_DATES.NEXT_DRAFT} 
                title="Next draft in"
              />
            </>
          )}
        </div>
      </section>
      
      {/* Taxi Tracker summary */}
      <TaxiBanner initial={taxiFlags} />

      {/* Current Week Preview */}
      <section className="mb-12">
        {isRegularSeason ? (
          <>
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
          </>
        ) : isPlayoffs ? (
          <>
            <SectionHeader title="Playoff brackets" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {[{ id: 'winners', title: 'Winners Bracket', data: winnersBracket }, { id: 'losers', title: 'Losers Bracket', data: losersBracket }].map((b) => (
                <Card key={b.id}>
                  <CardContent>
                    <h3 className="text-lg font-semibold mb-3">{b.title}</h3>
                    {b.data.length === 0 ? (
                      <p className="text-[var(--muted)]">No games yet.</p>
                    ) : (
                      (() => {
                        const rounds = new Map<number, Array<{ r: number; m: number; t1?: number | null; t2?: number | null; t1_points?: number | null; t2_points?: number | null }>>();
                        for (const g of b.data) {
                          const arr = rounds.get(g.r) || [];
                          arr.push(g);
                          rounds.set(g.r, arr);
                        }
                        const roundNums = Array.from(rounds.keys()).sort((a, b) => a - b);
                        const maxRound = roundNums.length ? roundNums[roundNums.length - 1] : 0;
                        const roundTitle = (r: number) => {
                          if (r === maxRound) return 'Finals';
                          if (r === maxRound - 1) return 'Semifinals';
                          return `Round ${r}`;
                        };
                        const totalRows = Math.max(1, (2 ** roundNums.length) * 2 - 1);
                        const totalCols = Math.max(1, roundNums.length * 2 - 1);
                        const colTemplate = Array.from({ length: totalCols }, (_, i) => (i % 2 === 0 ? 'minmax(240px,1fr)' : '64px')).join(' ');
                        return (
                          <div className="w-full overflow-x-auto">
                            <div className="grid gap-3" style={{ gridTemplateColumns: colTemplate }}>
                              {roundNums.map((r, rIdx) => (
                                <div key={`hdr-${r}`} className="text-sm font-semibold" style={{ gridColumn: rIdx * 2 + 1 }}>{roundTitle(r)}</div>
                              ))}
                            </div>
                            <div className="grid gap-4" style={{ gridTemplateColumns: colTemplate, gridTemplateRows: `repeat(${totalRows}, minmax(0,1fr))` }}>
                              {roundNums.map((r, rIdx) => {
                                const arrInRound = (rounds.get(r) || []).sort((a, b) => (a.m ?? 0) - (b.m ?? 0));
                                return arrInRound.flatMap((g, idx) => {
                                  const t1Name = g.t1 != null ? (bracketNameMap.get(g.t1) || `Roster ${g.t1}`) : 'Bye';
                                  const t2Name = g.t2 != null ? (bracketNameMap.get(g.t2) || `Roster ${g.t2}`) : 'Bye';
                                  const t1p = g.t1_points ?? null;
                                  const t2p = g.t2_points ?? null;
                                  const t1Seed = g.t1 != null ? (seedByRosterId.get(g.t1) ?? null) : null;
                                  const t2Seed = g.t2 != null ? (seedByRosterId.get(g.t2) ?? null) : null;
                                  const c1 = t1Name && t1Name !== 'Bye' ? getTeamColors(t1Name)?.primary : undefined;
                                  const c2 = t2Name && t2Name !== 'Bye' ? getTeamColors(t2Name)?.primary : undefined;
                                  const inFinal = r === maxRound;
                                  const matchLabel = inFinal ? (b.id === 'winners' ? (arrInRound.length > 1 ? (idx === 0 ? 'Championship' : '3rd Place') : 'Championship') : 'Final') : undefined;
                                  const row = ((idx + 1) * (2 ** (rIdx + 1))) - 1;
                                  const elements = [(
                                    <div key={`m-${r}-${idx}`} style={{ gridColumn: rIdx * 2 + 1, gridRow: row }} className="evw-surface border rounded-[var(--radius-card)] p-3">
                                      {matchLabel && (<div className="text-xs text-[var(--muted)] mb-1">{matchLabel}</div>)}
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                          {t1Name && t1Name !== 'Bye' && g.t1 != null ? (
                                            <Link href={`/teams/${g.t1}`} className="flex items-center gap-2 min-w-0 hover:underline">
                                              <div className="w-7 h-7 rounded-full overflow-hidden border" style={{ borderColor: c1 || 'var(--border)' }}>
                                                <Image src={getTeamLogoPath(t1Name)} alt={t1Name} width={28} height={28} className="object-contain w-7 h-7" />
                                              </div>
                                              <div className="truncate">
                                                <div className="text-sm font-semibold truncate">{t1Seed ? `#${t1Seed} ` : ''}{t1Name}</div>
                                                <div className="text-xs text-[var(--muted)]">{t1p == null ? '—' : t1p.toFixed(2)}</div>
                                              </div>
                                            </Link>
                                          ) : (
                                            <div className="truncate">
                                              <div className="text-sm font-semibold truncate">{t1Name}</div>
                                              <div className="text-xs text-[var(--muted)]">{t1p == null ? '—' : t1p.toFixed(2)}</div>
                                            </div>
                                          )}
                                        </div>
                                        <span className="text-[var(--muted)]">vs</span>
                                        <div className="flex items-center gap-2 min-w-0">
                                          {t2Name && t2Name !== 'Bye' && g.t2 != null ? (
                                            <Link href={`/teams/${g.t2}`} className="flex items-center gap-2 min-w-0 hover:underline">
                                              <div className="w-7 h-7 rounded-full overflow-hidden border" style={{ borderColor: c2 || 'var(--border)' }}>
                                                <Image src={getTeamLogoPath(t2Name)} alt={t2Name} width={28} height={28} className="object-contain w-7 h-7" />
                                              </div>
                                              <div className="truncate text-right">
                                                <div className="text-sm font-semibold truncate">{t2Seed ? `#${t2Seed} ` : ''}{t2Name}</div>
                                                <div className="text-xs text-[var(--muted)]">{t2p == null ? '—' : t2p.toFixed(2)}</div>
                                              </div>
                                            </Link>
                                          ) : (
                                            <div className="truncate text-right">
                                              <div className="text-sm font-semibold truncate">{t2Name}</div>
                                              <div className="text-xs text-[var(--muted)]">{t2p == null ? '—' : t2p.toFixed(2)}</div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      {(c1 || c2) && (
                                        <div className="mt-2 grid grid-cols-2 h-1 rounded-full overflow-hidden">
                                          <div style={{ backgroundColor: c1 || 'transparent' }} />
                                          <div style={{ backgroundColor: c2 || 'transparent' }} />
                                        </div>
                                      )}
                                    </div>
                                  )];
                                  if (rIdx < roundNums.length - 1) {
                                    const span = 1 << rIdx;
                                    const start = Math.max(1, row - span);
                                    const end = row + span + 1;
                                    elements.push(
                                      <div key={`c-${r}-${idx}`} style={{ gridColumn: rIdx * 2 + 2, gridRow: `${start} / ${end}`, position: 'relative' }}>
                                        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, transform: 'translateX(-50%)', background: 'var(--border)' }} />
                                        <div style={{ position: 'absolute', top: '50%', left: 0, right: '50%', height: 2, transform: 'translateY(-50%)', background: 'var(--border)' }} />
                                        <div style={{ position: 'absolute', top: '50%', left: '50%', right: 0, height: 2, transform: 'translateY(-50%)', background: 'var(--border)' }} />
                                      </div>
                                    );
                                  }
                                  return elements;
                                });
                              })}
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

          </>
        ) : (
          <>
            <SectionHeader title={`Season recap (${seasonYear})`} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
              <Card>
                <CardContent>
                  <h3 className="text-lg font-semibold mb-3">Top 3</h3>
                  <div className="space-y-3">
                    {(() => {
                      const invert = new Map<string, number>();
                      recapBracketNameMap.forEach((nm, rid) => invert.set(nm, rid));
                      return ['Champion', 'Runner-up', 'Third place'].map((label, idx) => {
                        const name = idx === 0 ? recap.podium?.champion : idx === 1 ? recap.podium?.runnerUp : recap.podium?.thirdPlace;
                        const color = name && name !== 'TBD' ? getTeamColors(name)?.primary : undefined;
                        const rid = name ? invert.get(name) : undefined;
                        const content = (
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full overflow-hidden border" style={{ borderColor: color || 'var(--border)' }}>
                              {name && name !== 'TBD' && (
                                <Image src={getTeamLogoPath(name)} alt={name} width={32} height={32} className="object-contain w-8 h-8" />
                              )}
                            </div>
                            <div className="truncate">
                              <div className="text-sm text-[var(--muted)]">{label}</div>
                              <div className="font-semibold truncate">{name ?? 'TBD'}</div>
                            </div>
                          </div>
                        );
                        return (
                          <div key={label} className="flex items-center justify-between p-2 rounded-md border" style={{ borderColor: color || 'var(--border)' }}>
                            {name && name !== 'TBD' && rid ? (
                              <Link href={`/teams/${rid}`} className="hover:underline">{content}</Link>
                            ) : (
                              content
                            )}
                            {color && <div className="w-1 h-8 rounded" style={{ backgroundColor: color }} />}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <h3 className="text-lg font-semibold mb-2">Awards</h3>
                  <ul className="space-y-2">
                    <li>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">MVP:</span>
                        {recap.awards?.mvp ? (
                          <>
                            <span>{recap.awards.mvp.name} ({recap.awards.mvp.points.toFixed(2)} pts)</span>
                            {(() => {
                              if (!recap.awards?.mvp?.teamName) return null;
                              const invert = new Map<string, number>();
                              recapBracketNameMap.forEach((nm, rid) => invert.set(nm, rid));
                              const rid = invert.get(recap.awards.mvp.teamName);
                              return (
                                <span className="flex items-center gap-1">
                                  <Image src={getTeamLogoPath(recap.awards.mvp.teamName)} alt={recap.awards.mvp.teamName} width={16} height={16} className="object-contain w-4 h-4" />
                                  {rid ? (
                                    <Link href={`/teams/${rid}`} className="text-xs text-[var(--muted)] hover:underline">{recap.awards.mvp.teamName}</Link>
                                  ) : (
                                    <span className="text-xs text-[var(--muted)]">{recap.awards.mvp.teamName}</span>
                                  )}
                                </span>
                              );
                            })()}
                          </>
                        ) : (
                          <span>TBD</span>
                        )}
                      </div>
                    </li>
                    <li>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Rookie of the Year:</span>
                        {recap.awards?.roy ? (
                          <>
                            <span>{recap.awards.roy.name} ({recap.awards.roy.points.toFixed(2)} pts)</span>
                            {(() => {
                              if (!recap.awards?.roy?.teamName) return null;
                              const invert = new Map<string, number>();
                              recapBracketNameMap.forEach((nm, rid) => invert.set(nm, rid));
                              const rid = invert.get(recap.awards.roy.teamName);
                              return (
                                <span className="flex items-center gap-1">
                                  <Image src={getTeamLogoPath(recap.awards.roy.teamName)} alt={recap.awards.roy.teamName} width={16} height={16} className="object-contain w-4 h-4" />
                                  {rid ? (
                                    <Link href={`/teams/${rid}`} className="text-xs text-[var(--muted)] hover:underline">{recap.awards.roy.teamName}</Link>
                                  ) : (
                                    <span className="text-xs text-[var(--muted)]">{recap.awards.roy.teamName}</span>
                                  )}
                                </span>
                              );
                            })()}
                          </>
                        ) : (
                          <span>TBD</span>
                        )}
                      </div>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <h3 className="text-lg font-semibold mb-2">Most weekly-high wins</h3>
                  {recap.weeklyHighsLeader ? (
                    <p>
                      <span className="font-medium">{recap.weeklyHighsLeader.teamName}</span> — {recap.weeklyHighsLeader.count}
                    </p>
                  ) : (
                    <p className="text-[var(--muted)]">TBD</p>
                  )}
                </CardContent>
              </Card>
              {recap.regularSeasonWinner && (
                <Card>
                  <CardContent>
                    <h3 className="text-lg font-semibold mb-2">Regular-season winner</h3>
                    <Link href={`/teams/${recap.regularSeasonWinner.rosterId}`} className="flex items-center gap-3 hover:underline">
                      <Image src={getTeamLogoPath(recap.regularSeasonWinner.teamName)} alt={recap.regularSeasonWinner.teamName} width={28} height={28} className="object-contain w-7 h-7 rounded-full border" />
                      <span className="font-semibold">{recap.regularSeasonWinner.teamName}</span>
                      <span className="text-xs text-[var(--muted)]">({recap.regularSeasonWinner.wins} wins, {recap.regularSeasonWinner.fpts.toFixed(2)} PF)</span>
                    </Link>
                  </CardContent>
                </Card>
              )}
              {recap.pfLeader && (
                <Card>
                  <CardContent>
                    <h3 className="text-lg font-semibold mb-2">Points-for leader</h3>
                    <Link href={`/teams/${recap.pfLeader.rosterId}`} className="flex items-center gap-3 hover:underline">
                      <Image src={getTeamLogoPath(recap.pfLeader.teamName)} alt={recap.pfLeader.teamName} width={28} height={28} className="object-contain w-7 h-7 rounded-full border" />
                      <span className="font-semibold">{recap.pfLeader.teamName}</span>
                      <span className="text-xs text-[var(--muted)]">{recap.pfLeader.fpts.toFixed(2)} PF</span>
                    </Link>
                  </CardContent>
                </Card>
              )}
              {recap.topWeek && (
                <Card>
                  <CardContent>
                    <h3 className="text-lg font-semibold mb-2">Highest weekly score</h3>
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/teams/${recap.topWeek.rosterId}`} className="flex items-center gap-3 hover:underline">
                        <Image src={getTeamLogoPath(recap.topWeek.teamName)} alt={recap.topWeek.teamName} width={28} height={28} className="object-contain w-7 h-7 rounded-full border" />
                        <span className="font-semibold">{recap.topWeek.teamName}</span>
                        <span className="text-xs text-[var(--muted)]">Week {recap.topWeek.week}</span>
                      </Link>
                      <div className="text-right">
                        <div className="text-lg font-bold text-[var(--accent)]">{recap.topWeek.points.toFixed(2)}</div>
                        <Link href={`/teams/${recap.topWeek.opponentRosterId}`} className="text-xs text-[var(--muted)] hover:underline">vs {recap.topWeek.opponentTeamName}</Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              {recap.toiletChampion && (
                <Card>
                  <CardContent>
                    <h3 className="text-lg font-semibold mb-2">Toilet Bowl Champion</h3>
                    {(() => {
                      const name = recap.toiletChampion as string | undefined;
                      if (!name) return <p className="text-[var(--muted)]">TBD</p>;
                      const color = getTeamColors(name)?.primary;
                      return (
                        <div className="flex items-center gap-3 p-2 rounded-md border" style={{ borderColor: color || 'var(--border)' }}>
                          <div className="w-8 h-8 rounded-full overflow-hidden border" style={{ borderColor: color || 'var(--border)' }}>
                            <Image src={getTeamLogoPath(name)} alt={name} width={32} height={32} className="object-contain w-8 h-8" />
                          </div>
                          <div className="font-semibold">{name}</div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              )}
            </div>
            {/* Recap Playoff Brackets */}
            <div className="mt-8">
              <SectionHeader title="Playoff brackets (recap)" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                {[{ id: 'winners-recap', title: 'Winners Bracket', data: recapWinnersBracket }, { id: 'losers-recap', title: 'Losers Bracket', data: recapLosersBracket }].map((b) => (
                  <Card key={b.id}>
                    <CardContent>
                      <h3 className="text-lg font-semibold mb-3">{b.title}</h3>
                      {b.data.length === 0 ? (
                        <p className="text-[var(--muted)]">No games.</p>
                      ) : (
                        (() => {
                          const rounds = new Map<number, SleeperBracketGameWithScore[]>();
                          for (const g of b.data) {
                            const arr = rounds.get(g.r) || [];
                            arr.push(g);
                            rounds.set(g.r, arr);
                          }
                          const roundNums = Array.from(rounds.keys()).sort((a, b) => a - b);
                          const maxRound = roundNums.length ? roundNums[roundNums.length - 1] : 0;
                          const roundTitle = (r: number) => {
                            if (r === maxRound) return 'Finals';
                            if (r === maxRound - 1) return 'Semifinals';
                            return `Round ${r}`;
                          };
                          return (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {roundNums.map((r) => (
                                <div key={r} className="space-y-3">
                                  <h4 className="font-semibold">{roundTitle(r)}</h4>
                                  {((rounds.get(r) || []).sort((a, b) => (a.m ?? 0) - (b.m ?? 0))).map((g, idx, arrInRound) => {
                                    const t1Name = g.t1 != null ? (recapBracketNameMap.get(g.t1) || `Roster ${g.t1}`) : 'Bye';
                                    const t2Name = g.t2 != null ? (recapBracketNameMap.get(g.t2) || `Roster ${g.t2}`) : 'Bye';
                                    const t1p = g.t1_points ?? null;
                                    const t2p = g.t2_points ?? null;
                                    const t1Seed = g.t1 != null ? (seedByRosterIdRecap.get(g.t1) ?? null) : null;
                                    const t2Seed = g.t2 != null ? (seedByRosterIdRecap.get(g.t2) ?? null) : null;
                                    const c1 = t1Name && t1Name !== 'Bye' ? getTeamColors(t1Name)?.primary : undefined;
                                    const c2 = t2Name && t2Name !== 'Bye' ? getTeamColors(t2Name)?.primary : undefined;
                                    const inFinal = r === maxRound;
                                    const matchLabel = inFinal
                                      ? (b.id === 'winners-recap'
                                          ? (arrInRound.length > 1 ? (idx === 0 ? 'Championship' : '3rd Place') : 'Championship')
                                          : 'Final')
                                      : undefined;
                                    return (
                                      <div key={idx} className="evw-surface border rounded-[var(--radius-card)] p-3">
                                        {matchLabel && (
                                          <div className="text-xs text-[var(--muted)] mb-1">{matchLabel}</div>
                                        )}
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-7 h-7 rounded-full overflow-hidden border" style={{ borderColor: c1 || 'var(--border)' }}>
                                              {t1Name && t1Name !== 'Bye' && (
                                                <Image src={getTeamLogoPath(t1Name)} alt={t1Name} width={28} height={28} className="object-contain w-7 h-7" />
                                              )}
                                            </div>
                                            <div className="truncate">
                                              <div className="text-sm font-semibold truncate">{t1Seed ? `#${t1Seed} ` : ''}{t1Name}</div>
                                              <div className="text-xs text-[var(--muted)]">{t1p == null ? '—' : t1p.toFixed(2)}</div>
                                            </div>
                                          </div>
                                          <span className="text-[var(--muted)]">vs</span>
                                          <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-7 h-7 rounded-full overflow-hidden border" style={{ borderColor: c2 || 'var(--border)' }}>
                                              {t2Name && t2Name !== 'Bye' && (
                                                <Image src={getTeamLogoPath(t2Name)} alt={t2Name} width={28} height={28} className="object-contain w-7 h-7" />
                                              )}
                                            </div>
                                            <div className="truncate text-right">
                                              <div className="text-sm font-semibold truncate">{t2Seed ? `#${t2Seed} ` : ''}{t2Name}</div>
                                              <div className="text-xs text-[var(--muted)]">{t2p == null ? '—' : t2p.toFixed(2)}</div>
                                            </div>
                                          </div>
                                        </div>
                                        {(c1 || c2) && (
                                          <div className="mt-2 grid grid-cols-2 h-1 rounded-full overflow-hidden">
                                            <div style={{ backgroundColor: c1 || 'transparent' }} />
                                            <div style={{ backgroundColor: c2 || 'transparent' }} />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          );
                        })()
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
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
      
      {/* Data Exports */}
      <section>
        <SectionHeader title="Data exports" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <LinkButton
            href="/api/export/all"
            aria-label="Download full league export JSON including rosters, rules, drafts, history, and trades"
            variant="primary"
          >
            Export everything (.json)
          </LinkButton>
          <LinkButton
            href="/api/export/rosters"
            aria-label="Download rosters and teams JSON across seasons"
          >
            Rosters & Teams (.json)
          </LinkButton>
          <LinkButton
            href="/api/export/rules"
            aria-label="Download league rules and settings JSON"
          >
            Rules & Settings (.json)
          </LinkButton>
          <LinkButton
            href="/api/export/drafts"
            aria-label="Download drafts and picks JSON across seasons"
          >
            Drafts & Picks (.json)
          </LinkButton>
          <LinkButton
            href="/api/export/history"
            aria-label="Download league history and records JSON"
          >
            History & Records (.json)
          </LinkButton>
          <LinkButton
            href="/api/export/trades"
            aria-label="Download trades and transactions JSON"
          >
            Trades & Transactions (.json)
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
