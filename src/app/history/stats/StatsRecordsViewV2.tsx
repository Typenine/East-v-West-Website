'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FranchiseStatsModal from './FranchiseStatsModal';
import { getReadableTextForColors, getTeamColors } from '@/lib/utils/team-utils';
import type {
  LeagueStatsDataset,
  StatsFranchiseRow,
  StatsPlayerCareerRow,
  StatsPlayerGameRow,
  StatsPlayerSeasonRow,
  StatsRecordEntry,
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
type DisplayRecord = StatsRecordEntry & { coHolders?: string[] };

type FranchiseNumericField =
  | 'regularWins'
  | 'regularWinPct'
  | 'regularPointsFor'
  | 'playoffWins'
  | 'titles'
  | 'championshipAppearances';

const FRANCHISE_RECORD_FIELDS: Record<string, FranchiseNumericField> = {
  'franchise-wins': 'regularWins',
  'franchise-pct': 'regularWinPct',
  'franchise-points': 'regularPointsFor',
  'franchise-playoff-wins': 'playoffWins',
  'franchise-titles': 'titles',
  'franchise-appearances': 'championshipAppearances',
};

function fmt(value: number, digits = 1): string {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return `rgba(11,95,152,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function HeaderCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--muted)] ${className}`}>
      {children}
    </th>
  );
}

function Cell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`whitespace-nowrap border-b border-[var(--border)] px-3 py-2 align-middle text-sm text-[var(--text)] ${className}`}>
      {children}
    </td>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">{children}</div>;
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

function PlayerLink({ playerId, name }: { playerId: string; name: string }) {
  return <Link href={`/players/${playerId}`} className="font-semibold text-[var(--accent)] hover:underline">{name}</Link>;
}

function TeamPill({
  teamName,
  franchises,
  onOpen,
}: {
  teamName: string;
  franchises: StatsFranchiseRow[];
  onOpen: (franchise: StatsFranchiseRow) => void;
}) {
  const colors = getTeamColors(teamName);
  const textColor = getReadableTextForColors([colors.primary, colors.secondary]);
  const franchise = franchises.find((row) => row.teamName === teamName);
  const style = {
    background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary || colors.primary})`,
    color: textColor,
    borderColor: hexToRgba(colors.secondary || colors.primary, 0.7),
  };
  const className = "inline-flex items-center rounded-md border px-2.5 py-1 text-sm font-bold shadow-sm";

  if (franchise) {
    return <button type="button" className={className} style={style} onClick={() => onOpen(franchise)}>{teamName}</button>;
  }
  return <span className={className} style={style}>{teamName}</span>;
}

function RecordGrid({
  records,
  franchises,
  onOpenFranchise,
}: {
  records: DisplayRecord[];
  franchises: StatsFranchiseRow[];
  onOpenFranchise: (franchise: StatsFranchiseRow) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {records.map((record) => {
        const teamNames = record.coHolders?.length
          ? record.coHolders
          : record.teamName
            ? [record.teamName]
            : [];
        const primaryColors = teamNames.map((name) => getTeamColors(name).primary);
        const stripe = primaryColors.length > 1
          ? `linear-gradient(90deg, ${primaryColors.map((color, index) => `${color} ${(index / primaryColors.length) * 100}%, ${color} ${((index + 1) / primaryColors.length) * 100}%`).join(', ')})`
          : primaryColors[0] || 'var(--accent)';
        const firstColors = teamNames[0] ? getTeamColors(teamNames[0]) : null;
        const cardStyle = firstColors
          ? {
              borderColor: hexToRgba(firstColors.primary, 0.7),
              background: `linear-gradient(135deg, ${hexToRgba(firstColors.primary, 0.15)} 0%, var(--surface) 44%, ${hexToRgba(firstColors.secondary || firstColors.primary, 0.09)} 100%)`,
            }
          : undefined;

        return (
          <div key={record.id} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]" style={cardStyle}>
            <div className="h-1.5 w-full" style={{ background: stripe }} />
            <div className="p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{record.label}</div>
              <div className="mt-2 text-2xl font-black tabular-nums text-[var(--text)]">{record.valueDisplay}</div>

              {record.playerId ? (
                <div className="mt-1"><PlayerLink playerId={record.playerId} name={record.holder} /></div>
              ) : teamNames.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {teamNames.map((teamName) => (
                    <TeamPill key={teamName} teamName={teamName} franchises={franchises} onOpen={onOpenFranchise} />
                  ))}
                </div>
              ) : (
                <div className="mt-1 font-semibold text-[var(--text)]">{record.holder}</div>
              )}

              {(record.season || record.week || record.opponent) ? (
                <div className="mt-2 text-xs text-[var(--muted)]">
                  {[record.season, record.week ? `Week ${record.week}` : null, record.opponent ? `vs. ${record.opponent}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type ThresholdRow = {
  playerId: string;
  name: string;
  position: string;
  value: number;
};

