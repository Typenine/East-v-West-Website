import Link from 'next/link';
import MatchupCard from '@/components/ui/matchup-card';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  getLeagueMatchups,
  getTeamsData,
  getNFLState,
  derivePodiumFromWinnersBracketByYear,
  getSeasonAwardsUsingLeagueScoring,
  getWeeklyHighsBySeason,
  getLeaguePlayoffBracketsWithScores,
  getRosterIdToTeamNameMap,
  buildYearToLeagueMapUnique,
  getLeagueRosters,
  getAllPlayersCached,
  type SleeperBracketGameWithScore,
  type WeeklyHighByWeekEntry,
} from '@/lib/utils/sleeper-api';
import { getRecapYear } from '@/lib/utils/phase-resolver';
import { getHomepagePhase } from '@/lib/utils/countdown-resolver';
import EmptyState from '@/components/ui/empty-state';
import SectionHeader from '@/components/ui/SectionHeader';
import TaxiBanner from '@/components/taxi/TaxiBanner';
import SeasonRecapGrid from '@/components/home/SeasonRecapGrid';
import PlayoffBracketPanel from '@/components/brackets/PlayoffBracketPanel';
import HomepageCountdowns from '@/components/home/HomepageCountdowns';
import CompactSeasonRecap from '@/components/home/CompactSeasonRecap';
import HistoricalSpotlight from '@/components/home/HistoricalSpotlight';
import AroundTheLeague from '@/components/home/AroundTheLeague';
import LeaguePulse from '@/components/home/LeaguePulse';
import { BroadcastPanel } from '@/components/ui/BroadcastPanel';
import { getHeadToHeadAllTime } from '@/lib/utils/headtohead';
import { requireTeamUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';
// Longer revalidate during offseason; kept short for regular season/playoffs where live data matters.
// Dynamic means this is respected only for ISR fallback, not for every request.
export const revalidate = 60;

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ── Auth (server-side, reserved for future My Team card) ─────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _authUser = await requireTeamUser().catch(() => null);

  // ── Homepage phase ─────────────────────────────────────────────────────────
  const phase = getHomepagePhase();
  const isRegularSeasonOrLater =
    phase === 'regular_season' ||
    phase === 'post_deadline_pre_postseason' ||
    phase === 'postseason';
  const isPostseason = phase === 'postseason';
  const isRegularSeason = phase === 'regular_season' || phase === 'post_deadline_pre_postseason';

  // ── Shared state ───────────────────────────────────────────────────────────
  let leagueId = LEAGUE_IDS.CURRENT;
  let yearMap: Record<string, string> = {};
  let seasonYear = '2026';
  let recapYear = seasonYear;

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
  let selectedWeek = 1;

  let winnersBracket: SleeperBracketGameWithScore[] = [];
  let losersBracket: SleeperBracketGameWithScore[] = [];
  let bracketNameMap = new Map<number, string>();
  const seedByRosterId = new Map<number, number>();

  // Roster player IDs (for AroundTheLeague client component)
  let allPlayerIds: string[] = [];
  // Position counts per team (for LeaguePulse roster construction)
  const positionCounts: Record<string, Record<string, number>> = {};

  const sp = (await (searchParams ?? Promise.resolve({}))) as Record<
    string,
    string | string[] | undefined
  >;
  const requestedWeekRaw = sp.week;
  const requestedWeekStr = Array.isArray(requestedWeekRaw)
    ? requestedWeekRaw[0]
    : requestedWeekRaw;
  const requestedWeekNum =
    typeof requestedWeekStr === 'string' ? Number(requestedWeekStr) : NaN;
  const hasUserOverride =
    Number.isFinite(requestedWeekNum) &&
    requestedWeekNum >= 1 &&
    requestedWeekNum <= MAX_REGULAR_WEEKS;

  try {
    const nflState = await getNFLState().catch(() => ({
      week: 1,
      display_week: 1,
      season_type: 'regular',
    }));
    seasonYear = String((nflState as { season?: string | number }).season ?? seasonYear);
    try {
      yearMap = await buildYearToLeagueMapUnique().catch(
        () => ({} as Record<string, string>)
      );
      leagueId = yearMap[seasonYear] || leagueId;
    } catch { /* use default */ }

    const nflSeasonYear = Number(seasonYear);
    recapYear = String(getRecapYear(nflSeasonYear));

    // Matchup data (only during regular season)
    if (isRegularSeason) {
      const nflStateTyped = nflState as { week?: number; display_week?: number };
      const rawWeek = Number(nflStateTyped.week ?? nflStateTyped.display_week ?? 1);
      const baseWeek = Number.isFinite(rawWeek) ? rawWeek : 1;
      const hasScores = (nflState as { season_has_scores?: boolean }).season_has_scores;
      let defaultWeek = hasScores === false ? 1 : baseWeek;
      const now = new Date();
      const dowET = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: 'America/New_York',
      }).format(now);
      if (dowET === 'Mon' || dowET === 'Tue') defaultWeek = Math.max(1, baseWeek - 1);
      defaultWeek = Math.min(Math.max(1, defaultWeek), MAX_REGULAR_WEEKS);
      selectedWeek = hasUserOverride ? (requestedWeekNum as number) : defaultWeek;

      const teams = await getTeamsData(leagueId).catch(
        () => [] as Array<{ rosterId: number; teamName: string; wins?: number; fpts?: number }>
      );
      const rosterIdToName = new Map<number, string>(
        teams.map((t) => [t.rosterId, t.teamName])
      );

      const matchups = await getLeagueMatchups(leagueId, selectedWeek);
      const hasAnyPoints = matchups.some(
        (m) => ((m as { custom_points?: number; points?: number }).custom_points ?? m.points ?? 0) > 0
      );
      let mus = matchups;
      if (!hasUserOverride) {
        if ((dowET === 'Mon' || dowET === 'Tue') && selectedWeek > defaultWeek && !hasAnyPoints && selectedWeek > 1) {
          const prev = await getLeagueMatchups(leagueId, selectedWeek - 1);
          if (prev.length > 0) { selectedWeek = selectedWeek - 1; mus = prev; }
        }
      }

      const groups = new Map<number, { roster_id: number; points: number; matchup_id: number }[]>();
      for (const m of mus) {
        const arr = groups.get(m.matchup_id) || [];
        arr.push({ roster_id: m.roster_id, points: m.custom_points ?? m.points ?? 0, matchup_id: m.matchup_id });
        groups.set(m.matchup_id, arr);
      }
      for (const arr of groups.values()) {
        if (arr.length >= 2) {
          const [a, b] = arr;
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

      // Seeds
      const sortedForSeeds = [...teams].sort(
        (a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.fpts ?? 0) - (a.fpts ?? 0)
      );
      sortedForSeeds.forEach((t, i) => seedByRosterId.set(t.rosterId, i + 1));
    }

    // Playoff bracket data
    if (isPostseason) {
      const [brackets, nameMap] = await Promise.all([
        getLeaguePlayoffBracketsWithScores(leagueId, { forceFresh: true }).catch(() => ({
          winners: [] as SleeperBracketGameWithScore[],
          losers: [] as SleeperBracketGameWithScore[],
        })),
        getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
      ]);
      winnersBracket = (brackets as { winners?: SleeperBracketGameWithScore[] }).winners || [];
      losersBracket = (brackets as { losers?: SleeperBracketGameWithScore[] }).losers || [];
      bracketNameMap = nameMap as Map<number, string>;
    }

    // Roster data (all phases — needed for AroundTheLeague and LeaguePulse)
    try {
      const [rosters, nameMap, playerMap] = await Promise.all([
        getLeagueRosters(leagueId).catch(() => []),
        getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
        // 12-hour cache — cheap after first load; gives us positions for LeaguePulse
        getAllPlayersCached(12 * 60 * 60 * 1000).catch(() => ({} as Record<string, { position?: string }>)),
      ]);
      const rIdToTeam = new Map<number, string>(nameMap);

      const playerIdSet = new Set<string>();
      for (const roster of rosters) {
        const teamName = rIdToTeam.get(roster.roster_id) || `Roster ${roster.roster_id}`;
        const counts: Record<string, number> = {};
        const allIds = [
          ...(roster.players || []),
          ...(roster.taxi || []),
          ...(roster.reserve || []),
        ];
        for (const pid of allIds) {
          playerIdSet.add(pid);
          const pos = (playerMap[pid] as { position?: string } | undefined)?.position;
          if (pos) counts[pos] = (counts[pos] ?? 0) + 1;
        }
        positionCounts[teamName] = counts;
      }
      allPlayerIds = Array.from(playerIdSet);
    } catch { /* leave allPlayerIds empty */ }
  } catch { /* fallback: use phase-only logic */ }

  // ── Season recap data (offseason phases) ─────────────────────────────────
  const recap: {
    podium?: { champion: string; runnerUp: string; thirdPlace: string };
    awards?: { mvp?: { name: string; points: number; teamName?: string }; roy?: { name: string; points: number; teamName?: string } };
    weeklyHighsTopTeams?: Array<{ teamName: string; rosterId?: number; count: number }>;
    regularSeasonWinner?: { teamName: string; rosterId: number; wins: number; fpts: number };
    pfLeader?: { teamName: string; rosterId: number; fpts: number };
    topWeeks3?: Array<{ teamName: string; rosterId: number; week: number; points: number; opponentTeamName: string; opponentRosterId: number }>;
    lastPlace?: { teamName: string; rosterId?: number };
    toiletBowlLoser?: { teamName: string; rosterId?: number };
    tenthPlaceWinner?: { teamName: string; rosterId?: number };
  } = {};
  let recapWinnersBracket: SleeperBracketGameWithScore[] = [];
  let recapLosersBracket: SleeperBracketGameWithScore[] = [];
  let recapBracketNameMap = new Map<number, string>();
  const seedByRosterIdRecap = new Map<number, number>();
  const showFullRecap = !isRegularSeasonOrLater;

  if (showFullRecap) {
    try {
      const recapLeagueId =
        yearMap[recapYear] ||
        LEAGUE_IDS.PREVIOUS[recapYear as keyof typeof LEAGUE_IDS.PREVIOUS];
      const leagueIdForRecap = recapLeagueId ?? leagueId;

      const [podiumDerived, awards, weeklyHighs, recapBrackets, recapNameMap] =
        await Promise.all([
          derivePodiumFromWinnersBracketByYear(recapYear).catch(() => null),
          getSeasonAwardsUsingLeagueScoring(recapYear, leagueIdForRecap, 14).catch(() => null),
          getWeeklyHighsBySeason(recapYear).catch(() => [] as WeeklyHighByWeekEntry[]),
          recapLeagueId
            ? getLeaguePlayoffBracketsWithScores(recapLeagueId, { forceFresh: true }).catch(
                () => ({
                  winners: [] as SleeperBracketGameWithScore[],
                  losers: [] as SleeperBracketGameWithScore[],
                })
              )
            : Promise.resolve({ winners: [] as SleeperBracketGameWithScore[], losers: [] as SleeperBracketGameWithScore[] }),
          recapLeagueId
            ? getRosterIdToTeamNameMap(recapLeagueId).catch(() => new Map<number, string>())
            : Promise.resolve(new Map<number, string>()),
        ]);

      recapWinnersBracket = recapBrackets?.winners || [];
      recapLosersBracket = recapBrackets?.losers || [];
      recapBracketNameMap = recapNameMap as Map<number, string>;

      if (recapLeagueId) {
        const teamsRecap = await getTeamsData(recapLeagueId).catch(() => []);
        const sortedRecap = [...teamsRecap].sort(
          (a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.fpts ?? 0) - (a.fpts ?? 0)
        );
        sortedRecap.forEach((t, i) => seedByRosterIdRecap.set(t.rosterId, i + 1));

        if (teamsRecap.length > 0) {
          const rw = sortedRecap[0];
          if (rw)
            recap.regularSeasonWinner = {
              teamName: rw.teamName,
              rosterId: rw.rosterId,
              wins: rw.wins ?? 0,
              fpts: rw.fpts ?? 0,
            };
          const pfTop = [...teamsRecap].sort((a, b) => (b.fpts ?? 0) - (a.fpts ?? 0))[0];
          if (pfTop)
            recap.pfLeader = { teamName: pfTop.teamName, rosterId: pfTop.rosterId, fpts: pfTop.fpts ?? 0 };
          const rsLast = sortedRecap[sortedRecap.length - 1];
          if (rsLast) recap.lastPlace = { teamName: rsLast.teamName, rosterId: rsLast.rosterId };
        }
      }

      const { CHAMPIONS } = await import('@/lib/constants/league');
      const base =
        (CHAMPIONS as Record<string, { champion?: string; runnerUp?: string; thirdPlace?: string }>)[recapYear] || {};
      recap.podium = {
        champion: (podiumDerived?.champion ?? base.champion ?? 'TBD') as string,
        runnerUp: (podiumDerived?.runnerUp ?? base.runnerUp ?? 'TBD') as string,
        thirdPlace: (podiumDerived?.thirdPlace ?? base.thirdPlace ?? 'TBD') as string,
      };

      if (awards) {
        recap.awards = {
          mvp: awards.mvp?.[0]
            ? { name: awards.mvp[0].name, points: awards.mvp[0].points, teamName: awards.mvp[0].teamName ?? undefined }
            : undefined,
          roy: awards.roy?.[0]
            ? { name: awards.roy[0].name, points: awards.roy[0].points, teamName: awards.roy[0].teamName ?? undefined }
            : undefined,
        };
      }

      const weeklyHighsRows = (weeklyHighs as WeeklyHighByWeekEntry[]) || [];
      if (weeklyHighsRows.length > 0) {
        const counts = new Map<string, number>();
        for (const row of weeklyHighsRows) {
          const key = row.teamName || 'Unknown Team';
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        const agg: Array<{ teamName: string; count: number; rosterId?: number }> = [];
        const invert = new Map<string, number>();
        recapBracketNameMap.forEach((nm, rid) => invert.set(nm, rid));
        for (const [tn, c] of counts.entries()) {
          agg.push({ teamName: tn, count: c, rosterId: invert.get(tn) });
        }
        agg.sort((a, b) => b.count - a.count || a.teamName.localeCompare(b.teamName));
        recap.weeklyHighsTopTeams = agg.slice(0, 3);

        const sortedWeeks = [...weeklyHighsRows].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
        recap.topWeeks3 = sortedWeeks.slice(0, 3).map((w) => ({
          teamName: w.teamName,
          rosterId: w.rosterId,
          week: w.week,
          points: w.points,
          opponentTeamName: w.opponentTeamName,
          opponentRosterId: w.opponentRosterId,
        }));
      }

      // Toilet Bowl / 10th place from losers bracket
      if (recapBrackets?.losers?.length > 0) {
        const lb = recapBrackets.losers as SleeperBracketGameWithScore[];
        const byRound: Record<number, SleeperBracketGameWithScore[]> = {};
        for (const g of lb) { const r = g.r ?? 0; (byRound[r] ||= []).push(g); }
        const rounds = Object.keys(byRound).map(Number);
        if (rounds.length > 0) {
          const maxRound = Math.max(...rounds);
          const avgSeed = (g: SleeperBracketGameWithScore) => {
            const s1 = g.t1 != null ? (seedByRosterIdRecap.get(g.t1) ?? 99) : 99;
            const s2 = g.t2 != null ? (seedByRosterIdRecap.get(g.t2) ?? 99) : 99;
            return (s1 + s2) / 2;
          };
          const last = (byRound[maxRound] || []).sort((a, b) => avgSeed(b) - avgSeed(a));
          const losersFinal = last[0];
          if (losersFinal) {
            let wRid: number | null = null;
            if (losersFinal.t1_points != null && losersFinal.t2_points != null) {
              wRid = losersFinal.t1_points > losersFinal.t2_points ? (losersFinal.t1 ?? null) : (losersFinal.t2 ?? null);
            } else { wRid = losersFinal.w ?? null; }
            const lRid = wRid != null ? (wRid === losersFinal.t1 ? (losersFinal.t2 ?? null) : (losersFinal.t1 ?? null)) : null;
            if (lRid != null) {
              const nm = recapNameMap as Map<number, string>;
              recap.toiletBowlLoser = { teamName: nm.get(lRid) || `Roster ${lRid}`, rosterId: lRid || undefined };
            }
          }
          // 10th place
          let rid9: number | null = null, rid10: number | null = null;
          for (const [rid, seed] of seedByRosterIdRecap.entries()) {
            if (seed === 9) rid9 = rid;
            if (seed === 10) rid10 = rid;
          }
          const tenthGame = lb.find(
            (g) => (g.t1 === rid9 && g.t2 === rid10) || (g.t1 === rid10 && g.t2 === rid9)
          );
          if (tenthGame) {
            let wRid: number | null = null;
            if (tenthGame.t1_points != null && tenthGame.t2_points != null) {
              wRid = tenthGame.t1_points > tenthGame.t2_points ? (tenthGame.t1 ?? null) : (tenthGame.t2 ?? null);
            } else { wRid = tenthGame.w ?? null; }
            if (wRid != null) {
              const nm = recapNameMap as Map<number, string>;
              recap.tenthPlaceWinner = { teamName: nm.get(wRid) || `Roster ${wRid}`, rosterId: wRid || undefined };
            }
          }
        }
      }
    } catch { /* show empty recap */ }
  }

  // ── Taxi flags ─────────────────────────────────────────────────────────────
  let taxiFlags: {
    generatedAt: string;
    lastRunAt?: string;
    runType?: string;
    season?: number;
    week?: number;
    actual: Array<{ team: string; type: string; message: string }>;
    potential: Array<{ team: string; type: string; message: string }>;
  } = { generatedAt: '', actual: [], potential: [] };
  try {
    const rf = await fetch('/api/taxi/flags', { next: { revalidate: 60 } });
    if (rf.ok) {
      const j = await rf.json().catch(() => null) as null | {
        generatedAt?: string; lastRunAt?: string; runType?: string;
        season?: number; week?: number;
        actual?: Array<{ team: string; type: string; message: string }>;
        potential?: Array<{ team: string; type: string; message: string }>;
      };
      if (j) {
        taxiFlags = {
          generatedAt: j.generatedAt || new Date().toISOString(),
          lastRunAt: j.lastRunAt, runType: j.runType, season: j.season, week: j.week,
          actual: Array.isArray(j.actual) ? j.actual : [],
          potential: Array.isArray(j.potential) ? j.potential : [],
        };
      }
    }
  } catch { /* leave empty */ }

  // ── Historical H2H data (for HistoricalSpotlight) ─────────────────────────
  let h2h: Awaited<ReturnType<typeof getHeadToHeadAllTime>> = { teams: [], matrix: {}, neverBeaten: [] };
  try {
    h2h = await getHeadToHeadAllTime();
  } catch { /* empty */ }

  // ── Trade block summary data (for LeaguePulse – server-side load) ─────────
  let tradeRows: import('@/components/trades/TradeBlockTab').TeamRow[] = [];
  try {
    const { TEAM_NAMES } = await import('@/lib/constants/league');
    const { getUserIdForTeam } = await import('@/lib/server/user-identity');
    const { readUserDoc } = await import('@/lib/server/user-store');
    tradeRows = await Promise.all(
      TEAM_NAMES.map(async (team) => {
        try {
          const userId = getUserIdForTeam(team);
          const doc = await readUserDoc(userId, team);
          return {
            team,
            tradeBlock: Array.isArray(doc.tradeBlock) ? doc.tradeBlock : [],
            tradeWants: doc.tradeWants ?? null,
            updatedAt: doc.updatedAt || null,
          };
        } catch {
          return { team, tradeBlock: [], tradeWants: null, updatedAt: null };
        }
      })
    );
  } catch { /* leave empty */ }


  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="home-page relative overflow-hidden">
      {/* Background treatment */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 home-aurora-motion"
        style={{
          background: `
            radial-gradient(1400px 760px at 7% -15%, rgba(37,99,235,0.38) 0%, rgba(37,99,235,0) 62%),
            radial-gradient(1200px 680px at 93% -8%, rgba(56,189,248,0.28) 0%, rgba(56,189,248,0) 64%),
            radial-gradient(1400px 980px at 50% 115%, rgba(99,102,241,0.24) 0%, rgba(99,102,241,0) 70%),
            linear-gradient(180deg, rgba(10,18,40,0.18) 0%, rgba(8,14,30,0.12) 45%, rgba(6,10,24,0.16) 100%)
          `,
          filter: 'saturate(125%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.14]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.26) 1px, transparent 1px)',
          backgroundSize: '100% 4px',
        }}
      />

      <div className="container mx-auto px-4 sm:px-5 py-6 sm:py-8 relative z-10">

        {/* ── 1. Key dates (always first) ────────────────────────────────── */}
        <HomepageCountdowns />

        {/* ── 2. Taxi banner (always second) ─────────────────────────────── */}
        <TaxiBanner initial={taxiFlags} />

        {/* ── Phase-specific content ──────────────────────────────────────── */}

        {/* Phase 1: post-championship pre-draft — recap is primary */}
        {phase === 'post_championship_pre_draft' && (
          <>
            <section className="mb-10 sm:mb-12">
              <SectionHeader title={`Season recap (${recapYear})`} />
              <SeasonRecapGrid recap={recap} rosterNameMap={recapBracketNameMap} />
              <div className="mt-8 space-y-8">
                <PlayoffBracketPanel
                  title="Official Playoffs"
                  games={recapWinnersBracket}
                  variant="winners"
                  nameMap={recapBracketNameMap}
                  seedMap={seedByRosterIdRecap}
                  keyPrefix="recap-winners"
                  emptyMessage="No games."
                />
                <PlayoffBracketPanel
                  title="Toilet Bowl"
                  games={recapLosersBracket}
                  variant="losers"
                  nameMap={recapBracketNameMap}
                  seedMap={seedByRosterIdRecap}
                  keyPrefix="recap-losers"
                  emptyMessage="No games."
                />
              </div>
            </section>

            <LeaguePulse tradeRows={tradeRows} positionCounts={positionCounts} />
            <AroundTheLeague playerIds={allPlayerIds} />
            <HistoricalSpotlight h2h={h2h} />
            <CompactDraftLink />
          </>
        )}

        {/* Phase 2: post-draft, pre-FA bidding */}
        {phase === 'post_draft_pre_fa' && (
          <>
            <LeaguePulse tradeRows={tradeRows} positionCounts={positionCounts} />
            <AroundTheLeague playerIds={allPlayerIds} />
            <CompactSeasonRecap recap={recap} year={recapYear} />
            <CompactDraftLink />
          </>
        )}

        {/* Phase 3: FA bidding open, pre-season */}
        {phase === 'fa_open_pre_season' && (
          <>
            <LeaguePulse tradeRows={tradeRows} positionCounts={positionCounts} />
            <AroundTheLeague playerIds={allPlayerIds} />
            <CompactSeasonRecap recap={recap} year={recapYear} />
          </>
        )}

        {/* Phase 4: regular season (including post-deadline) */}
        {(phase === 'regular_season' || phase === 'post_deadline_pre_postseason') && (
          <>
            {/* This Week matchups */}
            <section className="mb-10 sm:mb-12">
              <SectionHeader title={`Week ${selectedWeek} matchups`} />
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

            <LeaguePulse tradeRows={tradeRows} positionCounts={positionCounts} />
            <AroundTheLeague playerIds={allPlayerIds} />
          </>
        )}

        {/* Phase 6: postseason */}
        {phase === 'postseason' && (
          <>
            <section className="mb-10 sm:mb-12">
              <SectionHeader title="Playoff brackets" />
              <div className="space-y-8 mt-6">
                <PlayoffBracketPanel
                  title="Official Playoffs"
                  games={winnersBracket}
                  variant="winners"
                  nameMap={bracketNameMap}
                  seedMap={seedByRosterId}
                  keyPrefix="home-winners"
                  emptyMessage="No games yet."
                />
                <PlayoffBracketPanel
                  title="Toilet Bowl"
                  games={losersBracket}
                  variant="losers"
                  nameMap={bracketNameMap}
                  seedMap={seedByRosterId}
                  keyPrefix="home-losers"
                  emptyMessage="No games yet."
                />
              </div>
            </section>

            <LeaguePulse tradeRows={tradeRows} positionCounts={positionCounts} />
            <AroundTheLeague playerIds={allPlayerIds} />
          </>
        )}

        {/* Historical Spotlight for phases 2 & 3 (phase 1 already renders it above) */}
        {(phase === 'post_draft_pre_fa' || phase === 'fa_open_pre_season') && (
          <HistoricalSpotlight h2h={h2h} />
        )}

      </div>
    </div>
  );
}

/** Small compact link to Draft Central — shown in offseason phases. */
function CompactDraftLink() {
  return (
    <section className="mb-10 sm:mb-12">
      <BroadcastPanel accent="#6366f1" title="Draft Central">
        <p className="text-sm mb-3" style={{ color: 'rgba(233,237,245,0.7)' }}>
          Full draft order, pick ownership, prospect boards, scouting reports,
          and draft-trip details are all in Draft Central.
        </p>
        <Link
          href="/draft"
          className="inline-block rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          style={{ background: '#6366f1', color: '#fff' }}
        >
          Open Draft Central →
        </Link>
      </BroadcastPanel>
    </section>
  );
}
