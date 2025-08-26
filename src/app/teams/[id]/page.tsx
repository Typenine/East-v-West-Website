'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Tabs from '@/components/ui/Tabs';
import { 
  getTeamsData, 
  getTeamWeeklyResults, 
  getAllPlayers,
  SleeperPlayer,
  TeamData,
  getTeamAllTimeStatsByOwner,
  getTeamH2HRecordsAllTimeByOwner,
  getPlayersPPRAndPPG,
  getNFLSeasonStats,
  SleeperNFLSeasonPlayerStats,
} from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamLogoPath, getTeamColorStyle, resolveCanonicalTeamName } from '@/lib/utils/team-utils';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import SectionHeader from '@/components/ui/SectionHeader';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, THead, TBody, Th, Td, Tr } from '@/components/ui/Table';
import { Select } from '@/components/ui/Select';
import Label from '@/components/ui/Label';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import StatCard from '@/components/ui/StatCard';
import Modal from '@/components/ui/Modal';

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
    result: 'W' | 'L' | 'T' | null;
    opponentRosterId: number;
    played: boolean;
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
  // Collapsed state per playerId for News groups
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (playerId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [playerId]: !prev[playerId] }));
  };
  // Player detail modal state and season stats cache
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [seasonStats, setSeasonStats] = useState<Record<string, SleeperNFLSeasonPlayerStats>>({});
  // Player modal per-season state/caches
  const [modalYear, setModalYear] = useState<string>(selectedYear);
  const [modalFantasyCache, setModalFantasyCache] = useState<Record<string, { totalPPR: number; gp: number; ppg: number }>>({});
  const [modalRealCache, setModalRealCache] = useState<Record<string, SleeperNFLSeasonPlayerStats | null>>({});
  
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

  // Lazy-load season real-life stats when opening a player's modal (fetch once per season)
  useEffect(() => {
    if (!selectedPlayerId) return;
    if (seasonStats && seasonStats[selectedPlayerId]) return;
    (async () => {
      try {
        const stats = await getNFLSeasonStats(selectedYear);
        setSeasonStats(stats);
      } catch {
        /* ignore */
      }
    })();
  }, [selectedPlayerId, selectedYear, seasonStats]);

  // Clear cached season stats when the selected season changes
  useEffect(() => {
    setSeasonStats({});
  }, [selectedYear]);
  
  // Initialize modalYear and reset per-player caches when opening modal or switching page season
  useEffect(() => {
    if (!selectedPlayerId) return;
    setModalYear(String(selectedYear));
    setModalFantasyCache({});
    setModalRealCache({});
  }, [selectedPlayerId, selectedYear]);

  // Lazy fetch fantasy stats for selected player and modalYear
  useEffect(() => {
    if (!selectedPlayerId) return;
    const season = String(modalYear);
    if (modalFantasyCache[season]) return;
    (async () => {
      try {
        const res = await getPlayersPPRAndPPG(season, [selectedPlayerId]);
        setModalFantasyCache((prev) => ({
          ...prev,
          [season]: res[selectedPlayerId] || { totalPPR: 0, gp: 0, ppg: 0 },
        }));
      } catch {
        /* ignore */
      }
    })();
  }, [selectedPlayerId, modalYear, modalFantasyCache]);

  // Lazy fetch real-life stats for selected player and modalYear
  useEffect(() => {
    if (!selectedPlayerId) return;
    const season = String(modalYear);
    if (Object.prototype.hasOwnProperty.call(modalRealCache, season)) return;
    (async () => {
      try {
        const stats = await getNFLSeasonStats(season);
        setModalRealCache((prev) => ({
          ...prev,
          [season]: stats[selectedPlayerId] || null,
        }));
      } catch {
        /* ignore */
      }
    })();
  }, [selectedPlayerId, modalYear, modalRealCache]);
  
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
      <div className="flex flex-col items-center mb-4">
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
      </div>
      <SectionHeader
        title={teamName}
        subtitle={`All-time Record: ${allTimeStats.wins}-${allTimeStats.losses}-${allTimeStats.ties}`}
        className="mb-6"
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="year-select" className="sr-only md:not-sr-only text-[var(--muted)]">Season</Label>
            <Select
              id="year-select"
              size="sm"
              fullWidth={false}
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="w-[12rem]"
            >
              <option value="2025">2025 Season</option>
              <option value="2024">2024 Season</option>
              <option value="2023">2023 Season</option>
            </Select>
          </div>
        }
      />
      
      {/* All-time summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" style={{ borderTop: `4px solid ${getTeamColorStyle(teamName).backgroundColor}` }}>
        <StatCard label="Total PF" value={allTimeStats.totalPF.toFixed(2)} />
        <StatCard label="Total PA" value={allTimeStats.totalPA.toFixed(2)} />
        <StatCard label="Avg PF/Week" value={allTimeStats.avgPF.toFixed(2)} />
        <StatCard label="Avg PA/Week" value={allTimeStats.avgPA.toFixed(2)} />
      </div>
      
      
      
      <Tabs
        tabs={[
          {
            id: 'news',
            label: 'News',
            content: (
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <CardTitle>Roster News</CardTitle>
                  <div className="flex items-center gap-3">
                    {news && news.length > 0 ? (
                      <span className="text-sm text-[var(--muted)]">{news.length} articles</span>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setNewsWindowHours((h) => (h === 336 ? 720 : 336))}
                    >
                      {newsWindowHours === 336 ? 'Show older (30d)' : 'Show recent (14d)'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {newsLoading && <div className="py-6"><LoadingState message="Loading news..." /></div>}
                  {newsError && <div className="py-6"><ErrorState message={newsError} /></div>}
                  {!newsLoading && !newsError && (
                    <div>
                      {newsGrouped && newsGrouped.length > 0 ? (
                        <div className="space-y-8">
                          {newsGrouped.map((group) => {
                            const p = players[group.playerId];
                            const meta = p ? `${p.position || ''}${p.team ? ` • ${p.team}` : ''}` : '';
                            return (
                              <section key={group.playerId}>
                                <button
                                  type="button"
                                  onClick={() => toggleGroup(group.playerId)}
                                  aria-expanded={!collapsedGroups[group.playerId]}
                                  aria-controls={`news-group-${group.playerId}`}
                                  className="w-full flex items-baseline justify-between mb-2 text-left group hover:underline-offset-2"
                                >
                                  <h3 className="text-lg font-semibold group-hover:underline">
                                    {group.playerName}
                                    {meta ? <span className="ml-2 text-sm text-[var(--muted)]">{meta}</span> : null}
                                  </h3>
                                  <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
                                    {group.items.length} article{group.items.length !== 1 ? 's' : ''}
                                    <span aria-hidden>{collapsedGroups[group.playerId] ? '▸' : '▾'}</span>
                                  </span>
                                </button>
                                {!collapsedGroups[group.playerId] && (
                                  <div className="space-y-4" id={`news-group-${group.playerId}`}>
                                    {group.items.map((it, idx) => (
                                      <article
                                        key={`${group.playerId}-${it.link}-${idx}`}
                                        className="border border-[var(--border)] rounded-lg p-4 cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] transition"
                                        role="link"
                                        tabIndex={0}
                                        onClick={(e) => {
                                          const target = e.target as HTMLElement;
                                          if (target && target.closest('a')) return;
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
                                          <div className="text-sm text-[var(--muted)]">{it.sourceName}</div>
                                          <div className="text-xs text-[var(--muted)]">{it.publishedAt ? new Date(it.publishedAt).toLocaleString() : ''}</div>
                                        </div>
                                        <h4 className="font-semibold hover:underline">{it.title}</h4>
                                        <p className="text-sm text-[var(--text)] mt-1 whitespace-pre-line">{it.description}</p>
                                        <div className="mt-2">
                                          <a
                                            href={it.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center text-sm text-[var(--accent)] hover:underline"
                                          >
                                            Read at source ↗
                                          </a>
                                        </div>
                                      </article>
                                    ))}
                                  </div>
                                )}
                              </section>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[var(--muted)]">No recent news found for this roster.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: 'roster',
            label: 'Roster',
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Current Roster</CardTitle>
                </CardHeader>
                <CardContent>
                  {team.players && team.players.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <THead>
                          <Tr>
                            <Th>
                              <button type="button" onClick={() => onSort('name')} className="flex items-center gap-1 hover:text-[var(--text)]">
                                Player <span className="opacity-60">{sortArrow('name')}</span>
                              </button>
                            </Th>
                            <Th>
                              <button type="button" onClick={() => onSort('position')} className="flex items-center gap-1 hover:text-[var(--text)]">
                                Position <span className="opacity-60">{sortArrow('position')}</span>
                              </button>
                            </Th>
                            <Th>
                              <button type="button" onClick={() => onSort('team')} className="flex items-center gap-1 hover:text-[var(--text)]">
                                Team <span className="opacity-60">{sortArrow('team')}</span>
                              </button>
                            </Th>
                            <Th>
                              <button type="button" onClick={() => onSort('gp')} className="flex items-center gap-1 hover:text-[var(--text)]">
                                G <span className="opacity-60">{sortArrow('gp')}</span>
                              </button>
                            </Th>
                            <Th>
                              <button type="button" onClick={() => onSort('totalPPR')} className="flex items-center gap-1 hover:text-[var(--text)]">
                                Total PPR <span className="opacity-60">{sortArrow('totalPPR')}</span>
                              </button>
                            </Th>
                            <Th>
                              <button type="button" onClick={() => onSort('ppg')} className="flex items-center gap-1 hover:text-[var(--text)]">
                                PPG <span className="opacity-60">{sortArrow('ppg')}</span>
                              </button>
                            </Th>
                          </Tr>
                        </THead>
                        <TBody>
                          {sortedGroups.map(({ group, ids }) => (
                            [
                              (
                                <Tr key={`hdr-${group}`} className="bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]">
                                  <Td colSpan={6} className="text-xs font-semibold text-[var(--muted)] uppercase">
                                    {group}
                                  </Td>
                                </Tr>
                              ),
                              ...ids.map((playerId) => {
                                const player = players[playerId];
                                if (!player) return null;
                                const s = playerSeasonStats[playerId];
                                return (
                                  <Tr key={playerId}>
                                    <Td>
                                      <button
                                        type="button"
                                        className="text-sm font-medium text-[var(--accent)] hover:underline"
                                        onClick={() => setSelectedPlayerId(playerId)}
                                      >
                                        {player.first_name} {player.last_name}
                                      </button>
                                    </Td>
                                    <Td>
                                      <div className="text-sm text-[var(--muted)]">{player.position}</div>
                                    </Td>
                                    <Td>
                                      <div className="text-sm text-[var(--muted)]">{player.team}</div>
                                    </Td>
                                    <Td>
                                      <div className="text-sm text-[var(--muted)]">{(s?.gp ?? 0)}</div>
                                    </Td>
                                    <Td>
                                      <div className="text-sm text-[var(--muted)]">{(s?.totalPPR ?? 0).toFixed(1)}</div>
                                    </Td>
                                    <Td>
                                      <div className="text-sm text-[var(--text)]">{(s?.ppg ?? 0).toFixed(2)}</div>
                                    </Td>
                                  </Tr>
                                );
                              })
                            ]
                          ))}
                        </TBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-[var(--muted)] text-center py-4">No roster data available</p>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: 'schedule',
            label: 'Schedule',
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Season Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                  {weeklyResults && weeklyResults.length > 0 ? (
                    <div className="overflow-x-auto">
                      <Table>
                        <THead>
                          <Tr>
                            <Th>Week</Th>
                            <Th>Opponent</Th>
                            <Th>Result</Th>
                            <Th>Score</Th>
                          </Tr>
                        </THead>
                        <TBody>
                          {weeklyResults.map((result) => {
                            const opponentTeam = allTeams.find(t => t.rosterId === result.opponent);
                            const opponentName = opponentTeam ? opponentTeam.teamName : 'Unknown Team';
                            const isPlayed = !!result.played;
                            const chipText = isPlayed ? (result.result ?? '') : 'Scheduled';
                            const chipClass = isPlayed
                              ? (result.result === 'W'
                                  ? 'bg-green-100 text-green-800'
                                  : result.result === 'L'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800')
                              : 'evw-subtle text-[var(--text)]';
                            return (
                              <Tr key={result.week}>
                                <Td>
                                  <div className="text-sm text-[var(--text)]">Week {result.week}</div>
                                </Td>
                                <Td>
                                  <div className="text-sm font-medium text-[var(--text)]">{opponentName}</div>
                                </Td>
                                <Td>
                                  <Chip
                                    size="sm"
                                    variant="neutral"
                                    className={[
                                      'px-2',
                                      chipClass,
                                    ].join(' ')}
                                  >
                                    {chipText}
                                  </Chip>
                                </Td>
                                <Td>
                                  <div className="text-sm text-[var(--text)]">
                                    {isPlayed ? `${result.points.toFixed(2)} - ${result.opponentPoints.toFixed(2)}` : '—'}
                                  </div>
                                </Td>
                              </Tr>
                            );
                          })}
                        </TBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="text-[var(--muted)] text-center py-4">No schedule data available</p>
                  )}
                </CardContent>
              </Card>
            ),
          },
          {
            id: 'records',
            label: 'Records',
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Team Records</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StatCard label="Highest Scoring Week" value={`${allTimeStats.highestScore.toFixed(2)} pts`} />
                    <StatCard label="Lowest Scoring Week" value={`${allTimeStats.lowestScore.toFixed(2)} pts`} />
                  </div>
                </CardContent>
              </Card>
            ),
          },
          {
            id: 'h2h',
            label: 'H2H Records',
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Head-to-Head Records</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <THead>
                        <Tr>
                          <Th>Team</Th>
                          <Th>Record</Th>
                          <Th>Win %</Th>
                        </Tr>
                      </THead>
                      <TBody>
                        {Object.entries(h2hRecords).map(([opponentOwnerId, record]) => {
                          const opponentName = resolveCanonicalTeamName({ ownerId: opponentOwnerId });
                          const totalGames = record.wins + record.losses + record.ties;
                          const winPercentage = totalGames > 0 ? (record.wins + record.ties * 0.5) / totalGames : 0;
                          return (
                            <Tr key={opponentOwnerId}>
                              <Td>
                                <div className="text-sm font-medium text-[var(--text)]">{opponentName}</div>
                              </Td>
                              <Td>
                                <div className="text-sm text-[var(--text)]">
                                  {record.wins}-{record.losses}{record.ties > 0 ? `-${record.ties}` : ''}
                                </div>
                              </Td>
                              <Td>
                                <div className="text-sm text-[var(--text)]">{(winPercentage * 100).toFixed(1)}%</div>
                              </Td>
                            </Tr>
                          );
                        })}
                      </TBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ),
          },
        ]}
      />
      {/* Player Details Modal */}
      {selectedPlayerId && (
        <Modal
          open={!!selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
          title={(() => {
            const p = players[selectedPlayerId!];
            return p ? `${p.first_name} ${p.last_name}` : 'Player Details';
          })()}
        >
          {(() => {
            const p = players[selectedPlayerId!];
            const s = (modalFantasyCache[modalYear] ?? playerSeasonStats[selectedPlayerId!]) || { totalPPR: 0, gp: 0, ppg: 0 };
            const nfl = (modalRealCache[modalYear] ?? seasonStats[selectedPlayerId!]);
            const group = newsGrouped.find((g) => g.playerId === selectedPlayerId);
            const meta = p ? `${p.position || ''}${p.team ? ` • ${p.team}` : ''}` : '';

            const labelMap: Record<string, string> = {
              pass_yd: 'Pass Yds',
              pass_att: 'Pass Att',
              pass_cmp: 'Pass Cmp',
              pass_td: 'Pass TDs',
              pass_int: 'INT',
              rush_att: 'Rush Att',
              rush_yd: 'Rush Yds',
              rush_td: 'Rush TDs',
              rec: 'Receptions',
              tgt: 'Targets',
              rec_yd: 'Rec Yds',
              rec_td: 'Rec TDs',
              fumbles_lost: 'Fumbles Lost',
              sack: 'Sacks',
              int: 'INT (DEF)',
              def_td: 'Def TDs',
              pts_allowed: 'Pts Allowed',
              xpm: 'XPM',
              xpa: 'XPA',
              fgm: 'FGM',
              fga: 'FGA',
            };
            const candidateKeys = [
              'pass_yd','pass_att','pass_cmp','pass_td','pass_int','rush_att','rush_yd','rush_td','rec','tgt','rec_yd','rec_td','fumbles_lost','sack','int','def_td','pts_allowed','xpm','xpa','fgm','fga'
            ];
            const realStats: Array<{ key: string; label: string; value: number }> = [];
            if (nfl) {
              for (const k of candidateKeys) {
                const v = (nfl as Record<string, number | undefined>)[k];
                if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) > 0) {
                  realStats.push({ key: k, label: labelMap[k] || k, value: v });
                }
              }
            }
            // Keep at most 8 most notable stats by value
            realStats.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
            const topReal = realStats.slice(0, 8);

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  {meta ? <div className="text-sm text-[var(--muted)]">{meta}</div> : <span />}
                  <div className="flex items-center gap-2">
                    <Label htmlFor="player-season" className="text-xs text-[var(--muted)]">Season</Label>
                    <Select
                      id="player-season"
                      size="sm"
                      value={modalYear}
                      onChange={(e) => setModalYear(e.target.value)}
                      className="w-[8.5rem]"
                    >
                      <option value="2025">2025</option>
                      <option value="2024">2024</option>
                      <option value="2023">2023</option>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="evw-subtle rounded-lg p-3 border border-[var(--border)]">
                    <div className="text-xs font-semibold text-[var(--muted)] mb-1">Fantasy (PPR)</div>
                    <div className="text-sm">G: <span className="font-medium">{s.gp || 0}</span></div>
                    <div className="text-sm">Total: <span className="font-medium">{(s.totalPPR || 0).toFixed(1)}</span></div>
                    <div className="text-sm">PPG: <span className="font-medium">{(s.ppg || 0).toFixed(2)}</span></div>
                  </div>
                  <div className="evw-subtle rounded-lg p-3 border border-[var(--border)]">
                    <div className="text-xs font-semibold text-[var(--muted)] mb-1">Real-life</div>
                    <div className="text-sm">Games: <span className="font-medium">{(nfl?.gp ?? nfl?.gms_active ?? 0) || 0}</span></div>
                    {topReal.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {topReal.map((rs) => (
                          <li key={rs.key} className="flex justify-between"><span>{rs.label}</span><span className="font-medium">{rs.value}</span></li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-sm text-[var(--muted)]">No stat details available.</div>
                    )}
                  </div>
                </div>

                <div className="evw-subtle rounded-lg p-3 border border-[var(--border)]">
                  <div className="text-xs font-semibold text-[var(--muted)] mb-2">Latest News</div>
                  {group && group.items && group.items.length > 0 ? (
                    <ul className="space-y-2">
                      {group.items.slice(0, 5).map((it, idx) => (
                        <li key={`${selectedPlayerId}-news-${idx}`} className="text-sm">
                          <a href={it.link} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline font-medium">
                            {it.title}
                          </a>
                          <div className="text-xs text-[var(--muted)]">{it.sourceName}{it.publishedAt ? ` • ${new Date(it.publishedAt).toLocaleString()}` : ''}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-[var(--muted)]">No recent articles.</div>
                  )}
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
