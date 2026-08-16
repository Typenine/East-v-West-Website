'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo } from 'react';
import Modal from '@/components/ui/Modal';
import Tabs from '@/components/ui/Tabs';
import { getReadableTextForColors, getTeamColors, getTeamLogoPath } from '@/lib/utils/team-utils';
import type { LeagueStatsDataset, StatsFranchiseRow, StatsGameRow } from '@/lib/stats/types';

function fmt(value: number, digits = 1): string {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pct(value: number): string {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function recordString(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function gameTypeLabel(type: StatsGameRow['gameType']): string {
  if (type === 'regular') return 'Regular';
  if (type === 'playoffs') return 'Playoffs';
  if (type === 'toilet') return 'Toilet';
  return 'Postseason';
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
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-xl font-black tabular-nums text-[var(--text)]">{value}</div>
      {note ? <div className="mt-1 text-xs text-[var(--muted)]">{note}</div> : null}
    </div>
  );
}

export default function FranchiseStatsModal({
  dataset,
  franchise,
  open,
  onClose,
}: {
  dataset: LeagueStatsDataset;
  franchise: StatsFranchiseRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const detail = useMemo(() => {
    if (!franchise) return null;
    const teamName = franchise.teamName;
    const seasons = dataset.seasonTeams
      .filter((row) => row.teamName === teamName)
      .sort((a, b) => b.season.localeCompare(a.season));
    const games = dataset.games
      .filter((game) => game.teamA === teamName || game.teamB === teamName)
      .sort((a, b) => b.season.localeCompare(a.season) || b.week - a.week);
    const players = dataset.players
      .map((player) => {
        const split = player.franchises.find((row) => row.teamName === teamName);
        return split ? { ...player, franchiseSplit: split } : null;
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => b.franchiseSplit.points - a.franchiseSplit.points || a.name.localeCompare(b.name));

    const teamScores = games.map((game) => {
      const isA = game.teamA === teamName;
      const points = isA ? game.scoreA : game.scoreB;
      const opponentPoints = isA ? game.scoreB : game.scoreA;
      const opponent = isA ? game.teamB : game.teamA;
      return {
        ...game,
        points,
        opponentPoints,
        opponent,
        won: game.winner === teamName,
        lost: game.loser === teamName,
      };
    });

    const highest = [...teamScores].sort((a, b) => b.points - a.points)[0];
    const lowest = [...teamScores].sort((a, b) => a.points - b.points)[0];
    const biggestWin = [...teamScores].filter((row) => row.won).sort((a, b) => b.margin - a.margin)[0];
    const biggestLoss = [...teamScores].filter((row) => row.lost).sort((a, b) => b.margin - a.margin)[0];
    const closestWin = [...teamScores].filter((row) => row.won).sort((a, b) => a.margin - b.margin)[0];
    const pointsInLoss = [...teamScores].filter((row) => row.lost).sort((a, b) => b.points - a.points)[0];
    const bestSeason = [...seasons].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins || b.pointsFor - a.pointsFor)[0];

    const h2hMap = new Map<string, { opponent: string; wins: number; losses: number; ties: number; pf: number; pa: number }>();
    for (const row of teamScores) {
      const current = h2hMap.get(row.opponent) || { opponent: row.opponent, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 };
      if (row.tie) current.ties += 1;
      else if (row.won) current.wins += 1;
      else current.losses += 1;
      current.pf += row.points;
      current.pa += row.opponentPoints;
      h2hMap.set(row.opponent, current);
    }
    const headToHead = Array.from(h2hMap.values()).sort((a, b) => (b.wins + b.losses + b.ties) - (a.wins + a.losses + a.ties) || a.opponent.localeCompare(b.opponent));

    return { seasons, games: teamScores, players, highest, lowest, biggestWin, biggestLoss, closestWin, pointsInLoss, bestSeason, headToHead };
  }, [dataset, franchise]);

  if (!franchise || !detail) return null;

  const colors = getTeamColors(franchise.teamName);
  const headerText = getReadableTextForColors([colors.primary, colors.secondary]);
  const logo = getTeamLogoPath(franchise.teamName);
  const gamesPlayed = franchise.regularWins + franchise.regularLosses + franchise.regularTies;

  const overview = (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Regular Season" value={recordString(franchise.regularWins, franchise.regularLosses, franchise.regularTies)} note={`${pct(franchise.regularWinPct)} win rate`} />
        <Stat label="Points For" value={fmt(franchise.regularPointsFor, 1)} note={gamesPlayed ? `${fmt(franchise.avgScore, 1)} per game` : undefined} />
        <Stat label="Playoffs" value={recordString(franchise.playoffWins, franchise.playoffLosses, franchise.playoffTies)} note={`${franchise.championshipAppearances} title-game appearance${franchise.championshipAppearances === 1 ? '' : 's'}`} />
        <Stat label="Championships" value={franchise.titles} note={franchise.bestSeason ? `Best season: ${franchise.bestSeason}` : undefined} />
      </div>

      <div>
        <h4 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Head-to-Head</h4>
        <TableWrap>
          <table className="w-full">
            <thead><tr><Th>Opponent</Th><Th>Record</Th><Th className="text-right">PF</Th><Th className="text-right">PA</Th><Th className="text-right">Diff</Th></tr></thead>
            <tbody>{detail.headToHead.map((row) => <tr key={row.opponent}><Td className="font-semibold">{row.opponent}</Td><Td>{recordString(row.wins, row.losses, row.ties)}</Td><Td className="text-right tabular-nums">{fmt(row.pf)}</Td><Td className="text-right tabular-nums">{fmt(row.pa)}</Td><Td className="text-right tabular-nums">{fmt(row.pf - row.pa)}</Td></tr>)}</tbody>
          </table>
        </TableWrap>
      </div>
    </div>
  );

  const seasons = (
    <TableWrap>
      <table className="w-full">
        <thead><tr><Th>Season</Th><Th>Record</Th><Th className="text-right">Win %</Th><Th className="text-right">PF</Th><Th className="text-right">PA</Th><Th className="text-right">Avg</Th><Th>Finish</Th></tr></thead>
        <tbody>{detail.seasons.map((row) => {
          const champion = dataset.champions[row.season];
          const finish = champion?.champion === franchise.teamName ? 'Champion' : champion?.runnerUp === franchise.teamName ? 'Runner-up' : champion?.thirdPlace === franchise.teamName ? '3rd' : '—';
          return <tr key={row.season}><Td className="font-semibold">{row.season}</Td><Td>{recordString(row.wins, row.losses, row.ties)}</Td><Td className="text-right">{pct(row.winPct)}</Td><Td className="text-right tabular-nums">{fmt(row.pointsFor)}</Td><Td className="text-right tabular-nums">{fmt(row.pointsAgainst)}</Td><Td className="text-right tabular-nums">{fmt(row.avgScore)}</Td><Td>{finish}</Td></tr>;
        })}</tbody>
      </table>
    </TableWrap>
  );

  const players = (
    <TableWrap>
      <table className="w-full">
        <thead><tr><Th>Rk</Th><Th>Player</Th><Th>Pos</Th><Th className="text-right">Wks</Th><Th className="text-right">Starts</Th><Th className="text-right">Pts</Th><Th className="text-right">Pts/Wk</Th></tr></thead>
        <tbody>{detail.players.slice(0, 100).map((row, index) => <tr key={row.playerId}><Td>{index + 1}</Td><Td><Link href={`/players/${row.playerId}`} className="font-semibold text-[var(--accent)] hover:underline">{row.name}</Link></Td><Td>{row.position}</Td><Td className="text-right tabular-nums">{row.franchiseSplit.rosteredWeeks}</Td><Td className="text-right tabular-nums">{row.franchiseSplit.starts}</Td><Td className="text-right font-semibold tabular-nums">{fmt(row.franchiseSplit.points)}</Td><Td className="text-right tabular-nums">{row.franchiseSplit.rosteredWeeks ? fmt(row.franchiseSplit.points / row.franchiseSplit.rosteredWeeks) : '—'}</Td></tr>)}</tbody>
      </table>
    </TableWrap>
  );

  const games = (
    <TableWrap>
      <table className="w-full">
        <thead><tr><Th>Season</Th><Th>Week</Th><Th>Type</Th><Th>Result</Th><Th>Opponent</Th><Th className="text-right">PF</Th><Th className="text-right">PA</Th><Th className="text-right">Margin</Th></tr></thead>
        <tbody>{detail.games.map((row) => <tr key={row.id}><Td>{row.season}</Td><Td>{row.week}</Td><Td>{gameTypeLabel(row.gameType)}</Td><Td className={row.won ? 'font-bold' : row.lost ? '' : 'font-semibold'}>{row.tie ? 'T' : row.won ? 'W' : 'L'}</Td><Td>{row.opponent}</Td><Td className="text-right tabular-nums">{fmt(row.points, 2)}</Td><Td className="text-right tabular-nums">{fmt(row.opponentPoints, 2)}</Td><Td className="text-right tabular-nums">{fmt(row.margin, 2)}</Td></tr>)}</tbody>
      </table>
    </TableWrap>
  );

  const records = (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Stat label="Highest Score" value={detail.highest ? fmt(detail.highest.points, 2) : '—'} note={detail.highest ? `${detail.highest.season} W${detail.highest.week} vs. ${detail.highest.opponent}` : undefined} />
      <Stat label="Lowest Score" value={detail.lowest ? fmt(detail.lowest.points, 2) : '—'} note={detail.lowest ? `${detail.lowest.season} W${detail.lowest.week} vs. ${detail.lowest.opponent}` : undefined} />
      <Stat label="Biggest Win" value={detail.biggestWin ? fmt(detail.biggestWin.margin, 2) : '—'} note={detail.biggestWin ? `${detail.biggestWin.season} W${detail.biggestWin.week} vs. ${detail.biggestWin.opponent}` : undefined} />
      <Stat label="Biggest Loss" value={detail.biggestLoss ? fmt(detail.biggestLoss.margin, 2) : '—'} note={detail.biggestLoss ? `${detail.biggestLoss.season} W${detail.biggestLoss.week} vs. ${detail.biggestLoss.opponent}` : undefined} />
      <Stat label="Closest Win" value={detail.closestWin ? fmt(detail.closestWin.margin, 2) : '—'} note={detail.closestWin ? `${detail.closestWin.season} W${detail.closestWin.week} vs. ${detail.closestWin.opponent}` : undefined} />
      <Stat label="Most Points in Loss" value={detail.pointsInLoss ? fmt(detail.pointsInLoss.points, 2) : '—'} note={detail.pointsInLoss ? `${detail.pointsInLoss.season} W${detail.pointsInLoss.week} vs. ${detail.pointsInLoss.opponent}` : undefined} />
      <Stat label="Best Season" value={detail.bestSeason ? recordString(detail.bestSeason.wins, detail.bestSeason.losses, detail.bestSeason.ties) : '—'} note={detail.bestSeason ? `${detail.bestSeason.season} · ${fmt(detail.bestSeason.pointsFor)} PF` : undefined} />
      <Stat label="Career Scoring Leader" value={detail.players[0] ? fmt(detail.players[0].franchiseSplit.points) : '—'} note={detail.players[0]?.name} />
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={`${franchise.teamName} · Stats Reference`} size="2xl">
      <div className="space-y-4">
        <div className="flex items-center gap-4 rounded-xl p-4" style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary || colors.primary})`, color: headerText }}>
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white/90 p-1">
            <Image src={logo} alt={`${franchise.teamName} logo`} fill sizes="64px" className="object-contain p-1" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-[0.18em] opacity-80">East v. West Franchise Reference</div>
            <h3 className="truncate text-2xl font-black">{franchise.teamName}</h3>
            <div className="mt-1 text-sm font-semibold opacity-90">{franchise.firstSeason === franchise.lastSeason ? franchise.firstSeason : `${franchise.firstSeason}–${franchise.lastSeason}`} · {gamesPlayed} regular-season games</div>
          </div>
        </div>

        <Tabs
          lazyPanels
          lazyMode="mount-once"
          tabs={[
            { id: 'overview', label: 'Overview', content: overview },
            { id: 'seasons', label: 'Seasons', content: seasons },
            { id: 'players', label: 'Players', content: players },
            { id: 'games', label: 'Games', content: games },
            { id: 'records', label: 'Records', content: records },
          ]}
        />

        {franchise.currentRosterId != null ? (
          <div className="border-t border-[var(--border)] pt-3">
            <Link href={`/teams/${franchise.currentRosterId}`} className="text-sm font-semibold text-[var(--accent)] hover:underline">View full team page →</Link>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
