import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { teams } from '../../../teams';
import { getTeamLogoPath } from '../../../utils/logoUtils';
import styles from './DraftBoard.module.css';
import { loadState } from '../../../utils/storage';

const positionColors = {
  'QB': '#C00000',
  'RB': '#FFC000',
  'WR': '#0070C0',
  'TE': '#00B050',
  'DEF': '#7030A0',
  'K': '#FF8C42'
};

// Memoized grid cell component to prevent unnecessary re-renders
const GridCell = memo(function GridCell({ round, pickIndex, gridIndex, pick, teamId, isCurrentPick, getTeam, getTeamLogo }) {
  const team = getTeam(teamId);
  return (
    <div 
      key={`r${round}p${pickIndex + 1}`}
      className={`${styles.cell} ${pick ? styles.filledCell : ''} ${isCurrentPick ? styles.currentPick : ''}`}
      style={{
        '--team-primary-color': pick ? team?.colors[0] : 'rgba(0, 0, 0, 0.6)',
        '--team-secondary-color': pick ? team?.colors[1] : 'rgba(0, 0, 0, 0.6)',
        '--team-tertiary-color': pick ? team?.colors[2] || team?.colors[1] : 'rgba(0, 0, 0, 0.6)',
        '--position-color': pick ? positionColors[pick.position] : undefined
      }}
    >
      <div className={styles.teamLogo}>
        <img 
          src={getTeamLogo(teamId)} 
          alt="" 
          className={styles.logo}
          onLoad={() => console.log(`[IMG LOAD SUCCESS] DraftBoard team ${teamId} (${team?.name}):`, getTeamLogo(teamId))}
          onError={(e) => console.log(`[IMG LOAD ERROR] DraftBoard team ${teamId} (${team?.name}):`, getTeamLogo(teamId), 'Error:', e)}
        />
      </div>
      <AnimatePresence mode="wait">
        {pick && (
          <motion.div
            key={`pick-${gridIndex}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={styles.playerInfo}
          >
            <span className={styles.playerName}>{pick.player}</span>
            <span className={styles.position}>{pick.position}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

const DraftBoard = memo(function DraftBoard({ draftOrder }) {
  // Load initial state from localStorage
  const savedState = loadState();
  const [currentPickIndex, setCurrentPickIndex] = useState(savedState?.currentPickIndex ?? 0);
  
  // Initialize draftGrid from draftHistory
  const initialGrid = Array(48).fill(null);
  if (savedState?.draftHistory) {
    savedState.draftHistory.forEach((pick, index) => {
      if (pick) {
        initialGrid[index] = {
          player: pick.name,
          position: pick.position,
          team: draftOrder[index]
        };
      }
    });
  }
  const [draftGrid, setDraftGrid] = useState(initialGrid);
  const channelRef = useRef(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel('draft-overlay');
    
    const handleMessage = (event) => {
      const { type, payload } = event.data;
      
      if (type === 'STATE_UPDATE') {
        // Update currentPickIndex when state changes
        setCurrentPickIndex(payload.currentPickIndex);
      } else if (type === 'PLAYER_DRAFTED') {
        const { selectedPlayer, pickIndex } = payload;
        if (selectedPlayer) {
          setDraftGrid(prev => {
            const newGrid = [...prev];
            newGrid[pickIndex] = {
              player: selectedPlayer.name,
              position: selectedPlayer.position,
              team: draftOrder[pickIndex]
            };
            return newGrid;
          });
        }
      } else if (type === 'UNDO_PICK') {
        // For undo, we only clear the specified pick
        const { pickIndex } = payload;
        setDraftGrid(prev => {
          const newGrid = [...prev];
          // Only clear if there's actually something at this index
          if (newGrid[pickIndex]) {
            newGrid[pickIndex] = null;
          }
          return newGrid;
        });
      } else if (type === 'DRAFT_RESET') {
        setDraftGrid(Array(48).fill(null));
      }
    };

    channelRef.current.addEventListener('message', handleMessage);
    return () => {
      channelRef.current?.removeEventListener('message', handleMessage);
      channelRef.current?.close();
    };
  }, [draftOrder]);

  // Memoize team lookup functions
  const getTeamLogo = useCallback((teamId) => {
    // Return null immediately for invalid teamIds
    if (!teamId || typeof teamId !== 'number') {
      return null;
    }
    
    const team = teams.find(t => t.id === teamId);
    // Only call getTeamLogoPath if we found a valid team
    return team ? getTeamLogoPath(team) : null;
  }, []);

  const getTeam = useCallback((teamId) => (
    teams.find(t => t.id === teamId)
  ), []);

  return (
    <div className={styles.draftBoardContainer}>
      <div className={styles.grid}>
        {/* Pick Numbers Column */}
        <div className={styles.pickColumn}>
          <div className={styles.headerCell}>Pick</div>
          {[...Array(12)].map((_, i) => (
            <div 
              key={`pick-${i + 1}`}
              className={`${styles.pickCell} ${currentPickIndex % 12 === i ? styles.currentPick : ''}`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Round Columns */}
        {[1, 2, 3, 4].map(round => (
          <div key={`round-${round}`} className={styles.roundColumn}>
            <div className={styles.headerCell}>Round {round}</div>
            {[...Array(12)].map((_, pickIndex) => {
              const gridIndex = (round - 1) * 12 + pickIndex;
              const pick = draftGrid[gridIndex];
              const teamId = draftOrder[gridIndex];
              const isCurrentPick = currentPickIndex === gridIndex;

              return (
                <GridCell
                  key={`r${round}p${pickIndex + 1}`}
                  round={round}
                  pickIndex={pickIndex}
                  gridIndex={gridIndex}
                  pick={pick}
                  teamId={teamId}
                  isCurrentPick={isCurrentPick}
                  getTeam={getTeam}
                  getTeamLogo={getTeamLogo}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

export default DraftBoard;
