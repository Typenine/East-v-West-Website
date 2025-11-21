import { NextResponse } from 'next/server';
import { LEAGUE_IDS, CHAMPIONS } from '@/lib/constants/league';
import {
  getFranchisesAllTime,
  getLeagueRecordBook,
  getWeeklyHighScoreTallyAcrossSeasons,
  getSplitRecordsAllTime,
  getTopScoringWeeksAllTime,
  getWeeklyHighsBySeason,
  getLeagueMatchups,
  getTeamsData,
  getLeaguePlayoffBracketsWithScores,
  type FranchiseSummary,
  type LeagueRecordBook,
  type SplitRecord,
  type TopScoringWeekEntry,
  type WeeklyHighByWeekEntry,
  type SleeperFetchOptions,
  type SleeperMatchup,
  type TeamData,
  type SleeperBracketGameWithScore,
} from '@/lib/utils/sleeper-api';
import { getHeadToHeadAllTime } from '@/lib/utils/headtohead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const seasons = ['2025', ...Object.keys(LEAGUE_IDS.PREVIOUS || {})].sort();
    const optsCached: SleeperFetchOptions = { timeoutMs: 20000 };

    const promises = [
      getFranchisesAllTime(optsCached),
      getLeagueRecordBook(optsCached),
      getWeeklyHighScoreTallyAcrossSeasons({ tuesdayFlip: true }, optsCached),
      getSplitRecordsAllTime(optsCached),
      getTopScoringWeeksAllTime({ category: 'regular', top: 25 }, optsCached),
      getTopScoringWeeksAllTime({ category: 'playoffs', top: 25 }, optsCached),
      getTopScoringWeeksAllTime({ category: 'all', top: 25 }, optsCached),
      getHeadToHeadAllTime(),
    ] as const;

    const [
      franchises,
      recordBook,
      weeklyHighTally,
      splitRecords,
      topRegular,
      topPlayoffs,
      topAll,
      h2h,
    ] = (await Promise.all(promises)) as [
      FranchiseSummary[],
      LeagueRecordBook,
      Record<string, number>,
      Record<string, { teamName: string; regular: SplitRecord; playoffs: SplitRecord; toilet: SplitRecord }>,
      TopScoringWeekEntry[],
      TopScoringWeekEntry[],
      TopScoringWeekEntry[],
      Awaited<ReturnType<typeof getHeadToHeadAllTime>>,
    ];

    const weeklyHighsBySeason: Record<string, WeeklyHighByWeekEntry[]> = {};

    // Per-season containers
    const championshipGames: Record<string, {
      winner: string;
      loser: string;
      winnerPoints: number;
      loserPoints: number;
      week: number | null;
      notes?: string;
    } | null> = {};

    const playoffBrackets: Record<string, {
      winners: SleeperBracketGameWithScore[];
      losers: SleeperBracketGameWithScore[];
    }> = {};

    const weeklyHighsBySeasonLocal: Record<string, WeeklyHighByWeekEntry[]> = {};

    // Matchup-level game logs by season and week
    type MatchupLogEntry = {
      season: string;
      week: number;
      matchupId: number;
      homeRosterId: number;
      homeTeam: string;
      homePoints: number;
      awayRosterId: number;
      awayTeam: string;
      awayPoints: number;
    };

    const matchupLogsBySeason: Record<string, MatchupLogEntry[]> = {};

    for (const season of seasons) {
      const leagueId =
        season === '2025'
          ? LEAGUE_IDS.CURRENT
          : LEAGUE_IDS.PREVIOUS[season as keyof typeof LEAGUE_IDS.PREVIOUS];
      if (!leagueId) {
        matchupLogsBySeason[season] = [];
        weeklyHighsBySeasonLocal[season] = [];
        championshipGames[season] = null;
        playoffBrackets[season] = { winners: [], losers: [] };
        continue;
      }

      const teams: TeamData[] = await getTeamsData(leagueId, optsCached).catch(
        () => [] as TeamData[],
      );
      const rosterIdToName = new Map<number, string>(
        teams.map((t) => [t.rosterId, t.teamName] as const),
      );

      // Per-season weekly highs (explicit) for convenience
      weeklyHighsBySeasonLocal[season] = await getWeeklyHighsBySeason(season, optsCached).catch(
        () => [] as WeeklyHighByWeekEntry[],
      );

      // League uses 17 active weeks; exclude any Week 18 data to avoid erroneous entries
      const weeks = Array.from({ length: 17 }, (_, i) => i + 1);
      const allWeekMatchups = await Promise.all(
        weeks.map((w) =>
          getLeagueMatchups(leagueId, w, optsCached).catch(
            () => [] as SleeperMatchup[],
          ),
        ),
      );

      const logs: MatchupLogEntry[] = [];

      allWeekMatchups.forEach((weekMatchups, idx) => {
        const week = idx + 1;
        if (!weekMatchups || weekMatchups.length === 0) return;

        const byId = new Map<number, SleeperMatchup[]>();
        for (const m of weekMatchups) {
          const arr = byId.get(m.matchup_id) || [];
          arr.push(m);
          byId.set(m.matchup_id, arr);
        }

        for (const [matchupId, pair] of byId.entries()) {
          if (!pair || pair.length < 2) continue;
          const [a, b] = pair;
          const aPts = (a.custom_points ?? a.points ?? 0) as number;
          const bPts = (b.custom_points ?? b.points ?? 0) as number;

          logs.push({
            season,
            week,
            matchupId,
            homeRosterId: b.roster_id,
            homeTeam: rosterIdToName.get(b.roster_id) ?? `Roster ${b.roster_id}`,
            homePoints: bPts,
            awayRosterId: a.roster_id,
            awayTeam: rosterIdToName.get(a.roster_id) ?? `Roster ${a.roster_id}`,
            awayPoints: aPts,
          });
        }
      });

      matchupLogsBySeason[season] = logs;

      // Playoff brackets + scores
      try {
        const brackets = await getLeaguePlayoffBracketsWithScores(leagueId, optsCached);
        playoffBrackets[season] = brackets;

        // Try to identify the championship game from winners bracket: deepest round, non-null scores
        const winnersGames = brackets.winners || [];
        let champ: SleeperBracketGameWithScore | null = null;
        for (const g of winnersGames) {
          if (!g.t1 || !g.t2) continue;
          const hasScores = (g.t1_points ?? null) !== null || (g.t2_points ?? null) !== null;
          if (!hasScores) continue;
          if (!champ || (g.r ?? 0) > (champ.r ?? 0)) champ = g;
        }
        if (champ && champ.t1 && champ.t2) {
          const t1Name = rosterIdToName.get(champ.t1) ?? `Roster ${champ.t1}`;
          const t2Name = rosterIdToName.get(champ.t2) ?? `Roster ${champ.t2}`;
          const t1Pts = Number(champ.t1_points ?? 0);
          const t2Pts = Number(champ.t2_points ?? 0);
          let winnerName = t1Name;
          let loserName = t2Name;
          let winnerPoints = t1Pts;
          let loserPoints = t2Pts;
          if (t2Pts > t1Pts) {
            winnerName = t2Name;
            loserName = t1Name;
            winnerPoints = t2Pts;
            loserPoints = t1Pts;
          }
          const week = null; // can be derived from brackets metadata; left null for now
          championshipGames[season] = {
            winner: winnerName,
            loser: loserName,
            winnerPoints,
            loserPoints,
            week,
            notes: undefined,
          };
        } else {
          championshipGames[season] = null;
        }
      } catch {
        playoffBrackets[season] = { winners: [], losers: [] };
        championshipGames[season] = null;
      }
    }

    const body = {
      meta: {
        type: 'history-and-records',
        version: 1,
        generatedAt: new Date().toISOString(),
        seasons,
      },
      champions: CHAMPIONS,
      franchisesAllTime: franchises,
      recordBook,
      weeklyHighScoreTallyByOwner: weeklyHighTally,
      splitRecordsAllTime: splitRecords,
      topScoringWeeks: {
        regular: topRegular,
        playoffs: topPlayoffs,
        all: topAll,
      },
      weeklyHighsBySeason,
      headToHeadAllTime: h2h,
      matchupsBySeason: matchupLogsBySeason,
      championshipGames,
      playoffBrackets,
      playerRecords: {
        // Top single-game scoring weeks across all seasons grouped by category
        topWeeks: {
          regular: topRegular,
          playoffs: topPlayoffs,
          all: topAll,
        },
      },
    };

    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="evw-history-and-records.json"',
      },
    });
  } catch (err) {
    console.error('export/history GET error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
