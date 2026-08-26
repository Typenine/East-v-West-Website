import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import PlayerLink from '@/components/players/PlayerLink';
import { CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import {
  getAllPlayersCached,
  getLeagueRosters,
  getNFLState,
  getRosterIdToTeamNameMap,
  getSleeperInjuriesCached,
  type SleeperInjury,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';
import { buildPlayerAvailabilitySnapshot } from '@/lib/utils/player-availability';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

type LoosePlayer = SleeperPlayer & {
  injury_status?: string | null;
  status?: string | null;
  bye_week?: number | string | null;
};

type LooseInjury = SleeperInjury & {
  status?: string | null;
  practice_participation?: string | null;
};

type HealthRow = {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  status: string;
  practice: string;
  onReserve: boolean;
  onTaxi: boolean;
  byeWeek: number | null;
  availabilityPct: number;
  reasons: string[];
  severity: number;
};

function normalizedStatus(player: LoosePlayer | undefined, injury: LooseInjury | undefined) {
  const raw = String(injury?.status || player?.injury_status || player?.status || '').trim();
  if (!raw || raw.toLowerCase() === 'active') return 'Healthy';
  return raw;
}

function severityFor(status: string, practice: string, onReserve: boolean, availabilityPct: number) {
  const value = `${status} ${practice}`.toLowerCase();
  if (onReserve || /\bout\b|injured reserve|\bir\b|pup|suspend|inactive/.test(value)) return 4;
  if (/doubtful/.test(value)) return 3;
  if (/questionable|dnp|did not practice/.test(value) || availabilityPct < 75) return 2;
  if (/limited/.test(value) || availabilityPct < 90) return 1;
  return 0;
}

function statusClasses(severity: number) {
  if (severity >= 4) return 'border-red-500/40 bg-red-500/10 text-red-200';
  if (severity === 3) return 'border-orange-500/40 bg-orange-500/10 text-orange-200';
  if (severity === 2) return 'border-yellow-500/40 bg-yellow-500/10 text-yellow-100';
  if (severity === 1) return 'border-amber-400/30 bg-amber-400/5 text-amber-100';
  return 'border-emerald-500/25 bg-emerald-500/5 text-emerald-100';
}

function HealthTable({ rows }: { rows: HealthRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Practice</th>
            <th className="px-3 py-2">Availability</th>
            <th className="px-3 py-2">Roster</th>
            <th className="px-3 py-2">Bye</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerId} className="border-b border-[var(--border)]/70 last:border-b-0">
              <td className="px-3 py-3">
                <PlayerLink playerId={row.playerId} className="font-bold">{row.name}</PlayerLink>
                <div className="mt-0.5 text-[11px] text-[var(--muted)]">{row.position || '—'} · {row.nflTeam || 'FA'}</div>
              </td>
              <td className="px-3 py-3">
                <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${statusClasses(row.severity)}`}>{row.status}</span>
              </td>
              <td className="px-3 py-3 text-xs text-[var(--muted)]">{row.practice || '—'}</td>
              <td className="px-3 py-3 font-bold tabular-nums">{row.availabilityPct}%</td>
              <td className="px-3 py-3 text-xs text-[var(--muted)]">{row.onReserve ? 'Reserve' : row.onTaxi ? 'Taxi' : 'Active'}</td>
              <td className="px-3 py-3 text-xs text-[var(--muted)]">{row.byeWeek ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function TeamHealthPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rosterId = Number(id);
  const leagueId = LEAGUE_IDS.CURRENT;

  const [rosters, players, injuries, nameMap, nflState] = await Promise.all([
    getLeagueRosters(leagueId),
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    getSleeperInjuriesCached().catch(() => [] as SleeperInjury[]),
    getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
    getNFLState().catch(() => ({ week: 1 } as { week?: number })),
  ]);

  const roster = rosters.find((entry) => entry.roster_id === rosterId);
  if (!roster) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Team Health Center" subtitle="Roster not found" />
        <Card className="mt-5"><CardContent><p className="text-sm text-[var(--muted)]">No current 2026 roster matches this team.</p></CardContent></Card>
      </div>
    );
  }

  const playerIds = Array.from(new Set((roster.players || []).filter(Boolean)));
  const reserve = new Set((roster.reserve || []).filter(Boolean));
  const taxi = new Set((roster.taxi || []).filter(Boolean));
  const currentWeek = Math.max(1, Number((nflState as { week?: number }).week ?? 1));
  const availability = await buildPlayerAvailabilitySnapshot({ leagueId, uptoWeek: currentWeek, playerIds });
  const injuryMap = new Map((injuries as LooseInjury[]).map((injury) => [injury.player_id, injury]));

  const rows: HealthRow[] = playerIds.map((playerId) => {
    const player = players[playerId] as LoosePlayer | undefined;
    const injury = injuryMap.get(playerId);
    const entry = availability[playerId];
    const status = normalizedStatus(player, injury);
    const practice = String(injury?.practice_participation || '').trim();
    const availabilityPct = Math.round((entry?.weight ?? 0.92) * 100);
    const rawBye = player?.bye_week;
    const byeWeek = rawBye === null || rawBye === undefined || rawBye === '' ? null : Number(rawBye);
    const name = player ? `${player.first_name || ''} ${player.last_name || ''}`.trim() : playerId;
    const severity = severityFor(status, practice, reserve.has(playerId), availabilityPct);

    return {
      playerId,
      name: name || playerId,
      position: player?.position || '',
      nflTeam: player?.team || '',
      status,
      practice,
      onReserve: reserve.has(playerId),
      onTaxi: taxi.has(playerId),
      byeWeek: Number.isFinite(byeWeek) ? byeWeek : null,
      availabilityPct,
      reasons: entry?.reasons || [],
      severity,
    };
  }).sort((a, b) => b.severity - a.severity || a.position.localeCompare(b.position) || a.name.localeCompare(b.name));

  const attention = rows.filter((row) => row.severity > 0);
  const clear = rows.filter((row) => row.severity === 0);
  const outCount = rows.filter((row) => row.severity >= 4).length;
  const questionableCount = rows.filter((row) => row.severity === 2 || row.severity === 3).length;
  const practiceCount = rows.filter((row) => /limited|dnp|did not practice/i.test(row.practice)).length;
  const teamName = nameMap.get(rosterId) || `Roster ${rosterId}`;

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader
        title={`${teamName} Health Center`}
        subtitle={`${CURRENT_SEASON} injury, practice, reserve, and availability overview`}
        actions={
          <Link href={`/teams/${rosterId}`} className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-bold hover:bg-white/5">Back to team</Link>
        }
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="pt-5"><div className="text-2xl font-black">{attention.length}</div><div className="text-xs text-[var(--muted)]">Need attention</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-2xl font-black">{outCount}</div><div className="text-xs text-[var(--muted)]">Out / reserve / inactive</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-2xl font-black">{questionableCount}</div><div className="text-xs text-[var(--muted)]">Questionable / doubtful</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-2xl font-black">{practiceCount}</div><div className="text-xs text-[var(--muted)]">Practice limitations</div></CardContent></Card>
      </div>

      <div className="mt-5 space-y-5">
        <Card>
          <CardHeader><CardTitle>Needs Attention</CardTitle></CardHeader>
          <CardContent className="!p-0">
            {attention.length ? <HealthTable rows={attention} /> : <p className="p-5 text-sm text-[var(--muted)]">No current injury, practice, reserve, or availability flags.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Clear / Healthy</CardTitle></CardHeader>
          <CardContent className="!p-0">
            {clear.length ? <HealthTable rows={clear} /> : <p className="p-5 text-sm text-[var(--muted)]">No players currently listed as clear.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="mt-3 text-xs text-[var(--muted)]">
        Updated from free live sources: Sleeper roster/player injury and practice metadata, with ESPN depth-chart context through the existing East v. West availability model. Week {currentWeek}.
      </div>
    </div>
  );
}