function Leaderboard({
  title,
  rows,
  valueLabel,
  formatValue = (value) => fmt(value),
}: {
  title: string;
  rows: ThresholdRow[];
  valueLabel: string;
  formatValue?: (value: number) => string;
}) {
  return (
    <div>
      <h3 className="mb-2 font-bold text-[var(--text)]">{title}</h3>
      <TableWrap>
        <table className="w-full">
          <thead><tr><HeaderCell>Rk</HeaderCell><HeaderCell>Player</HeaderCell><HeaderCell>Pos</HeaderCell><HeaderCell className="text-right">{valueLabel}</HeaderCell></tr></thead>
          <tbody>
            {rows.slice(0, 10).map((row, index) => (
              <tr key={`${title}-${row.playerId}`}>
                <Cell>{index + 1}</Cell>
                <Cell><PlayerLink playerId={row.playerId} name={row.name} /></Cell>
                <Cell>{row.position}</Cell>
                <Cell className="text-right font-semibold tabular-nums">{formatValue(row.value)}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}

function emptyRow(colSpan: number, message = 'No qualifying players found.') {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-sm text-[var(--muted)]">{message}</td>
    </tr>
  );
}

export default function StatsRecordsViewV2({ dataset }: { dataset: LeagueStatsDataset }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [recordPosition, setRecordPosition] = useState('ALL');
  const [selectedFranchise, setSelectedFranchise] = useState<StatsFranchiseRow | null>(null);

  const positions = useMemo(() => {
    const order = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const available = new Set(
      [...dataset.players, ...dataset.playerSeasons, ...dataset.playerGames]
        .map((row) => row.position)
        .filter(Boolean),
    );
    return [
      ...order.filter((position) => available.has(position)),
      ...Array.from(available).filter((position) => !order.includes(position)).sort(),
    ];
  }, [dataset.playerGames, dataset.playerSeasons, dataset.players]);

  const franchiseRecords = useMemo<DisplayRecord[]>(() => {
    return dataset.records.franchise.map((record) => {
      const field = FRANCHISE_RECORD_FIELDS[record.id];
      if (!field) return record;

      const coHolders = dataset.franchises
        .filter((franchise) => Math.abs(Number(franchise[field]) - Number(record.value)) < 0.000001)
        .map((franchise) => franchise.teamName)
        .sort((a, b) => a.localeCompare(b));

      if (coHolders.length <= 1) return { ...record, coHolders };
      return {
        ...record,
        holder: coHolders.join(' / '),
        teamName: null,
        coHolders,
      };
    });
  }, [dataset.franchises, dataset.records.franchise]);

  const filteredRecordCareers = useMemo(() => {
    return [...dataset.players]
      .filter((row) => recordPosition === 'ALL' || row.position === recordPosition)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [dataset.players, recordPosition]);

  const filteredRecordSeasons = useMemo(() => {
    return [...dataset.playerSeasons]
      .filter((row) => recordPosition === 'ALL' || row.position === recordPosition)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [dataset.playerSeasons, recordPosition]);

  const filteredRecordGames = useMemo(() => {
    return [...dataset.playerGames]
      .filter((row) => recordPosition === 'ALL' || row.position === recordPosition)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [dataset.playerGames, recordPosition]);

  const deepLeaderboards = useMemo(() => {
    const playerById = new Map(dataset.players.map((row) => [row.playerId, row] as const));
    const threshold = new Map<string, { games20: number; games30: number; games40: number }>();
    for (const game of dataset.playerGames) {
      const current = threshold.get(game.playerId) || { games20: 0, games30: 0, games40: 0 };
      if (game.points >= 20) current.games20 += 1;
      if (game.points >= 30) current.games30 += 1;
      if (game.points >= 40) current.games40 += 1;
      threshold.set(game.playerId, current);
    }

    const fromCareer = (selector: (row: StatsPlayerCareerRow) => number, filter?: (row: StatsPlayerCareerRow) => boolean): ThresholdRow[] =>
      dataset.players
        .filter((row) => !filter || filter(row))
        .map((row) => ({ playerId: row.playerId, name: row.name, position: row.position, value: selector(row) }))
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

    const fromThreshold = (key: 'games20' | 'games30' | 'games40'): ThresholdRow[] =>
      Array.from(threshold.entries())
        .map(([playerId, counts]) => {
          const player = playerById.get(playerId);
          return player ? { playerId, name: player.name, position: player.position, value: counts[key] } : null;
        })
        .filter((row): row is ThresholdRow => Boolean(row))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

    return {
      starts: fromCareer((row) => row.starts),
      ppg: fromCareer((row) => row.ppg, (row) => row.rosteredWeeks >= 10),
      franchises: fromCareer((row) => row.franchises.length),
      games20: fromThreshold('games20'),
      games30: fromThreshold('games30'),
      games40: fromThreshold('games40'),
    };
  }, [dataset.playerGames, dataset.players]);

  const playerGameProgression = useMemo(() => {
    const rows = [...dataset.playerGames]
      .filter((row) => recordPosition === 'ALL' || row.position === recordPosition)
      .sort((a, b) => a.season.localeCompare(b.season) || a.week - b.week || a.id.localeCompare(b.id));
    const progression: StatsPlayerGameRow[] = [];
    let record = -Infinity;
    for (const row of rows) {
      if (row.points > record) {
        record = row.points;
        progression.push(row);
      }
    }
    return progression;
  }, [dataset.playerGames, recordPosition]);

  const playerSeasonProgression = useMemo(() => {
    const rows = dataset.playerSeasons.filter((row) => recordPosition === 'ALL' || row.position === recordPosition);
    const bySeason = new Map<string, StatsPlayerSeasonRow[]>();
    for (const row of rows) {
      const group = bySeason.get(row.season) || [];
      group.push(row);
      bySeason.set(row.season, group);
    }

    const result: { season: string; holders: StatsPlayerSeasonRow[]; points: number }[] = [];
    let record = -Infinity;
    for (const season of Array.from(bySeason.keys()).sort()) {
      const group = bySeason.get(season) || [];
      const max = Math.max(...group.map((row) => row.points));
      if (max > record) {
        record = max;
        result.push({
          season,
          points: max,
          holders: group.filter((row) => Math.abs(row.points - max) < 0.000001).sort((a, b) => a.name.localeCompare(b.name)),
        });
      }
    }
    return result;
  }, [dataset.playerSeasons, recordPosition]);

  const teamScoreProgression = useMemo(() => {
    const rows = dataset.games
      .flatMap((game) => [
        { id: `${game.id}-a`, season: game.season, week: game.week, team: game.teamA, opponent: game.teamB, points: game.scoreA },
        { id: `${game.id}-b`, season: game.season, week: game.week, team: game.teamB, opponent: game.teamA, points: game.scoreB },
      ])
      .sort((a, b) => a.season.localeCompare(b.season) || a.week - b.week || a.id.localeCompare(b.id));
    const progression: typeof rows = [];
    let record = -Infinity;
    for (const row of rows) {
      if (row.points > record) {
        record = row.points;
        progression.push(row);
      }
    }
    return progression;
  }, [dataset.games]);

  const setTab = (tab: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'overview') params.delete('tab');
    else params.set('tab', tab);
    const query = params.toString();
    router.replace(query ? `/history/stats?${query}` : '/history/stats', { scroll: false });
  };

  return (
    <div className="container mx-auto max-w-[1500px] px-4 py-8">
      <div className="mb-2 text-sm text-[var(--muted)]">
        <Link href="/history" className="hover:text-[var(--text)] hover:underline">History</Link> / Stats
      </div>

      <div className="border-b-4 border-[var(--accent)] pb-4">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-[var(--muted)]">East v. West Reference</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--text)] sm:text-4xl">League Statistics</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
          Complete East v. West player, franchise, season, game and record-book statistics
          {dataset.latestSeasonWithGames ? ` through the ${dataset.latestSeasonWithGames} season` : ''}.
        </p>
      </div>

      <nav className="mt-4 flex gap-1 overflow-x-auto border-b border-[var(--border)]" aria-label="Statistics sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setTab(tab.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition-colors ${tab.id === 'records' ? 'border-[var(--accent)] text-[var(--text)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="mt-7 space-y-10">
        <ReferenceSection title="Franchise Records" subtitle="Co-holders are shown together when multiple franchises share the league record.">
          <RecordGrid records={franchiseRecords} franchises={dataset.franchises} onOpenFranchise={setSelectedFranchise} />
        </ReferenceSection>

        <ReferenceSection title="Game Records">
          <RecordGrid records={dataset.records.games} franchises={dataset.franchises} onOpenFranchise={setSelectedFranchise} />
        </ReferenceSection>

        <ReferenceSection title="Season Records">
          <RecordGrid records={dataset.records.seasons} franchises={dataset.franchises} onOpenFranchise={setSelectedFranchise} />
        </ReferenceSection>

        <ReferenceSection
          title="Advanced Player Leaderboards"
          subtitle="Reference-style top-10 lists beyond raw career points. Career PPG requires at least 10 rostered weeks."
        >
          <div className="grid gap-7 xl:grid-cols-3">
            <Leaderboard title="Career Starts" rows={deepLeaderboards.starts} valueLabel="Starts" formatValue={(value) => String(value)} />
            <Leaderboard title="Career PPG" rows={deepLeaderboards.ppg} valueLabel="PPG" />
            <Leaderboard title="Most Franchises Played For" rows={deepLeaderboards.franchises} valueLabel="Teams" formatValue={(value) => String(value)} />
            <Leaderboard title="20+ Point Games" rows={deepLeaderboards.games20} valueLabel="Games" formatValue={(value) => String(value)} />
            <Leaderboard title="30+ Point Games" rows={deepLeaderboards.games30} valueLabel="Games" formatValue={(value) => String(value)} />
            <Leaderboard title="40+ Point Games" rows={deepLeaderboards.games40} valueLabel="Games" formatValue={(value) => String(value)} />
          </div>
        </ReferenceSection>

        <ReferenceSection title="Player Record Book" subtitle="Filter the full career, single-season and single-game datasets by position.">
          <div className="mb-3 flex flex-wrap gap-2">
            {['ALL', ...positions].map((position) => (
              <button
                key={position}
                type="button"
                onClick={() => setRecordPosition(position)}
                className={`rounded-md border px-3 py-1.5 text-xs font-bold ${recordPosition === position ? 'border-[var(--accent)] bg-accent-soft text-accent' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'}`}
              >
                {position === 'ALL' ? 'All' : position}
              </button>
            ))}
          </div>

          <div className="grid gap-8 xl:grid-cols-3">
            <div>
              <h3 className="mb-2 font-bold">Career Points</h3>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><HeaderCell>Rk</HeaderCell><HeaderCell>Player</HeaderCell><HeaderCell className="text-right">Pts</HeaderCell></tr></thead>
                  <tbody>
                    {filteredRecordCareers.length
                      ? filteredRecordCareers.slice(0, 25).map((row, index) => (
                          <tr key={row.playerId}><Cell>{index + 1}</Cell><Cell><PlayerLink playerId={row.playerId} name={row.name} /></Cell><Cell className="text-right font-semibold tabular-nums">{fmt(row.points)}</Cell></tr>
                        ))
                      : emptyRow(3)}
                  </tbody>
                </table>
              </TableWrap>
            </div>

            <div>
              <h3 className="mb-2 font-bold">Single-Season Points</h3>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><HeaderCell>Rk</HeaderCell><HeaderCell>Player</HeaderCell><HeaderCell>Year</HeaderCell><HeaderCell className="text-right">Pts</HeaderCell></tr></thead>
                  <tbody>
                    {filteredRecordSeasons.length
                      ? filteredRecordSeasons.slice(0, 25).map((row, index) => (
                          <tr key={`${row.season}-${row.playerId}`}><Cell>{index + 1}</Cell><Cell><PlayerLink playerId={row.playerId} name={row.name} /></Cell><Cell>{row.season}</Cell><Cell className="text-right font-semibold tabular-nums">{fmt(row.points)}</Cell></tr>
                        ))
                      : emptyRow(4)}
                  </tbody>
                </table>
              </TableWrap>
            </div>

            <div>
              <h3 className="mb-2 font-bold">Single-Game Points</h3>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><HeaderCell>Rk</HeaderCell><HeaderCell>Player</HeaderCell><HeaderCell>Game</HeaderCell><HeaderCell className="text-right">Pts</HeaderCell></tr></thead>
                  <tbody>
                    {filteredRecordGames.length
                      ? filteredRecordGames.slice(0, 25).map((row, index) => (
                          <tr key={row.id}><Cell>{index + 1}</Cell><Cell><PlayerLink playerId={row.playerId} name={row.name} /></Cell><Cell>{row.season} W{row.week}</Cell><Cell className="text-right font-semibold tabular-nums">{fmt(row.points)}</Cell></tr>
                        ))
                      : emptyRow(4)}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </div>
        </ReferenceSection>

        <ReferenceSection
          title="Record Progression"
          subtitle="Shows each point at which the standing league record was surpassed, oldest to newest. Position filter applies to player records."
        >
          <div className="grid gap-8 xl:grid-cols-3">
            <div>
              <h3 className="mb-2 font-bold">Single-Game Player Record</h3>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><HeaderCell>Season</HeaderCell><HeaderCell>Player</HeaderCell><HeaderCell>Game</HeaderCell><HeaderCell className="text-right">Record</HeaderCell></tr></thead>
                  <tbody>
                    {playerGameProgression.length
                      ? playerGameProgression.map((row) => (
                          <tr key={`game-prog-${row.id}`}><Cell>{row.season}</Cell><Cell><PlayerLink playerId={row.playerId} name={row.name} /></Cell><Cell>W{row.week}</Cell><Cell className="text-right font-semibold tabular-nums">{fmt(row.points)}</Cell></tr>
                        ))
                      : emptyRow(4, 'No player-game progression available.')}
                  </tbody>
                </table>
              </TableWrap>
            </div>

            <div>
              <h3 className="mb-2 font-bold">Single-Season Player Record</h3>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><HeaderCell>Season</HeaderCell><HeaderCell>Holder</HeaderCell><HeaderCell className="text-right">Record</HeaderCell></tr></thead>
                  <tbody>
                    {playerSeasonProgression.length
                      ? playerSeasonProgression.map((row) => (
                          <tr key={`season-prog-${row.season}`}>
                            <Cell>{row.season}</Cell>
                            <Cell>
                              <div className="flex flex-wrap gap-x-2 gap-y-1">
                                {row.holders.map((holder) => <PlayerLink key={holder.playerId} playerId={holder.playerId} name={holder.name} />)}
                              </div>
                            </Cell>
                            <Cell className="text-right font-semibold tabular-nums">{fmt(row.points)}</Cell>
                          </tr>
                        ))
                      : emptyRow(3, 'No player-season progression available.')}
                  </tbody>
                </table>
              </TableWrap>
            </div>

            <div>
              <h3 className="mb-2 font-bold">Team Single-Game Record</h3>
              <TableWrap>
                <table className="w-full">
                  <thead><tr><HeaderCell>Season</HeaderCell><HeaderCell>Team</HeaderCell><HeaderCell>Game</HeaderCell><HeaderCell className="text-right">Record</HeaderCell></tr></thead>
                  <tbody>
                    {teamScoreProgression.length
                      ? teamScoreProgression.map((row) => (
                          <tr key={`team-prog-${row.id}`}>
                            <Cell>{row.season}</Cell>
                            <Cell>
                              <TeamPill teamName={row.team} franchises={dataset.franchises} onOpen={setSelectedFranchise} />
                            </Cell>
                            <Cell>W{row.week} vs. {row.opponent}</Cell>
                            <Cell className="text-right font-semibold tabular-nums">{fmt(row.points, 2)}</Cell>
                          </tr>
                        ))
                      : emptyRow(4, 'No team-score progression available.')}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </div>
        </ReferenceSection>
      </div>

      <div className="mt-10 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
        <div>Generated {new Date(dataset.generatedAt).toLocaleString()}.</div>
        <ul className="mt-2 list-disc space-y-1 pl-5">{dataset.coverageNotes.map((note) => <li key={note}>{note}</li>)}</ul>
      </div>

      <FranchiseStatsModal
        dataset={dataset}
        franchise={selectedFranchise}
        open={Boolean(selectedFranchise)}
        onClose={() => setSelectedFranchise(null)}
      />
    </div>
  );
}
