'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { getTeamsData, TeamData } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import { Card, CardContent } from '@/components/ui/Card';
import SectionHeader from '@/components/ui/SectionHeader';
import Label from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

type SortKey = 'wins' | 'losses' | 'ties' | 'fpts' | 'fptsAgainst';
type SortDirection = 'asc' | 'desc';

export default function StandingsPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState('2025');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'wins',
    direction: 'desc'
  });
  
  const fetchStandings = useCallback(async () => {
    try {
      setLoading(true);
      // Get the league ID for the selected year
      let leagueId = LEAGUE_IDS.CURRENT;
      if (selectedYear !== '2025') {
        leagueId = LEAGUE_IDS.PREVIOUS[selectedYear as keyof typeof LEAGUE_IDS.PREVIOUS];
      }
      const teamsData = await getTeamsData(leagueId);
      setTeams(teamsData);
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
  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader 
          title="Standings"
          actions={(
            <div className="flex items-center gap-2">
              <Label htmlFor="year-select">Season</Label>
              <Select
                id="year-select"
                size="sm"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                fullWidth={false}
              >
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="2023">2023</option>
              </Select>
            </div>
          )}
        />
        <LoadingState message="Loading standings..." />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader 
          title="Standings"
          actions={(
            <div className="flex items-center gap-2">
              <Label htmlFor="year-select">Season</Label>
              <Select
                id="year-select"
                size="sm"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                fullWidth={false}
              >
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="2023">2023</option>
              </Select>
            </div>
          )}
        />
        <ErrorState message={error} retry={fetchStandings} homeLink />
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader 
        title="Standings"
        actions={(
          <div className="flex items-center gap-2">
            <Label htmlFor="year-select">Season</Label>
            <Select
              id="year-select"
              size="sm"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              fullWidth={false}
            >
              <option value="2025">2025</option>
              <option value="2024">2024</option>
              <option value="2023">2023</option>
            </Select>
          </div>
        )}
      />
      
      <Card className="overflow-x-auto">
        <CardContent className="p-0">
          <table className="min-w-full divide-y divide-[var(--border)]">
            <thead className="bg-[var(--surface)]">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                Seed
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                Team
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider"
                aria-sort={sortConfig.key === 'wins' ? (sortConfig.direction === 'desc' ? 'descending' : 'ascending') : 'none'}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-1"
                  onClick={() => handleSort('wins')}
                  aria-label={`Sort by record ${sortConfig.key === 'wins' && sortConfig.direction === 'desc' ? 'ascending' : 'descending'}`}
                >
                  Record
                  {sortConfig.key === 'wins' && (
                    <span className="ml-1" aria-hidden="true">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>
                  )}
                </Button>
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider"
                aria-sort={sortConfig.key === 'fpts' ? (sortConfig.direction === 'desc' ? 'descending' : 'ascending') : 'none'}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-1"
                  onClick={() => handleSort('fpts')}
                >
                  PF
                  {sortConfig.key === 'fpts' && (
                    <span className="ml-1" aria-hidden="true">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>
                  )}
                </Button>
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider"
                aria-sort={sortConfig.key === 'fptsAgainst' ? (sortConfig.direction === 'desc' ? 'descending' : 'ascending') : 'none'}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-1"
                  onClick={() => handleSort('fptsAgainst')}
                >
                  PA
                  {sortConfig.key === 'fptsAgainst' && (
                    <span className="ml-1" aria-hidden="true">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>
                  )}
                </Button>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                Streak
              </th>
            </tr>
          </thead>
          <tbody className="bg-transparent divide-y divide-[var(--border)]">
            {teamsWithSeeds.map((team) => (
              <tr 
                key={team.rosterId}
                className="cursor-pointer"
                role="link"
                tabIndex={0}
                onClick={() => (window.location.href = `/teams/${team.rosterId}?year=${selectedYear}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    window.location.href = `/teams/${team.rosterId}?year=${selectedYear}`;
                  }
                }}
                style={{ borderLeft: `4px solid ${getTeamColorStyle(team.teamName).backgroundColor}` }}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-[var(--text)]">{team.seed}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center mr-3 overflow-hidden" 
                      style={getTeamColorStyle(team.teamName)}
                    >
                      <Image
                        src={getTeamLogoPath(team.teamName)}
                        alt={team.teamName}
                        width={24}
                        height={24}
                        className="object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const fallback = document.createElement('div');
                            fallback.className = 'flex items-center justify-center h-full w-full';
                            fallback.innerHTML = `<span class="text-xs font-bold">${team.teamName.charAt(0)}</span>`;
                            parent.appendChild(fallback);
                          }
                        }}
                      />
                    </div>
                    <div className="text-sm font-medium" style={{ color: getTeamColorStyle(team.teamName).backgroundColor }}>
                      {team.teamName}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-[var(--text)]">
                    {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-[var(--text)]">{team.fpts.toFixed(2)}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-[var(--text)]">{team.fptsAgainst.toFixed(2)}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-[var(--text)]">
                    {/* We would calculate streak here from weekly results */}
                    {/* For now, just show a placeholder */}
                    {team.wins > team.losses ? `W${Math.min(team.wins, 3)}` : `L${Math.min(team.losses, 3)}`}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </CardContent>
      </Card>
    </div>
  );
}
