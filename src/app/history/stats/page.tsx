import type { Metadata } from 'next';
import { getLeagueStatsDatasetV2 } from '@/lib/stats/league-stats-v2';
import StatsReferenceRouter from './StatsReferenceRouter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'League Statistics — East v. West',
  description: 'East v. West player, franchise, season, game and record-book statistics.',
};

export default async function LeagueStatsPage() {
  const dataset = await getLeagueStatsDatasetV2();
  return <StatsReferenceRouter dataset={dataset} />;
}
