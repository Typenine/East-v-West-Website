import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import Card, { CardContent } from '@/components/ui/Card';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { 
  getLeagueMatchups,
  getRosterIdToTeamNameMap,
  getAllPlayersCached,
  type SleeperMatchup,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';
import RosterColumn, { type PlayerRow } from '@/components/matchups/RosterColumn';

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
  const week = clamp(Number.isFinite(weekParam) ? weekParam : 1, 1, 18);
  const matchupId = Number.isFinite(idParam) ? idParam : 0;

  const leagueId = LEAGUE_IDS.CURRENT;

  try {
    // Fetch everything we need
    const [matchups, nameMap, players] = await Promise.all([
      getLeagueMatchups(leagueId, week).catch(() => [] as SleeperMatchup[]),
      getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
      getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
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
              <Link href={`/?week=${week}`} className="text-[var(--accent)] hover:underline">← Back to Week {week}</Link>
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
      const starters = ((m.starters || []) as string[]).filter(Boolean);
      return buildRowsFromIds(starters, m);
    }

    function buildBenchRows(m: SleeperMatchup): PlayerRow[] {
      const starters = new Set(((m.starters || []) as string[]).filter(Boolean));
      const fromPlayers = Array.isArray(m.players) ? (m.players as string[]).filter(Boolean) : Object.keys((m.players_points || {}) as Record<string, number>);
      const benchIds = unique(fromPlayers.filter((id) => !starters.has(id)));
      return buildRowsFromIds(benchIds, m);
    }

    const aStarters = buildStarterRows(a);
    const bStarters = buildStarterRows(b);
    const aBench = buildBenchRows(a);
    const bBench = buildBenchRows(b);

    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader
          title={`Week ${week} Matchup`}
          actions={
            <Link href={`/?week=${week}`} className="inline-flex items-center px-4 py-2 rounded-full font-medium evw-surface border border-[var(--border)] text-[var(--text)] hover:opacity-90 focus:outline-none focus:ring-2 ring-[var(--focus)] ring-offset-2 ring-offset-[var(--surface)]">← Back to Week {week}</Link>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <RosterColumn
            title={bName}
            colorTeam={bName}
            week={week}
            totalPts={bPts}
            starters={bStarters}
            bench={bBench}
          />
          <RosterColumn
            title={aName}
            colorTeam={aName}
            week={week}
            totalPts={aPts}
            starters={aStarters}
            bench={aBench}
          />
        </div>

        <div className="text-xs text-[var(--muted)]">Data source: Sleeper weekly matchups • Week {week}</div>
      </div>
    );
  } catch {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader
          title={`Week ${week} Matchup`}
          actions={<Link href={`/?week=${week}`} className="text-[var(--accent)] hover:underline">← Back to Week {week}</Link>}
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
