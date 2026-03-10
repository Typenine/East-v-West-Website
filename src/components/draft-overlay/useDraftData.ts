'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TEAM_NAMES } from '@/lib/constants/league';
import { getTeamColors } from '@/lib/constants/team-colors';
import { getTeamLogoPath } from '@/lib/utils/team-utils';

// Team interface for overlay
interface Team {
  name: string;
  abbrev: string;
  colors: [string, string, string | null];
}

// Types matching the website's API response
interface DraftPick {
  overall: number;
  round: number;
  team: string;
  playerId: string;
  playerName?: string | null;
  playerPos?: string | null;
  playerNfl?: string | null;
  madeAt: string;
}

interface UpcomingPick {
  overall: number;
  round: number;
  team: string;
}

interface DraftOverview {
  id: string;
  year: number;
  rounds: number;
  clockSeconds: number;
  status: 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED';
  curOverall: number;
  onClockTeam?: string | null;
  clockStartedAt?: string | null;
  deadlineTs?: string | null;
  recentPicks: DraftPick[];
  allPicks?: DraftPick[];
  upcoming: UpcomingPick[];
  allSlots?: Array<{ overall: number; round: number; team: string }>;
}

interface AvailablePlayer {
  id: string;
  name: string;
  pos: string;
  nfl: string;
}

// Adapted state for overlay components
export interface OverlayState {
  draft: DraftOverview | null;
  remainingSec: number | null;
  available: AvailablePlayer[];
  usingCustom: boolean;
  // Computed values for overlay
  currentTeam: Team | null;
  currentPickIndex: number;
  timerSeconds: number;
  draftOrder: string[]; // Team names in pick order
  draftGrid: Array<{ player: string | null; position: string | null; team: string }>;
  nextTeams: Array<Team & { logoPath: string | null }>;
  lastPick: DraftPick | null;
  isNewPick: boolean;
}

