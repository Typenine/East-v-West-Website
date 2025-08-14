'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { getTeamsData, TeamData } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';

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
  
  useEffect(() => {
    async function fetchStandings() {
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
    }
    
    fetchStandings();
  }, [selectedYear]);
  
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
        <h1 className="text-3xl font-bold text-center mb-8">Standings</h1>
        <div className="animate-pulse">
          <div className="h-10 bg-slate-200 w-1/4 mb-6 rounded"></div>
          <div className="h-60 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-8">Standings</h1>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Standings</h1>
      
      <div className="mb-6">
        <label htmlFor="year-select" className="block text-sm font-medium text-gray-700 mb-2">
          Season
        </label>
        <select
          id="year-select"
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        >
          <option value="2025">2025 Season</option>
          <option value="2024">2024 Season</option>
          <option value="2023">2023 Season</option>
        </select>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Seed
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Team
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('wins')}
                aria-sort={sortConfig.key === 'wins' ? (sortConfig.direction === 'desc' ? 'descending' : 'ascending') : 'none'}
              >
                <button 
                  className="font-medium text-gray-500 uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded px-1"
                  aria-label={`Sort by record ${sortConfig.key === 'wins' && sortConfig.direction === 'desc' ? 'ascending' : 'descending'}`}
                >
                  Record
                  {sortConfig.key === 'wins' && (
                    <span className="ml-1" aria-hidden="true">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>
                  )}
                </button>
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('fpts')}
              >
                PF
                {sortConfig.key === 'fpts' && (
                  <span className="ml-1">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>
                )}
              </th>
              <th 
                scope="col" 
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer"
                onClick={() => handleSort('fptsAgainst')}
              >
                PA
                {sortConfig.key === 'fptsAgainst' && (
                  <span className="ml-1">{sortConfig.direction === 'desc' ? '▼' : '▲'}</span>
                )}
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Streak
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {teamsWithSeeds.map((team) => (
              <tr 
                key={team.rosterId}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => window.location.href = `/teams/${team.rosterId}?year=${selectedYear}`}
                style={{ borderLeft: `4px solid ${getTeamColorStyle(team.teamName).backgroundColor}` }}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{team.seed}</div>
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
                  <div className="text-sm text-gray-900">
                    {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{team.fpts.toFixed(2)}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{team.fptsAgainst.toFixed(2)}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {/* We would calculate streak here from weekly results */}
                    {/* For now, just show a placeholder */}
                    {team.wins > team.losses ? `W${Math.min(team.wins, 3)}` : `L${Math.min(team.losses, 3)}`}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
