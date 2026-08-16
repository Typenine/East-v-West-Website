'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { LeagueStatsDataset } from '@/lib/stats/types';

function fmt(value: number, digits = 1): string {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">{children}</div>;
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--muted)] ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] ${className}`}>{children}</td>;
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">{label}</div><div className="mt-1 text-xl font-black tabular-nums text-[var(--text)]">{value}</div>{note ? <div className="mt-1 text-xs text-[var(--muted)]">{note}</div> : null}</div>;
}

export default function WeeklyScorebook({ dataset, season }: { dataset: LeagueStatsDataset; season: string }) {
  const weeks = useMemo(() => Array.from(new Set(dataset.games.filter((game) => game.season === season).map((game) => game.week))).sort((a, b) => a - b), [dataset.games, season]);
  const [week, setWeek] = useState<number>(weeks[weeks.length - 1] || 1);

  useEffect(() => {
    setWeek(weeks[weeks.length - 1] || 1);
  }, [season, weeks]);

  const weekGames = useMemo(() => dataset.games.filter((game) => game.season === season && game.week === week), [dataset.games, season, week]);
  const weekPlayers = useMemo(() => dataset.playerGames.filter((row) => row.season === season && row.week === week).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)), [dataset.playerGames, season, week]);

  const summary = useMemo(() => {
    const teamScores = weekGames.flatMap((game) => [
      { team: game.teamA, points: game.scoreA, opponent: game.teamB },
      { team: game.teamB, points: game.scoreB, opponent: game.teamA },
    ]);
    const high = [...teamScores].sort((a, b) => b.points - a.points)[0];
    const low = [...teamScores].sort((a, b) => a.points - b.points)[0];
    const closest = [...weekGames].filter((game) => !game.tie).sort((a, b) => a.margin - b.margin)[0];
    const biggest = [...weekGames].filter((game) => !game.tie).sort((a, b) => b.margin - a.margin)[0];
    const avg = teamScores.length ? teamScores.reduce((sum, row) => sum + row.points, 0) / teamScores.length : 0;
    return { high, low, closest, biggest, avg };
  }, [weekGames]);

  const positional = useMemo(() => {
    const preferred = ['QB', 'RB', 'WR', 'TE'];
    return preferred.map((position) => ({
      position,
      rows: weekPlayers.filter((row) => row.position === position).slice(0, 3),
    })).filter((group) => group.rows.length > 0);
  }, [weekPlayers]);

  if (weeks.length === 0) {
    return <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">No scored weeks are available for {season}.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Week
            <select value={week} onChange={(event) => setWeek(Number(event.target.value))} className="ml-2 rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]">
              {weeks.map((value) => <option key={value} value={value}>Week {value}</option>)}
            </select>
          </label>
          <div className="text-sm text-[var(--muted)]">{weekGames.length} matchup{weekGames.length === 1 ? '' : 's'} · {weekPlayers.length} players with scoring entries</div>
        </div>
        <Link href={`/history/gamebook/${season}/${week}`} className="rounded-md border border-[var(--accent)] px-3 py-2 text-sm font-black text-[var(--accent)] hover:bg-accent-soft">Open full Week {week} gamebook →</Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="League High" value={summary.high ? fmt(summary.high.points, 2) : '—'} note={summary.high ? `${summary.high.team} vs. ${summary.high.opponent}` : undefined} />
        <Stat label="League Low" value={summary.low ? fmt(summary.low.points, 2) : '—'} note={summary.low ? `${summary.low.team} vs. ${summary.low.opponent}` : undefined} />
        <Stat label="Average Score" value={fmt(summary.avg, 2)} />
        <Stat label="Closest Game" value={summary.closest ? fmt(summary.closest.margin, 2) : '—'} note={summary.closest ? `${summary.closest.winner} over ${summary.closest.loser}` : undefined} />
        <Stat label="Biggest Win" value={summary.biggest ? fmt(summary.biggest.margin, 2) : '—'} note={summary.biggest ? `${summary.biggest.winner} over ${summary.biggest.loser}` : undefined} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-base font-bold text-[var(--text)]">Week {week} Matchups</h3>
          <TableWrap>
            <table className="w-full">
              <thead><tr><Th>Team</Th><Th className="text-right">Score</Th><Th>Opponent</Th><Th className="text-right">Score</Th></tr></thead>
              <tbody>{weekGames.map((game) => {
                const aWon = game.winner === game.teamA;
                const bWon = game.winner === game.teamB;
                return <tr key={game.id}><Td className={aWon ? 'font-bold' : ''}>{game.teamA}</Td><Td className={`text-right tabular-nums ${aWon ? 'font-bold' : ''}`}>{fmt(game.scoreA, 2)}</Td><Td className={bWon ? 'font-bold' : ''}>{game.teamB}</Td><Td className={`text-right tabular-nums ${bWon ? 'font-bold' : ''}`}>{fmt(game.scoreB, 2)}</Td></tr>;
              })}</tbody>
            </table>
          </TableWrap>
        </div>

        <div>
          <h3 className="mb-2 text-base font-bold text-[var(--text)]">Overall Player Leaders</h3>
          <TableWrap>
            <table className="w-full">
              <thead><tr><Th>Rk</Th><Th>Player</Th><Th>Pos</Th><Th>Franchise</Th><Th className="text-right">Pts</Th></tr></thead>
              <tbody>{weekPlayers.slice(0, 15).map((row, index) => <tr key={row.id}><Td>{index + 1}</Td><Td><Link href={`/players/${row.playerId}`} className="font-semibold text-[var(--accent)] hover:underline">{row.name}</Link></Td><Td>{row.position}</Td><Td>{row.franchiseName}</Td><Td className="text-right font-semibold tabular-nums">{fmt(row.points, 1)}</Td></tr>)}</tbody>
            </table>
          </TableWrap>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-base font-bold text-[var(--text)]">Positional Leaders</h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {positional.map((group) => <div key={group.position} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"><div className="mb-2 text-xs font-black uppercase tracking-wider text-[var(--muted)]">{group.position}</div><div className="space-y-2">{group.rows.map((row, index) => <div key={row.id} className="flex items-center justify-between gap-3 text-sm"><div className="min-w-0"><span className="mr-2 text-xs text-[var(--muted)]">{index + 1}</span><Link href={`/players/${row.playerId}`} className="truncate font-semibold text-[var(--accent)] hover:underline">{row.name}</Link><div className="ml-5 truncate text-xs text-[var(--muted)]">{row.franchiseName}</div></div><div className="shrink-0 font-black tabular-nums">{fmt(row.points, 1)}</div></div>)}</div></div>)}
        </div>
      </div>
    </div>
  );
}