export function useDraftData(basePollIntervalMs = 1000) {
  const [state, setState] = useState<OverlayState>({
    draft: null,
    remainingSec: null,
    available: [],
    usingCustom: false,
    currentTeam: null,
    currentPickIndex: 0,
    timerSeconds: 0,
    draftOrder: [],
    draftGrid: Array(48).fill({ player: null, position: null, team: '' }),
    nextTeams: [],
    lastPick: null,
    isNewPick: false,
  });

  const lastOverallRef = useRef<number | null>(null);
  const lastUpdateMsRef = useRef<number>(Date.now());
  const [pollInterval, setPollInterval] = useState(basePollIntervalMs);

  const fetchDraft = useCallback(async () => {
    try {
      const res = await fetch('/api/draft?include=available', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      
      const draft = json.draft as DraftOverview | null;
      const remainingSec = json.remainingSec as number | null;
      const available = (json.available || []) as AvailablePlayer[];
      const usingCustom = Boolean(json.usingCustom);

      // Compute derived values for overlay
      const onClockTeamName = draft?.onClockTeam || null;
      const currentTeam = onClockTeamName ? getTeamFromName(onClockTeamName) : null;
      
      // Current pick index (0-based)
      const currentPickIndex = draft ? draft.curOverall - 1 : 0;
      
      // Timer in seconds
      const timerSeconds = remainingSec ?? 0;

      // Build draft order from upcoming picks (team names)
      const draftOrder: string[] = [];
      if (draft?.upcoming) {
        for (const u of draft.upcoming) {
          draftOrder.push(u.team);
        }
      }

      // Build slot-to-team map from ALL slots (not just upcoming) for full grid team logos
      const slotTeamMap: Record<number, string> = {};
      if (draft?.allSlots) {
        for (const s of draft.allSlots) {
          slotTeamMap[s.overall - 1] = s.team;
        }
      } else if (draft?.upcoming) {
        // Fallback to upcoming if allSlots not available
        for (const u of draft.upcoming) {
          slotTeamMap[u.overall - 1] = u.team;
        }
      }
      
      // Build draft grid with team ownership for ALL cells
      // Use allPicks (all picks made) instead of recentPicks (last 10) for full grid display
      const draftGrid: Array<{ player: string | null; position: string | null; team: string }> = [];
      const picksToUse = draft?.allPicks ?? draft?.recentPicks ?? [];
      for (let i = 0; i < 48; i++) {
        // Find if this pick has been made
        const pick = picksToUse.find(p => p.overall - 1 === i);
        
        // Every cell gets team ownership (from pick or from slot map)
        const teamName = pick?.team || slotTeamMap[i] || '';
        
        draftGrid[i] = {
          player: pick ? (pick.playerName || pick.playerId) : null,
          position: pick ? (pick.playerPos || 'N/A') : null,
          team: teamName,
        };
      }

      // Next teams (up to 2)
      const nextTeams: Array<Team & { logoPath: string | null }> = [];
      if (draft?.upcoming) {
        for (const u of draft.upcoming.slice(0, 2)) {
          const team = getTeamFromName(u.team);
          if (team) {
            nextTeams.push({ ...team, logoPath: getTeamLogoPath(u.team) });
          }
        }
      }

      // Check for new pick
      const lastPick = draft?.recentPicks?.length ? draft.recentPicks[draft.recentPicks.length - 1] : null;
      
      // On first load, initialize the ref without triggering animation
      let isNewPick = false;
      if (lastPick) {
        if (lastOverallRef.current === null) {
          // First load - don't trigger animation for existing picks
          lastOverallRef.current = lastPick.overall;
          isNewPick = false;
        } else if (lastPick.overall !== lastOverallRef.current) {
          // New pick detected
          lastOverallRef.current = lastPick.overall;
          isNewPick = true;
        }
      }

      lastUpdateMsRef.current = Date.now();

      // Adjust polling based on draft status
      // LIVE: 1s (fast updates during draft)
      // PAUSED/NOT_STARTED: 5s (slower to conserve resources)
      // COMPLETED: 10s (minimal polling)
      const newPollInterval = draft?.status === 'LIVE' ? 1000 : draft?.status === 'COMPLETED' ? 10000 : 5000;
      setPollInterval(newPollInterval);

      setState({
        draft,
        remainingSec,
        available,
        usingCustom,
        currentTeam,
        currentPickIndex,
        timerSeconds,
        draftOrder,
        draftGrid,
        nextTeams,
        lastPick,
        isNewPick,
      });
    } catch (err) {
      console.error('[useDraftData] fetch error:', err);
    }
  }, []);

  // Use ref for poll interval to avoid effect restarts when interval changes
  const pollIntervalRef = useRef(pollInterval);
  pollIntervalRef.current = pollInterval;

  // Initial fetch and polling with dynamic interval
  useEffect(() => {
    fetchDraft();
    let intervalId: ReturnType<typeof setInterval>;
    
    const startPolling = () => {
      intervalId = setInterval(() => {
        fetchDraft();
        // Check if interval changed and restart if needed
        clearInterval(intervalId);
        startPolling();
      }, pollIntervalRef.current);
    };
    
    startPolling();
    return () => clearInterval(intervalId);
  }, [fetchDraft]);

  // Local countdown timer - tick every second to update display
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Compute local remaining seconds by subtracting time elapsed since last server update
  const elapsedSinceUpdate = Math.floor((Date.now() - lastUpdateMsRef.current) / 1000);
  const localRemainingSec = Math.max(0, (state.remainingSec ?? 0) - elapsedSinceUpdate);

  return {
    ...state,
    localRemainingSec,
    refetch: fetchDraft,
  };
}

// Helper to convert team name to Team object with colors
function getTeamFromName(name: string): Team | null {
  if (!TEAM_NAMES.includes(name)) return null;
  const colors = getTeamColors(name);
  // Generate simple abbreviation from team name
  const abbrev = name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
  return {
    name,
    abbrev,
    colors: [colors.primary, colors.secondary, colors.tertiary || null],
  };
}
