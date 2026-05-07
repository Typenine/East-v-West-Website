'use client';

import { useEffect, useState } from 'react';
import { getTimeRemaining } from '@/lib/utils/countdown';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

interface CountdownTimerProps {
  targetDate: Date;
  title: string;
  className?: string;
  emphasis?: boolean;
}

export default function CountdownTimer({ targetDate, title, className = '', emphasis = false }: CountdownTimerProps) {
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
          <CardTitle className={emphasis ? 'text-[1.05rem] sm:text-[1.12rem] font-bold' : ''}>{title}</CardTitle>
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
          <CardTitle className={emphasis ? 'text-[1.05rem] sm:text-[1.12rem] font-bold' : ''}>{title}</CardTitle>
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
        <CardTitle className={emphasis ? 'text-[1.05rem] sm:text-[1.12rem] font-bold' : ''}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`grid grid-cols-4 text-center ${emphasis ? 'gap-2 sm:gap-3' : 'gap-3'}`}>
          <div className="flex flex-col">
            <span className={`${emphasis ? 'text-4xl sm:text-5xl font-extrabold' : 'text-3xl font-bold'} tabular-nums`}>{timeRemaining.days}</span>
            <span className={`${emphasis ? 'text-[11px] sm:text-xs tracking-wider' : 'text-xs tracking-wide'} text-[var(--muted)] uppercase`}>Days</span>
          </div>
          <div className="flex flex-col">
            <span className={`${emphasis ? 'text-4xl sm:text-5xl font-extrabold' : 'text-3xl font-bold'} tabular-nums`}>{timeRemaining.hours}</span>
            <span className={`${emphasis ? 'text-[11px] sm:text-xs tracking-wider' : 'text-xs tracking-wide'} text-[var(--muted)] uppercase`}>Hours</span>
          </div>
          <div className="flex flex-col">
            <span className={`${emphasis ? 'text-4xl sm:text-5xl font-extrabold' : 'text-3xl font-bold'} tabular-nums`}>{timeRemaining.minutes}</span>
            <span className={`${emphasis ? 'text-[11px] sm:text-xs tracking-wider' : 'text-xs tracking-wide'} text-[var(--muted)] uppercase`}>Minutes</span>
          </div>
          <div className="flex flex-col">
            <span className={`${emphasis ? 'text-4xl sm:text-5xl font-extrabold' : 'text-3xl font-bold'} tabular-nums`}>{timeRemaining.seconds}</span>
            <span className={`${emphasis ? 'text-[11px] sm:text-xs tracking-wider' : 'text-xs tracking-wide'} text-[var(--muted)] uppercase`}>Seconds</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

