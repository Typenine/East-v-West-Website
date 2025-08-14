'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CHAMPIONS } from '@/lib/constants/league';

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState('champions');
  
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
                    <Link 
                      href={`/teams/${data.champion.toLowerCase().replace(/\s+/g, '-')}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      View Team
                    </Link>
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* This would be populated with real data from the API */}
            {[
              'Burrow My Sorrows',
              'Diggs in the Chat',
              'Kittle Me This',
              'Waddle Waddle',
              'Chubb Thumpers',
              'Lamb Chops',
              'Mixon It Up',
              'Najee By Nature',
              'Hurts So Good',
              'Chase-ing Wins',
              'Herbert the Pervert',
              'Pitts and Giggles'
            ].map((team) => (
              <Link 
                key={team}
                href={`/teams/${team.toLowerCase().replace(/\s+/g, '-')}`}
                className="bg-white shadow-md rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="p-6">
                  <h3 className="text-xl font-bold mb-2">{team}</h3>
                  <div className="text-sm text-gray-600">
                    <p>Championships: {team === CHAMPIONS['2023'].champion || team === CHAMPIONS['2024'].champion ? '1' : '0'}</p>
                    <p>Playoff Appearances: {['Burrow My Sorrows', 'Diggs in the Chat', 'Kittle Me This', 'Waddle Waddle'].includes(team) ? '2' : '1'}</p>
                    <p>Best Finish: {team === CHAMPIONS['2023'].champion || team === CHAMPIONS['2024'].champion ? '1st' : '3rd'}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      
      {/* Records Tab Content */}
      {activeTab === 'records' && (
        <div>
          <h2 className="text-2xl font-bold mb-6">League Records</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Highest Scoring Game */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4">Highest Scoring Game</h3>
              <div className="text-center">
                <p className="text-4xl font-bold text-blue-600 mb-2">198.6</p>
                <p className="text-lg font-semibold">Diggs in the Chat</p>
                <p className="text-gray-600">Week 8, 2024 Season</p>
              </div>
            </div>
            
            {/* Lowest Scoring Game */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4">Lowest Scoring Game</h3>
              <div className="text-center">
                <p className="text-4xl font-bold text-red-600 mb-2">42.8</p>
                <p className="text-lg font-semibold">Najee By Nature</p>
                <p className="text-gray-600">Week 14, 2023 Season</p>
              </div>
            </div>
            
            {/* Biggest Victory Margin */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4">Biggest Victory Margin</h3>
              <div className="text-center">
                <p className="text-4xl font-bold text-green-600 mb-2">87.4</p>
                <p className="text-lg font-semibold">Kittle Me This vs. Najee By Nature</p>
                <p className="text-gray-600">Week 14, 2023 Season</p>
              </div>
            </div>
            
            {/* Closest Victory */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4">Closest Victory</h3>
              <div className="text-center">
                <p className="text-4xl font-bold text-purple-600 mb-2">0.08</p>
                <p className="text-lg font-semibold">Waddle Waddle vs. Chubb Thumpers</p>
                <p className="text-gray-600">Week 3, 2024 Season</p>
              </div>
            </div>
            
            {/* Longest Win Streak */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4">Longest Win Streak</h3>
              <div className="text-center">
                <p className="text-4xl font-bold text-amber-600 mb-2">9 Games</p>
                <p className="text-lg font-semibold">Burrow My Sorrows</p>
                <p className="text-gray-600">Weeks 2-10, 2024 Season</p>
              </div>
            </div>
            
            {/* Longest Losing Streak */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4">Longest Losing Streak</h3>
              <div className="text-center">
                <p className="text-4xl font-bold text-gray-600 mb-2">8 Games</p>
                <p className="text-lg font-semibold">Herbert the Pervert</p>
                <p className="text-gray-600">Weeks 5-12, 2023 Season</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
