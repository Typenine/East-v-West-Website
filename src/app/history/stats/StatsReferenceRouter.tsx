'use client';

import { useSearchParams } from 'next/navigation';
import type { LeagueStatsDataset } from '@/lib/stats/types';
import StatsReferenceClient from './StatsReferenceClient';
import StatsRecordsView from './StatsRecordsView';

export default function StatsReferenceRouter({ dataset }: { dataset: LeagueStatsDataset }) {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';

  if (tab === 'records') {
    return <StatsRecordsView dataset={dataset} />;
  }

  return <StatsReferenceClient dataset={dataset} />;
}
