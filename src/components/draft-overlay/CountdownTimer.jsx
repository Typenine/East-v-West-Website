import React from 'react';

export default function CountdownTimer({ seconds, isRunning }) {
  // Format seconds into MM:SS
  const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Add pulse animation when timer is running and under 60 seconds
  const timerClasses = `
    text-7xl font-bold font-mono mt-8
    ${isRunning && seconds <= 60 ? 'text-red-500 animate-pulse' : 'text-white'}
    transition-colors duration-300
  `.trim();

  return (
    <div className="flex flex-col items-center">
      <div className={timerClasses}>
        {formatTime(seconds)}
      </div>
      <div className="text-xl mt-2 text-gray-300">
        {isRunning ? 'On The Clock' : 'Timer Paused'}
      </div>
    </div>
  );
}
