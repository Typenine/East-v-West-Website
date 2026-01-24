'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { teams, getTeamByName, getTeamLogoPath, Team } from './teams';

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
  // Computed values for old overlay components
  currentTeam: Team | null;
  currentPickIndex: number;
  timerSeconds: number;
  draftOrder: number[]; // Team IDs in pick order
  draftGrid: Array<{ player: string; position: string; team: number } | null>;
  nextTeams: Array<Team & { logoPath: string | null }>;
  lastPick: DraftPick | null;
  isNewPick: boolean;
}

export function useDraftData(pollIntervalMs = 2000) {
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

  const fetchDraft = useCallback(async () => {
    try {
      const res = await fetch('/api/draft?include=available', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      
      const draft = json.draft as DraftOverview | null;
      const remainingSec = json.remainingSec as number | null;
      const available = (json.available || []) as AvailablePlayer[];
      const usingCustom = Boolean(json.usingCustom);

      // Compute derived values for old overlay components
      const onClockTeamName = draft?.onClockTeam || null;
      const currentTeam = onClockTeamName ? getTeamByName(onClockTeamName) || null : null;
      
      // Current pick index (0-based)
      const currentPickIndex = draft ? draft.curOverall - 1 : 0;
      
      // Timer in seconds
      const timerSeconds = remainingSec ?? 0;

      // Build draft order from upcoming picks (team IDs)
      // This is a simplified version - the real order comes from the draft slots
      const draftOrder: number[] = [];
      if (draft?.upcoming) {
        for (const u of draft.upcoming) {
          const t = getTeamByName(u.team);
          if (t) draftOrder.push(t.id);
        }
      }

      // Build draft grid from recent picks
      const draftGrid: Array<{ player: string; position: string; team: number } | null> = Array(48).fill(null);
      if (draft?.recentPicks) {
        for (const pick of draft.recentPicks) {
          const idx = pick.overall - 1;
          if (idx >= 0 && idx < 48) {
            const t = getTeamByName(pick.team);
            draftGrid[idx] = {
              player: pick.playerName || pick.playerId,
              position: pick.playerPos || 'N/A',
              team: t?.id || 0,
            };
          }
        }
      }

      // Next teams (up to 2)
      const nextTeams: Array<Team & { logoPath: string | null }> = [];
      if (draft?.upcoming) {
        for (const u of draft.upcoming.slice(0, 2)) {
          const t = getTeamByName(u.team);
          if (t) {
            nextTeams.push({ ...t, logoPath: getTeamLogoPath(t) });
          }
        }
      }

      // Check for new pick
      const lastPick = draft?.recentPicks?.length ? draft.recentPicks[draft.recentPicks.length - 1] : null;
      const isNewPick = lastPick ? lastPick.overall !== lastOverallRef.current : false;
      if (lastPick) {
        lastOverallRef.current = lastPick.overall;
      }

      lastUpdateMsRef.current = Date.now();

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

  // Initial fetch and polling
  useEffect(() => {
    fetchDraft();
    const interval = setInterval(fetchDraft, pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchDraft, pollIntervalMs]);

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
    teams,
    getTeamByName,
    getTeamLogoPath,
  };
}
