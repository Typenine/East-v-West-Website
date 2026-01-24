import React, { useState } from 'react';
import DraftAnimation from '../OverlayDisplay/DraftAnimation/DraftAnimation';
import DraftAnimationGSAP from '../OverlayDisplay/DraftAnimation/DraftAnimationGSAP';
import CountdownTimerGSAP from '../OverlayDisplay/CountdownTimerGSAP/CountdownTimerGSAP';
import { teams } from '../../teams';
import { draftPlayers } from '../../draftPlayers';
import styles from './GSAPDemo.module.css';

const GSAPDemo = () => {
  const [showAnimation, setShowAnimation] = useState(false);
  const [useGSAP, setUseGSAP] = useState(true);
  const [timerSeconds, setTimerSeconds] = useState(90);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // Sample data for demo
  const sampleTeam = teams[0]; // Detroit Lions
  const samplePlayer = draftPlayers[0];

  const handleStartAnimation = () => {
    setShowAnimation(true);
  };

  const handleAnimationComplete = () => {
    setShowAnimation(false);
  };

  const toggleTimer = () => {
    setIsTimerRunning(!isTimerRunning);
  };

  // Timer countdown effect
  React.useEffect(() => {
    if (!isTimerRunning || timerSeconds <= 0) return;

    const interval = setInterval(() => {
      setTimerSeconds(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds]);

  return (
    <div className={styles.demoContainer}>
      <div className={styles.header}>
        <h1>GSAP vs Framer Motion Demo</h1>
        <p>Compare the animation quality and performance between the two libraries</p>
      </div>

      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <h3>Draft Animation Demo</h3>
          <div className={styles.buttonGroup}>
            <button 
              onClick={handleStartAnimation}
              disabled={showAnimation}
              className={styles.button}
            >
              {showAnimation ? 'Animation Running...' : 'Start Draft Animation'}
            </button>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={useGSAP}
                onChange={(e) => setUseGSAP(e.target.checked)}
                disabled={showAnimation}
              />
              Use GSAP (vs Framer Motion)
            </label>
          </div>
        </div>

        <div className={styles.controlGroup}>
          <h3>Timer Demo</h3>
          <div className={styles.buttonGroup}>
            <button onClick={toggleTimer} className={styles.button}>
              {isTimerRunning ? 'Pause Timer' : 'Start Timer'}
            </button>
            <button 
              onClick={() => setTimerSeconds(90)} 
              className={styles.button}
            >
              Reset Timer
            </button>
            <input
              type="range"
              min="0"
              max="120"
              value={timerSeconds}
              onChange={(e) => setTimerSeconds(parseInt(e.target.value))}
              className={styles.slider}
            />
            <span>{Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, '0')}</span>
          </div>
        </div>
      </div>

      <div className={styles.demoArea}>
        {/* Timer Demo */}
        <div className={styles.timerDemo}>
          <h3>GSAP Enhanced Timer</h3>
          <CountdownTimerGSAP 
            seconds={timerSeconds}
            isRunning={isTimerRunning}
            teamColors={sampleTeam.colors}
          />
        </div>

        {/* Animation Demo */}
        {showAnimation && (
          <div className={styles.animationDemo}>
            {useGSAP ? (
              <DraftAnimationGSAP
                player={samplePlayer}
                team={sampleTeam}
                onComplete={handleAnimationComplete}
              />
            ) : (
              <DraftAnimation
                player={samplePlayer}
                team={sampleTeam}
                onComplete={handleAnimationComplete}
              />
            )}
          </div>
        )}
      </div>

      <div className={styles.comparison}>
        <h3>Key Differences</h3>
        <div className={styles.comparisonGrid}>
          <div className={styles.comparisonItem}>
            <h4>Framer Motion</h4>
            <ul>
              <li>React-first API</li>
              <li>Declarative animations</li>
              <li>Good for simple transitions</li>
              <li>~52KB bundle size</li>
            </ul>
          </div>
          <div className={styles.comparisonItem}>
            <h4>GSAP</h4>
            <ul>
              <li>Imperative timeline control</li>
              <li>Superior performance</li>
              <li>Professional easing options</li>
              <li>~47KB bundle size</li>
              <li>Better complex sequences</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GSAPDemo;
