import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeagueStatsDatasetV2 } from '@/lib/stats/league-stats-v2';
import { buildWeeklyGamebook, franchiseHistoryId } from '@/lib/history/league-history';
import { getReadableTextForColors, getTeamColors } from '@/lib/utils/team-utils';
import type { StatsFranchiseRow, StatsGameRow } from '@/lib/stats/types';

export const dynamic = 'force-dynamic';

type PageParams = { season: string; week: string };

function fmt(value: number, digits = 1): string {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function gameTypeLabel(type: StatsGameRow['gameType']): string {
  if (type === 'regular') return 'Regular Season';
  if (type === 'playoffs') return 'Championship Bracket';
  if (type === 'toilet') return 'Toilet Bracket';
  return 'Postseason';
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-[11px] font-black uppercase tracking-wide text-[var(--muted)]">{label}</div><div className="mt-1 text-2xl font-black tabular-nums">{value}</div>{note ? <div className="mt-1 text-xs text-[var(--muted)]">{note}</div> : null}</div>;
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-left text-xs font-black uppercase tracking-wide text-[var(--muted)] ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-sm ${className}`}>{children}</td>;
}

function TeamLink({ teamName, franchiseMap }: { teamName: string; franchiseMap: Map<string, StatsFranchiseRow> }) {
  const colors = getTeamColors(teamName);
  const franchise = franchiseMap.get(teamName);
  const style = { background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary || colors.primary})`, color: getReadableTextForColors([colors.primary, colors.secondary]) };
  const className = 'inline-flex rounded-md px-2.5 py-1 text-sm font-black shadow-sm';
  return franchise ? <Link href={`/history/franchises/${franchiseHistoryId(franchise)}`} className={className} style={style}>{teamName}</Link> : <span className={className} style={style}>{teamName}</span>;
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { season, week } = await params;
  return { title: `${season} Week ${week} Gamebook — East v. West` };
}

