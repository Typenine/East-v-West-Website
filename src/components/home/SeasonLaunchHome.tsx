import { LEAGUE_IDS, TEAM_NAMES } from "@/lib/constants/league";
import {
  buildYearToLeagueMapUnique,
  getLeagueMatchups,
  getLeagueRosters,
  getNFLState,
  getRosterIdToTeamNameMap,
  getTeamsData,
} from "@/lib/utils/sleeper-api";
import { getHomepagePhase } from "@/lib/utils/countdown-resolver";
import { selectCalendar } from "@/lib/constants/league-calendar";
import { requireTeamUser } from "@/lib/server/session";
import { getUserIdForTeam } from "@/lib/server/user-identity";
import { readUserDoc } from "@/lib/server/user-store";
import { getHeadToHeadAllTime } from "@/lib/utils/headtohead";
import type { TeamRow } from "@/types/trade-block";
import type { MyTeamData } from "@/components/home/MyTeamCard";
import type { StandingsTeam } from "@/components/home/PlayoffRacePanel";
import SeasonWeekHeader from "@/components/home/SeasonWeekHeader";
import HomepageCountdowns from "@/components/home/HomepageCountdowns";
import TaxiBanner, { type TaxiFlags } from "@/components/taxi/TaxiBanner";
import MyTeamCard from "@/components/home/MyTeamCard";
import SeasonMatchups, {
  type SeasonHomeMatchup,
  type SeasonProjectionStarter,
} from "@/components/home/SeasonMatchups";
import InSeasonStandings from "@/components/home/InSeasonStandings";
import PlayoffRacePanel from "@/components/home/PlayoffRacePanel";
import LeaguePulse from "@/components/home/LeaguePulse";
import WeeklyLeaders from "@/components/home/WeeklyLeaders";
import AroundTheLeague from "@/components/home/AroundTheLeague";
import RecentTransactions from "@/components/home/RecentTransactions";
import HistoricalSpotlight from "@/components/home/HistoricalSpotlight";
import { loadProjectionSnapshotsForWeek } from "@/lib/fantasy/projection-snapshot-store";
import {
  buildLeagueProjectionSnapshotsV3,
  PROJECTION_MODEL_VERSION,
} from "@/lib/fantasy/weekly-projections-next";

const MAX_REGULAR_WEEKS = 14;

