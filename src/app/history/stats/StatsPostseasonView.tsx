'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { LeagueStatsDataset, StatsGameType } from '@/lib/stats/types';
import { getReadableTextForColors, getTeamColors } from '@/lib/utils/team-utils';

const TABS = [
  { id: 'overview', label: 'Overview', href: '/history/stats' },
  { id: 'players', label: 'Players', href: '/history/stats?tab=players' },
  { id: 'franchises', label: 'Franchises', href: '/history/stats?tab=franchises' },
  { id: 'seasons', label: 'Seasons', href: '/history/stats?tab=seasons' },
  { id: 'games', label: 'Games', href: '/history/stats?tab=games' },
  { id: 'postseason', label: 'Postseason', href: '/history/stats?tab=postseason' },
  { id: 'records', label: 'Records', href: '/history/stats?tab=records' },
  { id: 'explorer', label: 'Explorer', href: '/history/stats?tab=explorer' },
] as const;

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
  pf: number;
  pa: number;
  games: number;
};

type CategoryStats = {
  playerCareer: PlayerRow[];
  playerSeason: PlayerRow[];
  playerGame: PlayerRow[];
  teams: TeamRow[];
};

function fmt(value: number, digits = 1): string {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pct(row: TeamRow): string {
  if (!row.games) return 'â€”';
  return `${(((row.wins + row.ties * 0.5) / row.games) * 100).toFixed(1)}%`;
}

function record(row: TeamRow): string {
  return row.ties ? `${row.wins}-${row.losses}-${row.ties}` : `${row.wins}-${row.losses}`;
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
                <Td className="text-[var(--muted)]">{row.note || 'â€”'}</Td>
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

function FranchiseTable({ rows }: { rows: TeamRow[] }) {
  return (
    <div>
      <h3 className="mb-2 font-black text-[var(--text)]">Franchise Records</h3>
      <TableWrap>
        <table className="w-full">
          <thead><tr><Th>Rk</Th><Th>Franchise</Th><Th>Record</Th><Th className="text-right">Win %</Th><Th className="text-right">PF</Th><Th className="text-right">PA</Th></tr></thead>
          <tbody>
            {rows.map((row, index) => {
              const colors = getTeamColors(row.teamName);
              const text = getReadableTextForColors([colors.primary, colors.secondary]);
              return (
                <tr key={row.teamName}>
                  <Td>{index + 1}</Td>
                  <Td><span className="inline-flex rounded-md px-2.5 py-1 font-bold" style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary || colors.primary})`, color: text }}>{row.teamName}</span></Td>
                  <Td className="font-bold">{record(row)}</Td>
                  <Td className="text-right tabular-nums">{pct(row)}</Td>
                  <Td className="text-right tabular-nums">{fmt(row.pf)}</Td>
                  <Td className="text-right tabular-nums">{fmt(row.pa)}</Td>
                </tr>
              );
            })}
            {!rows.length ? <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-[var(--muted)]">No games are available for this category.</td></tr> : null}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

function buildCategory(dataset: LeagueStatsDataset, gameType: Extract<StatsGameType, 'playoffs' | 'toilet'>, position: string): CategoryStats {
  const games = dataset.games.filter((game) => game.gameType === gameType);
  const teamWeeks = new Set<string>();
  for (const game of games) {
    teamWeeks.add(`${game.season}|${game.week}|${game.teamA}`);
    teamWeeks.add(`${game.season}|${game.week}|${game.teamB}`);
  }

  const playerGames = dataset.playerGames.filter((row) =>
    teamWeeks.has(`${row.season}|${row.week}|${row.franchiseName}`) &&
    (position === 'ALL' || row.position === position)
  );

  const career = new Map<string, PlayerRow[];
  const seasons = new Map<string, PlayerRow>();
  for (const row of playerGames) {
    const careerRow = career.get(row.playerId) || { playerId: row.playerId, name: row.name, position: row.position, points: 0 };
    careerRow.points += row.points;
    career.set(row.playerId, careerRow);

    const seasonKey = `${row.season}|${row.playerId}`;
    const seasonRow = seasons.get(seasonKey) || { playerId: row.playerId, name: row.name, position: row.position, points: 0, note: row.season };
    seasonRow.points += row.points;
    seasons.set(seasonKey, seasonRow);
  }

  const teamMap = new Map<string, TeamRow>();
  const ensureTeam = (teamName: string) => {
    const existing = teamMap.get(teamName);
    if (existing) return existing;
    const created: TeamRow = { teamName, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, games: 0 };
    teamMap.set(teamName, created);
    return created;
  };

  for (const game of games) {
    const a = ensureTeam(game.teamA);
    const b = ensureTeam(game.teamB);
    a.games += 1;
    b.games += 1;
    a.pf += game.scoreA;
    a.pa += game.scoreB;
    b.pf += game.scoreB;
    b.pa += game.scoreA;
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

  return {
    playerCareer: Array.from(career.values()).map((row) => ({ ...row, points: Number(row.points.toFixed(2)) })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
    playerSeason: Array.from(seasons.values()).map((row) => ({ ...row, points: Number(row.points.toFixed(2)) })).sort((a, b) => b.points - a.points || String(b.note).localeCompare(String(a.note)) || a.name.localeCompare(b.name)),
    playerGame: playerGames.map((row) => ({ playerId: row.playerId, name: row.name, position: row.position, points: row.points, note: `${row.season} W${row.week} Â· ${row.franchiseName}` })).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
    teams: Array.from(teamMap.values()).sort((a, b) => b.wins - a.wins || ((b.wins + b.ties * 0.5) / Math.max(1, b.games)) - ((a.wins + a.ties * 0.5) / Math.max(1, a.games)) || b.pf - a.pf || a.teamName.localeCompare(b.teamName)),
  };
}

function CategorySection({ title, subtitle, stats }: { title: string; subtitle: string; stats: CategoryStats }) {
  return (
    <section className="space-y-5">
      <div className="border-b border-[var(--border)] pb-2">
        <h2 className="text-2xl font-black text-[var(--text)]">{title}</h2>
        <p className="mt-1 max-w-4xl text-sm text-[var(--muted)]">{subtitle}</p>
      </div>
      <FranchiseTable rows={stats.teams} />
      <div className="grid gap-7 xl:grid-cols-3">
        <PlayerTable title="Career Points" rows={stats.playerCareer} />
        <PlayerTable title="Single-Season Points" rows={stats.playerSeason} />
        <PlayerTable title="Single-Game Points" rows={stats.playerGame} />
      </div>
    </section>
  );
}

export default function StatsPostseasonView({ dataset }: { dataset: LeagueStatsDataset }) {
  const [position, setPosition] = useState('ALL');
  const positions = useMemo(() => {
    const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const available = new Set(dataset.playerGames.map((row) => row.position).filter(Boolean));
    return [...order.filter((value) => available.has(value)), ...Array.from(available).filter((value) => !order.includes(value)).sort()];
  }, [dataset.playerGames]);

  const playoffs = useMemo(() => buildCategory(dataset, 'playoffs', position), [dataset, position]);
  const toilet = useMemo(() => buildCategory(dataset, 'toilet', position), [dataset, position]);

  return (
    <main className="container mx-auto max-w-[1500px] px-4 py-8">
      <div className="mb-2 text-sm text-[var(--muted)]"><Link href="/history" className="hover:underline">History</Link> / Stats / Postseason</div>
      <div className="border-b-4 border-[var(--accent)] pb-4">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-[var(--muted)]">East v. West Reference</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--text)] sm:text-4xl">Postseason Statistics</h1>
        <p className="mt-2 max-w-4xl text-sm text-[var(--muted)]">Championship playoffs and the Toilet Bowl are tracked as separate competitions. Placement games after championship-bracket elimination are excluded from both records.</p>
      </div>

      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-[var(--border)]" aria-label="Statistics sections">
        {TABS.map((tab) => <Link key={tab.id} href={tab.href} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition-colors ${tab.id === 'postseason' ? 'border-[var(--accent)] text-[var(--text)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}>{tab.label}</Link.)}
      </nav>

      <div className="mt-6 flex flex-wrap gap-2">
        {['ALL', ...positions].map(˜[YJHOˆ]ÛˆÙ^O^İ˜[Y_H\OH˜]ÛˆˆÛÛXÚÏ^Ê
HOˆÙ]ÜÚ][ÛŠ˜[YJ_HÛ\ÜÓ˜[YO^Ø›İ[™Y[Y›Ü™\ˆLÈKLKH^^È›ÛX›Û	ÜÜÚ][ÛˆOOH˜[YHÈ	Ø›Ü™\‹Vİ˜\ŠKXXØÙ[
WH™ËXXØÙ[\ÛÙ^XXØÙ[	Èˆ	Ø›Ü™\‹Vİ˜\ŠKX›Ü™\ŠWH^Vİ˜\ŠK[]]Y
WHİ™\^Vİ˜\ŠK]^
WIßXOİ˜[YHOOH	ĞS	ÈÈ	Ğ[ÜÚ][ÛœÉÈˆ˜[Y_OØ]ÛŠ_BˆÙ]‚‚ˆ]ˆÛ\ÜÓ˜[YOH›]NÜXÙK^KLLˆ‚ˆØ]YÛÜTÙXİ[Ûˆ]OHÚ[\[ÛœÚ\^[Ù™œÈˆİX]OH“Û›HØ[Y\ÈÛˆHÚ[\[ÛœÚ\]Ûİ[\™Kˆš\œİ\›İ[™ÜÜÙ\ËÙ[ZYš[˜[È[™HÚ[\[ÛœÚ\Ûİ[È]\ˆXÙ[Y[Ø[Y\ÈÈ›İˆÚ[]›İÛØ[Y\È\™HÛÛ\][HÙ\\˜]Kˆˆİ]Ï^Ü^[Ù™œßHÏ‚ˆØ]YÛÜTÙXİ[Ûˆ]OH•Ú[]›İÛˆİX]OH“Û›HØ[Y\Èœ›ÛHÛY\\‰ÜÈÜÙ\œÈœ˜XÚÙ]Ûİ[\™KˆÚ[]›İÛÚ[œÈ[™ÜÜÙ\È™]™\ˆY™™Xİ^[Ù™ˆ™XÛÜ™Ë^[Ù™ˆÚ[ˆ\˜Ù[YÙHÜˆ^[Ù™ˆ^Y\ˆØÛÜš[™Ëˆˆİ]Ï^İÚ[]HÏ‚ˆÙ]‚ˆÛXZ[‚ˆ
NÂŸB