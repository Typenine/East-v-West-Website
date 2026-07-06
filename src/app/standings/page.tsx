'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTeamsData, TeamData, getCurrentStreaksForLeague } from '@/lib/utils/sleeper-api';
import { getLeagueIdForSeason } from '@/lib/constants/league';
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

type SortKey = 'wins' | 'losses' | 'ties' | 'fpts' | 'fptsAgainst';
type SortDirection = 'asc' | 'desc';

const SEASON_OPTIONS = ['2025', '2024', '2023'];

const thClass = 'px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] sm:px-5';

export default function StandingsPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState('2025');
  const [streaks, setStreaks] = useState<Record<number, { type: 'W' | 'L' | 'T' | null; length: number }>>({});
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'wins',
    direction: 'desc'
  });
  
  const fetchStandings = useCallback(async () => {
    try {
      setLoading(true);
      // Get the league ID for the selected year
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
  
  const handleSort = (key: SortKey) => {
    let direction: SortDirection = 'desc';
    
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    
    setSortConfig({ key, direction });
  };
  
  const sortedTeams = [...teams].sort((a, b) => {
    // First sort by the selected key
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    
    // If tied on primary sort, use points for as tiebreaker
    if (sortConfig.key !== 'fpts') {
      if (a.fpts > b.fpts) {
        return -1;
      }
      if (a.fpts < b.fpts) {
        return 1;
      }
    }
    
    return 0;
  });
  
  // Assign seeds to sorted teams
  const teamsWithSeeds = sortedTeams.map((team, index) => ({
    ...team,
    seed: index + 1
  }));
  
  const seasonTabs = (
    <div className="mt-4 flex gap-2" role="tablist" aria-orientation="horizontal">
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
        <BroadcastPanel title="Standings" meta={selectedYear} bodyClassName="!p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr style={{ background: PANEL.headerBg, borderBottom: `1px solid ${PANEL.hairline}` }}>
                  <th scope="col" className={thClass} style={broadcastFaintTextStyle}>
                    Seed
                  </th>
                  <th scope="col" className={thClass} style={broadcastFaintTextStyle}>
                    Team
                  </th>
                  <th scope="col" className={thClass} aria-sort={sortAriaSort('wins')}>
                    {sortHeader('wins', 'Record')}
                  </th>
                  <th scope="col" className={thClass} aria-sort={sortAriaSort('fpts')}>
                    {sortHeader('fpts', 'PF')}
                  </th>
                  <th scope="col" className={thClass} aria-sort={sortAriaSort('fptsAgainst')}>
                    {sortHeader('fptsAgainst', 'PA')}
                  </th>
                  <th scope="col" className={thClass} style={broadcastFaintTextStyle}>
                    Streak
                  </th>
                </tr>
              </thead>
              <tbody>
                {teamsWithSeeds.map((team) => {
                  const accent = teamAccent(team.teamName);
                  const streak = streaks[team.rosterId];
                  return (
                    <tr
                      key={team.rosterId}
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                      style={{ borderBottom: `1px solid ${PANEL.hairline}`, borderLeft: `3px solid ${accent}` }}
                      onClick={() => (window.location.href = `/teams/${team.rosterId}?year=${selectedYear}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          window.location.href = `/teams/${team.rosterId}?year=${selectedYear}`;
                        }
                      }}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold tabular-nums sm:px-5" style={broadcastMutedTextStyle}>
                        {team.seed}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 sm:px-5">
                        <div className="flex items-center gap-3">
                          <BroadcastTeamLogo team={team.teamName} accent={accent} size="sm" />
                          <span className="truncate text-sm font-bold" style={broadcastBodyTextStyle}>
                            {team.teamName}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold tabular-nums sm:px-5" style={broadcastBodyTextStyle}>
                        {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums sm:px-5" style={broadcastBodyTextStyle}>
                        {team.fpts.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm tabular-nums sm:px-5" style={broadcastMutedTextStyle}>
                        {team.fptsAgainst.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold sm:px-5" style={broadcastMutedTextStyle}>
                        {streak && streak.type && streak.length > 0 ? `${streak.type}${streak.length}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </BroadcastPanel>
      </div>
    </div>
  );
}
