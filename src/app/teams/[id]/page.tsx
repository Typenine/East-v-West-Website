'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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
  computeSeasonTotalsCustomScoringFromStats,
  getNFLSeasonStats,
  SleeperNFLSeasonPlayerStats,
  buildSeasonRosterFromMatchups,
  getLeagueMatchups,
} from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamLogoPath, getTeamColorStyle, getTeamColors, resolveCanonicalTeamName } from '@/lib/utils/team-utils';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import SectionHeader from '@/components/ui/SectionHeader';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, THead, TBody, Th, Td, Tr } from '@/components/ui/Table';
import { Select } from '@/components/ui/Select';
import Label from '@/components/ui/Label';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import StatCard from '@/components/ui/StatCard';

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
  // Records: career leaders and best single-season leaders by position (Top 5)
  type LeaderRow = { playerId: string; name: string; position: string; season?: string; total: number; ppg?: number };
  const POSITIONS = ['QB','RB','WR','TE','K','DEF/DST'] as const;
  type PosKey = typeof POSITIONS[number];
  const emptyCareer: Record<PosKey | 'ALL', LeaderRow[]> = { 'QB': [], 'RB': [], 'WR': [], 'TE': [], 'K': [], 'DEF/DST': [], 'ALL': [] };
  const emptySeason: Record<PosKey, LeaderRow[]> = { 'QB': [], 'RB': [], 'WR': [], 'TE': [], 'K': [], 'DEF/DST': [] };
  const [careerLeaders, setCareerLeaders] = useState<Record<PosKey | 'ALL', LeaderRow[]>>(emptyCareer);
  const [seasonLeaders, setSeasonLeaders] = useState<Record<PosKey, LeaderRow[]>>(emptySeason);
  const [recordsLoading, setRecordsLoading] = useState(false);

  // Player Weekly Points Modal state
  type WeeklyRow = { week: number; points: number; rostered: boolean; started: boolean };
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [playerModal, setPlayerModal] = useState<{ playerId: string; name: string } | null>(null);
  const [modalSeason, setModalSeason] = useState<string>('');
  const [modalSeasons, setModalSeasons] = useState<string[]>([]);
  const [modalWeeks, setModalWeeks] = useState<WeeklyRow[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const buildModalSeasons = useCallback(() => {
    const prevYears = Object.keys(LEAGUE_IDS.PREVIOUS || {});
    const seasons = Array.from(new Set([String(selectedYear), ...prevYears])).sort((a,b) => b.localeCompare(a));
    return seasons;
  }, [selectedYear]);

  const openPlayerModal = useCallback((playerId: string, name: string) => {
    const seasons = buildModalSeasons();
    setModalSeasons(seasons);
    setModalSeason(seasons[0] || String(selectedYear));
    setPlayerModal({ playerId, name });
    setPlayerModalOpen(true);
  }, [buildModalSeasons, selectedYear]);

  const closePlayerModal = useCallback(() => {
    setPlayerModalOpen(false);
    setPlayerModal(null);
    setModalWeeks([]);
    setModalError(null);
  }, []);

  const loadPlayerWeekly = useCallback(async (season: string, playerId: string) => {
    try {
      setModalLoading(true);
      setModalError(null);
      const leagueId = (season === '2025') ? LEAGUE_IDS.CURRENT : LEAGUE_IDS.PREVIOUS[season as keyof typeof LEAGUE_IDS.PREVIOUS];
      if (!leagueId) {
        setModalWeeks([]);
        setModalError('No league for this season');
        return;
      }
      // Find this franchise in that season
      const teams = await getTeamsData(leagueId);
      const canonicalName = resolveCanonicalTeamName({ ownerId: team?.ownerId });
      const seasonTeam = teams.find(t => t.teamName === canonicalName) || teams.find(t => t.ownerId === team?.ownerId);
      if (!seasonTeam) {
        setModalWeeks([]);
        setModalError('Team not found for this season');
        return;
      }
      const rosterId = seasonTeam.rosterId;
      const weeks = Array.from({ length: 17 }, (_, i) => i + 1);
      const weekly = await Promise.all(weeks.map((w) => getLeagueMatchups(leagueId, w).catch(() => [] as Array<{ roster_id?: number; players_points?: Record<string, number>; players?: string[]; starters?: string[] }>)));
      const rows: WeeklyRow[] = [];
      for (let i = 0; i < weeks.length; i++) {
        const w = weeks[i];
        const matchups = (weekly[i] || []) as Array<{ roster_id?: number; players_points?: Record<string, number>; players?: string[]; starters?: string[] }>;
        const m = matchups.find(mm => mm.roster_id === rosterId);
        if (!m) {
          rows.push({ week: w, points: 0, rostered: false, started: false });
          continue;
        }
        const playersArr = (m.players || []) as string[];
        const startersArr = (m.starters || []) as string[];
        const rostered = playersArr.includes(playerId) || startersArr.includes(playerId);
        const started = startersArr.includes(playerId);
        const pts = Number((m.players_points || {})[playerId] || 0);
        rows.push({ week: w, points: Number(pts.toFixed(2)), rostered, started });
      }
      setModalWeeks(rows);
    } catch (e) {
      setModalWeeks([]);
      setModalError('Failed to load weekly points');
    } finally {
      setModalLoading(false);
    }
  }, [team?.ownerId]);

  // Load weeks whenever modal season or player changes
  useEffect(() => {
    if (!playerModalOpen || !playerModal || !modalSeason) return;
    loadPlayerWeekly(modalSeason, playerModal.playerId);
  }, [playerModalOpen, playerModal, modalSeason, loadPlayerWeekly]);

  // Populate Records: multi-season aggregation with roster reconstruction
  useEffect(() => {
    (async () => {
      if (!team) return;
      try {
        setRecordsLoading(true);
        // Build dynamic seasons list (current selection + configured previous)
        const prevYears = Object.keys(LEAGUE_IDS.PREVIOUS || {});
        const seasons = Array.from(new Set([String(selectedYear), ...prevYears]))
          .sort((a, b) => b.localeCompare(a));

        // Ensure players metadata
        let allPlayersMap = players;
        if (!allPlayersMap || Object.keys(allPlayersMap).length === 0) {
          try { allPlayersMap = await getAllPlayers(); } catch { allPlayersMap = {}; }
        }

        // Aggregation buckets
        const careerTotals: Record<string, { total: number; pos: string; name: string }> = {};
        const bestSeason: Record<string, { total: number; season: string; pos: string; name: string }> = {};
        const canonicalName = resolveCanonicalTeamName({ ownerId: team.ownerId });
        // Debug capture per-season totals for a few players by name
        const debugNames = new Set(['Josh Allen','David Montgomery','Alvin Kamara']);
        const debugLeaguePerSeason: Record<string, Record<string, number>> = {}; // pid -> { season -> total } team-attributed, W1–17 + playoffs
        const debugCardPerSeason: Record<string, Record<string, number>> = {};   // pid -> { season -> total } NFL regular season W1–18 under league scoring
        const debugTeamPlayoffs: Record<string, Record<string, number>> = {};    // pid -> { season -> PO(15–17) points attributed to this team }
        const debugCardWeek18: Record<string, Record<string, number>> = {};      // pid -> { season -> Week 18 points }
        const debugPidByName: Record<string, string> = {};
        for (const [pid, pl] of Object.entries(allPlayersMap)) {
          const nm = `${pl?.first_name || ''} ${pl?.last_name || ''}`.trim();
          if (nm && debugNames.has(nm)) debugPidByName[nm] = pid;
        }

        for (const season of seasons) {
          const leagueId = (season === '2025') ? LEAGUE_IDS.CURRENT : LEAGUE_IDS.PREVIOUS[season as keyof typeof LEAGUE_IDS.PREVIOUS];
          if (!leagueId) continue;
          const teams = await getTeamsData(leagueId);
          const seasonTeam = teams.find(t => t.teamName === canonicalName) || teams.find(t => t.ownerId === team.ownerId);
          if (!seasonTeam) continue;

          // Build season roster: use provided players or reconstruct from matchups
          let seasonRoster: string[] = Array.isArray(seasonTeam.players) ? seasonTeam.players : [];
          if (!seasonRoster || seasonRoster.length === 0) {
            try {
              const reconstructed = await buildSeasonRosterFromMatchups(season, leagueId, seasonTeam.rosterId);
              seasonRoster = Array.from(reconstructed);
            } catch {
              seasonRoster = [];
            }
          }
          if (!seasonRoster || seasonRoster.length === 0) continue;

          // Week-level attribution: include playoffs, exclude Week 18, include current season partial
          const weeks = Array.from({ length: 17 }, (_, i) => i + 1);
          const weekly = await Promise.all(
            weeks.map((w) => getLeagueMatchups(leagueId, w).catch(() => [] as unknown[]))
          );

          // Aggregate per-player points for this season
          const seasonTotals: Record<string, number> = {};
          for (let idx = 0; idx < weekly.length; idx++) {
            const weekNum = weeks[idx];
            const weekMatches = weekly[idx] as Array<{ roster_id?: number; players_points?: Record<string, number> }>;
            for (const m of weekMatches) {
              if (!m || m.roster_id !== seasonTeam.rosterId) continue;
              const pp = m.players_points || {};
              for (const pid of Object.keys(pp)) {
                if (!seasonRoster.includes(pid)) continue;
                const val = Number(pp[pid] || 0);
                if (!Number.isFinite(val) || val <= 0) continue;
                seasonTotals[pid] = (seasonTotals[pid] || 0) + val;
                // capture playoff-only points (Weeks 15–17) for debug players
                if (weekNum >= 15 && debugNames.has((allPlayersMap[pid] ? `${allPlayersMap[pid].first_name} ${allPlayersMap[pid].last_name}` : '').trim())) {
                  (debugTeamPlayoffs[pid] ||= {});
                  debugTeamPlayoffs[pid][season] = (debugTeamPlayoffs[pid][season] || 0) + val;
                }
              }
            }
          }
          // Merge into career + best-season using attributed week-level totals
          for (const pid of Object.keys(seasonTotals)) {
            const total = seasonTotals[pid];
            const meta = allPlayersMap[pid];
            const pos = toPositionGroup(meta?.position);
            const name = meta ? `${meta.first_name} ${meta.last_name}` : pid;
            const c = (careerTotals[pid] ||= { total: 0, pos, name });
            c.total += total;
            const b = bestSeason[pid];
            if (!b || total > b.total) bestSeason[pid] = { total, season, pos, name };
            if (name && debugNames.has(name)) {
              (debugLeaguePerSeason[pid] ||= {});
              debugLeaguePerSeason[pid][season] = (debugLeaguePerSeason[pid][season] || 0) + total;
            }
          }

          // For debug: compute NFL regular-season totals (W1–18) using league scoring from weekly stats
          const [cardTotals18, cardTotals17] = await Promise.all([
            computeSeasonTotalsCustomScoringFromStats(season, leagueId, 18),
            computeSeasonTotalsCustomScoringFromStats(season, leagueId, 17),
          ]);
          for (const [name, pid] of Object.entries(debugPidByName)) {
            const tot = Number(cardTotals18[pid] || 0);
            if (!debugCardPerSeason[pid]) debugCardPerSeason[pid] = {};
            debugCardPerSeason[pid][season] = tot;
            const w18 = Number(((cardTotals18[pid] || 0) - (cardTotals17[pid] || 0)).toFixed(2));
            (debugCardWeek18[pid] ||= {});
            debugCardWeek18[pid][season] = w18;
          }
        }

        // Build Top 5 tables by position
        const byPosCareer: Record<PosKey | 'ALL', LeaderRow[]> = { 'QB': [], 'RB': [], 'WR': [], 'TE': [], 'K': [], 'DEF/DST': [], 'ALL': [] };
        Object.entries(careerTotals).forEach(([pid, v]) => {
          const row: LeaderRow = { playerId: pid, name: v.name, position: v.pos, total: v.total };
          if ((POSITIONS as readonly string[]).includes(v.pos)) byPosCareer[v.pos as PosKey].push(row);
          byPosCareer['ALL'].push(row);
        });
        (Object.keys(byPosCareer) as Array<keyof typeof byPosCareer>).forEach((k) => {
          byPosCareer[k].sort((a,b) => b.total - a.total);
          byPosCareer[k] = byPosCareer[k].slice(0,5);
        });

        const byPosSeason: Record<PosKey, LeaderRow[]> = { 'QB': [], 'RB': [], 'WR': [], 'TE': [], 'K': [], 'DEF/DST': [] };
        Object.entries(bestSeason).forEach(([pid, v]) => {
          if (!(POSITIONS as readonly string[]).includes(v.pos)) return;
          byPosSeason[v.pos as PosKey].push({ playerId: pid, name: v.name, position: v.pos, season: v.season, total: v.total });
        });
        (Object.keys(byPosSeason) as Array<keyof typeof byPosSeason>).forEach((k) => {
          byPosSeason[k].sort((a,b) => b.total - a.total);
          byPosSeason[k] = byPosSeason[k].slice(0,5);
        });

        setCareerLeaders(byPosCareer);
        // Debug: print reconciliation per player/season
        try {
          const nameById: Record<string, string> = {};
          Object.entries(careerTotals).forEach(([pid, v]) => (nameById[pid] = v.name));
          const pids = new Set<string>([...Object.keys(debugLeaguePerSeason), ...Object.keys(debugCardPerSeason)]);
          pids.forEach((pid) => {
            const nm = nameById[pid] || pid;
            const seasonsList = Array.from(new Set([...
              Object.keys(debugLeaguePerSeason[pid] || {}), ...Object.keys(debugCardPerSeason[pid] || {})
            ])).sort();
            const rows = seasonsList.map((s) => ({
              player: nm,
              season: s,
              team_attr_W1_17_plus_PO: Number((debugLeaguePerSeason[pid]?.[s] || 0).toFixed(2)),
              nfl_reg_W1_18: Number((debugCardPerSeason[pid]?.[s] || 0).toFixed(2)),
              playoffs_W15_17_only: Number((debugTeamPlayoffs[pid]?.[s] || 0).toFixed(2)),
              week18_only: Number((debugCardWeek18[pid]?.[s] || 0).toFixed(2)),
              delta_total: Number(((debugLeaguePerSeason[pid]?.[s] || 0) - (debugCardPerSeason[pid]?.[s] || 0)).toFixed(2)),
              delta_theory_PO_minus_W18: Number((((debugTeamPlayoffs[pid]?.[s] || 0) - (debugCardWeek18[pid]?.[s] || 0))).toFixed(2)),
            }));
            if (rows.length > 0) {
              console.groupCollapsed(`[Team Records Reconcile] ${nm}`);
              console.table(rows);
              console.groupEnd();
            }
          });
        } catch {}

        setSeasonLeaders(byPosSeason);
      } catch (e) {
        console.error('Failed to compute team records (multi-season)', e);
        setCareerLeaders(emptyCareer);
        setSeasonLeaders(emptySeason);
      } finally {
        setRecordsLoading(false);
      }
    })();
  }, [team, players, selectedYear]);

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

  // Lazy fetch fantasy totals for selected player and modalYear using league custom scoring (exact parity)
  useEffect(() => {
    if (!selectedPlayerId) return;
    const season = String(modalYear);
    if (modalFantasyCache[season]) return;
    (async () => {
      try {
        const leagueForSeason = getLeagueIdForYear(season);
        if (!leagueForSeason) {
          setModalFantasyCache((prev) => ({ ...prev, [season]: { totalPPR: 0, gp: 0, ppg: 0 } }));
          return;
        }
        const totals = await computeSeasonTotalsCustomScoringFromStats(season, leagueForSeason, 18);
        const total = Number(totals[selectedPlayerId] || 0);
        setModalFantasyCache((prev) => ({
          ...prev,
          [season]: { totalPPR: total, gp: 0, ppg: 0 },
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
            const [allPlayersData, leagueTotals, seasonAgg] = await Promise.all([
              getAllPlayers(),
              // Use league custom scoring for the full NFL regular season (Weeks 1–18)
              computeSeasonTotalsCustomScoringFromStats(selectedYear, leagueId, 18),
              // For GP we use season aggregate gp/gms_active (real-life)
              getNFLSeasonStats(selectedYear),
            ]);
            setPlayers(allPlayersData);
            const stats: Record<string, { totalPPR: number; gp: number; ppg: number }> = {};
            for (const pid of currentTeam.players) {
              const total = Number(leagueTotals[pid] || 0);
              const s = seasonAgg[pid];
              const gp = (s?.gp ?? s?.gms_active ?? 0) || 0;
              const ppg = gp > 0 ? total / gp : 0;
              stats[pid] = { totalPPR: total, gp, ppg };
            }
            setPlayerSeasonStats(stats);
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
  
  // Scoped team theme variables for this page
  const colors = getTeamColors(teamName);
  type TeamCSSVars = React.CSSProperties & {
    '--danger'?: string;
    '--gold'?: string;
    '--tertiary'?: string;
    '--quaternary'?: string;
  };
  const themeVars: TeamCSSVars = {
    '--danger': colors.primary,
    '--gold': colors.secondary,
    '--tertiary': colors.tertiary ?? colors.secondary ?? colors.primary,
    '--quaternary': colors.quaternary ?? colors.secondary ?? colors.primary,
  };
  // Local override to color Tabs with team primary while keeping global blue accents elsewhere
  type TabsAccentVars = React.CSSProperties & { '--accent'?: string };
  const tabsAccentVars: TabsAccentVars = { '--accent': colors.primary };
  
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
    <div className="container mx-auto px-4 py-8" style={themeVars}>
      <div className="w-full h-1.5 rounded-full mb-6 brand-gradient" />
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
      
      
      
      <div style={tabsAccentVars}>
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
                                <Tr key={`hdr-${group}`} className="bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]">
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
                                      <div className="text-sm text-[var(--muted)]">{(s?.totalPPR ?? 0).toFixed(2)}</div>
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

                  {/* Career Leaders (Top 5) */}
                  <div className="mt-6">
                    <SectionHeader
                      title="Career Leaders (with this Franchise)"
                      subtitle="League Scoring (Half‑PPR) • Weeks 1–17 + playoffs • Includes current season"
                    />
                    {recordsLoading ? (
                      <div className="py-4"><LoadingState message="Computing career leaders..." /></div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {POSITIONS.map((pos) => (
                          <Card key={`career-${pos}`}>
                            <CardHeader>
                              <CardTitle>{pos}</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="overflow-x-auto">
                                <Table>
                                  <THead>
                                    <Tr>
                                      <Th>#</Th>
                                      <Th>Player</Th>
                                      <Th className="text-right">Total</Th>
                                    </Tr>
                                  </THead>
                                  <TBody>
                                    {(careerLeaders[pos] || []).map((row, idx) => (
                                      <Tr key={`${pos}-${row.playerId}`}>
                                        <Td>{idx + 1}</Td>
                                        <Td>
                                          <button
                                            type="button"
                                            className="text-[var(--accent-strong,#0b5f98)] hover:underline font-medium"
                                            onClick={() => openPlayerModal(row.playerId, row.name)}
                                          >
                                            {row.name}
                                          </button>
                                        </Td>
                                        <Td className="text-right">{row.total.toFixed(2)}</Td>
                                      </Tr>
                                    ))}
                                  </TBody>
                                </Table>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Best Single-Season Totals (Top 5) */}
                  <div className="mt-8">
                    <SectionHeader
                      title="Best Single-Season Totals"
                      subtitle="League Scoring (Half‑PPR) • Weeks 1–17 + playoffs • Includes current season"
                    />
                    {recordsLoading ? (
                      <div className="py-4"><LoadingState message="Computing single-season leaders..." /></div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {(['QB','RB','WR','TE','K','DEF/DST'] as PosKey[]).map((pos) => (
                          <Card key={`season-${pos}`}>
                            <CardHeader>
                              <CardTitle>{pos}</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="overflow-x-auto">
                                <Table>
                                  <THead>
                                    <Tr>
                                      <Th>#</Th>
                                      <Th>Player</Th>
                                      <Th>Season</Th>
                                      <Th className="text-right">Total</Th>
                                    </Tr>
                                  </THead>
                                  <TBody>
                                    {(seasonLeaders[pos] || []).map((row, idx) => (
                                      <Tr key={`${pos}-${row.playerId}-${row.season}`}>
                                        <Td>{idx + 1}</Td>
                                        <Td>
                                          <button
                                            type="button"
                                            className="text-[var(--accent-strong,#0b5f98)] hover:underline font-medium"
                                            onClick={() => openPlayerModal(row.playerId, row.name)}
                                          >
                                            {row.name}
                                          </button>
                                        </Td>
                                        <Td>{row.season}</Td>
                                        <Td className="text-right">{row.total.toFixed(2)}</Td>
                                      </Tr>
                                    ))}
                                  </TBody>
                                </Table>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* TODO: Highest Scoring Game by Position (Top 5) requires weekly player logs; will wire via player-logs API. */}

                  {/* Player Weekly Points Modal */}
                  <Modal
                    open={playerModalOpen}
                    onClose={closePlayerModal}
                    title={playerModal ? `${playerModal.name} — Weekly Points` : 'Weekly Points'}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-end gap-3">
                        <div>
                          <Label>Season</Label>
                          <select
                            className="evw-input"
                            value={modalSeason}
                            onChange={(e) => setModalSeason(e.target.value)}
                          >
                            {modalSeasons.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div className="text-sm text-[var(--muted)]">
                          League Scoring (Half‑PPR) • Weeks 1–17 + playoffs • Team-attributed (rostered weeks)
                        </div>
                      </div>

                      {modalLoading ? (
                        <div className="py-6"><LoadingState message="Loading weekly points..." /></div>
                      ) : modalError ? (
                        <ErrorState message={modalError} />
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <THead>
                              <Tr>
                                <Th>Week</Th>
                                <Th>Rostered</Th>
                                <Th>Started</Th>
                                <Th className="text-right">Points</Th>
                              </Tr>
                            </THead>
                            <TBody>
                              {modalWeeks.map((w) => (
                                <Tr key={w.week}>
                                  <Td>
                                    <div className="flex items-center gap-2">
                                      <span>Week {w.week}</span>
                                      {w.week >= 15 && <span className="text-xs evw-chip">Playoffs</span>}
                                    </div>
                                  </Td>
                                  <Td>{w.rostered ? 'Yes' : 'No'}</Td>
                                  <Td>{w.started ? 'Yes' : 'No'}</Td>
                                  <Td className="text-right">{w.points.toFixed(2)}</Td>
                                </Tr>
                              ))}
                              <Tr>
                                <Td colSpan={3}><strong>Total</strong></Td>
                                <Td className="text-right font-semibold">
                                  {modalWeeks.reduce((sum, r) => sum + r.points, 0).toFixed(2)}
                                </Td>
                              </Tr>
                            </TBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </Modal>
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
      </div>
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
              <div className="space-y-4" style={tabsAccentVars}>
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
                    {(() => {
                      const gp = (nfl?.gp ?? nfl?.gms_active ?? 0) || 0;
                      const total = Number(s.totalPPR || 0);
                      const ppg = gp > 0 ? total / gp : 0;
                      return (
                        <>
                          <div className="text-sm">G: <span className="font-medium">{gp}</span></div>
                          <div className="text-sm">Total: <span className="font-medium">{total.toFixed(2)}</span></div>
                          <div className="text-sm">PPG: <span className="font-medium">{ppg.toFixed(2)}</span></div>
                        </>
                      );
                    })()}
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

                <div className="evw-subtle rounded-lg p-3 border border-[var(--border)]" style={{ borderTop: '3px solid var(--danger)', borderLeft: '3px solid var(--tertiary)' }}>
                  <div className="text-xs font-semibold text-[var(--muted)] mb-2">Latest News</div>
                  {group && group.items && group.items.length > 0 ? (
                    <ul className="space-y-1.5">
                      {group.items.slice(0, 5).map((it, idx) => (
                        <li key={`${selectedPlayerId}-news-${idx}`} className="text-sm flex items-start gap-2 rounded px-2 py-1 hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]">
                          <span aria-hidden={true} className="mt-1 inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--quaternary)' }} />
                          <div>
                            <a href={it.link} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline underline-offset-2 font-medium">
                              {it.title}
                            </a>
                            <div className="text-xs text-[var(--muted)]">{it.sourceName}{it.publishedAt ? ` • ${new Date(it.publishedAt).toLocaleString()}` : ''}</div>
                          </div>
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
