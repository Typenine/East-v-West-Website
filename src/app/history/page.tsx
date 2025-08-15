'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CHAMPIONS } from '@/lib/constants/league';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import {
  getFranchisesAllTime,
  getLeagueRecordBook,
  getAllTeamsData,
  type FranchiseSummary,
  type LeagueRecordBook,
} from '@/lib/utils/sleeper-api';
import { CANONICAL_TEAM_BY_USER_ID } from '@/lib/constants/team-mapping';

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState('champions');
  // Franchises state
  const [franchises, setFranchises] = useState<FranchiseSummary[]>([]);
  const [franchisesLoading, setFranchisesLoading] = useState(true);
  const [franchisesError, setFranchisesError] = useState<string | null>(null);
  // Records state
  const [recordBook, setRecordBook] = useState<LeagueRecordBook | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  // Owner -> rosterId mapping (prefer most recent season)
  const [ownerToRosterId, setOwnerToRosterId] = useState<Record<string, number>>({});
  // Inverted map to get ownerId by canonical team name (for CHAMPIONS links)
  const ownerByTeamName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [ownerId, teamName] of Object.entries(CANONICAL_TEAM_BY_USER_ID)) {
      map[teamName] = ownerId;
    }
    return map;
  }, []);
  
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setFranchisesLoading(true);
        setRecordsLoading(true);
        setFranchisesError(null);
        setRecordsError(null);
        const [fr, rb, allTeams] = await Promise.all([
          getFranchisesAllTime(),
          getLeagueRecordBook(),
          getAllTeamsData(),
        ]);
        if (cancelled) return;
        setFranchises(fr);
        setRecordBook(rb);
        // Build owner -> rosterId mapping preferring 2025, then 2024, then 2023
        const map: Record<string, number> = {};
        for (const year of ['2025', '2024', '2023']) {
          const teams = allTeams[year] || [];
          for (const t of teams) {
            if (map[t.ownerId] === undefined) map[t.ownerId] = t.rosterId;
          }
        }
        setOwnerToRosterId(map);
      } catch (e) {
        console.error('Error loading history data:', e);
        if (!cancelled) {
          setFranchisesError('Failed to load franchise data. Please try again later.');
          setRecordsError('Failed to load records. Please try again later.');
        }
      } finally {
        if (!cancelled) {
          setFranchisesLoading(false);
          setRecordsLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);
  
  const tabs = [
    { id: 'champions', label: 'Champions' },
    { id: 'brackets', label: 'Brackets' },
    { id: 'leaderboards', label: 'Leaderboards' },
    { id: 'franchises', label: 'Franchises' },
    { id: 'records', label: 'Records' }
  ];
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">League History</h1>
      
      {/* Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
              `}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      
      {/* Champions Tab Content */}
      {activeTab === 'champions' && (
        <div>
          <h2 className="text-2xl font-bold mb-6">League Champions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(CHAMPIONS).map(([year, data]) => (
              <div key={year} className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="bg-blue-600 text-white px-4 py-2 text-lg font-bold">
                  {year} Season
                </div>
                <div className="p-6">
                  <div className="text-center">
                    <div className="text-5xl mb-4">🏆</div>
                    <h3 className="text-xl font-bold mb-2">{data.champion}</h3>
                    {(() => {
                      const ownerId = ownerByTeamName[data.champion as keyof typeof ownerByTeamName];
                      const rosterId = ownerId ? ownerToRosterId[ownerId] : undefined;
                      if (data.champion === 'TBD' || !ownerId || rosterId === undefined) {
                        return (
                          <span className="text-gray-400 text-sm">Link unavailable</span>
                        );
                      }
                      return (
                        <Link 
                          href={`/teams/${rosterId}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          View Team
                        </Link>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Brackets Tab Content */}
      {activeTab === 'brackets' && (
        <div>
          <h2 className="text-2xl font-bold mb-6">Playoff Brackets</h2>
          
          <div className="mb-6">
            <label htmlFor="year-select" className="block text-sm font-medium text-gray-700 mb-2">
              Select Year
            </label>
            <select
              id="year-select"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="2025">2025 Season</option>
              <option value="2024">2024 Season</option>
              <option value="2023">2023 Season</option>
            </select>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-center text-gray-500 py-8">
              <p className="text-lg">Playoff bracket visualization coming soon</p>
              <p className="text-sm mt-2">Check back after the playoffs begin</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Leaderboards Tab Content */}
      {activeTab === 'leaderboards' && (
        <div>
          <h2 className="text-2xl font-bold mb-6">All-Time Leaderboards</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Most Championships */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4">Most Championships</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rank
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Team
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Championships
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {/* Championship counts */}
                    {(() => {
                      // Create a counts object
                      const counts: Record<string, number> = {};
                      
                      // Count championships by team
                      Object.values(CHAMPIONS).forEach((data) => {
                        if (data.champion !== 'TBD') {
                          counts[data.champion] = (counts[data.champion] || 0) + 1;
                        }
                      });
                      
                      // Convert to array, sort, and take top 5
                      return Object.entries(counts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map((entry, index) => (
                          <tr key={entry[0]}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {index + 1}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {entry[0]}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {entry[1]}
                            </td>
                          </tr>
                        ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Most Points All-Time */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4">Most Points All-Time</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rank
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Team
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Points
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {/* This would be populated with real data from the API */}
                    {[
                      { team: 'Burrow My Sorrows', points: 4582.4 },
                      { team: 'Diggs in the Chat', points: 4498.2 },
                      { team: 'Kittle Me This', points: 4476.8 },
                      { team: 'Chubb Thumpers', points: 4389.5 },
                      { team: 'Waddle Waddle', points: 4356.1 }
                    ].map((entry, index) => (
                      <tr key={entry.team}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {entry.team}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {entry.points.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Best Win Percentage */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4">Best Win Percentage</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rank
                      </th>
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
                    {/* This would be populated with real data from the API */}
                    {[
                      { team: 'Diggs in the Chat', record: '28-10-0', percentage: 0.737 },
                      { team: 'Burrow My Sorrows', record: '26-12-0', percentage: 0.684 },
                      { team: 'Waddle Waddle', record: '25-13-0', percentage: 0.658 },
                      { team: 'Kittle Me This', record: '24-14-0', percentage: 0.632 },
                      { team: 'Chubb Thumpers', record: '22-16-0', percentage: 0.579 }
                    ].map((entry, index) => (
                      <tr key={entry.team}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {entry.team}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {entry.record}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {(entry.percentage * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Most Playoff Appearances */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4">Most Playoff Appearances</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rank
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Team
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Appearances
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {/* This would be populated with real data from the API */}
                    {[
                      { team: 'Burrow My Sorrows', appearances: 2 },
                      { team: 'Diggs in the Chat', appearances: 2 },
                      { team: 'Kittle Me This', appearances: 2 },
                      { team: 'Waddle Waddle', appearances: 2 },
                      { team: 'Chubb Thumpers', appearances: 1 }
                    ].map((entry, index) => (
                      <tr key={entry.team}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {entry.team}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {entry.appearances}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Franchises Tab Content */}
      {activeTab === 'franchises' && (
        <div>
          <h2 className="text-2xl font-bold mb-6">Franchise History</h2>
          
          {franchisesLoading ? (
            <LoadingState message="Loading franchises..." />
          ) : franchisesError ? (
            <ErrorState message={franchisesError} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {franchises.map((f) => {
                const rosterId = ownerToRosterId[f.ownerId];
                const content = (
                  <div className="bg-white shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="p-6">
                      <h3 className="text-xl font-bold mb-2">{f.teamName}</h3>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>
                          Record: {f.wins}-{f.losses}
                          {f.ties > 0 ? `-${f.ties}` : ''} ({(() => {
                            const g = f.wins + f.losses + f.ties;
                            return g > 0 ? ((f.wins + f.ties * 0.5) / g * 100).toFixed(1) : '0.0';
                          })()}%)
                        </p>
                        <p>Total PF: {f.totalPF.toFixed(2)}</p>
                        <p>Avg PF: {f.avgPF.toFixed(2)}</p>
                        <p>Championships: {f.championships}</p>
                      </div>
                    </div>
                  </div>
                );
                return rosterId !== undefined ? (
                  <Link key={f.ownerId} href={`/teams/${rosterId}`} className="block">
                    {content}
                  </Link>
                ) : (
                  <div key={f.ownerId}>{content}</div>
                );
              })}
            </div>
          )}
        </div>
      )}
      
      {/* Records Tab Content */}
      {activeTab === 'records' && (
        <div>
          <h2 className="text-2xl font-bold mb-6">League Records</h2>
          
          {recordsLoading ? (
            <LoadingState message="Loading record book..." />
          ) : recordsError ? (
            <ErrorState message={recordsError} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Highest Scoring Game */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold mb-4">Highest Scoring Game</h3>
                <div className="text-center">
                  {recordBook?.highestScoringGame ? (
                    <>
                      <p className="text-4xl font-bold text-blue-600 mb-2">{recordBook.highestScoringGame.points.toFixed(2)}</p>
                      {(() => {
                        const ownerId = recordBook.highestScoringGame!.ownerId;
                        const rosterId = ownerToRosterId[ownerId];
                        const name = recordBook.highestScoringGame!.teamName;
                        return rosterId !== undefined ? (
                          <Link href={`/teams/${rosterId}`} className="text-lg font-semibold text-blue-700 hover:underline">{name}</Link>
                        ) : (
                          <p className="text-lg font-semibold">{name}</p>
                        );
                      })()}
                      <p className="text-gray-600">Week {recordBook.highestScoringGame.week}, {recordBook.highestScoringGame.year} Season</p>
                    </>
                  ) : (
                    <p className="text-gray-500">No data</p>
                  )}
                </div>
              </div>
              
              {/* Lowest Scoring Game */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold mb-4">Lowest Scoring Game</h3>
                <div className="text-center">
                  {recordBook?.lowestScoringGame ? (
                    <>
                      <p className="text-4xl font-bold text-red-600 mb-2">{recordBook.lowestScoringGame.points.toFixed(2)}</p>
                      {(() => {
                        const ownerId = recordBook.lowestScoringGame!.ownerId;
                        const rosterId = ownerToRosterId[ownerId];
                        const name = recordBook.lowestScoringGame!.teamName;
                        return rosterId !== undefined ? (
                          <Link href={`/teams/${rosterId}`} className="text-lg font-semibold text-blue-700 hover:underline">{name}</Link>
                        ) : (
                          <p className="text-lg font-semibold">{name}</p>
                        );
                      })()}
                      <p className="text-gray-600">Week {recordBook.lowestScoringGame.week}, {recordBook.lowestScoringGame.year} Season</p>
                    </>
                  ) : (
                    <p className="text-gray-500">No data</p>
                  )}
                </div>
              </div>
              
              {/* Biggest Victory Margin */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold mb-4">Biggest Victory Margin</h3>
                <div className="text-center">
                  {recordBook?.biggestVictory ? (
                    <>
                      <p className="text-4xl font-bold text-green-600 mb-2">{recordBook.biggestVictory.margin.toFixed(2)}</p>
                      <p className="text-lg font-semibold">
                        {(() => {
                          const wRoster = ownerToRosterId[recordBook.biggestVictory!.winnerOwnerId];
                          const lRoster = ownerToRosterId[recordBook.biggestVictory!.loserOwnerId];
                          const wName = recordBook.biggestVictory!.winnerTeamName;
                          const lName = recordBook.biggestVictory!.loserTeamName;
                          const W = wRoster !== undefined ? <Link href={`/teams/${wRoster}`} className="text-blue-700 hover:underline">{wName}</Link> : <span>{wName}</span>;
                          const L = lRoster !== undefined ? <Link href={`/teams/${lRoster}`} className="text-blue-700 hover:underline">{lName}</Link> : <span>{lName}</span>;
                          return <>{W} vs. {L}</>;
                        })()}
                      </p>
                      <p className="text-gray-600">Week {recordBook.biggestVictory.week}, {recordBook.biggestVictory.year} Season</p>
                    </>
                  ) : (
                    <p className="text-gray-500">No data</p>
                  )}
                </div>
              </div>
              
              {/* Closest Victory */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold mb-4">Closest Victory</h3>
                <div className="text-center">
                  {recordBook?.closestVictory ? (
                    <>
                      <p className="text-4xl font-bold text-purple-600 mb-2">{recordBook.closestVictory.margin.toFixed(2)}</p>
                      <p className="text-lg font-semibold">
                        {(() => {
                          const wRoster = ownerToRosterId[recordBook.closestVictory!.winnerOwnerId];
                          const lRoster = ownerToRosterId[recordBook.closestVictory!.loserOwnerId];
                          const wName = recordBook.closestVictory!.winnerTeamName;
                          const lName = recordBook.closestVictory!.loserTeamName;
                          const W = wRoster !== undefined ? <Link href={`/teams/${wRoster}`} className="text-blue-700 hover:underline">{wName}</Link> : <span>{wName}</span>;
                          const L = lRoster !== undefined ? <Link href={`/teams/${lRoster}`} className="text-blue-700 hover:underline">{lName}</Link> : <span>{lName}</span>;
                          return <>{W} vs. {L}</>;
                        })()}
                      </p>
                      <p className="text-gray-600">Week {recordBook.closestVictory.week}, {recordBook.closestVictory.year} Season</p>
                    </>
                  ) : (
                    <p className="text-gray-500">No data</p>
                  )}
                </div>
              </div>
              
              {/* Highest Combined Points */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold mb-4">Highest Combined Points</h3>
                <div className="text-center">
                  {recordBook?.highestCombined ? (
                    <>
                      <p className="text-4xl font-bold text-indigo-600 mb-2">{recordBook.highestCombined.combined.toFixed(2)}</p>
                      <p className="text-lg font-semibold">
                        {(() => {
                          const aRoster = ownerToRosterId[recordBook.highestCombined!.teamAOwnerId];
                          const bRoster = ownerToRosterId[recordBook.highestCombined!.teamBOwnerId];
                          const aName = recordBook.highestCombined!.teamAName;
                          const bName = recordBook.highestCombined!.teamBName;
                          const A = aRoster !== undefined ? <Link href={`/teams/${aRoster}`} className="text-blue-700 hover:underline">{aName}</Link> : <span>{aName}</span>;
                          const B = bRoster !== undefined ? <Link href={`/teams/${bRoster}`} className="text-blue-700 hover:underline">{bName}</Link> : <span>{bName}</span>;
                          return <>{A} ({recordBook.highestCombined!.teamAPoints.toFixed(2)}) vs. {B} ({recordBook.highestCombined!.teamBPoints.toFixed(2)})</>;
                        })()}
                      </p>
                      <p className="text-gray-600">Week {recordBook.highestCombined.week}, {recordBook.highestCombined.year} Season</p>
                    </>
                  ) : (
                    <p className="text-gray-500">No data</p>
                  )}
                </div>
              </div>
              
              {/* Longest Win Streak */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold mb-4">Longest Win Streak</h3>
                <div className="text-center">
                  {recordBook?.longestWinStreak ? (
                    <>
                      <p className="text-4xl font-bold text-amber-600 mb-2">{recordBook.longestWinStreak.length} Games</p>
                      {(() => {
                        const rosterId = ownerToRosterId[recordBook.longestWinStreak!.ownerId];
                        const name = recordBook.longestWinStreak!.teamName;
                        return rosterId !== undefined ? (
                          <Link href={`/teams/${rosterId}`} className="text-lg font-semibold text-blue-700 hover:underline">{name}</Link>
                        ) : (
                          <p className="text-lg font-semibold">{name}</p>
                        );
                      })()}
                      <p className="text-gray-600">Weeks {recordBook.longestWinStreak.start.week}-{recordBook.longestWinStreak.end.week}, {recordBook.longestWinStreak.start.year === recordBook.longestWinStreak.end.year ? recordBook.longestWinStreak.start.year : `${recordBook.longestWinStreak.start.year}–${recordBook.longestWinStreak.end.year}`} Season</p>
                    </>
                  ) : (
                    <p className="text-gray-500">No data</p>
                  )}
                </div>
              </div>
              
              {/* Longest Losing Streak */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold mb-4">Longest Losing Streak</h3>
                <div className="text-center">
                  {recordBook?.longestLosingStreak ? (
                    <>
                      <p className="text-4xl font-bold text-gray-600 mb-2">{recordBook.longestLosingStreak.length} Games</p>
                      {(() => {
                        const rosterId = ownerToRosterId[recordBook.longestLosingStreak!.ownerId];
                        const name = recordBook.longestLosingStreak!.teamName;
                        return rosterId !== undefined ? (
                          <Link href={`/teams/${rosterId}`} className="text-lg font-semibold text-blue-700 hover:underline">{name}</Link>
                        ) : (
                          <p className="text-lg font-semibold">{name}</p>
                        );
                      })()}
                      <p className="text-gray-600">Weeks {recordBook.longestLosingStreak.start.week}-{recordBook.longestLosingStreak.end.week}, {recordBook.longestLosingStreak.start.year === recordBook.longestLosingStreak.end.year ? recordBook.longestLosingStreak.start.year : `${recordBook.longestLosingStreak.start.year}–${recordBook.longestLosingStreak.end.year}`} Season</p>
                    </>
                  ) : (
                    <p className="text-gray-500">No data</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
