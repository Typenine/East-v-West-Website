'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { LeagueStatsDataset, StatsGameType } from '@/lib/stats/types';
import { getReadableTextForColors, getTeamColors } from '@/lib/utils/team-utils';

type PostseasonCategory = Extract<StatsGameType, 'playoffs' | 'toilet'>;

type PlayerRow = {
  playerId: string;
  name: string;
  position: string;
  points: number;
  note?: string;
};

type TeamRow = {
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  games: number;
  pointsFor: number;
  pointsAgainst: number;
};

type CategoryStats = {
  teams: TeamRow[];
  career: PlayerRow[];
  seasons: PlayerRow[];
  games: PlayerRow[];
};

const STATS_TABS = [
  ['Overview', '/history/stats'],
  ['Players', '/history/stats?tab=players'],
  ['Franchises', '/history/stats?tab=franchises'],
  ['Seasons', '/history/stats?tab=seasons'],
  ['Games', '/history/stats?tab=games'],
  ['Postseason', '/history/stats?tab=postseason'],
  ['Records', '/history/stats?tab=records'],
  ['Explorer', '/history/stats?tab=explorer'],
] as const;

function fmt(value: number, digits = 1): string {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function record(row: TeamRow): string {
  return row.ties ? `${row.wins}-${row.losses}-${row.ties}` : `${row.wins}-${row.losses}`;
}

function winPct(row: TeamRow): string {
  if (!row.games) return '-';
  return `${(((row.wins + row.ties * 0.5) / row.games) * 100).toFixed(1)}%`;
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">{children}</div>;
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-left text-xs font-black uppercase tracking-wide text-[var(--muted)] ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] ${className}`}>{children}</td>;
}

function buildCategory(dataset: LeagueStatsDataset, category: PostseasonCategory, position: string): CategoryStats {
  const games = dataset.games.filter((game) => game.gameType === category);
  const teamWeeks = new Set<string>();
  const teams = new Map<string, TeamRow>();

  const ensureTeam = (teamName: string) => {
    const existing = teams.get(teamName);
    if (existing) return existing;
    const created: TeamRow = { teamName, wins: 0, losses: 0, ties: 0, games: 0, pointsFor: 0, pointsAgainst: 0 };
    teams.set(teamName, created);
    return created;
  };

  for (const game of games) {
    teamWeeks.add(`${game.season}|${game.week}|${game.teamA}`);
    teamWeeks.add(`${game.season}|${game.week}|${game.teamB}`);
    const a = ensureTeam(game.teamA);
    const b = ensureTeam(game.teamB);
    a.games += 1;
    b.games += 1;
    a.pointsFor += game.scoreA;
    a.pointsAgainst += game.scoreB;
    b.pointsFor += game.scoreB;
    b.pointsAgainst += game.scoreA;
    if (game.tie) {
      a.ties += 1;
      b.ties += 1;
    } else if (game.winner === game.teamA) {
      a.wins += 1;
      b.losses += 1;
    } else if (game.winner === game.teamB) {
      b.wins += 1;
      a.losses += 1;
    }
  }

  const playerGames = dataset.playerGames.filter((row) =>
    teamWeeks.has(`${row.season}|${row.week}|${row.franchiseName}`) &&
    (position === 'ALL' || row.position === position)
  );

  const career = new Map<string, PlayerRow>();
  const seasons = new Map<string, PlayerRow>();
  for (const row of playerGames) {
    const careerRow = career.get(row.playerId) || {
      playerId: row.playerId,
      name: row.name,
      position: row.position,
      points: 0,
    };
    careerRow.points += row.points;
    career.set(row.playerId, careerRow);

    const seasonKey = `${row.season}|${row.playerId}`;
    const seasonRow = seasons.get(seasonKey) || {
      playerId: row.playerId,
      name: row.name,
      position: row.position,
      points: 0,
      note: row.season,
    };
    seasonRow.points += row.points;
    seasons.set(seasonKey, seasonRow);
  }

  return {
    teams: Array.from(teams.values()).sort((a, b) => b.wins - a.wins || ((b.wins + b.ties * 0.5) / Math.max(1, b.games)) - ((a.wins + a.ties * 0.5) / Math.max(1, a.games)) || b.pointsFor - a.pointsFor || a.teamName.localeCompare(b.teamName)),
    career: Array.from(career.values()).map((row) => ({ ...row, points: Number(row.points.toFixed(2)) })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
    seasons: Array.from(seasons.values()).map((row) => ({ ...row, points: Number(row.points.toFixed(2)) })).sort((a, b) => b.points - a.points || String(b.note).localeCompare(String(a.note)) || a.name.localeCompare(b.name)),
    games: playerGames.map((row) => ({ playerId: row.playerId, name: row.name, position: row.position, points: row.points, note: `${row.season} W${row.week} - ${row.franchiseName}` })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
  };
}

function PlayerTable({ title, rows }: { title: string; rows: PlayerRow[] }) {
  return (
    <div>
      <h3 className="mb-2 font-black text-[var(--text)]">{title}</h3>
      <TableWrap>
        <table className="w-full">
          <thead><tr><Th>Rk</Th><Th>Player</Th><Th>Pos</Th><Th>Detail</Th><Th className="text-right">Pts</Th></tr></thead>
          <tbody>
            {rows.slice(0, 10).map((row, index) => (
              <tr key={`${title}-${row.playerId}-${row.note || ''}`}>
                <Td>{index + 1}</Td>
                <Td><Link href={`/players/${row.playerId}`} className="font-bold text-[var(--accent)] hover:underline">{row.name}</Link></Td>
                <Td>{row.position}</Td>
                <Td className="text-[var(--muted)]">{row.note || '-'}</Td>
                <Td className="text-right font-black tabular-nums">{fmt(row.points)}</Td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-[var(--muted)]">No qualifying player scoring.</td></tr> : null}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

function CategorySection({ title, subtitle, stats }: { title: string; subtitle: string; stats: CategoryStats }) {
  return (
    <section className="space-y-6">
      <div className="border-b border-[var(--border)] pb-2">
        <h2 className="text-2xl font-black text-[var(--text)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
      </div>

      <div>
        <h3 className="mb-2 font-black text-[var(--text)]">Franchise Records</h3>
        <TableWrap>
          <table className="w-full">
            <thead><tr><Th>Rk</Th><Th>Franchise</Th><Th>Record</Th><Th className="text-right">Win %</Th><Th className="text-right">PF</Th><Th className="text-right">PA</Th></tr></thead>
            <tbody>
              {stats.teams.map((row, index) => {
                const colors = getTeamColors(row.teamName);
                const text = getReadableTextForColors([colors.primary, colors.secondary]);
                return (
                  <tr key={row.teamName}>
                    <Td>{index + 1}</Td>
                    <Td><span className="inline-flex rounded px-2 py-1 text-xs font-black" style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary || colors.primary})`, color: text }}>{row.teamName}</span></Td>
                    <Td className="font-bold">{record(row)}</Td>
                    <Td className="text-right tabular-nums">{winPct(row)}</Td>
                    <Td className="text-right tabular-nums">{fmt(row.pointsFor)}</Td>
                    <Td className="text-right tabular-nums">{fmt(row.pointsAgainst)}</Td>
                  </tr>
                );
              })}
              {!stats.teams.length ? <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-[var(--muted)]">No games are available for this category.</td></tr> : null}
            </tbody>
          </table>
        </TableWrap>
      </div>

      <div className="grid gap-7 xl:grid-cols-3">
        <PlayerTable title="Career Points" rows={stats.career} />
        <PlayerTable title="Single-Season Points" rows={stats.seasons} />
        <PlayerTable title="Single-Game Points" rows={stats.games} />
      </div>
    </section>
  );
}

