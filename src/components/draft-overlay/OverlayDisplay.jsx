import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { teams } from '../teams';
import { getTeamLogoPath } from '../utils/logoUtils';
import DraftBoard from './OverlayDisplay/DraftBoard/DraftBoard';
import ClockBox from './OverlayDisplay/ClockBox/ClockBox';
import { InfoBar } from './OverlayDisplay/InfoBar/InfoBar';
import AnimationLayer from './OverlayDisplay/AnimationLayer/AnimationLayer';
import styles from './OverlayDisplay.module.css';
import { defaultDraftOrder } from '../draftOrder';
import { loadState } from '../utils/storage';

const OverlayDisplay = React.memo(function OverlayDisplay() {
  // Initialize state from localStorage or defaults
  const savedState = loadState();
  const [currentTeamId, setCurrentTeamId] = useState(savedState?.draftOrder?.[savedState?.currentPickIndex] ?? 1);
  const [currentPickIndex, setCurrentPickIndex] = useState(savedState?.currentPickIndex ?? 0);
  const [timerSeconds, setTimerSeconds] = useState(savedState?.timerSeconds ?? 120);
  const [draftOrder, setDraftOrder] = useState(savedState?.draftOrder ?? defaultDraftOrder);
  const [animations, setAnimations] = useState({
    draft: null,
    onClock: null,
    trade: null
  });
  const channelRef = useRef(null);
  const lastTeamIdRef = useRef(currentTeamId);

  // Memoize team finding function to avoid stale closures
  const findTeamById = useCallback((id) => teams.find(t => t.id === id), []);

  useEffect(() => {
    // Initialize channel
    channelRef.current = new BroadcastChannel('draft-overlay');
    
    // Set up message listener
    const handleMessage = (event) => {
      console.log('[Message] Received message type:', event.data.type);
      
      if (event.data.type === 'UNDO_PICK') {
        // Clear all animations when undoing a pick
        setAnimations({
          draft: null,
          onClock: null,
          trade: null
        });
      } else if (event.data.type === 'PLAYER_DRAFTED') {
        const { selectedPlayer: newSelectedPlayer } = event.data.payload;
        if (newSelectedPlayer) {
          console.log('[Message] New player drafted:', newSelectedPlayer.name);
          
          // Find the drafting team and show the announcement
          const draftingTeam = findTeamById(draftOrder[newSelectedPlayer.pickIndex]);
          setAnimations(prev => ({
            ...prev,
            draft: {
            player: newSelectedPlayer,
            team: draftingTeam
          }}));
        } else {
          // If selectedPlayer is null, clear the recent draft
          setAnimations(prev => ({ ...prev, draft: null }));
          console.log('[Message] Clearing recent draft display');
        }
      } 
      else if (event.data.type === 'STATE_UPDATE') {
        const { currentTeamId: newTeamId, currentPickIndex, timerSeconds, draftOrder: newDraftOrder } = event.data.payload;
        
        // Batch all state updates in a single React cycle
        React.startTransition(() => {
          // Update draft order first since other state might depend on it
          if (newDraftOrder) {
            setDraftOrder(newDraftOrder);
          }
          
          // Update all other state
          setCurrentTeamId(newTeamId);
          setCurrentPickIndex(currentPickIndex);
          setTimerSeconds(timerSeconds);

          // Check if team changed and trigger onClock animation if needed
          const isTeamChanged = newTeamId !== lastTeamIdRef.current;
          const isNotDuringPick = !animations.draft;
          const isOnClockInactive = !animations.onClock;

          if (isTeamChanged && isNotDuringPick && isOnClockInactive) {
            const team = findTeamById(newTeamId);
            setAnimations(prev => ({
              ...prev,
              onClock: { team, isNextTeam: false }
            }));
          }

          // Update last known team ID
          lastTeamIdRef.current = newTeamId;
        });
      }
    };

    channelRef.current.addEventListener('message', handleMessage);

    // Cleanup listener on unmount
    return () => {
      channelRef.current.removeEventListener('message', handleMessage);
      channelRef.current.close();
    };
  }, [findTeamById, draftOrder, animations.draft, animations.onClock]);

  // Memoize current team lookup
  const currentTeam = useMemo(() => (
    teams.find(team => team.id === currentTeamId) || teams[0]
  ), [currentTeamId]);

  // Memoize time formatting function
  const formatTimeRemaining = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Memoize next teams calculation with pre-resolved logo paths
  const nextTeams = useMemo(() => {
    const next1Index = currentPickIndex + 1;
    const next2Index = currentPickIndex + 2;
    const totalPicks = draftOrder.length;
    
    // DEBUG: Why is nextTeams empty?
    console.log('[DRAFT STATE DEBUG] currentPickIndex:', currentPickIndex);
    console.log('[DRAFT STATE DEBUG] next1Index:', next1Index);
    console.log('[DRAFT STATE DEBUG] next2Index:', next2Index);
    console.log('[DRAFT STATE DEBUG] totalPicks (draftOrder.length):', totalPicks);
    console.log('[DRAFT STATE DEBUG] draftOrder:', draftOrder);
    console.log('[DRAFT STATE DEBUG] draftOrder[next1Index]:', draftOrder[next1Index]);
    console.log('[DRAFT STATE DEBUG] draftOrder[next2Index]:', draftOrder[next2Index]);
    
    const nextTeamIds = [];
    if (next1Index < totalPicks && draftOrder[next1Index]) {
      nextTeamIds.push(draftOrder[next1Index]);
      console.log('[DRAFT STATE DEBUG] Added next team 1:', draftOrder[next1Index]);
    } else {
      console.log('[DRAFT STATE DEBUG] Next team 1 NOT added - next1Index < totalPicks:', next1Index < totalPicks, 'draftOrder[next1Index]:', draftOrder[next1Index]);
    }
    if (next2Index < totalPicks && draftOrder[next2Index]) {
      nextTeamIds.push(draftOrder[next2Index]);
      console.log('[DRAFT STATE DEBUG] Added next team 2:', draftOrder[next2Index]);
    } else {
      console.log('[DRAFT STATE DEBUG] Next team 2 NOT added - next2Index < totalPicks:', next2Index < totalPicks, 'draftOrder[next2Index]:', draftOrder[next2Index]);
    }
    
    return nextTeamIds.map(teamId => {
      const team = findTeamById(teamId);
      if (!team) return null;
      
      // Pre-resolve the logo path here, just like the main team logo
      return {
        ...team,
        logoPath: getTeamLogoPath(team)
      };
    }).filter(Boolean);
  }, [findTeamById, draftOrder, currentPickIndex]);

  // Memoize ClockBox props to prevent unnecessary re-renders
  const clockBoxProps = useMemo(() => {
    const mainLogoPath = getTeamLogoPath(currentTeam);
    
    // COMPREHENSIVE LOGO DEBUGGING
    console.log('\n=== LOGO DEBUG SESSION ===');
    console.log('[MAIN LOGO] Team:', currentTeam?.name);
    console.log('[MAIN LOGO] Generated src:', mainLogoPath);
    console.log('[MAIN LOGO] Team object:', currentTeam);
    
    // Log next teams logo paths
    console.log('[NEXT TEAMS] Count:', nextTeams.length);
    nextTeams.forEach((team, index) => {
      console.log(`[NEXT TEAM ${index + 1}] Name:`, team?.name);
      console.log(`[NEXT TEAM ${index + 1}] Generated src:`, team?.logoPath);
      console.log(`[NEXT TEAM ${index + 1}] Team object:`, team);
    });
    
    // Log environment info
    console.log('[ENVIRONMENT] Protocol:', window.location.protocol);
    console.log('[ENVIRONMENT] Current URL:', window.location.href);
    console.log('[ENVIRONMENT] Base dir calculation:', window.location.href.replace(/\/build\/index\.html.*$/, '/build'));
    console.log('=== END LOGO DEBUG ===\n');
    
    return {
      teamAbbrev: currentTeam?.abbrev || 'DET',
      teamLogo: mainLogoPath,
      teamColors: currentTeam?.colors || ['#ffffff', '#ffffff'],
      roundNumber: Math.floor(currentPickIndex / 12) + 1,
      pickNumber: (currentPickIndex % 12) + 1,
      timeRemaining: formatTimeRemaining(timerSeconds),
      nextTeams
    };
  }, [currentTeam, currentPickIndex, timerSeconds, formatTimeRemaining, nextTeams]);

  // Memoize InfoBar props
  const infoBarProps = useMemo(() => ({
    teamColors: currentTeam?.colors || ['#ffffff', '#ffffff'],
    currentTeamId
  }), [currentTeam?.colors, currentTeamId]);

  return (
    <div className={styles.overlay}>
      <div className={styles.draftBoardContainer}>
        <DraftBoard 
          draftOrder={draftOrder} 
          currentPickIndex={currentPickIndex} 
        />
      </div>
      <div className={styles.topRow}>
        <ClockBox {...clockBoxProps} />
        <InfoBar {...infoBarProps} />
      </div>
      <AnimationLayer
        animations={animations}
        onAnimationComplete={(type) => {
          // Clear the completed animation and handle any follow-up animations
          if (type === 'draft') {
            setAnimations(prev => ({
              ...prev,
              draft: null,
              // Start onClock animation for next team after draft
              onClock: { team: findTeamById(draftOrder[currentPickIndex + 1]), isNextTeam: false }
            }));
          } else {
            // For other animations, just clear them
            setAnimations(prev => ({ ...prev, [type]: null }));
          }
        }}
        currentPickIndex={currentPickIndex}
      />
      {/* Ticker component temporarily hidden
      <Ticker />
      */}
    </div>
  );
});

export default OverlayDisplay;
