'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';
import { CHAMPIONS, LEAGUE_IDS } from '@/lib/constants/league';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import Card, { CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import {
  getFranchisesAllTime,
  getLeagueRecordBook,
  getAllTeamsData,
  getLeaguePlayoffBracketsWithScores,
  getLeagueWinnersBracket,
  getRosterIdToTeamNameMap,
  derivePodiumFromWinnersBracketByYear,
  type FranchiseSummary,
  type LeagueRecordBook,
  type SleeperBracketGameWithScore,
  type SleeperBracketGame,
} from '@/lib/utils/sleeper-api';
import { CANONICAL_TEAM_BY_USER_ID } from '@/lib/constants/team-mapping';
import SectionHeader from '@/components/ui/SectionHeader';

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
  // Auto-derived podiums from Sleeper brackets (by year)
  const [podiumsByYear, setPodiumsByYear] = useState<Record<string, { champion: string; runnerUp: string; thirdPlace: string }>>({});

  // Regular season winners count per franchise (by team name)
  const [regularSeasonWinnerCounts, setRegularSeasonWinnerCounts] = useState<Record<string, number>>({});

  // Derive podiums for past seasons (do not block the main load)
  useEffect(() => {
    let cancelled = false;
    async function loadPodiums() {
      try {
        const years = ['2024', '2023'];
        const results = await Promise.all(years.map((y) => derivePodiumFromWinnersBracketByYear(y)));
        if (cancelled) return;
        const merged: Record<string, { champion: string; runnerUp: string; thirdPlace: string }> = {};
        years.forEach((y, idx) => {
          const r = results[idx];
          if (!r) return;
          const base = CHAMPIONS[y as keyof typeof CHAMPIONS];
          merged[y] = {
            champion: (r.champion ?? base?.champion ?? 'TBD') as string,
            runnerUp: (r.runnerUp ?? base?.runnerUp ?? 'TBD') as string,
            thirdPlace: (r.thirdPlace ?? base?.thirdPlace ?? 'TBD') as string,
          };
        });
        setPodiumsByYear(merged);
      } catch (e) {
        console.error('Failed to auto-derive podiums:', e);
      }
    }
    loadPodiums();
    return () => {
      cancelled = true;
    };
  }, []);
  
  // Brackets state
  const [bracketYear, setBracketYear] = useState('2025');
  const [bracketLoading, setBracketLoading] = useState(false);
  const [bracketError, setBracketError] = useState<string | null>(null);
  const [winnersBracket, setWinnersBracket] = useState<SleeperBracketGameWithScore[]>([]);
  const [losersBracket, setLosersBracket] = useState<SleeperBracketGameWithScore[]>([]);
  const [bracketNameMap, setBracketNameMap] = useState<Map<number, string>>(new Map());
  // Leaderboards: playoff appearances computed from winners bracket participants per year
  const [playoffAppearances, setPlayoffAppearances] = useState<{
    ownerId: string;
    teamName: string;
    appearances: number;
  }[]>([]);

  // Load playoff brackets when Brackets tab is active or year changes
  useEffect(() => {
    if (activeTab !== 'brackets') return;
    let cancelled = false;
    async function loadBrackets() {
      try {
        setBracketLoading(true);
        setBracketError(null);
        const leagueId = bracketYear === '2025'
          ? LEAGUE_IDS.CURRENT
          : LEAGUE_IDS.PREVIOUS[bracketYear as keyof typeof LEAGUE_IDS.PREVIOUS];
        if (!leagueId) {
          throw new Error(`No league ID configured for year ${bracketYear}`);
        }
        const [brackets, nameMap] = await Promise.all([
          getLeaguePlayoffBracketsWithScores(leagueId),
          getRosterIdToTeamNameMap(leagueId),
        ]);
        if (cancelled) return;
        // For current season, suppress brackets if there are no scores yet (start of season)
        const hasAnyScore = [...(brackets.winners || []), ...(brackets.losers || [])].some(
          (g) => (g.t1_points ?? null) !== null || (g.t2_points ?? null) !== null
        );
        if (bracketYear === '2025' && !hasAnyScore) {
          setWinnersBracket([]);
          setLosersBracket([]);
        } else {
          setWinnersBracket(brackets.winners || []);
          setLosersBracket(brackets.losers || []);
        }
        setBracketNameMap(nameMap);
      } catch (e) {
        console.error('Error loading brackets:', e);
        if (!cancelled) setBracketError('Failed to load playoff brackets.');
      } finally {
        if (!cancelled) setBracketLoading(false);
      }
    }
    loadBrackets();
    return () => {
      cancelled = true;
    };
  }, [activeTab, bracketYear]);
  
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
        // Build owner -> rosterId and owner -> teamName mapping preferring 2025, then 2024, then 2023
        const ownerRosterMap: Record<string, number> = {};
        const ownerNameMap: Record<string, string> = {};
        const yearsOrdered: string[] = ['2025', '2024', '2023'];
        for (const year of yearsOrdered) {
          const teams = allTeams[year] || [];
          for (const t of teams) {
            if (ownerRosterMap[t.ownerId] === undefined) ownerRosterMap[t.ownerId] = t.rosterId;
            if (ownerNameMap[t.ownerId] === undefined) ownerNameMap[t.ownerId] = t.teamName;
          }
        }
        setOwnerToRosterId(ownerRosterMap);

        // Compute Regular Season Winners per franchise (previous completed seasons)
        const rsCounts: Record<string, number> = {};
        const rsYears: string[] = ['2024', '2023'];
        for (const y of rsYears) {
          const teams = allTeams[y] || [];
          if (!teams || teams.length === 0) continue;
          const sorted = [...teams].sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return (b.fpts ?? 0) - (a.fpts ?? 0);
          });
          const top = sorted[0];
          if (top?.teamName) {
            rsCounts[top.teamName] = (rsCounts[top.teamName] || 0) + 1;
          }
        }
        setRegularSeasonWinnerCounts(rsCounts);

        // Compute Most Playoff Appearances using winners bracket participants per season (exclude 2025 at season start)
        const previousYears: string[] = ['2024', '2023'];
        const leagueIdsByYear: Record<string, string> = {};
        for (const y of previousYears) leagueIdsByYear[y] = LEAGUE_IDS.PREVIOUS[y as keyof typeof LEAGUE_IDS.PREVIOUS];

        // Build rosterId -> ownerId mapping per year for bracket lookups
        const rosterToOwnerByYear: Record<string, Map<number, { ownerId: string; teamName: string }>> = {};
        for (const y of previousYears) {
          const teams = allTeams[y] || [];
          rosterToOwnerByYear[y] = new Map(teams.map((t) => [t.rosterId, { ownerId: t.ownerId, teamName: t.teamName }]));
        }

        const winnersByYear: Record<string, SleeperBracketGame[]> = {};
        await Promise.all(previousYears.map(async (y) => {
          const lid = leagueIdsByYear[y];
          winnersByYear[y] = lid ? await getLeagueWinnersBracket(lid).catch(() => []) : [];
        }));

        // Count unique participants per season, then aggregate by owner
        const ownerCounts: Record<string, number> = {};
        for (const y of previousYears) {
          const seenOwners = new Set<string>();
          const games = winnersByYear[y] || [];
          const mapByRoster = rosterToOwnerByYear[y] || new Map();
          for (const g of games) {
            const cands = [g.t1, g.t2];
            for (const rid of cands) {
              if (rid == null) continue;
              const info = mapByRoster.get(rid);
              if (!info) continue;
              if (!seenOwners.has(info.ownerId)) {
                seenOwners.add(info.ownerId);
              }
            }
          }
          // Increment counts once per owner per season
          for (const ownerId of seenOwners) {
            ownerCounts[ownerId] = (ownerCounts[ownerId] || 0) + 1;
          }
        }

        const appearanceRows = Object.entries(ownerCounts)
          .map(([ownerId, count]) => ({
            ownerId,
            teamName: ownerNameMap[ownerId] || 'Unknown Team',
            appearances: count,
          }))
          .sort((a, b) => b.appearances - a.appearances)
          .slice(0, 5);
        setPlayoffAppearances(appearanceRows);
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
  
  // Aggregate runner-up and third-place counts by team name, prefer auto-derived podiums where available
  const { runnerUpCounts, thirdPlaceCounts } = useMemo(() => {
    const ru: Record<string, number> = {};
    const tp: Record<string, number> = {};
    Object.entries(CHAMPIONS).forEach(([year, base]) => {
      const merged = podiumsByYear[year]
        ? podiumsByYear[year]
        : (base as { champion: string; runnerUp: string; thirdPlace: string });
      if (merged?.runnerUp && merged.runnerUp !== 'TBD') {
        ru[merged.runnerUp] = (ru[merged.runnerUp] || 0) + 1;
      }
      if (merged?.thirdPlace && merged.thirdPlace !== 'TBD') {
        tp[merged.thirdPlace] = (tp[merged.thirdPlace] || 0) + 1;
      }
    });
    return { runnerUpCounts: ru, thirdPlaceCounts: tp };
  }, [podiumsByYear]);
  
  const tabs = [
    { id: 'champions', label: 'Champions' },
    { id: 'brackets', label: 'Brackets' },
    { id: 'leaderboards', label: 'Leaderboards' },
    { id: 'franchises', label: 'Franchises' },
    { id: 'records', label: 'Records' }
  ];
  
  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader
        title="League History"
        actions={
          activeTab === 'brackets' && (
            <div className="flex items-center gap-2">
              <label htmlFor="year-select" className="sr-only">Select Year</label>
              <select
                id="year-select"
                className="mt-1 block w-40 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                value={bracketYear}
                onChange={(e) => setBracketYear(e.target.value)}
              >
                <option value="2025">2025 Season</option>
                <option value="2024">2024 Season</option>
                <option value="2023">2023 Season</option>
              </select>
            </div>
          )
        }
      />
      
      {/* Tabs */}
      <div className="border-b border-[var(--border)] mb-8">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                relative whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                ${activeTab === tab.id
                  ? 'text-[var(--text)] border-[color-mix(in_srgb,var(--accent)_70%,var(--gold)_30%)]'
                  : 'text-[var(--muted)] border-transparent hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'}
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
            {Object.entries(CHAMPIONS).map(([year, data]) => {
              const merged = podiumsByYear[year]
                ? podiumsByYear[year]
                : (data as { champion: string; runnerUp: string; thirdPlace: string });
              const { champion, runnerUp, thirdPlace } = merged;
              const renderLink = (teamName: string) => {
                const ownerId = ownerByTeamName[teamName];
                const rosterId = ownerId ? ownerToRosterId[ownerId] : undefined;
                if (teamName === 'TBD' || !ownerId || rosterId === undefined) {
                  return <span className="text-[var(--muted)] text-xs">Link unavailable</span>;
                }
                return (
                  <Link href={`/teams/${rosterId}`} className="text-[var(--accent)] text-xs hover:underline">
                    View Team
                  </Link>
                );
              };
              return (
                <Card key={year} className="overflow-hidden hover-lift">
                  <CardHeader className="accent-gradient text-white">
                    <CardTitle className="text-white text-lg">{year} Season</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Champion */}
                    <div className="text-center">
                      <div className="flex justify-center mb-4">
                        <div
                          className="w-14 h-14 rounded-full flex items-center justify-center overflow-hidden"
                          style={champion !== 'TBD' ? getTeamColorStyle(champion) : undefined}
                        >
                          {champion !== 'TBD' ? (
                            <Image
                              src={getTeamLogoPath(champion)}
                              alt={champion}
                              width={48}
                              height={48}
                              className="object-contain"
                              onError={(e) => {
                                const t = e.target as HTMLImageElement;
                                t.style.display = 'none';
                              }}
                            />
                          ) : (
                            <span className="text-3xl">🏆</span>
                          )}
                        </div>
                      </div>
                      <h3 className="text-xl font-semibold mb-2 text-[var(--text)]">{champion}</h3>
                      {renderLink(champion)}
                    </div>

                    {/* Runner-up and Third Place */}
                    <div className="mt-6 space-y-4">
                      {/* Runner-up */}
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
                          style={runnerUp !== 'TBD' ? getTeamColorStyle(runnerUp) : undefined}
                        >
                          {runnerUp !== 'TBD' ? (
                            <Image
                              src={getTeamLogoPath(runnerUp)}
                              alt={runnerUp}
                              width={32}
                              height={32}
                              className="object-contain"
                              onError={(e) => {
                                const t = e.target as HTMLImageElement;
                                t.style.display = 'none';
                              }}
                            />
                          ) : (
                            <span className="text-xl">🥈</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[var(--muted)]">Runner-up</div>
                          <div className="text-sm font-medium text-[var(--text)] truncate">{runnerUp}</div>
                          {renderLink(runnerUp)}
                        </div>
                      </div>

                      {/* Third Place */}
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
                          style={thirdPlace !== 'TBD' ? getTeamColorStyle(thirdPlace) : undefined}
                        >
                          {thirdPlace !== 'TBD' ? (
                            <Image
                              src={getTeamLogoPath(thirdPlace)}
                              alt={thirdPlace}
                              width={32}
                              height={32}
                              className="object-contain"
                              onError={(e) => {
                                const t = e.target as HTMLImageElement;
                                t.style.display = 'none';
                              }}
                            />
                          ) : (
                            <span className="text-xl">🥉</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[var(--muted)]">Third Place</div>
                          <div className="text-sm font-medium text-[var(--text)] truncate">{thirdPlace}</div>
                          {renderLink(thirdPlace)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Brackets Tab Content */}
      {activeTab === 'brackets' && (
        <div>
          <SectionHeader title="Playoff Brackets" />
          
          {bracketLoading ? (
            <LoadingState message="Loading playoff brackets..." />
          ) : bracketError ? (
            <ErrorState message={bracketError} />
          ) : (
            <div className="space-y-8">
              {/* Winners Bracket */}
              <div className="evw-surface border p-6 rounded-[var(--radius-card)] hover-lift">
                <h3 className="text-xl font-bold mb-4">Winners Bracket</h3>
                {winnersBracket.length === 0 ? (
                  <p className="text-[var(--muted)]">No winners bracket available for {bracketYear}.</p>
                ) : (
                  (() => {
                    const byRound: Record<number, SleeperBracketGameWithScore[]> = {};
                    winnersBracket.forEach((g) => {
                      const r = g.r ?? 0;
                      if (!byRound[r]) byRound[r] = [];
                      byRound[r].push(g);
                    });
                    const roundNums = Object.keys(byRound).map(n => Number(n)).sort((a,b) => a - b);
                    roundNums.forEach(r => byRound[r].sort((a,b) => (a.m ?? 0) - (b.m ?? 0)));
                    const nameFor = (rid?: number | null) => {
                      if (rid == null) return 'BYE';
                      return bracketNameMap.get(rid) || `Roster ${rid}`;
                    };
                    const TeamRow = ({ rid, isWinner, score }: { rid?: number | null; isWinner: boolean; score?: number | null }) => (
                      <div className={`flex items-center justify-between ${isWinner ? 'font-semibold text-[var(--accent)]' : ''}`}>
                        {rid != null ? (
                          <Link href={`/teams/${rid}`} className="hover:underline">
                            {nameFor(rid)}
                          </Link>
                        ) : (
                          <span className="text-[var(--muted)]">BYE</span>
                        )}
                        {score != null && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--muted)]">{score.toFixed(2)}</span>
                        )}
                      </div>
                    );
                    const MATCH_H = 72; // px
                    const GAP = 24; // px
                    return (
                      <div className="overflow-x-auto">
                        <div className="flex items-start gap-8">
                          {roundNums.map((r, rIdx) => {
                            const mtFirst = rIdx === 0 ? 0 : ((MATCH_H + GAP) * Math.pow(2, rIdx - 1)) / 2;
                            const mtBetween = rIdx === 0 ? GAP : ((MATCH_H + GAP) * Math.pow(2, rIdx - 1));
                            return (
                              <div key={`w-round-${r}`} className="min-w-[260px]">
                                <h4 className="font-semibold text-[var(--muted)] mb-2">Round {r}</h4>
                                <div>
                                  {byRound[r].map((g, idx) => (
                                    <div key={`w-${r}-${g.m}`} style={{ marginTop: idx === 0 ? mtFirst : mtBetween }}>
                                      <div className="border rounded p-3 h-[72px] flex flex-col justify-between">
                                        <TeamRow rid={g.t1 ?? null} isWinner={g.w != null && g.t1 != null && g.w === g.t1} score={g.t1_points ?? null} />
                                        <TeamRow rid={g.t2 ?? null} isWinner={g.w != null && g.t2 != null && g.w === g.t2} score={g.t2_points ?? null} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Losers Bracket */}
              <div className="evw-surface border p-6 rounded-[var(--radius-card)] hover-lift">
                <h3 className="text-xl font-bold mb-4">Losers Bracket</h3>
                {losersBracket.length === 0 ? (
                  <p className="text-[var(--muted)]">No losers bracket available for {bracketYear}.</p>
                ) : (
                  (() => {
                    const byRound: Record<number, SleeperBracketGameWithScore[]> = {};
                    losersBracket.forEach((g) => {
                      const r = g.r ?? 0;
                      if (!byRound[r]) byRound[r] = [];
                      byRound[r].push(g);
                    });
                    const roundNums = Object.keys(byRound).map(n => Number(n)).sort((a,b) => a - b);
                    roundNums.forEach(r => byRound[r].sort((a,b) => (a.m ?? 0) - (b.m ?? 0)));
                    const nameFor = (rid?: number | null) => {
                      if (rid == null) return 'BYE';
                      return bracketNameMap.get(rid) || `Roster ${rid}`;
                    };
                    const TeamRow = ({ rid, isWinner, score }: { rid?: number | null; isWinner: boolean; score?: number | null }) => (
                      <div className={`flex items-center justify-between ${isWinner ? 'font-semibold text-blue-700' : ''}`}>
                        {rid != null ? (
                          <Link href={`/teams/${rid}`} className="hover:underline">
                            {nameFor(rid)}
                          </Link>
                        ) : (
                          <span className="text-gray-500">BYE</span>
                        )}
                        {score != null && (
                          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">{score.toFixed(2)}</span>
                        )}
                      </div>
                    );
                    const MATCH_H = 72; // px
                    const GAP = 24; // px
                    return (
                      <div className="overflow-x-auto">
                        <div className="flex items-start gap-8">
                          {roundNums.map((r, rIdx) => {
                            const mtFirst = rIdx === 0 ? 0 : ((MATCH_H + GAP) * Math.pow(2, rIdx - 1)) / 2;
                            const mtBetween = rIdx === 0 ? GAP : ((MATCH_H + GAP) * Math.pow(2, rIdx - 1));
                            return (
                              <div key={`l-round-${r}`} className="min-w-[260px]">
                                <h4 className="font-semibold text-[var(--muted)] mb-2">Round {r}</h4>
                                <div>
                                  {byRound[r].map((g, idx) => (
                                    <div key={`l-${r}-${g.m}`} style={{ marginTop: idx === 0 ? mtFirst : mtBetween }}>
                                      <div className="border rounded p-3 h-[72px] flex flex-col justify-between">
                                        <TeamRow rid={g.t1 ?? null} isWinner={g.w != null && g.t1 != null && g.w === g.t1} score={g.t1_points ?? null} />
                                        <TeamRow rid={g.t2 ?? null} isWinner={g.w != null && g.t2 != null && g.w === g.t2} score={g.t2_points ?? null} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Leaderboards Tab Content */}
      {activeTab === 'leaderboards' && (
        <div>
          <h2 className="text-2xl font-bold mb-6">All-Time Leaderboards</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Most Championships */}
            <div className="evw-surface border p-6 rounded-[var(--radius-card)] hover-lift">
              <h3 className="text-xl font-bold mb-4">Most Championships</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)]">
                  <thead className="bg-transparent">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Rank
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Team
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Championships
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
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
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">
                              {index + 1}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">
                              {entry[0]}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">
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
            <div className="evw-surface border p-6 rounded-[var(--radius-card)] hover-lift">
              <h3 className="text-xl font-bold mb-4">Most Points All-Time</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)]">
                  <thead className="bg-transparent">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Rank
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Team
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Total Points
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {franchisesLoading ? (
                      <tr>
                        <td className="px-6 py-4 text-sm text-[var(--muted)]" colSpan={3}>Loading...</td>
                      </tr>
                    ) : franchisesError ? (
                      <tr>
                        <td className="px-6 py-4 text-sm text-red-500" colSpan={3}>{franchisesError}</td>
                      </tr>
                    ) : ([...franchises]
                      .sort((a, b) => b.totalPF - a.totalPF)
                      .slice(0, 5)
                      .map((f, index) => {
                        const rid = ownerToRosterId[f.ownerId];
                        const nameCell = rid !== undefined ? (
                          <Link href={`/teams/${rid}`} className="text-[var(--accent)] hover:underline">{f.teamName}</Link>
                        ) : (
                          <span>{f.teamName}</span>
                        );
                        return (
                          <tr key={f.ownerId}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">{index + 1}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">{nameCell}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">{f.totalPF.toFixed(2)}</td>
                          </tr>
                        );
                      }) )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Best Win Percentage */}
            <div className="evw-surface border p-6 rounded-[var(--radius-card)] hover-lift">
              <h3 className="text-xl font-bold mb-4">Best Win Percentage</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)]">
                  <thead className="bg-transparent">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Rank
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Team
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Record
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Win %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {franchisesLoading ? (
                      <tr>
                        <td className="px-6 py-4 text-sm text-[var(--muted)]" colSpan={4}>Loading...</td>
                      </tr>
                    ) : franchisesError ? (
                      <tr>
                        <td className="px-6 py-4 text-sm text-red-500" colSpan={4}>{franchisesError}</td>
                      </tr>
                    ) : ([...franchises]
                      .map((f) => {
                        const games = f.wins + f.losses + f.ties;
                        const pct = games > 0 ? (f.wins + f.ties * 0.5) / games : 0;
                        return { f, pct };
                      })
                      .sort((a, b) => b.pct - a.pct)
                      .slice(0, 5)
                      .map(({ f, pct }, index) => {
                        const rid = ownerToRosterId[f.ownerId];
                        const nameCell = rid !== undefined ? (
                          <Link href={`/teams/${rid}`} className="text-[var(--accent)] hover:underline">{f.teamName}</Link>
                        ) : (
                          <span>{f.teamName}</span>
                        );
                        const record = `${f.wins}-${f.losses}${f.ties > 0 ? `-${f.ties}` : ''}`;
                        return (
                          <tr key={f.ownerId}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">{index + 1}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">{nameCell}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">{record}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">{(pct * 100).toFixed(1)}%</td>
                          </tr>
                        );
                      }) )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Most Playoff Appearances */}
            <div className="evw-surface border p-6 rounded-[var(--radius-card)] hover-lift">
              <h3 className="text-xl font-bold mb-4">Most Playoff Appearances</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)]">
                  <thead className="bg-transparent">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Rank
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Team
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
                        Appearances
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {franchisesLoading ? (
                      <tr>
                        <td className="px-6 py-4 text-sm text-[var(--muted)]" colSpan={3}>Loading...</td>
                      </tr>
                    ) : playoffAppearances.length === 0 ? (
                      <tr>
                        <td className="px-6 py-4 text-sm text-[var(--muted)]" colSpan={3}>No data</td>
                      </tr>
                    ) : (playoffAppearances.map((row, index) => {
                      const rid = ownerToRosterId[row.ownerId];
                      const nameCell = rid !== undefined ? (
                        <Link href={`/teams/${rid}`} className="text-[var(--accent)] hover:underline">{row.teamName}</Link>
                      ) : (
                        <span>{row.teamName}</span>
                      );
                      return (
                        <tr key={row.ownerId}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">{index + 1}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[var(--text)]">{nameCell}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-[var(--muted)]">{row.appearances}</td>
                        </tr>
                      );
                    }))}
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
                const ruCount = runnerUpCounts[f.teamName] || 0;
                const tpCount = thirdPlaceCounts[f.teamName] || 0;
                const rsCount = regularSeasonWinnerCounts[f.teamName] || 0;
                const headerStyle = getTeamColorStyle(f.teamName);
                const content = (
                  <Card className="overflow-hidden hover-lift">
                    <CardHeader style={headerStyle}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                          <Image
                            src={getTeamLogoPath(f.teamName)}
                            alt={f.teamName}
                            width={28}
                            height={28}
                            className="object-contain"
                            onError={(e) => {
                              const t = e.target as HTMLImageElement;
                              t.style.display = 'none';
                            }}
                          />
                        </div>
                        <CardTitle className="text-current text-lg">{f.teamName}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="text-sm text-[var(--muted)] space-y-1">
                        <p>
                          Record: {f.wins}-{f.losses}
                          {f.ties > 0 ? `-${f.ties}` : ''} ({(() => {
                            const g = f.wins + f.losses + f.ties;
                            return g > 0 ? (((f.wins + f.ties * 0.5) / g) * 100).toFixed(1) : '0.0';
                          })()}%)
                        </p>
                        <p>Total PF: {f.totalPF.toFixed(2)}</p>
                        <p>Avg PF: {f.avgPF.toFixed(2)}</p>
                        <p>Championships: {f.championships}</p>
                        <p>2nd Place: {ruCount}</p>
                        <p>3rd Place: {tpCount}</p>
                        <p>Regular Season Winner: {rsCount}</p>
                      </div>
                    </CardContent>
                  </Card>
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
