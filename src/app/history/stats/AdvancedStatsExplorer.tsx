'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { LeagueStatsDataset, StatsGameRow, StatsPlayerCareerRow, StatsPlayerSeasonRow } from '@/lib/stats/types';

type Mode = 'careers' | 'seasons' | 'games';
type CareerSort = 'points' | 'starts' | 'ppg' | 'bestSeasonPoints' | 'bestGamePoints' | 'franchises';
type SeasonSort = 'points' | 'ppg' | 'starts' | 'bestGamePoints';
type GameSort = 'combined' | 'margin' | 'teamScore';

function fmt(value: number, digits = 1): string {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
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

const inputClass = 'mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]';
const labelClass = 'text-xs font-bold uppercase tracking-wide text-[var(--muted)]';

function gameTypeLabel(type: StatsGameRow['gameType']): string {
  if (type === 'regular') return 'Regular';
  if (type === 'playoffs') return 'Playoffs';
  if (type === 'toilet') return 'Toilet';
  return 'Postseason';
}

export default function AdvancedStatsExplorer({ dataset }: { dataset: LeagueStatsDataset }) {
  const [mode, setMode] = useState<Mode>('careers');
  const [position, setPosition] = useState('ALL');
  const [franchise, setFranchise] = useState('ALL');
  const [seasonFrom, setSeasonFrom] = useState('ALL');
  const [seasonTo, setSeasonTo] = useState('ALL');
  const [minPoints, setMinPoints] = useState('0');
  const [maxPoints, setMaxPoints] = useState('');
  const [minStarts, setMinStarts] = useState('0');
  const [minWeeks, setMinWeeks] = useState('0');
  const [minPpg, setMinPpg] = useState('0');
  const [careerSort, setCareerSort] = useState<CareerSort>('points');
  const [seasonSort, setSeasonSort] = useState<SeasonSort>('points');

  const [gameSeason, setGameSeason] = useState('ALL');
  const [gameTeam, setGameTeam] = useState('ALL');
  const [gameOpponent, setGameOpponent] = useState('ALL');
  const [gameType, setGameType] = useState('ALL');
  const [gameResult, setGameResult] = useState('ALL');
  const [minTeamScore, setMinTeamScore] = useState('0');
  const [minCombined, setMinCombined] = useState('0');
  const [maxMargin, setMaxMargin] = useState('');
  const [gameSort, setGameSort] = useState<GameSort>('combined');

  const positions = useMemo(() => {
    const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const available = new Set(dataset.players.map((row) => row.position).filter(Boolean));
    return [...order.filter((value) => available.has(value)), ...Array.from(available).filter((value) => !order.includes(value)).sort()];
  }, [dataset.players]);
  const franchises = useMemo(() => dataset.franchises.map((row) => row.teamName).sort(), [dataset.franchises]);
  const seasons = useMemo(() => [...dataset.seasons].sort((a, b) => a.localeCompare(b)), [dataset.seasons]);

  const careerRows = useMemo(() => {
    const min = Number(minPoints) || 0;
    const max = maxPoints === '' ? Infinity : Number(maxPoints);
    const starts = Number(minStarts) || 0;
    const weeks = Number(minWeeks) || 0;
    const ppg = Number(minPpg) || 0;
    return [...dataset.players]
      .filter((row) => {
        if (position !== 'ALL' && row.position !== position) return false;
        if (franchise !== 'ALL' && !row.franchises.some((split) => split.teamName === franchise)) return false;
        if (seasonFrom !== 'ALL' && row.lastSeason < seasonFrom) return false;
        if (seasonTo !== 'ALL' && row.firstSeason > seasonTo) return false;
        if (row.points < min || row.points > max || row.starts < starts || row.rosteredWeeks < weeks || row.ppg < ppg) return false;
        return true;
      })
      .sort((a, b) => {
        if (careerSort === 'franchises') return b.franchises.length - a.franchises.length || b.points - a.points;
        return Number(b[careerSort] ?? 0) - Number(a[careerSort] ?? 0) || a.name.localeCompare(b.name);
      })
      .slice(0, 250);
  }, [careerSort, dataset.players, franchise, maxPoints, minPoints, minPpg, minStarts, minWeeks, position, seasonFrom, seasonTo]);

  const seasonRows = useMemo(() => {
    const min = Number(minPoints) || 0;
    const max = maxPoints === '' ? Infinity : Number(maxPoints);
    const starts = Number(minStarts) || 0;
    const weeks = Number(minWeeks) || 0;
    const ppg = Number(minPpg) || 0;
    return [...dataset.playerSeasons]
      .filter((row) => {
        if (position !== 'ALL' && row.position !== position) return false;
        if (franchise !== 'ALL' && !row.franchises.some((split) => split.teamName === franchise)) return false;
        if (seasonFrom !== 'ALL' && row.season < seasonFrom) return false;
        if (seasonTo !== 'ALL' && row.season > seasonTo) return false;
        if (row.points < min || row.points > max || row.starts < starts || row.rosteredWeeks < weeks || row.ppg < ppg) return false;
        return true;
      })
      .sort((a, b) => Number(b[seasonSort] ?? 0) - Number(a[seasonSort] ?? 0) || b.season.localeCompare(a.season) || a.name.localeCompare(b.name))
      .slice(0, 250);
  }, [dataset.playerSeasons, franchise, maxPoints, minPoints, minPpg, minStarts, minWeeks, position, seasonFrom, seasonSort, seasonTo]);

  const gameRows = useMemo(() => {
    const minScore = Number(minTeamScore) || 0;
    const minTotal = Number(minCombined) || 0;
    const maxDiff = maxMargin === '' ? Infinity : Number(maxMargin);
    const perspective = (game: StatsGameRow) => {
      if (gameTeam === 'ALL') {
        const highScore = Math.max(game.scoreA, game.scoreB);
        return { team: game.winner || game.teamA, opponent: game.loser || game.teamB, teamScore: highScore, result: game.tie ? 'T' : 'W' };
      }
      const isA = game.teamA === gameTeam;
      const teamScore = isA ? game.scoreA : game.scoreB;
      const opponent = isA ? game.teamB : game.teamA;
      const result = game.tie ? 'T' : game.winner === gameTeam ? 'W' : 'L';
      return { team: gameTeam, opponent, teamScore, result };
    };

    return dataset.games
      .map((game) => ({ game, view: perspective(game) }))
      .filter(({ game, view }) => {
        if (gameSeason !== 'ALL' && game.season !== gameSeason) return false;
        if (gameTeam !== 'ALL' && game.teamA !== gameTeam && game.teamB !== gameTeam) return false;
        if (gameOpponent !== 'ALL' && view.opponent !== gameOpponent) return false;
        if (gameType !== 'ALL' && game.gameType !== gameType) return false;
        if (gameResult !== 'ALL' && view.result !== gameResult) return false;
        if (view.teamScore < minScore || game.combined < minTotal || game.margin > maxDiff) return false;
        return true;
      })
      .sort((a, b) => {
        if (gameSort === 'teamScore') return b.view.teamScore - a.view.teamScore || b.game.combined - a.game.combined;
        return b.game[gameSort] - a.game[gameSort] || b.game.season.localeCompare(a.game.season) || b.game.week - a.game.week;
      })
      .slice(0, 250);
  }, [dataset.games, gameOpponent, gameResult, gameSeason, gameSort, gameTeam, gameType, maxMargin, minCombined, minTeamScore]);

  const resetPlayerFilters = () => {
    setPosition('ALL'); setFranchise('ALL'); setSeasonFrom('ALL'); setSeasonTo('ALL');
    setMinPoints('0'); setMaxPoints(''); setMinStarts('0'); setMinWeeks('0'); setMinPpg('0');
  };
  const resetGameFilters = () => {
    setGameSeason('ALL'); setGameTeam('ALL'); setGameOpponent('ALL'); setGameType('ALL'); setGameResult('ALL');
    setMinTeamScore('0'); setMinCombined('0'); setMaxMargin('');
  };

  const playerFilters = (
    <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-5">
      <label className={labelClass}>Position<select value={position} onChange={(e) => setPosition(e.target.value)} className={inputClass}><option value="ALL">All</option>{positions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className={labelClass}>Franchise<select value={franchise} onChange={(e) => setFranchise(e.target.value)} className={inputClass}><option value="ALL">All</option>{franchises.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className={labelClass}>From Season<select value={seasonFrom} onChange={(e) => setSeasonFrom(e.target.value)} className={inputClass}><option value="ALL">Any</option>{seasons.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className={labelClass}>Through Season<select value={seasonTo} onChange={(e) => setSeasonTo(e.target.value)} className={inputClass}><option value="ALL">Any</option>{seasons.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className={labelClass}>Min Points<input type="number" value={minPoints} onChange={(e) => setMinPoints(e.target.value)} className={inputClass} /></label>
      <label className={labelClass}>Max Points<input type="number" value={maxPoints} placeholder="No max" onChange={(e) => setMaxPoints(e.target.value)} className={inputClass} /></label>
      <label className={labelClass}>Min Starts<input type="number" value={minStarts} onChange={(e) => setMinStarts(e.target.value)} className={inputClass} /></label>
      <label className={labelClass}>Min Weeks<input type="number" value={minWeeks} onChange={(e) => setMinWeeks(e.target.value)} className={inputClass} /></label>
      <label className={labelClass}>Min PPG<input type="number" step="0.1" value={minPpg} onChange={(e) => setMinPpg(e.target.value)} className={inputClass} /></label>
      <div className="flex items-end"><button type="button" onClick={resetPlayerFilters} className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-strong)]">Reset</button></div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([['careers', 'Player Career Finder'], ['seasons', 'Player Season Finder'], ['games', 'Game Finder']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setMode(id)} className={`rounded-md border px-4 py-2 text-sm font-bold ${mode === id ? 'border-[var(--accent)] bg-accent-soft text-accent' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'}`}>{label}</button>)}
      </div>

      {mode === 'careers' ? <>
        {playerFilters}
        <div className="flex items-center justify-between gap-3 text-sm"><span className="text-[var(--muted)]">{careerRows.length.toLocaleString()} matching career{careerRows.length === 1 ? '' : 's'}</span><label className={labelClass}>Sort<select value={careerSort} onChange={(e) => setCareerSort(e.target.value as CareerSort)} className={`${inputClass} ml-2 mt-0 inline-block w-auto`}><option value="points">Career Points</option><option value="starts">Starts</option><option value="ppg">PPG</option><option value="bestSeasonPoints">Best Season</option><option value="bestGamePoints">Best Game</option><option value="franchises">Franchises</option></select></label></div>
        <TableWrap><table className="w-full"><thead><tr><Th>Rk</Th><Th>Player</Th><Th>Pos</Th><Th>Years</Th><Th className="text-right">Teams</Th><Th className="text-right">Wks</Th><Th className="text-right">Starts</Th><Th className="text-right">Pts</Th><Th className="text-right">PPG</Th><Th className="text-right">Best Season</Th><Th className="text-right">Best Game</Th></tr></thead><tbody>{careerRows.map((row: StatsPlayerCareerRow, index) => <tr key={row.playerId}><Td>{index + 1}</Td><Td><Link href={`/players/${row.playerId}`} className="font-semibold text-[var(--accent)] hover:underline">{row.name}</Link></Td><Td>{row.position}</Td><Td>{row.firstSeason === row.lastSeason ? row.firstSeason : `${row.firstSeason}–${row.lastSeason}`}</Td><Td className="text-right">{row.franchises.length}</Td><Td className="text-right">{row.rosteredWeeks}</Td><Td className="text-right">{row.starts}</Td><Td className="text-right font-semibold tabular-nums">{fmt(row.points)}</Td><Td className="text-right tabular-nums">{fmt(row.ppg)}</Td><Td className="text-right tabular-nums">{row.bestSeasonPoints == null ? '—' : `${fmt(row.bestSeasonPoints)} (${row.bestSeason})`}</Td><Td className="text-right tabular-nums">{row.bestGamePoints == null ? '—' : `${fmt(row.bestGamePoints)} (${row.bestGameSeason} W${row.bestGameWeek})`}</Td></tr>)}</tbody></table></TableWrap>
      </> : null}

      {mode === 'seasons' ? <>
        {playerFilters}
        <div className="flex items-center justify-between gap-3 text-sm"><span className="text-[var(--muted)]">{seasonRows.length.toLocaleString()} matching player-season{seasonRows.length === 1 ? '' : 's'}</span><label className={labelClass}>Sort<select value={seasonSort} onChange={(e) => setSeasonSort(e.target.value as SeasonSort)} className={`${inputClass} ml-2 mt-0 inline-block w-auto`}><option value="points">Points</option><option value="ppg">PPG</option><option value="starts">Starts</option><option value="bestGamePoints">Best Game</option></select></label></div>
        <TableWrap><table className="w-full"><thead><tr><Th>Rk</Th><Th>Player</Th><Th>Season</Th><Th>Pos</Th><Th>Franchise</Th><Th className="text-right">Wks</Th><Th className="text-right">Starts</Th><Th className="text-right">Pts</Th><Th className="text-right">PPG</Th><Th className="text-right">Best Game</Th></tr></thead><tbody>{seasonRows.map((row: StatsPlayerSeasonRow, index) => <tr key={`${row.season}-${row.playerId}`}><Td>{index + 1}</Td><Td><Link href={`/players/${row.playerId}`} className="font-semibold text-[var(--accent)] hover:underline">{row.name}</Link></Td><Td>{row.season}</Td><Td>{row.position}</Td><Td>{row.franchises.map((split) => split.teamName).join(' / ')}</Td><Td className="text-right">{row.rosteredWeeks}</Td><Td className="text-right">{row.starts}</Td><Td className="text-right font-semibold tabular-nums">{fmt(row.points)}</Td><Td className="text-right tabular-nums">{fmt(row.ppg)}</Td><Td className="text-right tabular-nums">{row.bestGamePoints == null ? '—' : `${fmt(row.bestGamePoints)} W${row.bestGameWeek}`}</Td></tr>)}</tbody></table></TableWrap>
      </> : null}

      {mode === 'games' ? <>
        <div className="grid gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className={labelClass}>Season<select value={gameSeason} onChange={(e) => setGameSeason(e.target.value)} className={inputClass}><option value="ALL">All</option>{seasons.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className={labelClass}>Franchise<select value={gameTeam} onChange={(e) => { setGameTeam(e.target.value); setGameOpponent('ALL'); }} className={inputClass}><option value="ALL">All</option>{franchises.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className={labelClass}>Opponent<select value={gameOpponent} onChange={(e) => setGameOpponent(e.target.value)} className={inputClass} disabled={gameTeam === 'ALL'}><option value="ALL">Any</option>{franchises.filter((value) => value !== gameTeam).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className={labelClass}>Type<select value={gameType} onChange={(e) => setGameType(e.target.value)} className={inputClass}><option value="ALL">All</option><option value="regular">Regular</option><option value="playoffs">Playoffs</option><option value="toilet">Toilet</option><option value="postseason">Other Postseason</option></select></label>
          <label className={labelClass}>Result<select value={gameResult} onChange={(e) => setGameResult(e.target.value)} className={inputClass} disabled={gameTeam === 'ALL'}><option value="ALL">Any</option><option value="W">Win</option><option value="L">Loss</option><option value="T">Tie</option></select></label>
          <label className={labelClass}>Min Team Score<input type="number" value={minTeamScore} onChange={(e) => setMinTeamScore(e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Min Combined<input type="number" value={minCombined} onChange={(e) => setMinCombined(e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Max Margin<input type="number" value={maxMargin} placeholder="No max" onChange={(e) => setMaxMargin(e.target.value)} className={inputClass} /></label>
          <label className={labelClass}>Sort<select value={gameSort} onChange={(e) => setGameSort(e.target.value as GameSort)} className={inputClass}><option value="combined">Combined Score</option><option value="margin">Margin</option><option value="teamScore">Team Score</option></select></label>
          <div className="flex items-end"><button type="button" onClick={resetGameFilters} className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--surface-strong)]">Reset</button></div>
        </div>
        <div className="text-sm text-[var(--muted)]">{gameRows.length.toLocaleString()} matching game{gameRows.length === 1 ? '' : 's'}</div>
        <TableWrap><table className="w-full"><thead><tr><Th>Rk</Th><Th>Season</Th><Th>Week</Th><Th>Type</Th><Th>Team</Th><Th>Result</Th><Th>Opponent</Th><Th className="text-right">Score</Th><Th className="text-right">Margin</Th><Th className="text-right">Combined</Th></tr></thead><tbody>{gameRows.map(({ game, view }, index) => <tr key={game.id}><Td>{index + 1}</Td><Td>{game.season}</Td><Td>{game.week}</Td><Td>{gameTypeLabel(game.gameType)}</Td><Td className="font-semibold">{view.team}</Td><Td>{view.result}</Td><Td>{view.opponent}</Td><Td className="text-right font-semibold tabular-nums">{fmt(view.teamScore, 2)}</Td><Td className="text-right tabular-nums">{fmt(game.margin, 2)}</Td><Td className="text-right tabular-nums">{fmt(game.combined, 2)}</Td></tr>)}</tbody></table></TableWrap>
      </> : null}
    </div>
  );
}
