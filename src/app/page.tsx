import LegacyHome from './legacy-home';
import SeasonLaunchHome from '@/components/home/SeasonLaunchHome';
import { selectCalendar } from '@/lib/constants/league-calendar';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

function easternDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  const calendar = selectCalendar(now);
  const launchAt = new Date(calendar.regularSeasonStart.getTime() - 15 * 24 * 60 * 60 * 1000);

  // Flip on at the start of the launch calendar day, not 15 exact 24-hour periods
  // before kickoff. This makes the season command center active for the full day.
  const useSeasonHome =
    easternDateKey(now) >= easternDateKey(launchAt) &&
    now.getTime() < calendar.postseasonStart.getTime();

  if (useSeasonHome) {
    return <SeasonLaunchHome searchParams={searchParams} />;
  }

  return <LegacyHome searchParams={searchParams} />;
}
