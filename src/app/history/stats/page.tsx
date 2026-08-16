import type { Metadata } from 'next';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';
import StatsReferenceRouter from './StatsReferenceRouter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'League Statistics — East v. West',
  description: 'East v. West player, franchise, season, game and record-book statistics.',
};

export default async function LeagueStatsPage() {
  const dataset = await getLeagueStatsDatasetV3();
  return <StatsReferenceRouter dataset={dataset} />;
}
