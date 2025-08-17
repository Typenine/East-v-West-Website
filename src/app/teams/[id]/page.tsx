'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Tab } from '@headlessui/react';
import { 
  getTeamsData, 
  getTeamWeeklyResults, 
  getAllPlayers,
  SleeperPlayer,
  TeamData,
  getTeamAllTimeStatsByOwner,
  getTeamH2HRecordsAllTimeByOwner,
  getPlayersPPRAndPPG,
} from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamLogoPath, getTeamColorStyle, resolveCanonicalTeamName } from '@/lib/utils/team-utils';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';

// Position grouping order for roster sections
const POSITION_GROUP_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF/DST', 'DL', 'LB', 'DB', 'Other'] as const;
type PositionGroup = typeof POSITION_GROUP_ORDER[number];

const toPositionGroup = (pos?: string): string => {
  const p = (pos || '').toUpperCase();
  if (p === 'DST' || p === 'DEF') return 'DEF/DST';
  if (p === 'HB' || p === 'FB') return 'RB';
  if (p === 'PK') return 'K';
  if (p === 'DE' || p === 'DT' || p === 'EDGE' || p === 'DL') return 'DL';
  if (p === 'CB' || p === 'S' || p === 'FS' || p === 'SS' || p === 'DB') return 'DB';
  return p || 'Other';
};

const groupOrderIndex = (group: string): number => {
  const idx = POSITION_GROUP_ORDER.indexOf(group as PositionGroup);
  return idx === -1 ? 99 : idx;
};

