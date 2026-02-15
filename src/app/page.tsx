import Image from 'next/image';
import Link from 'next/link';
import CountdownTimer from '@/components/ui/countdown-timer';
import MatchupCard from '@/components/ui/matchup-card';
import { IMPORTANT_DATES, LEAGUE_IDS, CHAMPIONS } from '@/lib/constants/league';
import { getLeagueMatchups, getTeamsData, getNFLState, derivePodiumFromWinnersBracketByYear, getSeasonAwardsUsingLeagueScoring, getWeeklyHighsBySeason, getLeaguePlayoffBracketsWithScores, getRosterIdToTeamNameMap, buildYearToLeagueMapUnique, type SleeperBracketGameWithScore, type WeeklyHighByWeekEntry } from '@/lib/utils/sleeper-api';
import { getCurrentPhase, hasRegularSeasonStarted, getRecapYear } from '@/lib/utils/phase-resolver';
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

function hexToRgba(hex: string, alpha = 1): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const dynamic = 'force-dynamic';
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
  let recapYear = seasonYear;
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
    // Use phase resolver to determine recap year
    const nflSeasonYear = Number(seasonYear);
    recapYear = String(getRecapYear(nflSeasonYear));
    const week1Ts = new Date(IMPORTANT_DATES.NFL_WEEK_1_START).getTime();
    const playoffsStartTs = new Date(IMPORTANT_DATES.PLAYOFFS_START).getTime();
    const now = new Date();
    const nowTs = now.getTime();
    const beforeWeek1 = Number.isFinite(week1Ts) && nowTs < week1Ts;
    const afterPlayoffsStart = Number.isFinite(playoffsStartTs) && nowTs >= playoffsStartTs;
    // Playoffs are active based on NFL season state and PLAYOFFS_START.
    // Super Bowl date does not affect playoffs/offseason gating; recap flip is driven by championship completion below.
    isPlayoffs = (seasonTypeStr === 'post' || afterPlayoffsStart);
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
        // If winners bracket final is decided, consider playoffs complete -> show offseason recap
        try {
          const byRound: Record<number, SleeperBracketGameWithScore[]> = {};
          for (const g of winnersBracket) {
            const r = (g as { r?: number }).r ?? 0;
            (byRound[r] ||= []).push(g);
          }
          const rounds = Object.keys(byRound).map((n) => Number(n));
          if (rounds.length > 0) {
            const maxR = Math.max(...rounds);
            const lastRound = byRound[maxR] || [];
            const final = lastRound.find((g) => (g as unknown as { w?: number | null }).w != null);
            const finalHasScores = lastRound.some((g) => (g as { t1_points?: number | null }).t1_points != null || (g as { t2_points?: number | null }).t2_points != null);
            if (final || finalHasScores) {
              isPlayoffs = false;
            }
          }
        } catch {}
        // Fallback: derive champion directly; if present, flip to offseason
        if (isPlayoffs) {
          try {
            const pod = await derivePodiumFromWinnersBracketByYear(recapYear).catch(() => null);
            if (pod && pod.champion && pod.champion !== 'TBD') {
              isPlayoffs = false;
            }
          } catch {}
        }
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
        // Detect championship completion again after fresh fetch
        try {
          const byRound2: Record<number, SleeperBracketGameWithScore[]> = {};
          for (const g of winnersBracket) {
            const r = (g as { r?: number }).r ?? 0;
            (byRound2[r] ||= []).push(g);
          }
          const rounds2 = Object.keys(byRound2).map((n) => Number(n));
          if (rounds2.length > 0) {
            const maxR2 = Math.max(...rounds2);
            const lastRound2 = byRound2[maxR2] || [];
            const final2 = lastRound2.find((g) => (g as unknown as { w?: number | null }).w != null);
            const final2HasScores = lastRound2.some((g) => (g as { t1_points?: number | null }).t1_points != null || (g as { t2_points?: number | null }).t2_points != null);
            if (final2 || final2HasScores) {
              isPlayoffs = false;
            }
          }
        } catch {}
        if (isPlayoffs) {
          try {
            const pod2 = await derivePodiumFromWinnersBracketByYear(recapYear).catch(() => null);
            const fallbackYear = String(Number(recapYear) - 1);
            const pod2b = pod2 ?? await derivePodiumFromWinnersBracketByYear(fallbackYear).catch(() => null);
            if (pod2b && pod2b.champion && pod2b.champion !== 'TBD') {
              isPlayoffs = false;
            }
          } catch {}
        }
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
    weeklyHighsTopTeams?: Array<{ teamName: string; rosterId?: number; count: number }>;
    lastPlace?: { teamName: string; rosterId?: number };
    tenthPlaceWinner?: { teamName: string; rosterId?: number };
    regularSeasonWinner?: { teamName: string; rosterId: number; wins: number; fpts: number };
    pfLeader?: { teamName: string; rosterId: number; fpts: number };
    topWeek?: { teamName: string; rosterId: number; week: number; points: number; opponentTeamName: string; opponentRosterId: number };
    topWeeks3?: Array<{ teamName: string; rosterId: number; week: number; points: number; opponentTeamName: string; opponentRosterId: number }>;
  } = {};
  if (!isRegularSeason && !isPlayoffs) {
    try {
      const leagueIdRecap = yearMap[recapYear] || LEAGUE_IDS.PREVIOUS[recapYear as keyof typeof LEAGUE_IDS.PREVIOUS];
      const [podiumDerived, awards, weeklyHighs, recapBrackets, recapNameMap] = await Promise.all([
        derivePodiumFromWinnersBracketByYear(recapYear).catch(() => null),
        getSeasonAwardsUsingLeagueScoring(recapYear, leagueIdRecap ?? leagueId, 14).catch(() => null),
        getWeeklyHighsBySeason(recapYear).catch(() => [] as WeeklyHighByWeekEntry[]),
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
      const base = (CHAMPIONS as Record<string, { champion?: string; runnerUp?: string; thirdPlace?: string }>)[recapYear] || {};
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
        // Top 3 teams by weekly-high wins
        const agg: Array<{ teamName: string; count: number; rosterId?: number }> = [];
        const invert = new Map<string, number>();
        recapBracketNameMap.forEach((nm, rid) => invert.set(nm, rid));
        for (const [tn, c] of counts.entries()) {
          agg.push({ teamName: tn, count: c, rosterId: invert.get(tn) });
        }
        agg.sort((a,b) => b.count - a.count || a.teamName.localeCompare(b.teamName));
        recap.weeklyHighsTopTeams = agg.slice(0, 3);
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
        const sortedWeeks = [...weeklyHighsRows].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
        const top = sortedWeeks[0];
        if (top) recap.topWeek = { teamName: top.teamName, rosterId: top.rosterId, week: top.week, points: top.points, opponentTeamName: top.opponentTeamName, opponentRosterId: top.opponentRosterId };
        recap.topWeeks3 = sortedWeeks.slice(0, 3).map((w) => ({ teamName: w.teamName, rosterId: w.rosterId, week: w.week, points: w.points, opponentTeamName: w.opponentTeamName, opponentRosterId: w.opponentRosterId }));
      }
      // Derive Last Place (losers final loser) and 10th Place Winner (classification game winner) from losers bracket
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
          // Choose the losers final as the game with the highest average seed (worst teams)
          const avgSeed = (g: SleeperBracketGameWithScore) => {
            const s1 = g.t1 != null ? (seedByRosterIdRecap.get(g.t1) ?? 99) : 99;
            const s2 = g.t2 != null ? (seedByRosterIdRecap.get(g.t2) ?? 99) : 99;
            return (s1 + s2) / 2;
          };
          const sortedLast = [...last].sort((a,b) => avgSeed(b) - avgSeed(a));
          const losersFinal = sortedLast[0];
          if (losersFinal) {
            let wRid: number | null = null;
            if (losersFinal.t1_points != null && losersFinal.t2_points != null) {
              if (losersFinal.t1_points > losersFinal.t2_points) wRid = losersFinal.t1 ?? null;
              else if (losersFinal.t2_points > losersFinal.t1_points) wRid = losersFinal.t2 ?? null;
              else wRid = (losersFinal.w ?? (losersFinal.t1 ?? null));
            } else {
              wRid = losersFinal.w ?? null;
            }
            const lRid = (wRid != null) ? ((wRid === losersFinal.t1) ? (losersFinal.t2 ?? null) : (losersFinal.t1 ?? null)) : null;
            if (lRid != null) {
              const nmMap = recapNameMap as Map<number, string>;
              recap.lastPlace = { teamName: nmMap.get(lRid) || `Roster ${lRid}`, rosterId: lRid || undefined };
            }
          }
          // Tenth place game winner: directly locate the game between rosterIds seeded #9 and #10
          let rid9: number | null = null;
          let rid10: number | null = null;
          for (const [rid, seed] of seedByRosterIdRecap.entries()) {
            if (seed === 9) rid9 = rid;
            if (seed === 10) rid10 = rid;
          }
          const involves910 = (g: SleeperBracketGameWithScore) => {
            if (rid9 == null || rid10 == null) return false;
            const a = g.t1 ?? null;
            const b = g.t2 ?? null;
            return (a === rid9 && b === rid10) || (a === rid10 && b === rid9);
          };
          // Prefer the latest round where 9 plays 10; if none found, fall back to seed-based check; if still none, pick lowest average seed game
          const direct910 = lb.filter(involves910);
          const matchIs910BySeed = (g: SleeperBracketGameWithScore) => {
            const s1 = g.t1 != null ? (seedByRosterIdRecap.get(g.t1) ?? null) : null;
            const s2 = g.t2 != null ? (seedByRosterIdRecap.get(g.t2) ?? null) : null;
            const set = new Set([s1, s2]);
            return set.has(9) && set.has(10) && set.size === 2;
          };
          const all910BySeed = direct910.length === 0 ? lb.filter(matchIs910BySeed) : [];
          const tenthGame = direct910.length > 0
            ? [...direct910].sort((a, b) => (b.r ?? 0) - (a.r ?? 0) || (b.m ?? 0) - (a.m ?? 0))[0]
            : (all910BySeed.length > 0
                ? [...all910BySeed].sort((a, b) => (b.r ?? 0) - (a.r ?? 0) || (b.m ?? 0) - (a.m ?? 0))[0]
                : ([...lb].sort((a, b) => avgSeed(a) - avgSeed(b))[0] || null));
          if (tenthGame) {
            let wRid: number | null = null;
            if (tenthGame.t1_points != null && tenthGame.t2_points != null) {
              if (tenthGame.t1_points > tenthGame.t2_points) wRid = tenthGame.t1 ?? null;
              else if (tenthGame.t2_points > tenthGame.t1_points) wRid = tenthGame.t2 ?? null;
              else wRid = (tenthGame.w ?? (tenthGame.t1 ?? null));
            } else {
              wRid = tenthGame.w ?? null;
            }
            if (wRid != null) {
              const nmMap = recapNameMap as Map<number, string>;
              recap.tenthPlaceWinner = { teamName: nmMap.get(wRid) || `Roster ${wRid}`, rosterId: wRid || undefined };
            }
          }
        }
      }
    } catch {}
  }
  // Offseason primary countdown selection based on phase
  const phase = getCurrentPhase();
  const seasonStarted = hasRegularSeasonStarted();
  let offPrimaryDate = IMPORTANT_DATES.NFL_WEEK_1_START;
  let offPrimaryTitle = 'Season starts in';
  
  if (phase === 'post_championship_pre_draft') {
    // During post-championship pre-draft, show season countdown
    offPrimaryDate = IMPORTANT_DATES.NFL_WEEK_1_START;
    offPrimaryTitle = 'Season starts in';
  } else if (phase === 'post_draft_pre_season') {
    offPrimaryDate = IMPORTANT_DATES.NFL_WEEK_1_START;
    offPrimaryTitle = seasonStarted ? 'Season in progress' : 'Season starts in';
  }
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
            <div className="flex flex-col gap-6 mt-6">
              {[{ id: 'winners', title: 'Winners Bracket', data: winnersBracket }, { id: 'losers', title: 'Losers Bracket', data: losersBracket }].map((b) => (
                <Card key={b.id} className="w-full">
                  <CardContent>
                    <h3 className="text-lg font-semibold mb-3">{b.title}</h3>
                    {b.data.length === 0 ? (
                      <p className="text-[var(--muted)]">No games yet.</p>
                    ) : (
                      (() => {
                        const byRound: Record<number, SleeperBracketGameWithScore[]> = {};
                        b.data.forEach((g) => {
                          const r = g.r ?? 0;
                          if (!byRound[r]) byRound[r] = [];
                          byRound[r].push(g);
                        });
                        const roundNums = Object.keys(byRound).map(n => Number(n)).sort((a,b) => a - b);
                        roundNums.forEach(r => byRound[r].sort((a,b) => (a.m ?? 0) - (b.m ?? 0)));

                        const nameFor = (rid?: number | null) => {
                          if (rid == null) return 'BYE';
                          return bracketNameMap.get(rid) || `Roster ${rid}`;
                        };
                        const TeamRow = ({ rid, isWinner, score }: { rid?: number | null; isWinner: boolean; score?: number | null }) => {
                          const nm = rid != null ? nameFor(rid) : 'BYE';
                          const seed = rid != null ? (seedByRosterId.get(rid) ?? null) : null;
                          const color = nm && nm !== 'BYE' ? getTeamColors(nm)?.primary : undefined;
                          return (
                            <div className={`flex items-center justify-between gap-2 ${isWinner ? 'font-semibold text-[var(--accent)]' : ''}`}>
                              <div className="min-w-0 flex-1 flex items-center gap-2">
                                {nm !== 'BYE' && rid != null ? (
                                  <Link href={`/teams/${rid}`} className="flex items-center gap-2 min-w-0 hover:underline" title={nm}>
                                    <div className="w-5 h-5 rounded-full overflow-hidden border" style={{ borderColor: color || 'var(--border)' }}>
                                      <Image src={getTeamLogoPath(nm)} alt={nm} width={20} height={20} className="object-contain w-5 h-5" />
                                    </div>
                                    <span className="truncate">{seed ? `#${seed} ` : ''}{nm}</span>
                                  </Link>
                                ) : (
                                  <span className="block truncate text-[var(--muted)]" title="BYE">BYE</span>
                                )}
                              </div>
                              {score != null && (
                                <span className="shrink-0 ml-2 text-xs px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--muted)]">{score.toFixed(2)}</span>
                              )}
                            </div>
                          );
                        };
                        const maxRound = roundNums.length ? roundNums[roundNums.length - 1] : 0;
                        // Determine proper Championship and 3rd Place labeling only for winners bracket
                        const semiWinners: Array<number> = [];
                        const semiLosers: Array<number> = [];
                        if ((b.id === 'winners') && roundNums.length >= 2) {
                          const semiRound = roundNums[roundNums.length - 2];
                          const semis = byRound[semiRound] || [];
                          for (const s of semis) {
                            const w = s.w ?? ((s.t1_points != null && s.t2_points != null) ? ((s.t1_points > s.t2_points) ? s.t1 : s.t2) : null);
                            const l = w != null ? ((w === s.t1) ? s.t2 : s.t1) : null;
                            if (w != null) semiWinners.push(w);
                            if (l != null) semiLosers.push(l);
                          }
                        }
                        const isPair = (pair: [number | null | undefined, number | null | undefined], set: Set<number>) => {
                          const [a,b] = pair;
                          if (a == null || b == null) return false;
                          return set.has(a) && set.has(b) && set.size === 2;
                        };
                        const winnersSet = semiWinners.length === 2 ? new Set<number>(semiWinners) : null;
                        const losersSet = semiLosers.length === 2 ? new Set<number>(semiLosers) : null;
                        const labelFor = (g: SleeperBracketGameWithScore, rNum: number): string | undefined => {
                          if (rNum !== maxRound) return undefined;
                          if (b.id === 'losers') return 'Final';
                          if (winnersSet && isPair([g.t1 ?? null, g.t2 ?? null], winnersSet)) return 'Championship';
                          if (losersSet && isPair([g.t1 ?? null, g.t2 ?? null], losersSet)) return '3rd Place';
                          return undefined; // Other placement games (5th/7th) remain unlabeled
                        };
                        const MATCH_H = 84; // px
                        const GAP = 24; // px
                        const roundTitle = (r: number) => {
                          if (r === maxRound) return 'Finals';
                          if (r === maxRound - 1) return 'Semifinals';
                          return `Round ${r}`;
                        };
                        return (
                          <div className="overflow-x-auto">
                            <div className="flex items-start gap-8">
                              {roundNums.map((r, rIdx) => {
                                const mtFirst = rIdx === 0 ? 0 : ((MATCH_H + GAP) * Math.pow(2, rIdx - 1)) / 2;
                                const mtBetween = rIdx === 0 ? GAP : ((MATCH_H + GAP) * Math.pow(2, rIdx - 1));
                                const matches = byRound[r];
                                const n = matches.length;
                                const colHeight = mtFirst + n * MATCH_H + Math.max(0, n - 1) * mtBetween;
                                // Round column element (header outside measured height)
                                const roundCol = (
                                  <div key={`${b.id}-round-${r}`} className="min-w-[260px]">
                                    <h4 className="font-semibold text-[var(--muted)] mb-2">{roundTitle(r)}</h4>
                                    <div style={{ height: colHeight }}>
                                      {matches.map((g, idx) => (
                                        <div key={`${b.id}-${r}-${g.m}`} style={{ marginTop: idx === 0 ? mtFirst : mtBetween }}>
                                          <div className="border rounded p-3 h-[84px] relative flex flex-col justify-between overflow-hidden">
                                            {(() => { const ml = labelFor(g, r); return ml ? <div className="absolute top-1 left-2 text-[10px] px-1.5 py-0.5 rounded border bg-[var(--surface)] text-[var(--muted)]">{ml}</div> : null; })()}
                                            <TeamRow rid={g.t1 ?? null} isWinner={g.w != null && g.t1 != null && g.w === g.t1} score={g.t1_points ?? null} />
                                            <TeamRow rid={g.t2 ?? null} isWinner={g.w != null && g.t2 != null && g.w === g.t2} score={g.t2_points ?? null} />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                                // Connector column (between this round and next)
                                const connCol = (rIdx < roundNums.length - 1) ? (
                                  <div key={`${b.id}-conn-${r}`} className="relative w-16" style={{ height: colHeight }}>
                                    {Array.from({ length: Math.floor(n / 2) }, (_, k) => {
                                      const i1 = 2 * k;
                                      const i2 = i1 + 1;
                                      const y1 = mtFirst + i1 * (MATCH_H + GAP) + MATCH_H / 2;
                                      const y2 = mtFirst + i2 * (MATCH_H + GAP) + MATCH_H / 2;
                                      const mid = (y1 + y2) / 2;
                                      return (
                                        <div key={`${b.id}-connseg-${r}-${k}`}>
                                          <div style={{ position: 'absolute', left: '50%', top: `${y1}px`, height: `${y2 - y1}px`, width: 2, transform: 'translateX(-50%)', background: 'var(--border)' }} />
                                          <div style={{ position: 'absolute', top: `${mid}px`, left: 0, right: '50%', height: 2, transform: 'translateY(-50%)', background: 'var(--border)' }} />
                                          <div style={{ position: 'absolute', top: `${mid}px`, left: '50%', right: 0, height: 2, transform: 'translateY(-50%)', background: 'var(--border)' }} />
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : null;
                                return [roundCol, connCol];
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
            <SectionHeader title={`Season recap (${recapYear})`} />
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
                      {(() => {
                        const row = recap.awards?.mvp;
                        if (!row) return <div className="text-[var(--muted)]">MVP: TBD</div>;
                        const t = row.teamName;
                        const colors = t ? getTeamColors(t) : { primary: 'var(--border)', secondary: 'var(--border)' };
                        const bg = t ? hexToRgba(colors.secondary || colors.primary, 0.08) : 'transparent';
                        const invert = new Map<string, number>();
                        recapBracketNameMap.forEach((nm, rid) => invert.set(nm, rid));
                        const rid = t ? invert.get(t) : undefined;
                        return (
                          <div className="flex items-center justify-between gap-3 p-2 rounded-md border" style={{ borderColor: colors.primary, backgroundColor: bg }}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium shrink-0">MVP:</span>
                              {t && (
                                <div className="w-6 h-6 rounded-full evw-surface border overflow-hidden flex items-center justify-center shrink-0" style={{ borderColor: colors.primary }}>
                                  <Image src={getTeamLogoPath(t)} alt={t} width={20} height={20} className="object-contain" />
                                </div>
                              )}
                              <span className="truncate">{row.name} ({row.points.toFixed(2)} pts)</span>
                              {t && (
                                rid ? (
                                  <Link href={`/teams/${rid}`} className="text-xs text-[var(--muted)] hover:underline">{t}</Link>
                                ) : (
                                  <span className="text-xs text-[var(--muted)]">{t}</span>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </li>
                    <li>
                      {(() => {
                        const row = recap.awards?.roy;
                        if (!row) return <div className="text-[var(--muted)]">Rookie of the Year: TBD</div>;
                        const t = row.teamName;
                        const colors = t ? getTeamColors(t) : { primary: 'var(--border)', secondary: 'var(--border)' };
                        const bg = t ? hexToRgba(colors.secondary || colors.primary, 0.08) : 'transparent';
                        const invert = new Map<string, number>();
                        recapBracketNameMap.forEach((nm, rid) => invert.set(nm, rid));
                        const rid = t ? invert.get(t) : undefined;
                        return (
                          <div className="flex items-center justify-between gap-3 p-2 rounded-md border" style={{ borderColor: colors.primary, backgroundColor: bg }}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium shrink-0">Rookie of the Year:</span>
                              {t && (
                                <div className="w-6 h-6 rounded-full evw-surface border overflow-hidden flex items-center justify-center shrink-0" style={{ borderColor: colors.primary }}>
                                  <Image src={getTeamLogoPath(t)} alt={t} width={20} height={20} className="object-contain" />
                                </div>
                              )}
                              <span className="truncate">{row.name} ({row.points.toFixed(2)} pts)</span>
                              {t && (
                                rid ? (
                                  <Link href={`/teams/${rid}`} className="text-xs text-[var(--muted)] hover:underline">{t}</Link>
                                ) : (
                                  <span className="text-xs text-[var(--muted)]">{t}</span>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <h3 className="text-lg font-semibold mb-2">Most weekly-high wins (Top 3)</h3>
                  {recap.weeklyHighsTopTeams && recap.weeklyHighsTopTeams.length > 0 ? (
                    <div className="space-y-2">
                      {recap.weeklyHighsTopTeams.map((row, idx) => {
                        const colors = getTeamColors(row.teamName);
                        const bg = hexToRgba(colors.secondary || colors.primary, 0.08);
                        const borderColor = colors.primary;
                        const content = (
                          <div className="flex items-center justify-between gap-3 p-2 rounded-md border" style={{ borderColor, backgroundColor: bg }}>
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-full evw-surface border overflow-hidden flex items-center justify-center shrink-0" style={{ borderColor }}>
                                <Image src={getTeamLogoPath(row.teamName)} alt={row.teamName} width={24} height={24} className="object-contain" />
                              </div>
                              <div className="truncate">
                                <div className="text-sm font-semibold truncate">#{idx + 1} {row.teamName}</div>
                              </div>
                            </div>
                            <span className="text-sm text-[var(--muted)]">{row.count}</span>
                          </div>
                        );
                        return row.rosterId ? (
                          <Link key={row.teamName} href={`/teams/${row.rosterId}`} className="block hover:underline">
                            {content}
                          </Link>
                        ) : (
                          <div key={row.teamName}>{content}</div>
                        );
                      })}
                    </div>
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
              {recap.topWeeks3 && recap.topWeeks3.length > 0 && (
                <Card>
                  <CardContent>
                    <h3 className="text-lg font-semibold mb-2">Top weekly scores</h3>
                    <div className="space-y-2">
                      {recap.topWeeks3.map((w, i) => {
                        const colors = getTeamColors(w.teamName);
                        const bg = hexToRgba(colors.secondary || colors.primary, 0.08);
                        const borderColor = colors.primary;
                        return (
                          <div key={`${w.week}-${w.rosterId}-${i}`} className="flex items-center justify-between gap-3 p-2 rounded-md border" style={{ borderColor, backgroundColor: bg }}>
                            <Link href={`/teams/${w.rosterId}`} className="flex items-center gap-3 hover:underline min-w-0">
                              <div className="w-7 h-7 rounded-full evw-surface border overflow-hidden flex items-center justify-center shrink-0" style={{ borderColor }}>
                                <Image src={getTeamLogoPath(w.teamName)} alt={w.teamName} width={24} height={24} className="object-contain" />
                              </div>
                              <span className="font-semibold truncate">#{i + 1} {w.teamName}</span>
                              <span className="text-xs text-[var(--muted)]">Week {w.week}</span>
                            </Link>
                            <div className="text-right">
                              <div className="text-lg font-bold text-[var(--accent)]">{w.points.toFixed(2)}</div>
                              <Link href={`/teams/${w.opponentRosterId}`} className="text-xs text-[var(--muted)] hover:underline">vs {w.opponentTeamName}</Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
              {recap.lastPlace && (
                <Card>
                  <CardContent>
                    <h3 className="text-lg font-semibold mb-2">Last Place</h3>
                    {(() => {
                      const name = recap.lastPlace?.teamName;
                      if (!name) return <p className="text-[var(--muted)]">TBD</p>;
                      const color = getTeamColors(name)?.primary;
                      const bg = hexToRgba(getTeamColors(name)?.secondary || color, 0.08);
                      const content = (
                        <div className="flex items-center gap-3 p-2 rounded-md border" style={{ borderColor: color || 'var(--border)', backgroundColor: bg }}>
                          <div className="w-8 h-8 rounded-full overflow-hidden border" style={{ borderColor: color || 'var(--border)' }}>
                            <Image src={getTeamLogoPath(name)} alt={name} width={32} height={32} className="object-contain w-8 h-8" />
                          </div>
                          <div className="font-semibold truncate">{name}</div>
                        </div>
                      );
                      return recap.lastPlace?.rosterId ? (
                        <Link href={`/teams/${recap.lastPlace.rosterId}`} className="block hover:underline">{content}</Link>
                      ) : content;
                    })()}
                  </CardContent>
                </Card>
              )}
              {recap.tenthPlaceWinner && (
                <Card>
                  <CardContent>
                    <h3 className="text-lg font-semibold mb-2">10th place (winner)</h3>
                    {(() => {
                      const name = recap.tenthPlaceWinner?.teamName;
                      if (!name) return <p className="text-[var(--muted)]">TBD</p>;
                      const color = getTeamColors(name)?.primary;
                      const bg = hexToRgba(getTeamColors(name)?.secondary || color, 0.08);
                      const content = (
                        <div className="flex items-center gap-3 p-2 rounded-md border" style={{ borderColor: color || 'var(--border)', backgroundColor: bg }}>
                          <div className="w-8 h-8 rounded-full overflow-hidden border" style={{ borderColor: color || 'var(--border)' }}>
                            <Image src={getTeamLogoPath(name)} alt={name} width={32} height={32} className="object-contain w-8 h-8" />
                          </div>
                          <div className="font-semibold truncate">{name}</div>
                        </div>
                      );
                      return recap.tenthPlaceWinner?.rosterId ? (
                        <Link href={`/teams/${recap.tenthPlaceWinner.rosterId}`} className="block hover:underline">{content}</Link>
                      ) : content;
                    })()}
                  </CardContent>
                </Card>
              )}
            </div>
            {/* Recap Playoff Brackets */}
            <div className="mt-8">
              <SectionHeader title="Playoff brackets (recap)" />
              <div className="flex flex-col gap-6 mt-4">
                {[{ id: 'winners-recap', title: 'Winners Bracket', data: recapWinnersBracket }, { id: 'losers-recap', title: 'Losers Bracket', data: recapLosersBracket }].map((b) => (
                  <Card key={b.id} className="w-full">
                    <CardContent>
                      <h3 className="text-lg font-semibold mb-3">{b.title}</h3>
                      {b.data.length === 0 ? (
                        <p className="text-[var(--muted)]">No games.</p>
                      ) : (
                        (() => {
                          const byRound: Record<number, SleeperBracketGameWithScore[]> = {};
                          b.data.forEach((g) => {
                            const r = g.r ?? 0;
                            if (!byRound[r]) byRound[r] = [];
                            byRound[r].push(g);
                          });
                          const roundNums = Object.keys(byRound).map(n => Number(n)).sort((a,b) => a - b);
                          roundNums.forEach(r => byRound[r].sort((a,b) => (a.m ?? 0) - (b.m ?? 0)));
                          const nameFor = (rid?: number | null) => {
                            if (rid == null) return 'BYE';
                            return recapBracketNameMap.get(rid) || `Roster ${rid}`;
                          };
                          const TeamRow = ({ rid, isWinner, score }: { rid?: number | null; isWinner: boolean; score?: number | null }) => {
                            const nm = rid != null ? nameFor(rid) : 'BYE';
                            const seed = rid != null ? (seedByRosterIdRecap.get(rid) ?? null) : null;
                            const color = nm && nm !== 'BYE' ? getTeamColors(nm)?.primary : undefined;
                            return (
                              <div className={`flex items-center justify-between gap-2 ${isWinner ? 'font-semibold text-[var(--accent)]' : ''}`}>
                                <div className="min-w-0 flex-1 flex items-center gap-2">
                                  {nm !== 'BYE' && rid != null ? (
                                    <Link href={`/teams/${rid}`} className="flex items-center gap-2 min-w-0 hover:underline" title={nm}>
                                      <div className="w-5 h-5 rounded-full overflow-hidden border" style={{ borderColor: color || 'var(--border)' }}>
                                        <Image src={getTeamLogoPath(nm)} alt={nm} width={20} height={20} className="object-contain w-5 h-5" />
                                      </div>
                                      <span className="truncate">{seed ? `#${seed} ` : ''}{nm}</span>
                                    </Link>
                                  ) : (
                                    <span className="block truncate text-[var(--muted)]" title="BYE">BYE</span>
                                  )}
                                </div>
                                {score != null && (
                                  <span className="shrink-0 ml-2 text-xs px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--muted)]">{score.toFixed(2)}</span>
                                )}
                              </div>
                            );
                          };
                          const maxRound = roundNums.length ? roundNums[roundNums.length - 1] : 0;
                          // Proper Championship and 3rd Place labeling for winners recap only
                          const semiWinners: Array<number> = [];
                          const semiLosers: Array<number> = [];
                          if ((b.id === 'winners-recap') && roundNums.length >= 2) {
                            const semiRound = roundNums[roundNums.length - 2];
                            const semis = byRound[semiRound] || [];
                            for (const s of semis) {
                              const w = s.w ?? ((s.t1_points != null && s.t2_points != null) ? ((s.t1_points > s.t2_points) ? s.t1 : s.t2) : null);
                              const l = w != null ? ((w === s.t1) ? s.t2 : s.t1) : null;
                              if (w != null) semiWinners.push(w);
                              if (l != null) semiLosers.push(l);
                            }
                          }
                          const winnersSet = semiWinners.length === 2 ? new Set<number>(semiWinners) : null;
                          const losersSet = semiLosers.length === 2 ? new Set<number>(semiLosers) : null;
                          const isPair = (pair: [number | null | undefined, number | null | undefined], set: Set<number>) => {
                            const [a,b] = pair;
                            if (a == null || b == null) return false;
                            return set.has(a) && set.has(b) && set.size === 2;
                          };
                          const labelFor = (g: SleeperBracketGameWithScore, rNum: number): string | undefined => {
                            if (rNum !== maxRound) return undefined;
                            if (b.id === 'losers-recap') return 'Final';
                            if (winnersSet && isPair([g.t1 ?? null, g.t2 ?? null], winnersSet)) return 'Championship';
                            if (losersSet && isPair([g.t1 ?? null, g.t2 ?? null], losersSet)) return '3rd Place';
                            return undefined;
                          };
                          const MATCH_H = 72; // px
                          const GAP = 24; // px
                          const roundTitle = (r: number) => {
                            if (r === maxRound) return 'Finals';
                            if (r === maxRound - 1) return 'Semifinals';
                            return `Round ${r}`;
                          };
                          return (
                            <div className="overflow-x-auto">
                              <div className="flex items-start gap-8">
                                {roundNums.map((r, rIdx) => {
                                  const mtFirst = rIdx === 0 ? 0 : ((MATCH_H + GAP) * Math.pow(2, rIdx - 1)) / 2;
                                  const mtBetween = rIdx === 0 ? GAP : ((MATCH_H + GAP) * Math.pow(2, rIdx - 1));
                                  const matches = byRound[r];
                                  const n = matches.length;
                                  const colHeight = mtFirst + n * MATCH_H + Math.max(0, n - 1) * mtBetween;
                                  const roundCol = (
                                    <div key={`${b.id}-round-${r}`} className="min-w-[260px]">
                                      <h4 className="font-semibold text-[var(--muted)] mb-2">{roundTitle(r)}</h4>
                                      <div style={{ height: colHeight }}>
                                        {matches.map((g, idx) => (
                                          <div key={`${b.id}-${r}-${g.m}`} style={{ marginTop: idx === 0 ? mtFirst : mtBetween }}>
                                            <div className="border rounded p-3 h-[72px] relative flex flex-col justify-between overflow-hidden">
                                              {(() => { const ml = labelFor(g, r); return ml ? <div className="absolute -top-2 left-2 text-[10px] px-1.5 py-0.5 rounded border bg-[var(--surface)] text-[var(--muted)]">{ml}</div> : null; })()}
                                              <TeamRow rid={g.t1 ?? null} isWinner={g.w != null && g.t1 != null && g.w === g.t1} score={g.t1_points ?? null} />
                                              <TeamRow rid={g.t2 ?? null} isWinner={g.w != null && g.t2 != null && g.w === g.t2} score={g.t2_points ?? null} />
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                  const connCol = (rIdx < roundNums.length - 1) ? (
                                    <div key={`${b.id}-conn-${r}`} className="relative w-16" style={{ height: colHeight }}>
                                      {Array.from({ length: Math.floor(n / 2) }, (_, k) => {
                                        const i1 = 2 * k;
                                        const i2 = i1 + 1;
                                        const y1 = mtFirst + i1 * (MATCH_H + GAP) + MATCH_H / 2;
                                        const y2 = mtFirst + i2 * (MATCH_H + GAP) + MATCH_H / 2;
                                        const mid = (y1 + y2) / 2;
                                        return (
                                          <div key={`${b.id}-connseg-${r}-${k}`}>
                                            <div style={{ position: 'absolute', left: '50%', top: `${y1}px`, height: `${y2 - y1}px`, width: 2, transform: 'translateX(-50%)', background: 'var(--border)' }} />
                                            <div style={{ position: 'absolute', top: `${mid}px`, left: 0, right: '50%', height: 2, transform: 'translateY(-50%)', background: 'var(--border)' }} />
                                            <div style={{ position: 'absolute', top: `${mid}px`, left: '50%', right: 0, height: 2, transform: 'translateY(-50%)', background: 'var(--border)' }} />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : null;
                                  return [roundCol, connCol];
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
