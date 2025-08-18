'use client';

import { useEffect, useState } from 'react';
import { getTimeRemaining } from '@/lib/utils/countdown';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

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
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-[var(--muted)]">Loading...</div>
        </CardContent>
      </Card>
    );
  }
  
  // If the countdown is over
  if (timeRemaining.total <= 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-2xl font-bold">Started!</div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className="flex flex-col">
            <span className="text-3xl font-bold tabular-nums">{timeRemaining.days}</span>
            <span className="text-xs text-[var(--muted)] uppercase tracking-wide">Days</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-bold tabular-nums">{timeRemaining.hours}</span>
            <span className="text-xs text-[var(--muted)] uppercase tracking-wide">Hours</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-bold tabular-nums">{timeRemaining.minutes}</span>
            <span className="text-xs text-[var(--muted)] uppercase tracking-wide">Minutes</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-bold tabular-nums">{timeRemaining.seconds}</span>
            <span className="text-xs text-[var(--muted)] uppercase tracking-wide">Seconds</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

