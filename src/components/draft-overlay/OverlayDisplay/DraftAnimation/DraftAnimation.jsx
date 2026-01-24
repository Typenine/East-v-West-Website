import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { getTeamLogoPath } from '../../../utils/logoUtils';
import styles from './DraftAnimation.module.css';

const DraftAnimation = ({ player, team, onComplete }) => {
  // Debug logging for mount/unmount in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] DraftAnimation mounted - Player: ${player?.name}, Team: ${team?.name}`);
      return () => console.log(`[DEBUG] DraftAnimation unmounted - Player: ${player?.name}, Team: ${team?.name}`);
    }
  }, [player?.name, team?.name]);

  if (!player || !team) return null;

  return (
    <motion.div 
      className={styles.animationContainer}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ 
        opacity: 0,
        transition: { duration: 1 }
      }}
    >
        {/* Background flash */}
        <motion.div 
          className={styles.flash}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ 
            opacity: [0, 1, 0],
            scale: [0, 1.5, 3],
          }}
          transition={{ 
            duration: 1,
            times: [0, 0.3, 1]
          }}
        />

        {/* Team color bars */}
        <motion.div 
          className={styles.bars}
          style={{ '--team-primary': team.colors[0], '--team-secondary': team.colors[1] }}
        >
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className={styles.bar}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{
                duration: 0.4,
                delay: i * 0.1,
                ease: "easeOut"
              }}
            />
          ))}
        </motion.div>

        {/* Content container */}
        <motion.div 
          className={styles.content}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          {/* Team info with stagger animation */}
          <motion.div className={styles.teamInfo}>
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ 
                duration: 0.6,
                delay: 0.7,
                type: "spring",
                stiffness: 200
              }}
            >
              <img 
                src={getTeamLogoPath(team)} 
                alt={team.name} 
                className={styles.teamLogo}
                onLoad={() => console.log(`[IMG LOAD SUCCESS] Draft animation (${team.name}):`, getTeamLogoPath(team))}
                onError={(e) => console.log(`[IMG LOAD ERROR] Draft animation (${team.name}):`, getTeamLogoPath(team), 'Error:', e)}
              />
            </motion.div>
            <motion.div
              className={styles.teamName}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.4 }}
            >
              {team.name}
            </motion.div>
          </motion.div>

          {/* Player info with stagger */}
          <motion.div className={styles.playerInfo}>
            <motion.div
              className={styles.selects}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.3, duration: 0.4 }}
            >
              SELECTS
            </motion.div>
            <motion.div
              className={styles.playerName}
              initial={{ opacity: 0, scale: 1.2 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.5, duration: 0.4 }}
            >
              {player.name}
            </motion.div>
            <motion.div
              className={styles.playerDetails}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.7, duration: 0.4 }}
            >
              {player.position} • {player.college} • {player.nflTeam}
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Exit animation trigger */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0 }}
          transition={{ delay: 8.5, duration: 1 }}
          onAnimationComplete={onComplete}
        />
      </motion.div>
  );
};

export default DraftAnimation;
