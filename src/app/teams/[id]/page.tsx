'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Tab } from '@headlessui/react';
import { 
  getTeamsData, 
  getTeamWeeklyResults, 
  getTeamH2HRecords,
  getAllPlayers,
  SleeperPlayer,
  TeamData
} from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function TeamPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rosterId = parseInt(params.id as string);
  const yearParam = searchParams.get('year') || '2025';
  
  const [team, setTeam] = useState<TeamData | null>(null);
  const [weeklyResults, setWeeklyResults] = useState<Array<{
    week: number;
    points: number;
    opponent: number;
    opponentPoints: number;
    result: 'W' | 'L' | 'T';
    opponentRosterId: number;
  }>>([]);
  const [h2hRecords, setH2HRecords] = useState<Record<number, { wins: number, losses: number, ties: number }>>({});
  const [players, setPlayers] = useState<Record<string, SleeperPlayer>>({});
  const [allTeams, setAllTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(yearParam);
  const [allTimeStats, setAllTimeStats] = useState({
    wins: 0,
    losses: 0,
    ties: 0,
    totalPF: 0,
    totalPA: 0,
    avgPF: 0,
    avgPA: 0,
    highestScore: 0,
    lowestScore: 999
  });
  
  // Get the league ID for the selected year
  const getLeagueIdForYear = (year: string) => {
    if (year === '2025') return LEAGUE_IDS.CURRENT;
    return LEAGUE_IDS.PREVIOUS[year as keyof typeof LEAGUE_IDS.PREVIOUS];
  };
  
  useEffect(() => {
    async function fetchTeamData() {
      try {
        setLoading(true);
        
        // Get the league ID for the selected year
        const leagueId = getLeagueIdForYear(selectedYear);
        
        // Fetch teams data for the selected year
        const teamsData = await getTeamsData(leagueId);
        setAllTeams(teamsData);
        
        // Find the current team
        const currentTeam = teamsData.find(t => t.rosterId === rosterId);
        if (!currentTeam) {
          throw new Error('Team not found');
        }
        setTeam(currentTeam);
        
        // Fetch weekly results
        const results = await getTeamWeeklyResults(leagueId, rosterId);
        setWeeklyResults(results);
        
        // Fetch H2H records
        const h2h = await getTeamH2HRecords(leagueId, rosterId);
        setH2HRecords(h2h);
        
        // Fetch players data if team has players
        if (currentTeam.players && currentTeam.players.length > 0) {
          const allPlayersData = await getAllPlayers();
          setPlayers(allPlayersData);
        }
        
        // Calculate all-time stats
        // In a real implementation, we would fetch data from all years
        // For now, we'll use the current year as a placeholder
        setAllTimeStats({
          wins: currentTeam.wins,
          losses: currentTeam.losses,
          ties: currentTeam.ties,
          totalPF: currentTeam.fpts,
          totalPA: currentTeam.fptsAgainst,
          avgPF: currentTeam.fpts / (currentTeam.wins + currentTeam.losses + currentTeam.ties || 1),
          avgPA: currentTeam.fptsAgainst / (currentTeam.wins + currentTeam.losses + currentTeam.ties || 1),
          highestScore: Math.max(...results.map(r => r.points)),
          lowestScore: Math.min(...results.map(r => r.points))
        });
        
        setError(null);
      } catch (err) {
        console.error('Error fetching team data:', err);
        setError('Failed to load team data. Please try again later.');
      } finally {
        setLoading(false);
      }
    }
    
    fetchTeamData();
  }, [rosterId, selectedYear]);
  
  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    // Update URL without refreshing the page
    const url = new URL(window.location.href);
    url.searchParams.set('year', year);
    window.history.pushState({}, '', url);
  };
  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingState message="Loading team data..." />
      </div>
    );
  }
  
  if (error || !team) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ErrorState
          message={error || 'Team not found'}
          retry={() => {
            setLoading(true);
            setError(null);
            // Re-fetch team data
            (async () => {
              try {
                const leagueId = getLeagueIdForYear(selectedYear);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const teamsData = await getTeamsData(leagueId);
                // Process team data would go here...
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load team data');
              } finally {
                setLoading(false);
              }
            })();
          }}
        />
      </div>
    );
  }
  
  // Find the team's canonical name
  const teamName = team.teamName;
  
  // Function to handle missing logo images
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    target.style.display = 'none';
    const parent = target.parentElement;
    if (parent) {
      const fallback = document.createElement('div');
      fallback.className = 'flex items-center justify-center h-full w-full';
      fallback.innerHTML = `<span class="text-4xl font-bold">${target.alt.charAt(0)}</span>`;
      parent.appendChild(fallback);
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col items-center mb-8">
        <div 
          className="w-32 h-32 rounded-full flex items-center justify-center mb-4 overflow-hidden" 
          style={getTeamColorStyle(teamName)}
        >
          <Image
            src={getTeamLogoPath(teamName)}
            alt={teamName}
            width={100}
            height={100}
            className="object-contain p-2"
            onError={handleImageError}
          />
        </div>
        <h1 className="text-3xl font-bold text-center mb-2">{teamName}</h1>
        <p className="text-center text-gray-600 mb-4">
          All-time Record: {allTimeStats.wins}-{allTimeStats.losses}-{allTimeStats.ties}
        </p>
      </div>
      
      {/* All-time summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" style={{borderTop: `4px solid ${getTeamColorStyle(teamName).backgroundColor}`}}>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Total PF</div>
          <div className="text-2xl font-bold">{allTimeStats.totalPF.toFixed(2)}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Total PA</div>
          <div className="text-2xl font-bold">{allTimeStats.totalPA.toFixed(2)}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Avg PF/Week</div>
          <div className="text-2xl font-bold">{allTimeStats.avgPF.toFixed(2)}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm text-gray-500">Avg PA/Week</div>
          <div className="text-2xl font-bold">{allTimeStats.avgPA.toFixed(2)}</div>
        </div>
      </div>
      
      {/* Season selector */}
      <div className="mb-8">
        <label htmlFor="year-select" className="block text-sm font-medium text-gray-700 mb-2">
          Select Season
        </label>
        <select
          id="year-select"
          value={selectedYear}
          onChange={(e) => handleYearChange(e.target.value)}
          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
        >
          <option value="2025">2025 Season</option>
          <option value="2024">2024 Season</option>
          <option value="2023">2023 Season</option>
        </select>
      </div>
      
      <Tab.Group>
        <Tab.List className="flex space-x-1 rounded-xl p-1" style={{backgroundColor: `${getTeamColorStyle(teamName).backgroundColor}20`}}>
          <Tab
            className={({ selected }) =>
              classNames(
                'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                'ring-white ring-opacity-60 ring-offset-2 focus:outline-none focus:ring-2',
                selected
                  ? 'bg-white shadow'
                  : 'text-gray-100 hover:bg-white/[0.12] hover:text-white'
              )
            }
            style={{
              color: getTeamColorStyle(teamName).backgroundColor
            }}
          >
            Roster
          </Tab>
          <Tab
            className={({ selected }) =>
              classNames(
                'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                'ring-white ring-opacity-60 ring-offset-2 focus:outline-none focus:ring-2',
                selected
                  ? 'bg-white shadow'
                  : 'text-gray-100 hover:bg-white/[0.12] hover:text-white'
              )
            }
            style={{
              color: getTeamColorStyle(teamName).backgroundColor
            }}
          >
            Schedule
          </Tab>
          <Tab
            className={({ selected }) =>
              classNames(
                'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                'ring-white ring-opacity-60 ring-offset-2 focus:outline-none focus:ring-2',
                selected
                  ? 'bg-white shadow'
                  : 'text-gray-100 hover:bg-white/[0.12] hover:text-white'
              )
            }
            style={{
              color: getTeamColorStyle(teamName).backgroundColor
            }}
          >
            H2H Records
          </Tab>
          <Tab
            className={({ selected }) =>
              classNames(
                'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                'ring-white ring-opacity-60 ring-offset-2 focus:outline-none focus:ring-2',
                selected
                  ? 'bg-white shadow'
                  : 'text-gray-100 hover:bg-white/[0.12] hover:text-white'
              )
            }
          >
            Records
          </Tab>
        </Tab.List>
        <Tab.Panels>
          {/* Roster Panel */}
          <Tab.Panel className="rounded-xl bg-white p-3 shadow-md">
            <h2 className="text-xl font-bold mb-4">Current Roster</h2>
            {team.players && team.players.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Player
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Position
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Team
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {team.players.map((playerId) => {
                      const player = players[playerId];
                      if (!player) return null;
                      
                      return (
                        <tr key={playerId}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {player.first_name} {player.last_name}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{player.position}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">{player.team}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No roster data available</p>
            )}
          </Tab.Panel>
          
          {/* Schedule Panel */}
          <Tab.Panel className="rounded-xl bg-white p-3 shadow-md">
            <h2 className="text-xl font-bold mb-4">Season Schedule</h2>
            {weeklyResults && weeklyResults.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Week
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Opponent
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Result
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {weeklyResults.map((result) => {
                      const opponentTeam = allTeams.find(t => t.rosterId === result.opponent);
                      const opponentName = opponentTeam ? opponentTeam.teamName : 'Unknown Team';
                      
                      return (
                        <tr key={result.week}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">Week {result.week}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{opponentName}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              result.result === 'W' ? 'bg-green-100 text-green-800' :
                              result.result === 'L' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {result.result}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {result.points.toFixed(2)} - {result.opponentPoints.toFixed(2)}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No schedule data available</p>
            )}
          </Tab.Panel>
          
          {/* H2H Records Panel */}
          <Tab.Panel className="rounded-xl bg-white p-3 shadow-md">
            <h2 className="text-xl font-bold mb-4">Head-to-Head Records</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Team
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Record
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Win %
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(h2hRecords).map(([opponentId, record]) => {
                    const opponentTeam = allTeams.find(t => t.rosterId === parseInt(opponentId));
                    const opponentName = opponentTeam ? opponentTeam.teamName : 'Unknown Team';
                    const totalGames = record.wins + record.losses + record.ties;
                    const winPercentage = totalGames > 0 ? (record.wins + record.ties * 0.5) / totalGames : 0;
                    
                    return (
                      <tr key={opponentId}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{opponentName}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {record.wins}-{record.losses}{record.ties > 0 ? `-${record.ties}` : ''}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {(winPercentage * 100).toFixed(1)}%
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Tab.Panel>
          
          {/* Records Panel */}
          <Tab.Panel className="rounded-xl bg-white p-3 shadow-md">
            <h2 className="text-xl font-bold mb-4">Team Records</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-2">Highest Scoring Week</h3>
                <div className="text-2xl font-bold">{allTimeStats.highestScore.toFixed(2)} pts</div>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-2">Lowest Scoring Week</h3>
                <div className="text-2xl font-bold">{allTimeStats.lowestScore.toFixed(2)} pts</div>
              </div>
            </div>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
