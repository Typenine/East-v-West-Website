'use client';

import { useEffect, useState } from 'react';
import { getTimeRemaining } from '@/lib/utils/countdown';

interface CountdownTimerProps {
  targetDate: Date;
  title: string;
  className?: string;
}

export default function CountdownTimer({ targetDate, title, className = '' }: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(getTimeRemaining(targetDate));
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
    const timer = setInterval(() => {
      setTimeRemaining(getTimeRemaining(targetDate));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [targetDate]);
  
  // If we're server-side rendering, don't show the countdown yet
  if (!isClient) {
    return (
      <div className={`p-6 rounded-lg shadow-md ${className}`}>
        <h3 className="text-xl font-bold mb-4">{title}</h3>
        <div className="text-center">Loading...</div>
      </div>
    );
  }
  
  // If the countdown is over
  if (timeRemaining.total <= 0) {
    return (
      <div className={`p-6 rounded-lg shadow-md ${className}`}>
        <h3 className="text-xl font-bold mb-4">{title}</h3>
        <div className="text-center text-2xl font-bold">Started!</div>
      </div>
    );
  }
  
  return (
    <div className={`p-6 rounded-lg shadow-md ${className}`}>
      <h3 className="text-xl font-bold mb-4">{title}</h3>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="flex flex-col">
          <span className="text-3xl font-bold">{timeRemaining.days}</span>
          <span className="text-sm">Days</span>
        </div>
        <div className="flex flex-col">
          <span className="text-3xl font-bold">{timeRemaining.hours}</span>
          <span className="text-sm">Hours</span>
        </div>
        <div className="flex flex-col">
          <span className="text-3xl font-bold">{timeRemaining.minutes}</span>
          <span className="text-sm">Minutes</span>
        </div>
        <div className="flex flex-col">
          <span className="text-3xl font-bold">{timeRemaining.seconds}</span>
          <span className="text-sm">Seconds</span>
        </div>
      </div>
    </div>
  );
}
