import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import styles from './CountdownTimerGSAP.module.css';

const CountdownTimerGSAP = ({ seconds, isRunning, teamColors = ['#ffffff', '#ffffff'] }) => {
  const timerRef = useRef();
  const circleRef = useRef();
  const warningTimelineRef = useRef();

  // Format seconds into MM:SS
  const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Warning animation for low time
  useEffect(() => {
    if (!isRunning || seconds > 30) {
      // Stop warning animation
      if (warningTimelineRef.current) {
        warningTimelineRef.current.kill();
        warningTimelineRef.current = null;
      }
      
      // Reset to normal state
      gsap.to(timerRef.current, {
        scale: 1,
        color: '#ffffff',
        textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
        duration: 0.3,
        ease: 'power2.out'
      });
      
      return;
    }

    // Create warning animation for low time
    if (!warningTimelineRef.current && seconds <= 30) {
      const tl = gsap.timeline({ repeat: -1, yoyo: true });
      warningTimelineRef.current = tl;

      tl.to(timerRef.current, {
        scale: 1.1,
        color: seconds <= 10 ? '#ff0000' : '#ff6600',
        textShadow: `0 0 20px ${seconds <= 10 ? '#ff0000' : '#ff6600'}`,
        duration: 0.5,
        ease: 'power2.inOut'
      });
    }
  }, [isRunning, seconds]);

  // Circular progress animation
  useEffect(() => {
    if (!circleRef.current) return;

    const circumference = 2 * Math.PI * 45; // radius = 45
    const progress = seconds / 120; // assuming 2 minute max
    const strokeDashoffset = circumference * (1 - progress);

    gsap.to(circleRef.current, {
      strokeDashoffset: strokeDashoffset,
      duration: 1,
      ease: 'power2.out'
    });
  }, [seconds]);

  return (
    <div className={styles.timerContainer}>
      {/* Circular progress indicator */}
      <svg className={styles.progressRing} width="120" height="120">
        <circle
          className={styles.progressRingBackground}
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth="4"
          fill="transparent"
          r="45"
          cx="60"
          cy="60"
        />
        <circle
          ref={circleRef}
          className={styles.progressRingProgress}
          stroke={teamColors[0]}
          strokeWidth="4"
          fill="transparent"
          r="45"
          cx="60"
          cy="60"
          strokeDasharray={`${2 * Math.PI * 45} ${2 * Math.PI * 45}`}
          strokeDashoffset={2 * Math.PI * 45}
          transform="rotate(-90 60 60)"
        />
      </svg>
      
      {/* Timer text */}
      <div 
        ref={timerRef}
        className={styles.timerText}
      >
        {formatTime(seconds)}
      </div>
      
      {/* Status text */}
      <div className={styles.statusText}>
        {isRunning ? 'On The Clock' : 'Timer Paused'}
      </div>
    </div>
  );
};

export default CountdownTimerGSAP;