export default function StatsPostseasonView({ dataset }: { dataset: LeagueStatsDataset }) {
  const [position, setPosition] = useState('ALL');
  const positions = useMemo(() => {
    const preferred = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const available = new Set(dataset.playerGames.map((row) => row.position).filter(Boolean));
    return [...preferred.filter((value) => available.has(value)), ...Array.from(available).filter((value) => !preferred.includes(value)).sort()];
  }, [dataset.playerGames]);

  const playoffs = useMemo(() => buildCategory(dataset, 'playoffs', position), [dataset, position]);
  const toilet = useMemo(() => buildCategory(dataset, 'toilet', position), [dataset, position]);

  return (
    <main className="container mx-auto max-w-[1500px] px-4 py-8">
      <div className="mb-2 text-sm text-[var(--muted)]"><Link href="/history" className="hover:underline">History</Link> / Stats / Postseason</div>
      <div className="border-b-4 border-[var(--accent)] pb-4">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-[var(--muted)]">East v. West Reference</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Postseason Statistics</h1>
        <p className="mt-2 max-w-4xl text-sm text-[var(--muted)]">Championship playoffs and the Toilet Bowl are separate competitions. Placement games after championship-bracket elimination are excluded from both sets of records.</p>
      </div>

      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-[var(--border)]" aria-label="Statistics sections">
        {STATS_TABS.map(([label, href]) => <Link key={label} href={href} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold ${label === 'Postseason' ? 'border-[var(--accent)] text-[var(--text)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}>{label}</Link>)}
      </nav>

      <div className="mt-5 flex flex-wrap gap-2">
        {['ALL', ...positions].map((value) => <button key={value} type="button" onClick={() => setPosition(value)} className={`rounded-md border px-3 py-1.5 text-xs font-bold ${position === value ? 'border-[var(--accent)] bg-accent-soft text-accent' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'}`}>{value === 'ALL' ? 'All Positions' : value}</button>)}
      </div>

      <div className="mt-9 space-y-14">
        <CategorySection title="Championship Playoffs" subtitle="Only games on the path to the East v. West championship count here. A team eliminated in the first round receives a playoff loss and no later placement-game wins." stats={playoffs} />
        <CategorySection title="Toilet Bowl" subtitle="Only Sleeper losers-bracket games count here. Toilet Bowl wins, losses, points and player scoring never affect championship-playoff records." stats={toilet} />
      </div>
    </main>
  );
}
