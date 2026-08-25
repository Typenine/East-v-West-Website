'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CURRENT_SEASON } from '@/lib/constants/league';
import { selectCalendar } from '@/lib/constants/league-calendar';

const MINUTE = 60_000;

function compactRemaining(target: Date, now: number): string {
  const ms = Math.max(0, target.getTime() - now);
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.max(0, Math.ceil(ms / MINUTE));
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export default function SeasonWeekHeader({
  week,
  matchupCount,
}: {
  week: number;
  matchupCount: number;
}) {
  const calendar = useMemo(() => selectCalendar(new Date()), []);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE);
    return () => window.clearInterval(timer);
  }, []);

  const beforeKickoff = now < calendar.regularSeasonStart.getTime();
  const statusItems = [
    ...(beforeKickoff
      ? [{ label: 'Season starts', value: compactRemaining(calendar.regularSeasonStart, now) }]
      : [{ label: 'Season status', value: 'Active' }]),
    { label: 'Trade deadline', value: compactRemaining(calendar.tradeDeadline, now) },
    { label: 'Playoffs', value: compactRemaining(calendar.postseasonStart, now) },
    { label: 'Matchups', value: String(matchupCount || 6) },
  ];

  return (
    <section className="mb-6 sm:mb-8">
      <div
        className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
        style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.12)' }}
      >
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--muted)]">
              East v. West
            </div>
            <div className="mt-1 text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">
              {CURRENT_SEASON} Season · Week {week}
            </div>
            <div className="mt-1 text-sm text-[var(--muted)]">
              {beforeKickoff ? 'Week 1 upcoming · in-season hub is live' : 'Regular season command center'}
            </div>
          </div>
          <Link
            href="/matchups"
            className="w-fit rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-2)]"
          >
            Full schedule
          </Link>
        </div>

        <div className="grid border-t border-[var(--border)] sm:grid-cols-4">
          {statusItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-3 last:border-b-0 sm:block sm:border-b-0 sm:border-r sm:last:border-r-0"
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                {item.label}
              </div>
              <div className="mt-0.5 text-base font-black tabular-nums text-[var(--text)] sm:text-lg">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