export default async function SeasonLaunchHome({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  const calendar = selectCalendar(now);
  const presentationPhase = getHomepagePhase(now);
  const isPostDeadline = presentationPhase === "post_deadline_pre_postseason";
  const authUser = await requireTeamUser().catch(() => null);

  const sp = (await (searchParams ?? Promise.resolve({}))) as Record<string, string | string[] | undefined>;
  const requestedRaw = sp.week;
  const requestedStr = Array.isArray(requestedRaw) ? requestedRaw[0] : requestedRaw;
  const requestedWeek = typeof requestedStr === "string" ? Number(requestedStr) : NaN;
  const hasWeekOverride = Number.isFinite(requestedWeek) && requestedWeek >= 1 && requestedWeek <= MAX_REGULAR_WEEKS;

  let leagueId = LEAGUE_IDS.CURRENT;
  let seasonYear = String(calendar.season);
  let selectedWeek = 1;
  let standings: StandingsTeam[] = [];
  const matchups: SeasonHomeMatchup[] = [];
  let myTeamData: MyTeamData | null = null;
  let tradeRows: TeamRow[] = [];

  try {
    const nflState = await getNFLState().catch(() => ({ week: 1, display_week: 1, season_has_scores: false }));
    seasonYear = String((nflState as { season?: string | number }).season ?? calendar.season);
    const yearMap = await buildYearToLeagueMapUnique().catch(() => ({} as Record<string, string>));
    leagueId = yearMap[seasonYear] || leagueId;

    const rawWeek = Number(
      (nflState as { week?: number; display_week?: number }).week
      ?? (nflState as { display_week?: number }).display_week
      ?? 1,
    );
    const currentWeek = Math.max(1, Math.min(18, Number.isFinite(rawWeek) ? rawWeek : 1));
    const beforeKickoff = now.getTime() < calendar.regularSeasonStart.getTime();
    const hasScores = (nflState as { season_has_scores?: boolean }).season_has_scores;
    let defaultWeek = beforeKickoff || hasScores === false ? 1 : currentWeek;
    const dowET = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/New_York" }).format(now);
    if (!beforeKickoff && (dowET === "Mon" || dowET === "Tue")) defaultWeek = Math.max(1, defaultWeek - 1);
    defaultWeek = Math.min(MAX_REGULAR_WEEKS, Math.max(1, defaultWeek));
    selectedWeek = hasWeekOverride ? requestedWeek : defaultWeek;

    const [teams, rosterNameMap, rosters, sleeperMatchups] = await Promise.all([
      getTeamsData(leagueId).catch(() => []),
      getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
      getLeagueRosters(leagueId).catch(() => []),
      getLeagueMatchups(leagueId, selectedWeek).catch(() => []),
    ]);

    const sortedTeams = [...teams].sort(
      (a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.fpts ?? 0) - (a.fpts ?? 0),
    );
    standings = sortedTeams.map((team, index) => ({
      teamName: team.teamName,
      rosterId: team.rosterId,
      wins: team.wins ?? 0,
      losses: team.losses ?? 0,
      fpts: team.fpts ?? 0,
      seed: index + 1,
    }));

    let projectionSnapshots = await loadProjectionSnapshotsForWeek({
      season: Number(seasonYear),
      week: selectedWeek,
      modelVersion: PROJECTION_MODEL_VERSION,
    }).catch(() => []);

    const shouldGenerateSelectedWeek = beforeKickoff ? selectedWeek === 1 : selectedWeek === currentWeek;
    if (shouldGenerateSelectedWeek && projectionSnapshots.length < Math.min(12, rosters.length)) {
      const generated = await buildLeagueProjectionSnapshotsV3({
        season: seasonYear,
        week: selectedWeek,
        saveSnapshots: true,
      }).catch(() => []);
      if (generated.length) {
        projectionSnapshots = generated.map((snapshot) => {
          const hasCurrentLineup = (snapshot.currentLineup || []).some((entry) => Boolean(entry.player));
          return {
            ...snapshot,
            currentTotal: snapshot.currentTotal ?? snapshot.optimalTotal,
            currentLineup: hasCurrentLineup ? snapshot.currentLineup : snapshot.optimalLineup,
          };
        });
      }
    }

    const projectionByTeam = new Map(
      projectionSnapshots.map((snapshot) => [snapshot.teamName, snapshot] as const),
    );

    const projectedStartersFor = (teamName: string): SeasonProjectionStarter[] => {
      const snapshot = projectionByTeam.get(teamName);
      if (!snapshot) return [];
      return (snapshot.currentLineup || []).flatMap((entry) => {
        const player = entry.player;
        if (!player) return [];
        return [{
          id: player.id,
          position: player.position,
          nflTeam: player.nflTeam,
          projection: Number(player.projection || 0),
          stddev: Math.max(0.1, (Number(player.rangeHigh || 0) - Number(player.rangeLow || 0)) / 2.564),
        }];
      });
    };

    const groups = new Map<number, Array<{ rosterId: number; points: number }>>();
    for (const matchup of sleeperMatchups) {
      const entries = groups.get(matchup.matchup_id) || [];
      entries.push({
        rosterId: matchup.roster_id,
        points: matchup.custom_points ?? matchup.points ?? 0,
      });
      groups.set(matchup.matchup_id, entries);
    }

    for (const [matchupId, entries] of groups.entries()) {
      if (entries.length < 2) continue;
      const [away, home] = entries;
      const homeTeam = rosterNameMap.get(home.rosterId) || `Roster ${home.rosterId}`;
      const awayTeam = rosterNameMap.get(away.rosterId) || `Roster ${away.rosterId}`;
      const homeSnapshot = projectionByTeam.get(homeTeam);
      const awaySnapshot = projectionByTeam.get(awayTeam);

      matchups.push({
        homeTeam,
        awayTeam,
        homeRosterId: home.rosterId,
        awayRosterId: away.rosterId,
        homeScore: home.points,
        awayScore: away.points,
        homeProjectedScore: homeSnapshot?.currentTotal ?? undefined,
        awayProjectedScore: awaySnapshot?.currentTotal ?? undefined,
        homeStarters: projectedStartersFor(homeTeam),
        awayStarters: projectedStartersFor(awayTeam),
        week: selectedWeek,
        matchupId,
      });
    }

    if (authUser) {
      const roster = rosters.find((item) => rosterNameMap.get(item.roster_id) === authUser.team);
      if (roster) {
        const teamStanding = standings.find((team) => team.rosterId === roster.roster_id);
        const uniquePlayers = new Set<string>(roster.players || []);
        for (const playerId of [...(roster.taxi || []), ...(roster.reserve || [])]) uniquePlayers.add(playerId);
        myTeamData = {
          teamName: authUser.team,
          rosterCount: uniquePlayers.size,
          taxiCount: (roster.taxi || []).length,
          irCount: (roster.reserve || []).length,
          wins: teamStanding?.wins ?? roster.settings?.wins ?? 0,
          losses: teamStanding?.losses ?? roster.settings?.losses ?? 0,
          fpts: teamStanding?.fpts ?? roster.settings?.fpts ?? 0,
          seed: teamStanding?.seed,
          tradeBlock: [],
          tradeWants: null,
          tradeBlockUpdatedAt: null,
          tradeBlockPlayerIds: [],
          tradeBlockPickCount: 0,
        };
      }
    }
  } catch {
    // Each section below has a useful empty/loading state.
  }

  try {
    tradeRows = await Promise.all(
      TEAM_NAMES.map(async (team) => {
        try {
          const userId = getUserIdForTeam(team);
          const doc = await readUserDoc(userId, team);
          const row: TeamRow = {
            team,
            tradeBlock: Array.isArray(doc.tradeBlock) ? doc.tradeBlock : [],
            tradeWants: doc.tradeWants ?? null,
            updatedAt: doc.updatedAt || null,
          };
          if (myTeamData && myTeamData.teamName === team) {
            myTeamData.tradeBlock = row.tradeBlock;
            myTeamData.tradeWants = row.tradeWants;
            myTeamData.tradeBlockUpdatedAt = row.updatedAt;
            myTeamData.tradeBlockPlayerIds = row.tradeBlock
              .filter((asset) => asset.type === "player")
              .map((asset) => (asset as { playerId: string }).playerId);
            myTeamData.tradeBlockPickCount = row.tradeBlock.filter((asset) => asset.type === "pick").length;
          }
          return row;
        } catch {
          return { team, tradeBlock: [], tradeWants: null, updatedAt: null };
        }
      }),
    );
  } catch {
    tradeRows = [];
  }

  const h2h = await getHeadToHeadAllTime().catch(() => ({ teams: [], matrix: {}, neverBeaten: [] }));
  const emptyTaxi: TaxiFlags = { generatedAt: now.toISOString(), actual: [], potential: [] };

  return (
    <div className="home-page relative overflow-hidden">
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
          filter: "saturate(125%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.14]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.26) 1px, transparent 1px)",
          backgroundSize: "100% 4px",
        }}
      />

      <div className="container relative z-10 mx-auto px-4 py-6 sm:px-5 sm:py-8">
        <SeasonWeekHeader week={selectedWeek} matchupCount={matchups.length} />

        <HomepageCountdowns />

        <TaxiBanner initial={emptyTaxi} />

        {myTeamData && (
          <section className="mb-10 sm:mb-12">
            <MyTeamCard data={myTeamData} phase={presentationPhase} />
          </section>
        )}

        <SeasonMatchups
          selectedWeek={selectedWeek}
          maxWeeks={MAX_REGULAR_WEEKS}
          season={seasonYear}
          matchups={matchups}
        />

        {isPostDeadline && standings.length > 0 ? (
          <PlayoffRacePanel standings={standings} />
        ) : (
          standings.length > 0 && <InSeasonStandings standings={standings} />
        )}

        <LeaguePulse
          tradeRows={tradeRows}
          positionCounts={{}}
          playerPositions={{}}
          phase={presentationPhase}
          standings={standings}
        />

        <WeeklyLeaders week={selectedWeek} matchups={matchups} />
        <AroundTheLeague myTeam={authUser?.team ?? null} />
        <RecentTransactions />
        <HistoricalSpotlight h2h={h2h} />
      </div>
    </div>
  );
}