export default async function WeeklyGamebookPage({ params }: { params: Promise<PageParams> }) {
  const { season, week: rawWeek } = await params;
  const week = Number(rawWeek);
  if (!Number.isInteger(week) || week < 1) notFound();
  const dataset = await getLeagueStatsDatasetV2();
  const book = buildWeeklyGamebook(dataset, season, week);
  if (!book) notFound();

  const franchiseMap = new Map(dataset.franchises.map((row) => [row.teamName, row] as const));
  const allWeeks = Array.from(new Set(dataset.games.filter((game) => game.season === season).map((game) => game.week))).sort((a, b) => a - b);
  const index = allWeeks.indexOf(week);
  const previous = index > 0 ? allWeeks[index - 1] : null;
  const next = index >= 0 && index < allWeeks.length - 1 ? allWeeks[index + 1] : null;
  const gameTypes = Array.from(new Set(book.games.map((game) => gameTypeLabel(game.gameType))));

  return (
    <main className="container mx-auto max-w-[1500px] px-4 py-8">
      <div className="text-sm text-[var(--muted)]"><Link href="/history" className="hover:underline">History</Link> / <Link href="/history/gamebook" className="hover:underline">Gamebooks</Link> / {season} Week {week}</div>
      <div className="mt-2 border-b-4 border-[var(--accent)] pb-4">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-[var(--muted)]">{gameTypes.join(' / ')}</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{season} Week {week} Gamebook</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{book.games.length} matchup{book.games.length === 1 ? '' : 's'} · {book.players.length} player scoring entries · complete weekly EVW reference.</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">{previous ? <Link href={`/history/gamebook/${season}/${previous}`} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-bold hover:border-[var(--accent)]">← Week {previous}</Link> : null}{next ? <Link href={`/history/gamebook/${season}/${next}`} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-bold hover:border-[var(--accent)]">Week {next} →</Link> : null}</div>
        <div className="flex gap-3 text-sm"><Link href="/history/gamebook" className="font-bold text-[var(--accent)] hover:underline">All gamebooks</Link><Link href="/history/stats?tab=seasons" className="font-bold text-[var(--accent)] hover:underline">Season stats</Link></div>
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="League High" value={book.high ? fmt(book.high.points, 2) : '—'} note={book.high ? `${book.high.team} vs. ${book.high.opponent}` : undefined} />
        <Stat label="League Low" value={book.low ? fmt(book.low.points, 2) : '—'} note={book.low ? `${book.low.team} vs. ${book.low.opponent}` : undefined} />
        <Stat label="Average Score" value={fmt(book.averageScore, 2)} />
        <Stat label="Closest Game" value={book.closest ? fmt(book.closest.margin, 2) : '—'} note={book.closest ? `${book.closest.winner} over ${book.closest.loser}` : undefined} />
        <Stat label="Biggest Win" value={book.biggest ? fmt(book.biggest.margin, 2) : '—'} note={book.biggest ? `${book.biggest.winner} over ${book.biggest.loser}` : undefined} />
      </div>

      <section className="mt-10 space-y-3">
        <div className="border-b border-[var(--border)] pb-2"><h2 className="text-xl font-black">Matchups</h2><p className="mt-1 text-sm text-[var(--muted)]">Every recorded team score for the week.</p></div>
        <div className="grid gap-4 lg:grid-cols-2">{book.games.map((game) => {
          const aWon = game.winner === game.teamA;
          const bWon = game.winner === game.teamB;
          return <div key={game.id} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"><div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2 text-xs font-black uppercase tracking-wide text-[var(--muted)]"><span>{gameTypeLabel(game.gameType)}</span><span>Margin {fmt(game.margin, 2)}</span></div><div className="grid grid-cols-[1fr_auto] items-center gap-4 p-4"><div><TeamLink teamName={game.teamA} franchiseMap={franchiseMap} /></div><div className={`text-2xl font-black tabular-nums ${aWon ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>{fmt(game.scoreA, 2)}</div><div><TeamLink teamName={game.teamB} franchiseMap={franchiseMap} /></div><div className={`text-2xl font-black tabular-nums ${bWon ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>{fmt(game.scoreB, 2)}</div></div></div>;
        })}</div>
      </section>

      <section className="mt-10 space-y-3">
        <div className="border-b border-[var(--border)] pb-2"><h2 className="text-xl font-black">Overall Player Leaders</h2><p className="mt-1 text-sm text-[var(--muted)]">Highest EVW-scoring player performances from the week.</p></div>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]"><table className="w-full"><thead><tr><Th>Rk</Th><Th>Player</Th><Th>Pos</Th><Th>Franchise</Th><Th>Started</Th><Th className="text-right">Pts</Th></tr></thead><tbody>{book.players.slice(0, 25).map((row, rank) => <tr key={row.id}><Td>{rank + 1}</Td><Td><Link href={`/players/${row.playerId}`} className="font-black text-[var(--accent)] hover:underline">{row.name}</Link></Td><Td>{row.position}</Td><Td><TeamLink teamName={row.franchiseName} franchiseMap={franchiseMap} /></Td><Td>{row.started ? 'Yes' : 'No'}</Td><Td className="text-right font-black tabular-nums">{fmt(row.points)}</Td></tr>)}</tbody></table></div>
      </section>

      <section className="mt-10 space-y-3">
        <div className="border-b border-[var(--border)] pb-2"><h2 className="text-xl font-black">Positional Leaders</h2></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{book.positional.map((group) => <div key={group.position} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-sm font-black uppercase tracking-wide text-[var(--muted)]">{group.position}</div><div className="mt-3 space-y-3">{group.rows.map((row, rank) => <div key={row.id} className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-sm"><span className="mr-2 text-xs text-[var(--muted)]">{rank + 1}</span><Link href={`/players/${row.playerId}`} className="font-black text-[var(--accent)] hover:underline">{row.name}</Link></div><div className="ml-5 mt-0.5 text-xs text-[var(--muted)]">{row.franchiseName}</div></div><div className="font-black tabular-nums">{fmt(row.points)}</div></div>)}</div></div>)}</div>
      </section>

      <section className="mt-10 space-y-3">
        <div className="border-b border-[var(--border)] pb-2"><h2 className="text-xl font-black">Milestones & Records</h2><p className="mt-1 text-sm text-[var(--muted)]">League milestones automatically detected in this week.</p></div>
        {book.milestones.length ? <div className="grid gap-3 md:grid-cols-2">{book.milestones.map((item) => <div key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">{item.type}</div><div className="mt-1 font-black">{item.playerId ? <Link href={`/players/${item.playerId}`} className="text-[var(--accent)] hover:underline">{item.title}</Link> : item.teamName && franchiseMap.get(item.teamName) ? <Link href={`/history/franchises/${franchiseHistoryId(franchiseMap.get(item.teamName)!)}`} className="text-[var(--accent)] hover:underline">{item.title}</Link> : item.title}</div><div className="mt-1 text-sm text-[var(--muted)]">{item.detail}</div></div>)}</div> : <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">No tracked league milestones were triggered this week.</div>}
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <Link href="/transactions" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 font-bold text-[var(--accent)] hover:underline">Transactions archive →</Link>
        <Link href="/trades" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 font-bold text-[var(--accent)] hover:underline">Trade history →</Link>
        <Link href="/newsletter" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 font-bold text-[var(--accent)] hover:underline">Newsletter archive →</Link>
      </section>
    </main>
  );
}
