'use client';

import { useState } from 'react';
import { Tab } from '@headlessui/react';
import CountdownTimer from '@/components/ui/countdown-timer';
import { IMPORTANT_DATES, TEAM_NAMES } from '@/lib/constants/league';

// Mock data for past rookie drafts
const pastDrafts = {
  '2025': {
    rounds: 5,
    picks_per_round: 12,
    team_hauls: TEAM_NAMES.map(team => ({
      team,
      picks: [
        { round: 1, pick: Math.floor(Math.random() * 12) + 1, player: 'Player A' },
        { round: 2, pick: Math.floor(Math.random() * 12) + 1, player: 'Player B' },
      ]
    }))
  },
  '2024': {
    rounds: 5,
    picks_per_round: 12,
    team_hauls: TEAM_NAMES.map(team => ({
      team,
      picks: [
        { round: 1, pick: Math.floor(Math.random() * 12) + 1, player: 'Player C' },
        { round: 3, pick: Math.floor(Math.random() * 12) + 1, player: 'Player D' },
      ]
    }))
  },
  '2023': {
    rounds: 5,
    picks_per_round: 12,
    team_hauls: TEAM_NAMES.map(team => ({
      team,
      picks: [
        { round: 2, pick: Math.floor(Math.random() * 12) + 1, player: 'Player E' },
        { round: 4, pick: Math.floor(Math.random() * 12) + 1, player: 'Player F' },
      ]
    }))
  }
};

// Mock data for 2027 suggestions
const suggestions = [
  {
    title: 'Add IDP Positions',
    description: 'Consider adding Individual Defensive Players to deepen the league strategy.'
  },
  {
    title: 'Increase Rookie Draft Rounds',
    description: 'Add an extra round to the rookie draft to give more opportunities for sleeper picks.'
  },
  {
    title: 'Dynasty Contract System',
    description: 'Implement a contract system where players can be signed for 1-4 years with different cap implications.'
  },
  {
    title: 'Auction Draft Format',
    description: 'Switch to an auction format for the rookie draft to add another strategic element.'
  }
];

export default function DraftPage() {
  const [selectedYear, setSelectedYear] = useState('2025');
  const years = Object.keys(pastDrafts).sort((a, b) => parseInt(b) - parseInt(a));
  const submissionsOpen = false; // Toggle for 2027 suggestions submissions

  function classNames(...classes: string[]) {
    return classes.filter(Boolean).join(' ');
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Draft Central</h1>
      
      <Tab.Group>
        <Tab.List className="flex space-x-1 rounded-xl bg-slate-200 p-1">
          <Tab
            className={({ selected }) =>
              classNames(
                'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                'ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2',
                selected
                  ? 'bg-white shadow'
                  : 'text-slate-700 hover:bg-white/[0.12] hover:text-slate-900'
              )
            }
          >
            Next Draft
          </Tab>
          <Tab
            className={({ selected }) =>
              classNames(
                'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                'ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2',
                selected
                  ? 'bg-white shadow'
                  : 'text-slate-700 hover:bg-white/[0.12] hover:text-slate-900'
              )
            }
          >
            Past Rookie Drafts
          </Tab>
          <Tab
            className={({ selected }) =>
              classNames(
                'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                'ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2',
                selected
                  ? 'bg-white shadow'
                  : 'text-slate-700 hover:bg-white/[0.12] hover:text-slate-900'
              )
            }
          >
            2027 Suggestions
          </Tab>
        </Tab.List>
        <Tab.Panels className="mt-6">
          {/* Next Draft Panel */}
          <Tab.Panel className="rounded-xl bg-white p-6 shadow-md">
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-6">Next Draft: July 18, 2026</h2>
              <CountdownTimer 
                targetDate={IMPORTANT_DATES.NEXT_DRAFT}
                title="Countdown to Draft Day" 
                className="bg-blue-50 border border-blue-200 mb-8"
              />
            </div>
            
            <div className="border rounded-lg p-6 bg-slate-50 mb-8">
              <h3 className="text-xl font-bold mb-4">Airbnb Information</h3>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold">Address</h4>
                  <p>123 Lake House Drive, Lake Tahoe, CA 96150</p>
                </div>
                <div>
                  <h4 className="font-semibold">Dates</h4>
                  <p>July 17-19, 2026 (Friday-Sunday)</p>
                </div>
                <div>
                  <h4 className="font-semibold">Notes</h4>
                  <ul className="list-disc pl-5">
                    <li>Check-in: 4:00 PM Friday</li>
                    <li>Check-out: 11:00 AM Sunday</li>
                    <li>Bring your own beverages and snacks</li>
                    <li>Draft starts at 1:00 PM ET on Saturday</li>
                  </ul>
                </div>
              </div>
            </div>
            
            <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              Add to Calendar
            </button>
          </Tab.Panel>
          
          {/* Past Rookie Drafts Panel */}
          <Tab.Panel className="rounded-xl bg-white p-6 shadow-md">
            <div className="mb-6">
              <label htmlFor="year-select" className="block text-sm font-medium text-gray-700 mb-2">
                Select Year
              </label>
              <select
                id="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year} Draft
                  </option>
                ))}
              </select>
            </div>
            
            {pastDrafts[selectedYear as keyof typeof pastDrafts] && (
              <div>
                <div className="mb-8">
                  <h3 className="text-xl font-bold mb-4">Draft Structure</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border rounded-lg p-4 bg-slate-50">
                      <div className="text-sm text-gray-500">Rounds</div>
                      <div className="text-2xl font-bold">{pastDrafts[selectedYear as keyof typeof pastDrafts].rounds}</div>
                    </div>
                    <div className="border rounded-lg p-4 bg-slate-50">
                      <div className="text-sm text-gray-500">Picks Per Round</div>
                      <div className="text-2xl font-bold">{pastDrafts[selectedYear as keyof typeof pastDrafts].picks_per_round}</div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-xl font-bold mb-4">Team Hauls</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pastDrafts[selectedYear as keyof typeof pastDrafts].team_hauls.map((teamHaul, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <h4 className="font-bold mb-2">{teamHaul.team}</h4>
                        <ul className="space-y-1">
                          {teamHaul.picks.map((pick, pickIndex) => (
                            <li key={pickIndex} className="text-sm">
                              Round {pick.round}, Pick {pick.pick}: {pick.player}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Tab.Panel>
          
          {/* 2027 Suggestions Panel */}
          <Tab.Panel className="rounded-xl bg-white p-6 shadow-md">
            <div className="mb-6 flex justify-between items-center">
              <h2 className="text-2xl font-bold">2027 Draft Suggestions</h2>
              <div className="text-sm bg-amber-100 text-amber-800 px-3 py-1 rounded-full">
                {submissionsOpen ? 'Submissions Open' : 'Submissions Closed'}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {suggestions.map((suggestion, index) => (
                <div key={index} className="border rounded-lg p-4 bg-slate-50">
                  <h3 className="font-bold mb-2">{suggestion.title}</h3>
                  <p className="text-sm text-gray-600">{suggestion.description}</p>
                </div>
              ))}
            </div>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
