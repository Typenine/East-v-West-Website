'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Tab } from '@headlessui/react';
import CountdownTimer from '@/components/ui/countdown-timer';
import { IMPORTANT_DATES, LEAGUE_IDS } from '@/lib/constants/league';
import EmptyState from '@/components/ui/empty-state';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import { getLeagueDrafts, getDraftPicks, getTeamsData, getAllPlayers, SleeperPlayer } from '@/lib/utils/sleeper-api';

// Draft data types
type TeamHaul = {
  team: string;
  picks: { round: number; pick: number; player: string }[];
};

type DraftYearData = {
  rounds: number;
  picks_per_round: number;
  team_hauls: TeamHaul[];
};

type SleeperDraftSettings = {
  rounds?: number;
};

// Suggestions section will use EmptyState (no mock content)

export default function DraftPage() {
  const [selectedYear, setSelectedYear] = useState('2025');
  const years = useMemo(() => ['2025', ...Object.keys(LEAGUE_IDS.PREVIOUS)].sort((a, b) => parseInt(b) - parseInt(a)), []);
  const submissionsOpen = false; // Toggle for 2027 suggestions submissions

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftsByYear, setDraftsByYear] = useState<Record<string, DraftYearData | null>>({});
  const playersRef = useRef<Record<string, SleeperPlayer> | null>(null);
  const loadedYearsRef = useRef<Set<string>>(new Set());

  function classNames(...classes: string[]) {
    return classes.filter(Boolean).join(' ');
  }

  useEffect(() => {
    const leagueId = selectedYear === '2025' 
      ? LEAGUE_IDS.CURRENT 
      : LEAGUE_IDS.PREVIOUS[selectedYear as keyof typeof LEAGUE_IDS.PREVIOUS];

    if (!leagueId) {
      setDraftsByYear(prev => ({ ...prev, [selectedYear]: null }));
      return;
    }

    if (loadedYearsRef.current.has(selectedYear)) return;
    loadedYearsRef.current.add(selectedYear);

    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [drafts, teams] = await Promise.all([
          getLeagueDrafts(leagueId),
          getTeamsData(leagueId),
        ]);

        if (!playersRef.current) {
          playersRef.current = await getAllPlayers();
        }

        const draft = drafts[0];
        if (!draft) {
          if (!cancelled) setDraftsByYear(prev => ({ ...prev, [selectedYear]: null }));
          return;
        }

        const picks = await getDraftPicks(draft.draft_id);
        const rounds = picks.reduce((max, p) => Math.max(max, p.round), 0);
        const picksInRound1 = picks.filter(p => p.round === 1).length || teams.length;

        const byTeam = new Map<number, { round: number; pick: number; player: string }[]>();
        for (const p of picks) {
          const arr = byTeam.get(p.roster_id) || [];
          const player = playersRef.current?.[p.player_id];
          const name = player ? `${player.first_name} ${player.last_name}` : 'Unknown Player';
          arr.push({ round: p.round, pick: p.draft_slot, player: name });
          byTeam.set(p.roster_id, arr);
        }

        const team_hauls: TeamHaul[] = [];
        for (const t of teams) {
          const arr = byTeam.get(t.rosterId) || [];
          team_hauls.push({
            team: t.teamName,
            picks: arr.sort((a, b) => (a.round === b.round ? a.pick - b.pick : a.round - b.round)),
          });
        }

        const data: DraftYearData = {
          rounds: rounds || ((draft.settings as SleeperDraftSettings | null | undefined)?.rounds ?? 0),
          picks_per_round: picksInRound1,
          team_hauls,
        };

        if (!cancelled) setDraftsByYear(prev => ({ ...prev, [selectedYear]: data }));
      } catch (e) {
        console.error('Error loading draft data', e);
        if (!cancelled) {
          setError('Unable to load draft data at this time.');
          setDraftsByYear(prev => ({ ...prev, [selectedYear]: null }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [selectedYear]);

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
            {loading ? (
              <LoadingState message="Loading draft data..." />
            ) : error ? (
              <ErrorState message={error} />
            ) : draftsByYear[selectedYear] === undefined ? (
              <EmptyState title="Select a year" message="Choose a year to view draft results." />
            ) : draftsByYear[selectedYear] === null ? (
              <EmptyState title="No draft data" message="No draft data available for the selected year." />
            ) : (
              <div>
                <div className="mb-8">
                  <h3 className="text-xl font-bold mb-4">Draft Structure</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border rounded-lg p-4 bg-slate-50">
                      <div className="text-sm text-gray-500">Rounds</div>
                      <div className="text-2xl font-bold">{draftsByYear[selectedYear]?.rounds}</div>
                    </div>
                    <div className="border rounded-lg p-4 bg-slate-50">
                      <div className="text-sm text-gray-500">Picks Per Round</div>
                      <div className="text-2xl font-bold">{draftsByYear[selectedYear]?.picks_per_round}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-bold mb-4">Team Hauls</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(draftsByYear[selectedYear]?.team_hauls ?? []).map((teamHaul, index) => (
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
            <EmptyState 
              title="No suggestions yet" 
              message="We'll open community suggestions for 2027 closer to the 2026 season."
            />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
