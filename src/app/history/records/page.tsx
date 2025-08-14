'use client';

import { useState } from 'react';
import Link from 'next/link';

type RecordCategory = 'team' | 'game' | 'season' | 'player';

export default function RecordsPage() {
  const [category, setCategory] = useState<RecordCategory>('team');
  
  // Team Records
  const teamRecords = [
    {
      title: 'Most Championships',
      holder: 'Burrow My Sorrows',
      value: '1',
      year: '2023'
    },
    {
      title: 'Most Regular Season Wins',
      holder: 'Diggs in the Chat',
      value: '28',
      year: '2023-2025'
    },
    {
      title: 'Best Win Percentage',
      holder: 'Diggs in the Chat',
      value: '73.7%',
      year: '2023-2025'
    },
    {
      title: 'Most Points All-Time',
      holder: 'Burrow My Sorrows',
      value: '4,582.4',
      year: '2023-2025'
    },
    {
      title: 'Most Playoff Appearances',
      holder: 'Burrow My Sorrows',
      value: '2',
      year: '2023-2025'
    },
    {
      title: 'Longest Win Streak',
      holder: 'Burrow My Sorrows',
      value: '9 games',
      year: '2024'
    }
  ];
  
  // Game Records
  const gameRecords = [
    {
      title: 'Highest Scoring Game',
      holder: 'Diggs in the Chat',
      value: '198.6 pts',
      year: 'Week 8, 2024'
    },
    {
      title: 'Lowest Scoring Game',
      holder: 'Najee By Nature',
      value: '42.8 pts',
      year: 'Week 14, 2023'
    },
    {
      title: 'Biggest Victory Margin',
      holder: 'Kittle Me This vs. Najee By Nature',
      value: '87.4 pts',
      year: 'Week 14, 2023'
    },
    {
      title: 'Closest Victory',
      holder: 'Waddle Waddle vs. Chubb Thumpers',
      value: '0.08 pts',
      year: 'Week 3, 2024'
    },
    {
      title: 'Highest Combined Score',
      holder: 'Diggs in the Chat vs. Burrow My Sorrows',
      value: '356.2 pts',
      year: 'Week 8, 2024'
    },
    {
      title: 'Lowest Combined Score',
      holder: 'Najee By Nature vs. Herbert the Pervert',
      value: '98.6 pts',
      year: 'Week 14, 2023'
    }
  ];
  
  // Season Records
  const seasonRecords = [
    {
      title: 'Most Points in a Season',
      holder: 'Diggs in the Chat',
      value: '2,145.8 pts',
      year: '2024'
    },
    {
      title: 'Highest Average Points per Game',
      holder: 'Diggs in the Chat',
      value: '134.1 pts/game',
      year: '2024'
    },
    {
      title: 'Most Wins in a Season',
      holder: 'Burrow My Sorrows',
      value: '12 wins',
      year: '2024'
    },
    {
      title: 'Best Regular Season Record',
      holder: 'Burrow My Sorrows',
      value: '12-2-0',
      year: '2024'
    },
    {
      title: 'Highest Scoring Week',
      holder: 'League Average',
      value: '142.6 pts/team',
      year: 'Week 8, 2024'
    },
    {
      title: 'Lowest Scoring Week',
      holder: 'League Average',
      value: '86.3 pts/team',
      year: 'Week 14, 2023'
    }
  ];
  
  // Player Records
  const playerRecords = [
    {
      title: 'Most Points in a Game (QB)',
      holder: 'Joe Burrow (Burrow My Sorrows)',
      value: '48.6 pts',
      year: 'Week 8, 2024'
    },
    {
      title: 'Most Points in a Game (RB)',
      holder: 'Christian McCaffrey (Kittle Me This)',
      value: '42.2 pts',
      year: 'Week 3, 2023'
    },
    {
      title: 'Most Points in a Game (WR)',
      holder: 'Stefon Diggs (Diggs in the Chat)',
      value: '38.7 pts',
      year: 'Week 8, 2024'
    },
    {
      title: 'Most Points in a Game (TE)',
      holder: 'George Kittle (Kittle Me This)',
      value: '36.1 pts',
      year: 'Week 9, 2023'
    },
    {
      title: 'Most Points in a Season (QB)',
      holder: 'Joe Burrow (Burrow My Sorrows)',
      value: '412.8 pts',
      year: '2024'
    },
    {
      title: 'Most Points in a Season (RB)',
      holder: 'Christian McCaffrey (Kittle Me This)',
      value: '386.4 pts',
      year: '2023'
    },
    {
      title: 'Most Points in a Season (WR)',
      holder: 'Stefon Diggs (Diggs in the Chat)',
      value: '342.6 pts',
      year: '2024'
    },
    {
      title: 'Most Points in a Season (TE)',
      holder: 'George Kittle (Kittle Me This)',
      value: '276.8 pts',
      year: '2023'
    }
  ];
  
  // Get the records for the selected category
  const getRecords = () => {
    switch (category) {
      case 'team':
        return teamRecords;
      case 'game':
        return gameRecords;
      case 'season':
        return seasonRecords;
      case 'player':
        return playerRecords;
      default:
        return teamRecords;
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">League Records</h1>
      
      {/* Category Tabs */}
      <div className="flex flex-wrap justify-center mb-8 gap-2">
        <button
          onClick={() => setCategory('team')}
          className={`px-4 py-2 rounded-md ${
            category === 'team'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          Team Records
        </button>
        <button
          onClick={() => setCategory('game')}
          className={`px-4 py-2 rounded-md ${
            category === 'game'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          Game Records
        </button>
        <button
          onClick={() => setCategory('season')}
          className={`px-4 py-2 rounded-md ${
            category === 'season'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          Season Records
        </button>
        <button
          onClick={() => setCategory('player')}
          className={`px-4 py-2 rounded-md ${
            category === 'player'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
          }`}
        >
          Player Records
        </button>
      </div>
      
      {/* Records Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {getRecords().map((record, index) => (
          <div key={index} className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-2">
              <h3 className="text-lg font-bold">{record.title}</h3>
            </div>
            <div className="p-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-800 mb-2">{record.value}</p>
                <p className="text-lg font-medium">{record.holder}</p>
                <p className="text-sm text-gray-600 mt-1">{record.year}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-8 text-center">
        <Link 
          href="/history" 
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Back to History
        </Link>
      </div>
    </div>
  );
}
