'use client';

import { useSearchParams } from 'next/navigation';
import type { LeagueStatsDataset } from '@/lib/stats/types';
import StatsReferenceClient from './StatsReferenceClient';
import StatsRecordsViewV2 from './StatsRecordsViewV2';
import StatsPostseasonView from './StatsPostseasonView';

export default function StatsReferenceRouter({ dataset }: { dataset: LeagueStatsDataset }) {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';

  if (tab === 'postseason') {
    return <StatsPostseasonView dataset={dataset} />;
  }

  if (tab === 'records') {
    return <StatsRecordsViewV2 dataset={dataset} />;
  }

  return <StatsReferenceClient dataset={dataset} />;
}
