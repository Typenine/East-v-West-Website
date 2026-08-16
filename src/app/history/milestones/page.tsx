import type { Metadata } from 'next';
import Link from 'next/link';
import { getLeagueStatsDatasetV2 } from '@/lib/stats/league-stats-v2';
import { buildLeagueMilestones } from '@/lib/history/league-history';
import MilestonesClient from './MilestonesClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'League Milestones — East v. West',
  description: 'Career scoring milestones, franchise wins, records and championships across East v. West history.',
};

export default async function LeagueMilestonesPage() {
  const dataset = await getLeagueStatsDatasetV2();
  const milestones = buildLeagueMilestones(dataset);

  return (
    <main className="container mx-auto max-w-[1200px] px-4 py-8">
      <div className="text-sm text-[var(--muted)]"><Link href="/history" className="hover:underline">History</Link> / Milestones</div>
      <div className="mt-2 border-b-4 border-[var(--accent)] pb-4">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-[var(--muted)]">Living League History</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">League Milestones</h1>
        <p className="mt-2 max-w-4xl text-sm text-[var(--muted)]">Automatically detected career point thresholds, franchise win milestones, playoff milestones, league scoring records and championships. New milestones appear as the statistical archive grows.</p>
      </div>
      <div className="mt-7"><MilestonesClient milestones={milestones} franchises={dataset.franchises} /></div>
    </main>
  );
}
