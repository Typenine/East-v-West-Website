'use client';

import { useEffect, useMemo, useState } from 'react';
import CountdownTimer from '@/components/ui/countdown-timer';
import SectionHeader from '@/components/ui/SectionHeader';
import Select from '@/components/ui/Select';
import { getCountdownCards } from '@/lib/utils/countdown-resolver';

const STORAGE_KEY = 'evw-countdown-time-zone';

const TIME_ZONE_OPTIONS = [
  { value: 'auto', label: 'Automatic (device)' },
  { value: 'America/New_York', label: 'Eastern Time' },
  { value: 'America/Chicago', label: 'Central Time' },
  { value: 'America/Denver', label: 'Mountain Time' },
  { value: 'America/Phoenix', label: 'Arizona Time' },
  { value: 'America/Los_Angeles', label: 'Pacific Time' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'UTC', label: 'UTC' },
] as const;

function formatTargetDate(targetDate: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(targetDate);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(targetDate);
  }
}

export default function HomepageCountdowns() {
  const [card1, card2] = useMemo(() => getCountdownCards(), []);
  const [selectedTimeZone, setSelectedTimeZone] = useState('auto');
  const [detectedTimeZone, setDetectedTimeZone] = useState<string | null>(null);

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setDetectedTimeZone(detected || 'America/New_York');

    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && TIME_ZONE_OPTIONS.some((option) => option.value === saved)) {
        setSelectedTimeZone(saved);
      }
    } catch {
      // The selector still works when browser storage is unavailable.
    }
  }, []);

  const activeTimeZone = selectedTimeZone === 'auto'
    ? detectedTimeZone ?? 'America/New_York'
    : selectedTimeZone;

  const handleTimeZoneChange = (value: string) => {
    setSelectedTimeZone(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Keep the in-session selection even when browser storage is unavailable.
    }
  };

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader
        title="Key dates"
        subtitle="Event times adjust to the selected zone. The countdown is the same worldwide."
        actions={(
          <div className="flex items-center gap-2">
            <label htmlFor="countdown-time-zone" className="text-xs font-semibold text-[var(--muted)] whitespace-nowrap">
              Time zone
            </label>
            <Select
              id="countdown-time-zone"
              size="sm"
              fullWidth={false}
              value={selectedTimeZone}
              onChange={(event) => handleTimeZoneChange(event.target.value)}
              aria-label="Countdown time zone"
            >
              {TIME_ZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        )}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <CountdownTimer targetDate={card1.targetDate.toISOString()} title={card1.title} emphasis />
          <p className="mt-2 text-center text-xs font-semibold text-[var(--muted)]" aria-live="polite">
            {formatTargetDate(card1.targetDate, activeTimeZone)}
          </p>
        </div>
        <div>
          <CountdownTimer targetDate={card2.targetDate.toISOString()} title={card2.title} emphasis />
          <p className="mt-2 text-center text-xs font-semibold text-[var(--muted)]" aria-live="polite">
            {formatTargetDate(card2.targetDate, activeTimeZone)}
          </p>
        </div>
      </div>
    </section>
  );
}
