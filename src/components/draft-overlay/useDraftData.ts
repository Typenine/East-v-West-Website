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
  upcoming: UpcomingPick[];
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
  draftGrid: Array<{ player: string; position: string; team: string } | null>;
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
    draftGrid: Array(48).fill(null),
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

      // Build draft grid from recent picks
      const draftGrid: Array<{ player: string; position: string; team: string } | null> = Array(48).fill(null);
      if (draft?.recentPicks) {
        for (const pick of draft.recentPicks) {
          const idx = pick.overall - 1;
          if (idx >= 0 && idx < 48) {
            draftGrid[idx] = {
              player: pick.playerName || pick.playerId,
              position: pick.playerPos || 'N/A',
              team: pick.team,
            };
          }
        }
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

  // Initial fetch and polling with dynamic interval
  useEffect(() => {
    fetchDraft();
    const interval = setInterval(fetchDraft, pollInterval);
    return () => clearInterval(interval);
  }, [fetchDraft, pollInterval]);

  // Local countdown timer
  const [localTick, setLocalTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLocalTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Compute local remaining seconds
  const elapsedSinceUpdate = Math.floor((Date.now() - lastUpdateMsRef.current) / 1000);
  const localRemainingSec = Math.max(0, (state.remainingSec ?? 0) - elapsedSinceUpdate + localTick * 0);

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
