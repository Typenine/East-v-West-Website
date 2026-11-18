'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { getTeamsData, TeamData, getCurrentStreaksForLeague } from '@/lib/utils/sleeper-api';
import { CURRENT_SEASON, getLeagueIdForSeason } from '@/lib/constants/league';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import SectionHeader from '@/components/ui/SectionHeader';
import { Chip } from '@/components/ui/Chip';
import {
  BroadcastPanel,
  BroadcastTeamLogo,
  PANEL,
  teamAccent,
  broadcastFaintTextStyle,
  broadcastMutedTextStyle,
  broadcastBodyTextStyle,
} from '@/components/ui/BroadcastPanel';

type SortKey = 'wins' | 'losses' | 'ties' | 'fpts' | 'fptsAgainst' | 'luck';
type SortDirection = 'asc' | 'desc';
type LuckData = { luck: number; expectedWins: number; allPlayExpected: number; historicalExpected: number };

const SEASON_OPTIONS = [CURRENT_SEASON, '2025', '2024', '2023'];
const getPlayoffTeamsForSeason = (season: string) => season === '2026' ? 7 : 8;

const thClass = 'px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] sm:px-5';

export default function StandingsPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [luckByRoster, setLuckByRoster] = useState<Record<number, LuckData>>({});
  const [luckStatus, setLuckStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(CURRENT_SEASON);
  const [streaks, setStreaks] = useState<Record<number, { type: 'W' | 'L' | 'T' | null; length: number }>>({});
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'wins',
    direction: 'desc'
  });
  
  const fetchStandings = useCallback(async () => {
    try {
      setLoading(true);
      const leagueId = getLeagueIdForSeason(selectedYear);
      if (!leagueId) {
        throw new Error(`No league ID found for season ${selectedYear}`);
      }
      const [teamsData, streakMap] = await Promise.all([
        getTeamsData(leagueId),
        getCurrentStreaksForLeague(leagueId)
      ]);
      setTeams(teamsData);
      setStreaks(streakMap);
      setError(null);
    } catch (err) {
      console.error('Error fetching standings:', err);
      setError('Failed to load standings. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchStandings();
  }, [fetchStandings]);

  useEffect(() => {
    const controller = new AbortController();
    setLuckByRoster({});
    setLuckStatus('loading');
    (async () => {
      try {
        const response = await fetch(
          `/api/standings/luck?season=${encodeURIComponent(selectedYear)}`,
          { signal: controller.signal, cache: 'no-store' },
        );
        if (!response.ok) throw new Error('Luck data unavailable');
        const payload = await response.json() as {
          teams: Array<LuckData & { rosterId: number }>;
        };
        if (!Array.isArray(payload.teams)) throw new Error('Invalid luck data');
        if (controller.signal.aborted) return;
        setLuckByRoster(Object.fromEntries(payload.teams.map((t) =>
          [t.rosterId, { luck: t.luck, expectedWins: t.expectedWins,
            allPlayExpected: t.allPlayExpected, historicalExpected: t.historicalExpected }])));
        setLuckStatus('ready');
      } catch {
        if (!controller.signal.aborted) setLuckStatus('unavailable');
      }
    })();
    return () => controller.abort();
  }, [selectedYear]);
  
  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const officialOrder = [...teams].sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (a.ties !== b.ties) return b.ties - a.ties;
    return b.fpts - a.fpts;
  });
  const seedByRoster = new Map(officialOrder.map((team, index) => [team.rosterId, index + 1]));
  
  const sortedTeams = [...teams].sort((a, b) => {
    const key = sortConfig.key;
    if (key === 'luck') {
      const aLuck = luckStatus === 'ready' ? luckByRoster[a.rosterId]?.luck : undefined;
      const bLuck = luckStatus === 'ready' ? luckByRoster[b.rosterId]?.luck : undefined;
      const aHasLuck = typeof aLuck === 'number' && Number.isFinite(aLuck);
      const bHasLuck = typeof bLuck === 'number' && Number.isFinite(bLuck);

      // Keep missing or still-loading luck data at the bottom, in either
      // direction, and use official seed order for stable ties.
      if (aHasLuck !== bHasLuck) return aHasLuck ? -1 : 1;
      if (aHasLuck && bHasLuck) {
        const difference = sortConfig.direction === 'desc'
          ? bLuck! - aLuck!
          : aLuck! - bLuck!;
        if (difference !== 0) return difference;
      }
      return (seedByRoster.get(a.rosterId) ?? Infinity) -
        (seedByRoster.get(b.rosterId) ?? Infinity);
    }
    if (a[key] > b[key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    if (a[key] < b[key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (key !== 'fpts') {
      if (a.fpts > b.fpts) return -1;
      if (a.fpts < b.fpts) return 1;
    }
    return 0;
  });
  
  const teamsWithSeeds = sortedTeams.map((team) => ({
    ...team,
    seed: seedByRoster.get(team.rosterId) ?? 0,
  }));
  const showingOfficialOrder = sortConfig.key === 'wins' && sortConfig.direction === 'desc';
  const playoffTeams = getPlayoffTeamsForSeason(selectedYear);
  
  const seasonTabs = (
    <div className="mt-4 flex flex-wrap items-center gap-2" role="tablist" aria-orientation="horizontal">
      {SEASON_OPTIONS.map((year) => (
        <Chip
          key={year}
          role="tab"
          aria-selected={selectedYear === year}
          selected={selectedYear === year}
          variant="accent"
          onClick={() => setSelectedYear(year)}
        >
          {year}
        </Chip>
      ))}
      {selectedYear === CURRENT_SEASON && (
        <>
          <Link
            href="/playoff-lab"
            className="ml-0 rounded-full border border-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] transition hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] sm:ml-2"
          >
            Playoff Lab
          </Link>
          <Link
            href="/power-rankings"
            className="rounded-full border border-[var(--accent)] px-3 py-1.5 text-xs font-bold text-[var(--accent)] transition hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
          >
            Power Rankings
          </Link>
        </>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Standings" subtitle="Season records, scoring, and streaks across the league" />
        {seasonTabs}
        <div className="mt-5">
          <LoadingState message="Loading standings..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Standings" subtitle="Season records, scoring, and streaks across the league" />
        {seasonTabs}
        <div className="mt-5">
          <ErrorState message={error} retry={fetchStandings} homeLink />
        </div>
      </div>
    );
  }

  const sortHeader = (key: SortKey, label: string) => {
    const active = sortConfig.key === key;
    return (
      <button
        type="button"
        onClick={() => handleSort(key)}
        className="inline-flex items-center gap-1 transition-colors hover:text-[var(--panel-text)]"
        style={active ? broadcastBodyTextStyle : broadcastFaintTextStyle}
      >
        {label}
        {active && (
          <span aria-hidden="true">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>
        )}
      </button>
    );
  };

  const sortAriaSort = (key: SortKey): 'ascending' | 'descending' | 'none' =>
    sortConfig.key === key ? (sortConfig.direction === 'desc' ? 'descending' : 'ascending') : 'none';

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Standings" subtitle="Season records, scoring, and streaks across the league" />
      {seasonTabs}

      <div className="mt-5">
        <BroadcastPanel title="Standings" meta={`${selectedYear} · Top ${playoffTeams} make the playoffs`} bodyClassName="!p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr style={{ background: PANEL.headerBg, borderBottom: `1px solid ${PANEL.hairline}` }}>
                  <th scope="col" className={thClass} style={broadcastFaintTextStyle}>Seed</th>
                  <th scope="col" className={thClass} style={broadcastFaintTextStyle}>Team</th>
                  <th scope="col" className={thClass} aria-sort={sortAriaSort('wins')}>{sortHeader('wins', 'Record')}</th>
                  <th scope="col" className={thClass} aria-sort={sortAriaSort('fpts')}>{sortHeader('fpts', 'PF')}</th>
                  <th scope="col" className={thClass} style={broadcastFaintTextStyle}>PF/G</th>
                  <th scope="col" className={thClass} aria-sort={sortAriaSort('fptsAgainst')}>{sortHeader('fptsAgainst', 'PA')}</th>
                  <th scope="col" className={thClass} style={broadcastFaintTextStyle}>PA/G</th>
                  <th scope="col" className={thClass} style={broadcastFaintTextStyle}>Streak</th>
                  <th scope="col" className={thClass} aria-sort={sortAriaSort('luck')} title="Actual wins minus the average of All-Play and historical expected wins">{sortHeader('luck', 'Luck')}</th>
                </tr>
              </thead>
              <tbody>
                {teamsWithSeeds.map((team) => {
                  const accent = teamAccent(team.teamName);
                  const streak = streaks[team.rosterId];
                  const luckEntry = luckByRoster[team.rosterId];
                  const gamesPlayed = team.wins + team.losses + team.ties;
                  const pointsForPerGame = gamesPlayed > 0 ? team.fpts / gamesPlayed : null;
                  const pointsAgainstPerGame = gamesPlayed > 0 ? team.fptsAgainst / gamesPlayed : null;
                  const firstOutsidePlayoffs = showingOfficialOrder && team.seed === playoffTeams + 1;
                  return (
                    <tr
                      key={team.rosterId}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                      style={{
                        borderBottom: `1px solid ${PANEL.hairline}`,
                        borderTop: firstOutsidePlayoffs ? '2px solid #2563eb' : undefined,
                        borderLeft: `3px solid ${accent}`,
                        background: team.seed <= playoffTeams ? 'rgba(37,99,235,0.04)' : undefined,
                      }}
                      onClick={() => (window.location.href = `/teams/${team.rosterId}?year=${selectedYear}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          window.location.href = `/teams/${team.rosterId}?year=${selectedYear}`;
                        }
                      }}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold tabular-nums sm:px-5" style={broadcastMutedTextStyle}>{team.seed}</td>
                      <td className="whitespace-nowrap px-4 py-3 sm:px-5">
                        <div className="flex items-center gap-3">
                          <BroadcastTeamLogo team={team.teamName} accent={accent} size="sm" />
                          <span className="truncate text-sm font-bold" style={broadcastBodyTextStyle}>{team.teamName}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold tabular-nums sm:px-5" style={broadcastBodyTextStyle}>
                        {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums sm:px-5" style={broadcastBodyTextStyle}>{team.fpts.toFixed(2)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold tabular-nums sm:px-5" style={broadcastBodyTextStyle}>
                        {pointsForPerGame !== null ? pointsForPerGame.toFixed(2) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums sm:px-5" style={broadcastMutedTextStyle}>{team.fptsAgainst.toFixed(2)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold tabular-nums sm:px-5" style={broadcastMutedTextStyle}>
                        {pointsAgainstPerGame !== null ? pointsAgainstPerGame.toFixed(2) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold sm:px-5" style={broadcastMutedTextStyle}>
                        {streak && streak.type && streak.length > 0 ? `${streak.type}${streak.length}` : '—'}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 text-sm font-semibold tabular-nums sm:px-5"
                        style={broadcastBodyTextStyle}
                        title={luckEntry
                          ? `Combined expected wins: ${luckEntry.expectedWins.toFixed(2)} (All-Play: ${luckEntry.allPlayExpected.toFixed(2)}, Historical: ${luckEntry.historicalExpected.toFixed(2)})`
                          : undefined}
                      >
                        {luckStatus === 'loading' ? '…' : luckStatus === 'ready' && luckEntry
                          ? `${luckEntry.luck > 0 ? '+' : ''}${luckEntry.luck.toFixed(2)}`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 border-t border-[var(--panel-hairline)] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] sm:px-5" style={broadcastMutedTextStyle}>
            <span className="h-0.5 w-8 bg-[#2563eb]" aria-hidden="true" />
            Seeds 1-{playoffTeams} qualify for the playoffs
          </div>
          <div className="border-t border-[var(--panel-hairline)] px-4 py-3 text-xs leading-relaxed sm:px-5" style={broadcastMutedTextStyle}>
            <p>
              <span className="font-bold" style={broadcastBodyTextStyle}>How Luck is calculated:</span>{' '}
              We use two equally weighted models to estimate how many games a team should have won based on its weekly scores.
            </p>
            <p className="mt-1">
              <span className="font-semibold" style={broadcastBodyTextStyle}>All-Play (50%):</span>{' '}
              Each week, how often would the team&apos;s score beat the other 11 teams that same week?
              <span className="ml-2 font-semibold" style={broadcastBodyTextStyle}>Historical (50%):</span>{' '}
              Each week, how often would its score beat all completed East v. West regular-season scores since 2023? Every season uses the same growing pool, including scores from later seasons.
            </p>
            <p className="mt-1">
              We add each model&apos;s weekly win probabilities to get two expected-win totals, then average them.
              <span className="ml-2 font-semibold" style={broadcastBodyTextStyle}>Luck = Actual Wins − Average Expected Wins.</span>{' '}
              Positive means more wins than expected; negative means fewer.
              For example, 7 actual wins against 8.1 All-Play and 8.5 historical expected wins produces −1.3 Luck.
              Recalculated after every completed week.
            </p>
            {luckStatus === 'unavailable' && (
              <p className="mt-1 font-semibold">Luck numbers are temporarily unavailable.</p>
            )}
          </div>
        </BroadcastPanel>
      </div>
    </div>
  );
}
