import LegacyHome from './legacy-home';
import SeasonLaunchHome from '@/components/home/SeasonLaunchHome';
import { selectCalendar } from '@/lib/constants/league-calendar';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  const calendar = selectCalendar(now);
  const launchAt = calendar.regularSeasonStart.getTime() - 15 * 24 * 60 * 60 * 1000;
  const useSeasonHome = now.getTime() >= launchAt && now.getTime() < calendar.postseasonStart.getTime();

  if (useSeasonHome) {
    return <SeasonLaunchHome searchParams={searchParams} />;
  }

  return <LegacyHome searchParams={searchParams} />;
}