// Roster News types (from /api/roster-news)
type RosterNewsMatch = { playerId: string; name: string };
type RosterNewsItem = {
  sourceName: string;
  title: string;
  link: string;
  description: string;
  publishedAt: string | null;
  matches: RosterNewsMatch[];
};
type RosterNewsResponse = {
  generatedAt: string;
  count: number;
  sinceHours: number;
  items: RosterNewsItem[];
};

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
  const [h2hRecords, setH2HRecords] = useState<Record<string, { wins: number, losses: number, ties: number }>>({});
  const [players, setPlayers] = useState<Record<string, SleeperPlayer>>({});
  const [playerSeasonStats, setPlayerSeasonStats] = useState<Record<string, { totalPPR: number; gp: number; ppg: number }>>({});
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
  // News state
  const [news, setNews] = useState<RosterNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsWindowHours, setNewsWindowHours] = useState<number>(336); // 14 days default
  
  // Sorting state for roster table
  type SortKey = 'name' | 'position' | 'team' | 'gp' | 'totalPPR' | 'ppg';
  const [sortBy, setSortBy] = useState<SortKey>('ppg');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const onSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir(key === 'name' || key === 'position' || key === 'team' ? 'asc' : 'desc');
    }
  };
  const sortArrow = (key: SortKey) => sortBy === key ? (sortDir === 'asc' ? '▲' : '▼') : null;
  
  const sortedGroups = useMemo(() => {
    if (!team?.players) return [] as { group: string; ids: string[] }[];
    const byGroup: Record<string, string[]> = {};
    for (const pid of team.players) {
      const pos = players[pid]?.position;
      const group = toPositionGroup(pos);
      if (!byGroup[group]) byGroup[group] = [];
      byGroup[group].push(pid);
    }
    // Sort players within group by selected column, then name asc as tiebreaker
    for (const g of Object.keys(byGroup)) {
      byGroup[g].sort((a, b) => {
        type SortVal = string | number | null;
        const pa = players[a];
        const pb = players[b];
        const val = (pid: string): SortVal => {
          const p = players[pid];
          const s = playerSeasonStats[pid];
          switch (sortBy) {
            case 'name': return p ? `${p.first_name} ${p.last_name}` : '';
            case 'position': return p?.position || '';
            case 'team': return p?.team || '';
            case 'gp': return s?.gp ?? null;
            case 'totalPPR': return s?.totalPPR ?? null;
            case 'ppg': return s?.ppg ?? null;
            default: return null;
          }
        };
        const va = val(a);
        const vb = val(b);
        // Missing values always go to the bottom
        if (va === null && vb !== null) return 1;
        if (va !== null && vb === null) return -1;
        let cmp = 0;
        if (typeof va === 'number' && typeof vb === 'number') {
          cmp = va - vb;
        } else {
          cmp = String(va).localeCompare(String(vb));
        }
        if (cmp === 0) {
          const nameA = pa ? `${pa.first_name} ${pa.last_name}` : '';
          const nameB = pb ? `${pb.first_name} ${pb.last_name}` : '';
          cmp = nameA.localeCompare(nameB);
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    // Order groups by defined order
    const groups = Object.keys(byGroup).sort((ga, gb) => groupOrderIndex(ga) - groupOrderIndex(gb));
    return groups.map((g) => ({ group: g, ids: byGroup[g] }));
  }, [team?.players, players, playerSeasonStats, sortBy, sortDir]);
  
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
        
        // Fetch weekly results (season-scoped)
        const results = await getTeamWeeklyResults(leagueId, rosterId);
        setWeeklyResults(results);

        // Fetch all-time H2H records (aggregated by owner across seasons)
        const h2hAllTime = await getTeamH2HRecordsAllTimeByOwner(currentTeam.ownerId);
        setH2HRecords(h2hAllTime);
        
        // Fetch players data and season stats if team has players
        if (currentTeam.players && currentTeam.players.length > 0) {
          try {
            const [allPlayersData, seasonStats] = await Promise.all([
              getAllPlayers(),
              getPlayersPPRAndPPG(selectedYear, currentTeam.players),
            ]);
            setPlayers(allPlayersData);
            setPlayerSeasonStats(seasonStats);
          } catch {
            // Best-effort: still attempt to load players
            try {
              const allPlayersData = await getAllPlayers();
              setPlayers(allPlayersData);
            } catch {
              /* ignore */
            }
          }
        }
        
        // Fetch all-time aggregate stats by owner across seasons
        const allTime = await getTeamAllTimeStatsByOwner(currentTeam.ownerId);
        setAllTimeStats(allTime);
        
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

  // Fetch roster-based news via /api/roster-news
  useEffect(() => {
    const load = async () => {
      if (!team || !team.players || team.players.length === 0) return;
      try {
        setNewsLoading(true);
        setNewsError(null);
        const playerIds = encodeURIComponent(team.players.join(','));
        // Use selected timeframe and increased limit for more articles
        const res = await fetch(`/api/roster-news?playerIds=${playerIds}&limit=100&sinceHours=${newsWindowHours}` as const, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to fetch roster news: ${res.status}`);
        const data: RosterNewsResponse = await res.json();
        setNews(data.items || []);
      } catch (e) {
        console.error(e);
        setNewsError('Failed to load news');
      } finally {
        setNewsLoading(false);
      }
    };
    load();
  }, [team, newsWindowHours]);
  
  // Group news by matched player for better readability
  const newsGrouped = useMemo(() => {
    if (!news || news.length === 0) return [] as Array<{ playerId: string; playerName: string; items: RosterNewsItem[] }>;
    const map: Record<string, { playerId: string; playerName: string; items: RosterNewsItem[] }> = {};
    for (const it of news) {
      if (!it.matches) continue;
      for (const m of it.matches) {
        // Ensure the match is for a player on this roster
        if (team?.players && !team.players.includes(m.playerId)) continue;
        const p = players[m.playerId];
        const playerName = p ? `${p.first_name} ${p.last_name}` : m.name;
        if (!map[m.playerId]) {
          map[m.playerId] = { playerId: m.playerId, playerName, items: [] };
        }
        map[m.playerId].items.push(it);
      }
    }
    const groups = Object.values(map);
    // Sort groups by number of items desc, then name asc
    groups.sort((a, b) => (b.items.length - a.items.length) || a.playerName.localeCompare(b.playerName));
    // Sort items in each group by published date desc
    for (const g of groups) {
      g.items.sort((a, b) => {
        const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return tb - ta;
      });
    }
    return groups;
  }, [news, players, team?.players]);
  
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
            News
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
                        <button type="button" onClick={() => onSort('name')} className="flex items-center gap-1 hover:text-gray-700">
                          Player <span className="opacity-60">{sortArrow('name')}</span>
                        </button>
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button type="button" onClick={() => onSort('position')} className="flex items-center gap-1 hover:text-gray-700">
                          Position <span className="opacity-60">{sortArrow('position')}</span>
                        </button>
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button type="button" onClick={() => onSort('team')} className="flex items-center gap-1 hover:text-gray-700">
                          Team <span className="opacity-60">{sortArrow('team')}</span>
                        </button>
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button type="button" onClick={() => onSort('gp')} className="flex items-center gap-1 hover:text-gray-700">
                          G <span className="opacity-60">{sortArrow('gp')}</span>
                        </button>
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button type="button" onClick={() => onSort('totalPPR')} className="flex items-center gap-1 hover:text-gray-700">
                          Total PPR <span className="opacity-60">{sortArrow('totalPPR')}</span>
                        </button>
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button type="button" onClick={() => onSort('ppg')} className="flex items-center gap-1 hover:text-gray-700">
                          PPG <span className="opacity-60">{sortArrow('ppg')}</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sortedGroups.map(({ group, ids }) => (
                      [
                        (
                          <tr key={`hdr-${group}`} className="bg-gray-100">
                            <td colSpan={6} className="px-6 py-2 text-xs font-semibold text-gray-600 uppercase">
                              {group}
                            </td>
                          </tr>
                        ),
                        ...ids.map((playerId) => {
                          const player = players[playerId];
                          if (!player) return null;
                          const s = playerSeasonStats[playerId];
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
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-500">{(s?.gp ?? 0)}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-500">{(s?.totalPPR ?? 0).toFixed(1)}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{(s?.ppg ?? 0).toFixed(2)}</div>
                              </td>
                            </tr>
                          );
                        })
                      ]
                    ))}
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
                  {Object.entries(h2hRecords).map(([opponentOwnerId, record]) => {
                    const opponentName = resolveCanonicalTeamName({ ownerId: opponentOwnerId });
                    const totalGames = record.wins + record.losses + record.ties;
                    const winPercentage = totalGames > 0 ? (record.wins + record.ties * 0.5) / totalGames : 0;

                    return (
                      <tr key={opponentOwnerId}>
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
          {/* News Panel */}
          <Tab.Panel className="rounded-xl bg-white p-3 shadow-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Roster News</h2>
              <div className="flex items-center gap-3">
                {news && news.length > 0 ? (
                  <span className="text-sm text-gray-600">{news.length} articles</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setNewsWindowHours((h) => (h === 336 ? 720 : 336))}
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                  {newsWindowHours === 336 ? 'Show older (30d)' : 'Show recent (14d)'}
                </button>
              </div>
            </div>
            {newsLoading && (
              <div className="py-6"><LoadingState message="Loading news..." /></div>
            )}
            {newsError && (
              <div className="py-6"><ErrorState message={newsError} /></div>
            )}
            {!newsLoading && !newsError && (
              <div>
                {newsGrouped && newsGrouped.length > 0 ? (
                  <div className="space-y-8">
                    {newsGrouped.map((group) => {
                      const p = players[group.playerId];
                      const meta = p ? `${p.position || ''}${p.team ? ` • ${p.team}` : ''}` : '';
                      return (
                        <section key={group.playerId}>
                          <div className="flex items-baseline justify-between mb-2">
                            <h3 className="text-lg font-semibold">
                              {group.playerName}
                              {meta ? <span className="ml-2 text-sm text-gray-500">{meta}</span> : null}
                            </h3>
                            <span className="text-xs text-gray-500">{group.items.length} article{group.items.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="space-y-4">
                            {group.items.map((it, idx) => (
                              <article
                                key={`${group.playerId}-${it.link}-${idx}`}
                                className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition"
                                role="link"
                                tabIndex={0}
                                onClick={(e) => {
                                  const target = e.target as HTMLElement;
                                  if (target && target.closest('a')) return; // don't double-open when clicking existing links
                                  if (it.link) window.open(it.link, '_blank', 'noopener,noreferrer');
                                }}
                                onKeyDown={(e) => {
                                  if ((e.key === 'Enter' || e.key === ' ') && it.link) {
                                    e.preventDefault();
                                    window.open(it.link, '_blank', 'noopener,noreferrer');
                                  }
                                }}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <div className="text-sm text-gray-600">{it.sourceName}</div>
                                  <div className="text-xs text-gray-500">{it.publishedAt ? new Date(it.publishedAt).toLocaleString() : ''}</div>
                                </div>
                                <h4 className="font-semibold hover:underline">{it.title}</h4>
                                <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{it.description}</p>
                                <div className="mt-2">
                                  <a
                                    href={it.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center text-sm text-blue-600 hover:underline"
                                  >
                                    Read at source ↗
                                  </a>
                                </div>
                              </article>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-gray-500">No recent news found for this roster.</p>
                )}
              </div>
            )}
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
