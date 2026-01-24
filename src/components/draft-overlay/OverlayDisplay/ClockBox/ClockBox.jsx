import React from 'react';
import styles from './ClockBox.module.css';

const ClockBox = ({ 
  teamAbbrev = 'DET',
  roundNumber = 1,
  pickNumber = 1,
  timeRemaining = '10:00',
  nextTeams = ['MTL', 'KC'],
  teamLogo = null,
  teamColors = ['#ffffff', '#ffffff']
}) => {
  return (
    <div className={styles.clockBox}>
      <div className={styles.leftSection}>
        <div className={styles.teamAbbrevContainer} style={{
          background: `linear-gradient(135deg, ${teamColors[0]}cc 0%, ${teamColors[0]}cc 50%, ${teamColors[1]}cc 50%, ${teamColors[1]}cc 100%)`
        }}>
          <div 
            className={styles.teamAbbrev}
            style={{
              color: '#ffffff',
              textShadow: `2px 2px 0 ${teamColors[0]}, -2px -2px 0 ${teamColors[1]}, 2px -2px 0 ${teamColors[0]}, -2px 2px 0 ${teamColors[1]}, 0 0 8px rgba(0,0,0,0.5)`
            }}
          >
            {teamAbbrev}
          </div>
        </div>
        <div className={styles.roundInfo}>
          <span className={styles.label}>RD</span> {roundNumber} PK {pickNumber}
        </div>
      </div>
      
      <div className={styles.centerSection}>
        <div className={styles.timer}>{timeRemaining}</div>
      </div>
      
      <div className={styles.rightSection}>
        <div className={styles.nextUp}>
          <span className={styles.nextText}>NEXT</span>
          <div className={styles.nextLogos}>
            {nextTeams.map((team, i) => (
              <div key={i} className={styles.nextUpLogo}>
                {team && team.logoPath && (
                  <img 
                    src={team.logoPath} 
                    alt={team.name}
                    onLoad={() => console.log(`[IMG LOAD SUCCESS] Next team ${i + 1} (${team.name}):`, team.logoPath)}
                    onError={(e) => console.log(`[IMG LOAD ERROR] Next team ${i + 1} (${team.name}):`, team.logoPath, 'Error:', e)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        <div className={styles.teamLogo}>
          <div className={styles.logoPlaceholder}>
            {teamLogo && (
              <img 
                src={teamLogo} 
                alt="Team Logo" 
                onLoad={() => console.log('[IMG LOAD SUCCESS] Main logo:', teamLogo)}
                onError={(e) => console.log('[IMG LOAD ERROR] Main logo:', teamLogo, 'Error:', e)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClockBox;
