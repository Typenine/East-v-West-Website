import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import Card, { CardContent } from '@/components/ui/Card';
import MatchupCard from '@/components/ui/matchup-card';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { 
  getLeagueMatchups,
  getRosterIdToTeamNameMap,
  getAllPlayersCached,
  getNFLWeekStats,
  getNFLState,
  type SleeperMatchup,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';
import RosterColumn, { type PlayerRow } from '@/components/matchups/RosterColumn';
import WinProbability from '@/components/matchups/WinProbability';
import { buildPlayerAvailabilitySnapshot } from '@/lib/utils/player-availability';

export const revalidate = 20;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default async function MatchupDetailPage({ params }: { params?: Promise<Record<string, string | string[] | undefined>> }) {
  const p = (await (params ?? Promise.resolve({}))) as Record<string, string | string[] | undefined>;
  const weekRaw = p.week;
  const idRaw = p.id;
  const weekStr = Array.isArray(weekRaw) ? weekRaw[0] : weekRaw;
  const idStr = Array.isArray(idRaw) ? idRaw[0] : idRaw;
  const weekParam = Number(weekStr);
  const idParam = Number(idStr);
  const week = clamp(Number.isFinite(weekParam) ? weekParam : 1, 1, 17);
  const matchupId = Number.isFinite(idParam) ? idParam : 0;

  const leagueId = LEAGUE_IDS.CURRENT;

  try {
    // Fetch everything we need
    const [matchups, nameMap, players, state] = await Promise.all([
      getLeagueMatchups(leagueId, week).catch(() => [] as SleeperMatchup[]),
      getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
      getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
      getNFLState().catch(() => ({ season: String(new Date().getFullYear()) } as { season: string })),
    ]);

    // Group by matchup_id
    const byId = new Map<number, SleeperMatchup[]>();
    for (const m of matchups) {
      const arr = byId.get(m.matchup_id) || [];
      arr.push(m);
      byId.set(m.matchup_id, arr);
    }
    const pair = byId.get(matchupId) || [];
    if (!pair || pair.length < 2) {
      return (
        <div className="container mx-auto px-4 py-8">
          <SectionHeader
            title={`Week ${week}: Matchup not found`}
            actions={
              week > 14
                ? (
                  <Link href={`/?week=14`} className="text-[var(--accent)] hover:underline">← Back to Schedule</Link>
                ) : (
                  <Link href={`/?week=${week}`} className="text-[var(--accent)] hover:underline">← Back to Week {week}</Link>
                )
            }
          />
          <Card className="mt-4">
            <CardContent>
              <p className="text-[var(--muted)]">We couldn&apos;t find that matchup for Week {week}. It may not exist or data isn&apos;t available yet.</p>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Normalize two sides
    const [a, b] = pair; // two rosters
    const aName = nameMap.get(a.roster_id) ?? `Roster ${a.roster_id}`;
    const bName = nameMap.get(b.roster_id) ?? `Roster ${b.roster_id}`;
    const aPts = (a.custom_points ?? a.points ?? 0);
    const bPts = (b.custom_points ?? b.points ?? 0);

    // Helpers to build rows
    function buildRowsFromIds(ids: string[], m: SleeperMatchup): PlayerRow[] {
      const pp = (m.players_points || {}) as Record<string, number>;
      const out: PlayerRow[] = [];
      for (const pid of ids) {
        const pl = (players as Record<string, SleeperPlayer>)[pid];
        const name = pl ? `${pl.first_name || ''} ${pl.last_name || ''}`.trim() : pid;
        const pos = pl?.position;
        const team = pl?.team;
        const pts = Number(pp[pid] ?? 0);
        out.push({ id: pid, name, pos, team, pts });
      }
      return out;
    }

    function unique<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

    function buildStarterRows(m: SleeperMatchup): PlayerRow[] {
      const starters = ((m.starters || []) as string[]).filter((id) => id && id !== '0');
      return buildRowsFromIds(starters, m);
    }

    function buildBenchRows(m: SleeperMatchup): PlayerRow[] {
      const starters = new Set(((m.starters || []) as string[]).filter((id) => id && id !== '0'));
      const fromPlayers = Array.isArray(m.players)
        ? (m.players as string[]).filter((id) => id && id !== '0')
        : Object.keys((m.players_points || {}) as Record<string, number>).filter((id) => id !== '0');
      const benchIds = unique(fromPlayers.filter((id) => !starters.has(id)));
      return buildRowsFromIds(benchIds, m);
    }

    const aStarters = buildStarterRows(a);
    const bStarters = buildStarterRows(b);
    const aBench = buildBenchRows(a);
    const bBench = buildBenchRows(b);

    // Fetch weekly stats for this season/week for stat lines beneath player names
    const season = (state as { season?: string }).season || String(new Date().getFullYear());
    const currentWeek = Number((state as { week?: number }).week ?? week);
    let weekStats: Record<string, Partial<Record<string, number>>> = {};
    try {
      const stats = await getNFLWeekStats(season, week);
      weekStats = stats as unknown as Record<string, Partial<Record<string, number>>>;
    } catch {
      weekStats = {};
    }

    const playerIds = Array.from(new Set([
      ...aStarters.map((p) => p.id),
      ...bStarters.map((p) => p.id),
      ...aBench.map((p) => p.id),
      ...bBench.map((p) => p.id),
    ]));

    const availability = await buildPlayerAvailabilitySnapshot({
      leagueId,
      uptoWeek: week,
      playerIds,
    });

    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader
          title={`Week ${week} Matchup`}
          actions={
            week > 14
              ? (
                <Link href={`/?week=14`} className="inline-flex items-center px-4 py-2 rounded-full font-medium evw-surface border border-[var(--border)] text-[var(--text)] hover:opacity-90 focus:outline-none focus:ring-2 ring-[var(--focus)] ring-offset-2 ring-offset-[var(--surface)]">← Back to Schedule</Link>
              ) : (
                <Link href={`/?week=${week}`} className="inline-flex items-center px-4 py-2 rounded-full font-medium evw-surface border border-[var(--border)] text-[var(--text)] hover:opacity-90 focus:outline-none focus:ring-2 ring-[var(--focus)] ring-offset-2 ring-offset-[var(--surface)]">← Back to Week {week}</Link>
              )
          }
        />

        {/* Inline WP bars moved under each team header */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <RosterColumn
            title={bName}
            colorTeam={bName}
            week={week}
            season={season}
            currentWeek={currentWeek}
            totalPts={bPts}
            starters={bStarters}
            bench={bBench}
            stats={weekStats}
            availability={availability}
            headerExtras={
              <WinProbability
                week={week}
                season={season}
                leftTeamName={bName}
                rightTeamName={aName}
                leftTotal={bPts}
                rightTotal={aPts}
                leftStarters={bStarters as PlayerRow[]}
                rightStarters={aStarters as PlayerRow[]}
                currentWeek={currentWeek}
                variant="inline"
                side="left"
                bordered={false}
                availability={availability}
              />
            }
          />
          <RosterColumn
            title={aName}
            colorTeam={aName}
            week={week}
            season={season}
            currentWeek={currentWeek}
            totalPts={aPts}
            starters={aStarters}
            bench={aBench}
            stats={weekStats}
            availability={availability}
            headerExtras={
              <WinProbability
                week={week}
                season={season}
                leftTeamName={bName}
                rightTeamName={aName}
                leftTotal={bPts}
                rightTotal={aPts}
                leftStarters={bStarters as PlayerRow[]}
                rightStarters={aStarters as PlayerRow[]}
                currentWeek={currentWeek}
                variant="inline"
                side="right"
                bordered={false}
                availability={availability}
              />
            }
          />
        </div>

        {/* Other matchups in this week */}
        {Array.from(byId.entries()).filter(([mid]) => mid !== matchupId).length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold mb-2">Other matchups</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from(byId.entries()).filter(([mid]) => mid !== matchupId).map(([mid, arr]) => {
                const [m1, m2] = arr;
                const awayTeam = nameMap.get(m2.roster_id) ?? `Roster ${m2.roster_id}`;
                const homeTeam = nameMap.get(m1.roster_id) ?? `Roster ${m1.roster_id}`;
                const awayScore = (m2.custom_points ?? m2.points ?? 0);
                const homeScore = (m1.custom_points ?? m1.points ?? 0);
                return (
                  <MatchupCard
                    key={mid}
                    awayTeam={awayTeam}
                    homeTeam={homeTeam}
                    awayRosterId={m2.roster_id}
                    homeRosterId={m1.roster_id}
                    awayScore={awayScore}
                    homeScore={homeScore}
                    week={week}
                    matchupId={mid}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="text-xs text-[var(--muted)]">
          Data source: Sleeper weekly matchups • Live scoreboard: ESPN • Week {week}
          <br />
          Legend: Yet to play (YTP) • In progress (IP) • Finished (FIN)
        </div>
      </div>
    );
  } catch {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader
          title={`Week ${week} Matchup`}
          actions={week > 14
            ? <Link href={`/?week=14`} className="text-[var(--accent)] hover:underline">← Back to Schedule</Link>
            : <Link href={`/?week=${week}`} className="text-[var(--accent)] hover:underline">← Back to Week {week}</Link>}
        />
        <Card className="mt-4">
          <CardContent>
            <p className="text-[var(--muted)]">Failed to load matchup. Please try again later.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
}
