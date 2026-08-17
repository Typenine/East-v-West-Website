import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';
import { buildAllEvwTeams, franchiseHistoryId } from '@/lib/history/league-history';
import { getReadableTextForColors, getTeamColors } from '@/lib/utils/team-utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'All-EVW Teams — East v. West',
  description: 'Annual first-team and second-team All-East v. West selections based on regular-season league scoring.',
};

const COLUMN_WIDTHS = {
  slot: '9%',
  player: '24%',
  position: '8%',
  franchise: '41%',
  points: '18%',
} as const;

function fmt(value: number): string {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function Th({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: CSSProperties }) {
  return <th style={style} className={`border-b border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-left text-xs font-black uppercase tracking-wide text-[var(--muted)] ${className}`}>{children}</th>;
}

function Td({ children, className = '', style }: { children: React.ReactNode; className?: string; style?: CSSProperties }) {
  return <td style={style} className={`border-b border-[var(--border)] px-3 py-2 text-sm ${className}`}>{children}</td>;
}

export default async function AllEvwPage() {
  const dataset = await getLeagueStatsDatasetV3();
  const seasons = buildAllEvwTeams(dataset);
  const franchiseByName = new Map(dataset.franchises.map((row) => [row.teamName, row] as const));

  return (
    <main className="container mx-auto max-w-[1400px] px-4 py-8">
      <div className="text-sm text-[var(--muted)]"><Link href="/history" className="hover:underline">History</Link> / All-EVW Teams</div>
      <div className="mt-2 border-b-4 border-[var(--accent)] pb-4">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-[var(--muted)]">Annual Honors</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">All-East v. West Teams</h1>
        <p className="mt-2 max-w-4xl text-sm text-[var(--muted)]">First and second teams are selected strictly from complete regular-season EVW point totals. Production is credited only to the franchise that rostered the player that week. Each player can occupy one slot per season.</p>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {seasons.map((season) => <a key={season.season} href={`#season-${season.season}`} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-black hover:border-[var(--accent)]">{season.season}</a>)}
      </div>

      <div className="mt-7 space-y-12">
        {seasons.map((season) => (
          <section key={season.season} id={`season-${season.season}`} className="scroll-mt-24 space-y-5">
            <div className="border-b border-[var(--border)] pb-2">
              <h2 className="text-2xl font-black">{season.season} All-EVW Team</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">QB · 2 RB · 2 WR · TE · FLEX · Superflex · DEF</p>
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              {([['First Team', season.firstTeam], ['Second Team', season.secondTeam]] as const).map(([label, rows]) => (
                <div key={label} className="min-w-0">
                  <h3 className="mb-2 text-base font-black uppercase tracking-wide">{label}</h3>
                  <div className="all-evw-table-wrap overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <table className="all-evw-team-table w-full table-fixed">
                      <colgroup>
                        <col style={{ width: COLUMN_WIDTHS.slot }} />
                        <col style={{ width: COLUMN_WIDTHS.player }} />
                        <col style={{ width: COLUMN_WIDTHS.position }} />
                        <col style={{ width: COLUMN_WIDTHS.franchise }} />
                        <col style={{ width: COLUMN_WIDTHS.points }} />
                      </colgroup>
                      <thead><tr>
                        <Th style={{ width: COLUMN_WIDTHS.slot }}>Slot</Th>
                        <Th style={{ width: COLUMN_WIDTHS.player }}>Player</Th>
                        <Th style={{ width: COLUMN_WIDTHS.position, display: 'table-cell' }}>Pos</Th>
                        <Th style={{ width: COLUMN_WIDTHS.franchise }}>Franchise</Th>
                        <Th className="text-right" style={{ width: COLUMN_WIDTHS.points }}>Reg. Pts</Th>
                      </tr></thead>
                      <tbody>{rows.map((row) => {
                        const primaryFranchise = row.franchises[0];
                        const franchise = primaryFranchise ? franchiseByName.get(primaryFranchise) : null;
                        const colors = primaryFranchise ? getTeamColors(primaryFranchise) : null;
                        return (
                          <tr key={`${label}-${row.slot}-${row.playerId}`}>
                            <Td className="font-black" style={{ width: COLUMN_WIDTHS.slot }}>{row.slot}</Td>
                            <Td style={{ width: COLUMN_WIDTHS.player }}><Link href={`/players/${row.playerId}`} className="font-black text-[var(--accent)] hover:underline">{row.name}</Link></Td>
                            <Td style={{ width: COLUMN_WIDTHS.position, display: 'table-cell' }}>{row.position}</Td>
                            <Td className="min-w-0" style={{ width: COLUMN_WIDTHS.franchise }}>
                              {primaryFranchise ? franchise ? <Link href={`/history/franchises/${franchiseHistoryId(franchise)}`} className="inline-block max-w-full whitespace-normal break-words rounded px-2 py-1 text-xs font-bold leading-tight hover:opacity-90" style={{ background: colors?.primary || 'var(--accent)', color: colors ? getReadableTextForColors([colors.primary, colors.secondary]) : '#fff', overflowWrap: 'anywhere' }}>{row.franchises.join(' / ')}</Link> : <span className="whitespace-normal break-words" style={{ overflowWrap: 'anywhere' }}>{row.franchises.join(' / ')}</span> : '—'}
                            </Td>
                            <Td className="text-right font-black tabular-nums" style={{ width: COLUMN_WIDTHS.points }}>{fmt(row.points)}</Td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--muted)]">
        Selection note: All-EVW is an automatically generated statistical honor based only on complete regular-season EVW points. Starts are not part of the selection formula. FLEX is RB/WR/TE; SF is QB/RB/WR/TE. Playoff, Toilet Bowl and other postseason scoring are excluded.
      </div>
    </main>
  );
}
