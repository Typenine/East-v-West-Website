'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FranchiseStatsModal from './FranchiseStatsModal';
import WeeklyScorebook from './WeeklyScorebook';
import AdvancedStatsExplorer from './AdvancedStatsExplorer';
import type {
  LeagueStatsDataset,
  StatsFranchiseRow,
  StatsGameRow,
} from '@/lib/stats/types';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'players', label: 'Players' },
  { id: 'franchises', label: 'Franchises' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'games', label: 'Games' },
  { id: 'records', label: 'Records' },
  { id: 'explorer', label: 'Explorer' },
] as const;

type TabId = (typeof TABS)[number]['id'];
type PlayerSort = 'points' | 'starts' | 'ppg' | 'bestSeasonPoints' | 'bestGamePoints' | 'name';
type FranchiseSort = 'regularWins' | 'regularWinPct' | 'regularPointsFor' | 'avgScore' | 'playoffWins' | 'titles';
type SortDirection = 'asc' | 'desc';

function fmt(value: number, digits = 2): string {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pct(value: number): string {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function recordString(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

function yearRange(first: string, last: string): string {
  if (!first && !last) return '—';
  return first === last ? first : `${first}–${last}`;
}

function gameTypeLabel(type: StatsGameRow['gameType']): string {
  if (type === 'regular') return 'Regular';
  if (type === 'playoffs') return 'Playoffs';
  if (type === 'toilet') return 'Toilet';
  return 'Postseason';
}

function ReferenceSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="border-b border-[var(--border)] pb-2">
        <h2 className="text-xl font-bold text-[var(--text)]">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">{children}</div>;
}

function HeaderCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--muted)] ${className}`}>{children}</th>;
}

function Cell({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td title={title} className={`whitespace-nowrap border-b border-[var(--border)] px-3 py-2 align-middle text-sm text-[var(--text)] ${className}`}>{children}</td>;
}

function SortHeader({ label, active, direction, onClick, align = 'right' }: { label: string; active: boolean; direction: SortDirection; onClick: () => void; align?: 'left' | 'right' }) {
  return (
    <HeaderCell className={align === 'right' ? 'text-right' : ''}>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-[var(--text)]">
        {label}{active ? <span aria-hidden="true">{direction === 'desc' ? '↓' : '↑'}</span> : null}
      </button>
    </HeaderCell>
  );
}

function PlayerLink({ playerId, name }: { playerId: string; name: string }) {
  return <Link href={`/players/${playerId}`} className="font-semibold text-[var(--accent)] hover:underline">{name}</Link>;
}

function FranchiseButton({ franchise, onOpen }: { franchise: StatsFranchiseRow; onOpen: (franchise: StatsFranchiseRow) => void }) {
  return <button type="button" onClick={() => onOpen(franchise)} className="text-left font-semibold text-[var(--accent)] hover:underline">{franchise.teamName}</button>;
}

function NamedFranchiseButton({ name, franchises, onOpen }: { name: string; franchises: StatsFranchiseRow[]; onOpen: (franchise: StatsFranchiseRow) => void }) {
  const franchise = franchises.find((row) => row.teamName === name);
  if (!franchise) return <span className="font-semibold">{name}</span>;
  return <FranchiseButton franchise={franchise} onOpen={onOpen} />;
}

export default function StatsReferenceClient({ dataset }: { dataset: LeagueStatsDataset }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'overview';
  const activeTab: TabId = TABS.some((tab) => tab.id === requestedTab) ? requestedTab as TabId : 'overview';

  const [selectedFranchise, setSelectedFranchise] = useState<StatsFranchiseRow | null>(null);
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerPosition, setPlayerPosition] = useState('ALL');
  const [playerFranchise, setPlayerFranchise] = useState('ALL');
  const [playerSort, setPlayerSort] = useState<PlayerSort>('points');
  const [playerDirection, setPlayerDirection] = useState<SortDirection>('desc');
  const [franchiseSort, setFranchiseSort] = useState<FranchiseSort>('regularWins');
  const [franchiseDirection, setFranchiseDirection] = useState<SortDirection>('desc');
  const defaultSeason = dataset.latestSeasonWithGames || dataset.seasons[0] || '';
  const [season, setSeason] = useState(defaultSeason);
  const [seasonPosition, setSeasonPosition] = useState('ALL');
  const [gameSeason, setGameSeason] = useState('ALL');
  const [gameTeam, setGameTeam] = useState('ALL');
  const [gameType, setGameType] = useState('ALL');

  const positions = useMemo(() => {
    const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const available = new Set(dataset.players.map((row) => row.position).filter(Boolean));
    return [...order.filter((position) => available.has(position)), ...Array.from(available).filter((position) => !order.includes(position)).sort()];
  }, [dataset.players]);

  const franchiseNames = useMemo(() => dataset.franchises.map((row) => row.teamName).sort(), [dataset.franchises]);

  const setTab = (tab: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'overview') params.delete('tab');
    else params.set('tab', tab);
    const query = params.toString();
    router.replace(query ? `/history/stats?${query}` : '/history/stats', { scroll: false });
  };

  const togglePlayerSort = (key: PlayerSort) => {
    if (playerSort === key) setPlayerDirection((direction) => direction === 'desc' ? 'asc' : 'desc');
    else {
      setPlayerSort(key);
      setPlayerDirection(key === 'name' ? 'asc' : 'desc');
    }
  };

  const toggleFranchiseSort = (key: FranchiseSort) => {
    if (franchiseSort === key) setFranchiseDirection((direction) => direction === 'desc' ? 'asc' : 'desc');
    else {
      setFranchiseSort(key);
      setFranchiseDirection('desc');
    }
  };

  const filteredPlayers = useMemo(() => {
    const search = playerSearch.trim().toLowerCase();
    const rows = dataset.players.filter((row) => {
      if (playerPosition !== 'ALL' && row.position !== playerPosition) return false;
      if (playerFranchise !== 'ALL' && !row.franchises.some((split) => split.teamName === playerFranchise)) return false;
      if (search && !`${row.name} ${row.position} ${row.nflTeam || ''} ${row.franchises.map((split) => split.teamName).join(' ')}`.toLowerCase().includes(search)) return false;
      return true;
    });
    const direction = playerDirection === 'desc' ? -1 : 1;
    return rows.sort((a, b) => {
      if (playerSort === 'name') return direction * a.name.localeCompare(b.name);
      const av = Number(a[playerSort] ?? -Infinity);
      const bv = Number(b[playerSort] ?? -Infinity);
      return direction * (av - bv) || a.name.localeCompare(b.name);
    });
  }, [dataset.players, playerDirection, playerFranchise, playerPosition, playerSearch, playerSort]);

  const sortedFranchises = useMemo(() => {
    const direction = franchiseDirection === 'desc' ? -1 : 1;
    return [...dataset.franchises].sort((a, b) => {
      const av = Number(a[franchiseSort] ?? 0);
      const bv = Number(b[franchiseSort] ?? 0);
      return direction * (av - bv) || a.teamName.localeCompare(b.teamName);
    });
  }, [dataset.franchises, franchiseDirection, franchiseSort]);

  const seasonTeams = useMemo(() => dataset.seasonTeams.filter((row) => row.season === season), [dataset.seasonTeams, season]);
  const seasonPlayers = useMemo(() => dataset.playerSeasons
    .filter((row) => row.season === season && (seasonPosition === 'ALL' || row.position === seasonPosition))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)), [dataset.playerSeasons, season, seasonPosition]);
  const seasonGames = useMemo(() => dataset.games.filter((row) => row.season === season), [dataset.games, season]);

  const filteredGames = useMemo(() => dataset.games.filter((row) => {
    if (gameSeason !== 'ALL' && row.season !== gameSeason) return false;
    if (gameTeam !== 'ALL' && row.teamA !== gameTeam && row.teamB !== gameTeam) return false;
    if (gameType !== 'ALL' && row.gameType !== gameType) return false;
    return true;
  }), [dataset.games, gameSeason, gameTeam, gameType]);

  const latestSeasonRows = useMemo(() => dataset.playerSeasons
    .filter((row) => row.season === dataset.latestSeasonWithGames)
    .sort((a, b) => b.points - a.points)
    .slice(0, 10), [dataset.latestSeasonWithGames, dataset.playerSeasons]);

  return (
    <div className="container mx-auto max-w-[1500px] px-4 py-8">
      <div className="mb-2 text-sm text-[var(--muted)]"><Link href="/history" className="hover:text-[var(--text)] hover:underline">History</Link> / Stats</div>
      <div className="border-b-4 border-[var(--accent)] pb-4">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-[var(--muted)]">East v. West Reference</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--text)] sm:text-4xl">League Statistics</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Complete East v. West player, franchise, season, game and record-book statistics{dataset.latestSeasonWithGames ? ` through the ${dataset.latestSeasonWithGames} season` : ''}.</p>
      </div>

      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-[var(--border)]" aria-label="Statistics sections">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setTab(tab.id)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition-colors ${activeTab === tab.id ? 'border-[var(--accent)] text-[var(--text)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}>
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="mt-7 space-y-8">
        {activeTab === 'overview' ? (
          <>
            <ReferenceSection title="Reference Index" subtitle="Start with a database or jump directly into a deeper reference tool.">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['players', 'Player Index', 'Career, season, game-log and franchise-attributed player statistics'],
                  ['franchises', 'Franchise Index', 'All-time records plus drill-down franchise reference profiles'],
                  ['seasons', 'Season Index', 'Year-by-year standings, leaders and weekly scorebooks'],
                  ['games', 'Game Index', 'Every scored matchup with season and franchise filters'],
                  ['records', 'Record Book', 'Ranked records, milestone leaderboards and record progression'],
                  ['explorer', 'Stats Explorer', 'Build custom career, player-season and game queries'],
                ].map(([id, title, description]) => (
                  <button key={id} type="button" onClick={() => setTab(id as TabId)} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-left hover:bg-[var(--surface-strong)]">
                    <div className="font-bold text-[var(--accent)]">{title}</div>
                    <div className="mt-1 text-sm text-[var(--muted)]">{description}</div>
                  </button>
                ))}
              </div>
            </ReferenceSection>

            <div className="grid gap-8 xl:grid-cols-2">
              <ReferenceSection title="All-Time Player Leaders" subtitle="East v. West points scored while rostered by a league franchise.">
                <TableWrap>
                  <table className="w-full"><thead><tr><HeaderCell>Rk</HeaderCell><HeaderCell>Player</HeaderCell><HeaderCell>Pos</HeaderCell><HeaderCell className="text-right">Pts</HeaderCell><HeaderCell className="text-right">Starts</HeaderCell></tr></thead>
                    <tbody>{dataset.players.slice(0, 10).map((row, index) => <tr key={row.playerId}><Cell>{index + 1}</Cell><Cell><PlayerLink playerId={row.playerId} name={row.name} /></Cell><Cell>{row.position}</Cell><Cell className="text-right font-semibold tabular-nums">{fmt(row.points, 1)}</Cell><Cell className="text-right tabular-nums">{row.starts}</Cell></tr>)}</tbody></table>
                </TableWrap>
              </ReferenceSection>

              <ReferenceSection title="All-Time Franchise Leaders" subtitle="Click a franchise for its statistical reference profile.">
                <TableWrap>
                  <table className="w-full"><thead><tr><HeaderCell>Rk</HeaderCell><HeaderCell>Franchise</HeaderCell><HeaderCell className="text-right">W</HeaderCell><HeaderCell className="text-right">Pct</HeaderCell><HeaderCell className="text-right">PF</HeaderCell><HeaderCell className="text-right">Titles</HeaderCell></tr></thead>
                    <tbody>{dataset.franchises.slice(0, 10).map((row, index) => <tr key={row.teamName}><Cell>{index + 1}</Cell><Cell><FranchiseButton franchise={row} onOpen={setSelectedFranchise} /></Cell><Cell className="text-right tabular-nums">{row.regularWins}</Cell><Cell className="text-right tabular-nums">{pct(row.regularWinPct)}</Cell><Cell className="text-right tabular-nums">{fmt(row.regularPointsFor, 1)}</Cell><Cell className="text-right tabular-nums">{row.titles}</Cell></tr>)}</tbody></table>
                </TableWrap>
              </ReferenceSection>
            </div>

            {dataset.latestSeasonWithGames ? (
              <ReferenceSection title={`${dataset.latestSeasonWithGames} Player Leaders`} subtitle="Most recent season with completed East v. West scoring.">
                <TableWrap>
                  <table className="w-full"><thead><tr><HeaderCell>Rk</HeaderCell><HeaderCell>Player</HeaderCell><HeaderCell>Pos</HeaderCell><HeaderCell>Franchise</HeaderCell><HeaderCell className="text-right">Pts</HeaderCell><HeaderCell className="text-right">PPG</HeaderCell></tr></thead>
                    <tbody>{latestSeasonRows.map((row, index) => <tr key={`${row.season}-${row.playerId}`}><Cell>{index + 1}</Cell><Cell><PlayerLink playerId={row.playerId} name={row.name} /></Cell><Cell>{row.position}</Cell><Cell>{row.franchises.map((split) => split.teamName).join(' / ')}</Cell><Cell className="text-right font-semibold tabular-nums">{fmt(row.points, 1)}</Cell><Cell className="text-right tabular-nums">{fmt(row.ppg, 1)}</Cell></tr>)}</tbody></table>
                </TableWrap>
              </ReferenceSection>
            ) : null}
          </>
        ) : null}

        {activeTab === 'players' ? (
          <ReferenceSection title="Player Index" subtitle={`${filteredPlayers.length.toLocaleString()} players in the current result set. Normal player clicks open the profile modal, which now includes a weekly EVW game log.`}>
            <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-4">
              <label className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Search<input value={playerSearch} onChange={(event) => setPlayerSearch(event.target.value)} placeholder="Player or team" className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]" /></label>
              <label className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Position<select value={playerPosition} onChange={(event) => setPlayerPosition(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]"><option value="ALL">All Positions</option>{positions.map((position) => <option key={position} value={position}>{position}</option>)}</select></label>
              <label className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Franchise<select value={playerFranchise} onChange={(event) => setPlayerFranchise(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]"><option value="ALL">All Franchises</option>{franchiseNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
              <div className="flex items-end"><button type="button" onClick={() => { setPlayerSearch(''); setPlayerPosition('ALL'); setPlayerFranchise('ALL'); }} className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-strong)]">Reset filters</button></div>
            </div>
            <TableWrap>
              <table className="w-full">
                <thead><tr><HeaderCell>Rk</HeaderCell><SortHeader label="Player" active={playerSort === 'name'} direction={playerDirection} onClick={() => togglePlayerSort('name')} align="left" /><HeaderCell>Pos</HeaderCell><HeaderCell>Years</HeaderCell><HeaderCell className="text-right">Teams</HeaderCell><HeaderCell className="text-right">Wks</HeaderCell><SortHeader label="Starts" active={playerSort === 'starts'} direction={playerDirection} onClick={() => togglePlayerSort('starts')} /><SortHeader label="Pts" active={playerSort === 'points'} direction={playerDirection} onClick={() => togglePlayerSort('points')} /><SortHeader label="PPG" active={playerSort === 'ppg'} direction={playerDirection} onClick={() => togglePlayerSort('ppg')} /><SortHeader label="Best Season" active={playerSort === 'bestSeasonPoints'} direction={playerDirection} onClick={() => togglePlayerSort('bestSeasonPoints')} /><SortHeader label="Best Game" active={playerSort === 'bestGamePoints'} direction={playerDirection} onClick={() => togglePlayerSort('bestGamePoints')} /></tr></thead>
                <tbody>{filteredPlayers.map((row, index) => <tr key={row.playerId}><Cell>{index + 1}</Cell><Cell><PlayerLink playerId={row.playerId} name={row.name} /></Cell><Cell>{row.position}</Cell><Cell>{yearRange(row.firstSeason, row.lastSeason)}</Cell><Cell className="text-right" title={row.franchises.map((split) => split.teamName).join(', ')}>{row.franchises.length}</Cell><Cell className="text-right tabular-nums">{row.rosteredWeeks}</Cell><Cell className="text-right tabular-nums">{row.starts}</Cell><Cell className="text-right font-semibold tabular-nums">{fmt(row.points, 1)}</Cell><Cell className="text-right tabular-nums">{fmt(row.ppg, 1)}</Cell><Cell className="text-right tabular-nums">{row.bestSeasonPoints == null ? '—' : `${fmt(row.bestSeasonPoints, 1)} (${row.bestSeason})`}</Cell><Cell className="text-right tabular-nums">{row.bestGamePoints == null ? '—' : `${fmt(row.bestGamePoints, 1)} (${row.bestGameSeason} W${row.bestGameWeek})`}</Cell></tr>)}</tbody>
              </table>
            </TableWrap>
          </ReferenceSection>
        ) : null}

        {activeTab === 'franchises' ? (
          <ReferenceSection title="Franchise Index" subtitle="All-time regular-season, playoff and championship statistics. Click any franchise for seasons, players, games, head-to-head and team records.">
            <TableWrap>
              <table className="w-full">
                <thead><tr><HeaderCell>Franchise</HeaderCell><HeaderCell>Years</HeaderCell><HeaderCell>Record</HeaderCell><SortHeader label="Win %" active={franchiseSort === 'regularWinPct'} direction={franchiseDirection} onClick={() => toggleFranchiseSort('regularWinPct')} /><SortHeader label="Wins" active={franchiseSort === 'regularWins'} direction={franchiseDirection} onClick={() => toggleFranchiseSort('regularWins')} /><SortHeader label="PF" active={franchiseSort === 'regularPointsFor'} direction={franchiseDirection} onClick={() => toggleFranchiseSort('regularPointsFor')} /><HeaderCell className="text-right">PA</HeaderCell><SortHeader label="Avg" active={franchiseSort === 'avgScore'} direction={franchiseDirection} onClick={() => toggleFranchiseSort('avgScore')} /><HeaderCell>Playoff</HeaderCell><SortHeader label="PO W" active={franchiseSort === 'playoffWins'} direction={franchiseDirection} onClick={() => toggleFranchiseSort('playoffWins')} /><SortHeader label="Titles" active={franchiseSort === 'titles'} direction={franchiseDirection} onClick={() => toggleFranchiseSort('titles')} /><HeaderCell className="text-right">Apps</HeaderCell><HeaderCell>Best Season</HeaderCell></tr></thead>
                <tbody>{sortedFranchises.map((row) => <tr key={row.teamName}><Cell><FranchiseButton franchise={row} onOpen={setSelectedFranchise} /></Cell><Cell>{yearRange(row.firstSeason, row.lastSeason)}</Cell><Cell>{recordString(row.regularWins, row.regularLosses, row.regularTies)}</Cell><Cell className="text-right tabular-nums">{pct(row.regularWinPct)}</Cell><Cell className="text-right tabular-nums">{row.regularWins}</Cell><Cell className="text-right tabular-nums">{fmt(row.regularPointsFor, 1)}</Cell><Cell className="text-right tabular-nums">{fmt(row.regularPointsAgainst, 1)}</Cell><Cell className="text-right tabular-nums">{fmt(row.avgScore, 1)}</Cell><Cell>{recordString(row.playoffWins, row.playoffLosses, row.playoffTies)}</Cell><Cell className="text-right tabular-nums">{row.playoffWins}</Cell><Cell className="text-right font-semibold tabular-nums">{row.titles}</Cell><Cell className="text-right tabular-nums">{row.championshipAppearances}</Cell><Cell>{row.bestSeason ? `${row.bestSeason} (${row.bestSeasonWins}-${row.bestSeasonLosses})` : '—'}</Cell></tr>)}</tbody>
              </table>
            </TableWrap>
          </ReferenceSection>
        ) : null}

        {activeTab === 'seasons' ? (
          <>
            <ReferenceSection title="Season Index" subtitle="Choose a year for its standings, player leaders, game summary and weekly scorebook.">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <label className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Season<select value={season} onChange={(event) => setSeason(event.target.value)} className="ml-2 rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]">{dataset.seasons.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                {dataset.champions[season] ? <div className="text-sm text-[var(--muted)]"><span className="font-semibold text-[var(--text)]">Champion:</span> {dataset.champions[season].champion}</div> : null}
              </div>
            </ReferenceSection>

            <ReferenceSection title={`${season} Standings`} subtitle="Regular-season results only.">
              <TableWrap><table className="w-full"><thead><tr><HeaderCell>Rk</HeaderCell><HeaderCell>Franchise</HeaderCell><HeaderCell>W</HeaderCell><HeaderCell>L</HeaderCell><HeaderCell>T</HeaderCell><HeaderCell className="text-right">Pct</HeaderCell><HeaderCell className="text-right">PF</HeaderCell><HeaderCell className="text-right">PA</HeaderCell><HeaderCell className="text-right">Avg</HeaderCell></tr></thead><tbody>{seasonTeams.map((row, index) => <tr key={`${row.season}-${row.teamName}`}><Cell>{index + 1}</Cell><Cell><NamedFranchiseButton name={row.teamName} franchises={dataset.franchises} onOpen={setSelectedFranchise} /></Cell><Cell>{row.wins}</Cell><Cell>{row.losses}</Cell><Cell>{row.ties}</Cell><Cell className="text-right">{pct(row.winPct)}</Cell><Cell className="text-right tabular-nums">{fmt(row.pointsFor, 1)}</Cell><Cell className="text-right tabular-nums">{fmt(row.pointsAgainst, 1)}</Cell><Cell className="text-right tabular-nums">{fmt(row.avgScore, 1)}</Cell></tr>)}</tbody></table></TableWrap>
            </ReferenceSection>

            <ReferenceSection title={`${season} Player Leaders`} subtitle="Sortable season production remains available in Explorer; this table is the quick top-100 reference.">
              <div className="mb-3 flex flex-wrap gap-2">{['ALL', ...positions].map((position) => <button key={position} type="button" onClick={() => setSeasonPosition(position)} className={`rounded-md border px-3 py-1.5 text-xs font-bold ${seasonPosition === position ? 'border-[var(--accent)] bg-accent-soft text-accent' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'}`}>{position === 'ALL' ? 'All' : position}</button>)}</div>
              <TableWrap><table className="w-full"><thead><tr><HeaderCell>Rk</HeaderCell><HeaderCell>Player</HeaderCell><HeaderCell>Pos</HeaderCell><HeaderCell>Franchise</HeaderCell><HeaderCell className="text-right">Wks</HeaderCell><HeaderCell className="text-right">Starts</HeaderCell><HeaderCell className="text-right">Pts</HeaderCell><HeaderCell className="text-right">PPG</HeaderCell><HeaderCell className="text-right">Best Game</HeaderCell></tr></thead><tbody>{seasonPlayers.slice(0, 100).map((row, index) => <tr key={`${row.season}-${row.playerId}`}><Cell>{index + 1}</Cell><Cell><PlayerLink playerId={row.playerId} name={row.name} /></Cell><Cell>{row.position}</Cell><Cell>{row.franchises.map((split) => split.teamName).join(' / ')}</Cell><Cell className="text-right">{row.rosteredWeeks}</Cell><Cell className="text-right">{row.starts}</Cell><Cell className="text-right font-semibold tabular-nums">{fmt(row.points, 1)}</Cell><Cell className="text-right tabular-nums">{fmt(row.ppg, 1)}</Cell><Cell className="text-right tabular-nums">{row.bestGamePoints == null ? '—' : `${fmt(row.bestGamePoints, 1)} W${row.bestGameWeek}`}</Cell></tr>)}</tbody></table></TableWrap>
            </ReferenceSection>

            <ReferenceSection title={`${season} Game Summary`} subtitle={`${seasonGames.length} completed East v. West matchups in the dataset.`}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(() => {
                  const highest = [...seasonGames].sort((a, b) => b.combined - a.combined)[0];
                  const biggest = [...seasonGames].filter((game) => !game.tie).sort((a, b) => b.margin - a.margin)[0];
                  const closest = [...seasonGames].filter((game) => !game.tie).sort((a, b) => a.margin - b.margin)[0];
                  const teamScores = seasonGames.flatMap((game) => [{ team: game.teamA, points: game.scoreA, week: game.week }, { team: game.teamB, points: game.scoreB, week: game.week }]);
                  const topTeam = [...teamScores].sort((a, b) => b.points - a.points)[0];
                  return [
                    ['Highest Combined', highest ? `${fmt(highest.combined, 1)}` : '—', highest ? `${highest.teamA} vs. ${highest.teamB}, W${highest.week}` : 'No games'],
                    ['Biggest Win', biggest ? `${fmt(biggest.margin, 1)}` : '—', biggest ? `${biggest.winner} over ${biggest.loser}, W${biggest.week}` : 'No games'],
                    ['Closest Win', closest ? `${fmt(closest.margin, 2)}` : '—', closest ? `${closest.winner} over ${closest.loser}, W${closest.week}` : 'No games'],
                    ['Highest Team Score', topTeam ? `${fmt(topTeam.points, 1)}` : '—', topTeam ? `${topTeam.team}, W${topTeam.week}` : 'No games'],
                  ].map(([label, value, note]) => <div key={label} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{label}</div><div className="mt-1 text-2xl font-black tabular-nums">{value}</div><div className="mt-1 text-xs text-[var(--muted)]">{note}</div></div>);
                })()}
              </div>
            </ReferenceSection>

            <ReferenceSection title={`${season} Weekly Scorebook`} subtitle="Choose any scored week for matchup results, league scoring context and player leaders by position.">
              <WeeklyScorebook dataset={dataset} season={season} />
            </ReferenceSection>
          </>
        ) : null}

        {activeTab === 'games' ? (
          <ReferenceSection title="Game Index" subtitle={`${filteredGames.length.toLocaleString()} completed matchups match the current filters.`}>
            <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-3">
              <label className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Season<select value={gameSeason} onChange={(event) => setGameSeason(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]"><option value="ALL">All Seasons</option>{dataset.seasons.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Franchise<select value={gameTeam} onChange={(event) => setGameTeam(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]"><option value="ALL">All Franchises</option>{franchiseNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
              <label className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Game Type<select value={gameType} onChange={(event) => setGameType(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]"><option value="ALL">All Games</option><option value="regular">Regular Season</option><option value="playoffs">Playoffs</option><option value="toilet">Toilet Bracket</option><option value="postseason">Other Postseason</option></select></label>
            </div>
            <TableWrap><table className="w-full"><thead><tr><HeaderCell>Season</HeaderCell><HeaderCell>Week</HeaderCell><HeaderCell>Type</HeaderCell><HeaderCell>Team</HeaderCell><HeaderCell className="text-right">Score</HeaderCell><HeaderCell>Opponent</HeaderCell><HeaderCell className="text-right">Score</HeaderCell><HeaderCell className="text-right">Margin</HeaderCell><HeaderCell className="text-right">Combined</HeaderCell></tr></thead><tbody>{filteredGames.map((game) => { const aWon = game.winner === game.teamA; const bWon = game.winner === game.teamB; return <tr key={game.id}><Cell>{game.season}</Cell><Cell>{game.week}</Cell><Cell>{gameTypeLabel(game.gameType)}</Cell><Cell className={aWon ? 'font-bold' : ''}><NamedFranchiseButton name={game.teamA} franchises={dataset.franchises} onOpen={setSelectedFranchise} /></Cell><Cell className={`text-right tabular-nums ${aWon ? 'font-bold' : ''}`}>{fmt(game.scoreA, 2)}</Cell><Cell className={bWon ? 'font-bold' : ''}><NamedFranchiseButton name={game.teamB} franchises={dataset.franchises} onOpen={setSelectedFranchise} /></Cell><Cell className={`text-right tabular-nums ${bWon ? 'font-bold' : ''}`}>{fmt(game.scoreB, 2)}</Cell><Cell className="text-right tabular-nums">{fmt(game.margin, 2)}</Cell><Cell className="text-right tabular-nums">{fmt(game.combined, 2)}</Cell></tr>; })}</tbody></table></TableWrap>
          </ReferenceSection>
        ) : null}

        {activeTab === 'explorer' ? (
          <ReferenceSection title="Stats Explorer 2.0" subtitle="Query career, player-season and matchup history with multi-field filters instead of relying on fixed leaderboards.">
            <AdvancedStatsExplorer dataset={dataset} />
          </ReferenceSection>
        ) : null}
      </div>

      <div className="mt-10 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
        <div>Generated {new Date(dataset.generatedAt).toLocaleString()}.</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">{dataset.coverageNotes.map((note) => <li key={note}>{note}</li>)}</ul>
      </div>

      <FranchiseStatsModal dataset={dataset} franchise={selectedFranchise} open={Boolean(selectedFranchise)} onClose={() => setSelectedFranchise(null)} />
    </div>
  );
}