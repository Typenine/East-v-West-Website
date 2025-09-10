import Image from 'next/image';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { 
  getLeagueMatchups,
  getRosterIdToTeamNameMap,
  getAllPlayersCached,
  type SleeperMatchup,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';

export const revalidate = 20;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default async function MatchupDetailPage({ params }: { params: { week: string; id: string } }) {
  const weekParam = Number(params.week);
  const idParam = Number(params.id);
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

    // Build starters list for each side in the order Sleeper provides
    function buildStarters(m: SleeperMatchup): Array<{ id: string; pts: number; pos?: string; team?: string; name: string }> {
      const starters = (m.starters || []) as string[];
      const pp = (m.players_points || {}) as Record<string, number>;
      const list: Array<{ id: string; pts: number; pos?: string; team?: string; name: string }> = [];
      for (const pid of starters) {
        const pl = (players as Record<string, SleeperPlayer>)[pid];
        const name = pl ? `${pl.first_name || ''} ${pl.last_name || ''}`.trim() : pid;
        const pos = pl?.position;
        const team = pl?.team;
        const pts = Number(pp[pid] ?? 0);
        list.push({ id: pid, pts, pos, team, name });
      }
      return list;
    }

    const aStarters = buildStarters(a);
    const bStarters = buildStarters(b);

    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader
          title={`Week ${week} Matchup`}
          actions={
            <Link href={`/?week=${week}`} className="inline-flex items-center px-4 py-2 rounded-full font-medium evw-surface border border-[var(--border)] text-[var(--text)] hover:opacity-90 focus:outline-none focus:ring-2 ring-[var(--focus)] ring-offset-2 ring-offset-[var(--surface)]">← Back to Week {week}</Link>
          }
        />

        {/* Scoreboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Away side */}
          <Card>
            <CardHeader style={getTeamColorStyle(bName)}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                  <Image src={getTeamLogoPath(bName)} alt={bName} width={28} height={28} className="object-contain" />
                </div>
                <CardTitle className="text-current">{bName}</CardTitle>
                <div className="ml-auto text-lg font-extrabold">{bPts.toFixed(2)}</div>
              </div>
            </CardHeader>
            <CardContent>
              <h3 className="text-sm font-semibold mb-3">Starters</h3>
              <ul className="space-y-2">
                {bStarters.length > 0 ? (
                  bStarters.map((s) => (
                    <li key={s.id} className="flex items-center justify-between evw-surface border border-[var(--border)] rounded-md px-3 py-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{s.name}</div>
                        <div className="text-xs text-[var(--muted)]">{s.pos || '—'}{s.team ? ` • ${s.team}` : ''}</div>
                      </div>
                      <div className="font-semibold tabular-nums">{s.pts.toFixed(2)}</div>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-[var(--muted)]">No starters listed.</li>
                )}
              </ul>
            </CardContent>
          </Card>

          {/* Home side */}
          <Card>
            <CardHeader style={getTeamColorStyle(aName)}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                  <Image src={getTeamLogoPath(aName)} alt={aName} width={28} height={28} className="object-contain" />
                </div>
                <CardTitle className="text-current">{aName}</CardTitle>
                <div className="ml-auto text-lg font-extrabold">{aPts.toFixed(2)}</div>
              </div>
            </CardHeader>
            <CardContent>
              <h3 className="text-sm font-semibold mb-3">Starters</h3>
              <ul className="space-y-2">
                {aStarters.length > 0 ? (
                  aStarters.map((s) => (
                    <li key={s.id} className="flex items-center justify-between evw-surface border border-[var(--border)] rounded-md px-3 py-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{s.name}</div>
                        <div className="text-xs text-[var(--muted)]">{s.pos || '—'}{s.team ? ` • ${s.team}` : ''}</div>
                      </div>
                      <div className="font-semibold tabular-nums">{s.pts.toFixed(2)}</div>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-[var(--muted)]">No starters listed.</li>
                )}
              </ul>
            </CardContent>
          </Card>
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
