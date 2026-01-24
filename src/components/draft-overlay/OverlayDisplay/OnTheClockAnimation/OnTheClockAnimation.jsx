import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { getTeamLogoPath } from '../../../utils/logoUtils';
import styles from './OnTheClockAnimation.module.css';

// Helper to convert hex to rgb for animation
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : '0, 0, 0';
};

const OnTheClockAnimation = ({ team, roundNumber, pickNumber, onComplete }) => {
  // Debug logging for mount/unmount in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] OnTheClockAnimation mounted - Team: ${team?.name}, Round: ${roundNumber}, Pick: ${pickNumber}`);
      return () => console.log(`[DEBUG] OnTheClockAnimation unmounted - Team: ${team?.name}, Round: ${roundNumber}, Pick: ${pickNumber}`);
    }
  }, [team?.name, roundNumber, pickNumber]);

  if (!team) return null;

  // CSS variables for team colors
  const style = {
    '--team-primary': team.colors[0],
    '--team-secondary': team.colors[1]
  };

  return (
    <motion.div 
      className={styles.animationContainer}
      initial={{ 
        opacity: 0, 
        scale: 0.98,
        backgroundColor: 'rgba(0, 0, 0, 0.95)' 
      }}
      animate={{ 
        opacity: 1,
        scale: 1,
        backgroundColor: `rgba(${hexToRgb(team.colors[0])}, 0.95)`
      }}
      exit={{ 
        opacity: 0,
        scale: 0.98,
        backgroundColor: 'rgba(0, 0, 0, 0)'
      }}
      transition={{ 
        duration: 0.6,
        ease: [0.4, 0, 0.2, 1]
      }}
      style={style}
    >
      <motion.div 
        className={styles.content}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -20, opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div 
          className={styles.teamInfo}
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        >
          {team.logo && (
            <img 
              src={getTeamLogoPath(team)} 
              alt={team.name} 
              className={styles.teamLogo}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              onLoad={() => console.log(`[IMG LOAD SUCCESS] OnTheClock animation (${team.name}):`, getTeamLogoPath(team))}
              onError={(e) => console.log(`[IMG LOAD ERROR] OnTheClock animation (${team.name}):`, getTeamLogoPath(team), 'Error:', e)}
            />
          )}
          <motion.div className={styles.teamNameWrapper}>
            <motion.div 
              className={styles.onClockLabel}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.4, duration: 0.4 }}
            >
              ON THE CLOCK
            </motion.div>
            <motion.h1 
              className={styles.teamName}
              data-text={team.name}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              {team.name}
            </motion.h1>
            <motion.div 
              className={styles.pickLabel}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              <span>ROUND {roundNumber}</span>
              <span className={styles.divider} style={{ backgroundColor: team.colors[0] }} />
              <span>PICK {pickNumber}</span>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Auto-dismiss trigger */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0 }}
        transition={{ delay: 6 }}
        onAnimationComplete={onComplete}
      />
    </motion.div>
  );
};

export default OnTheClockAnimation;
