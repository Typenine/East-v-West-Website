import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { getLeagueStatsDatasetV2 } from '@/lib/stats/league-stats-v2';
import { describeFranchiseRecord, franchiseHistoryId } from '@/lib/history/league-history';
import { getReadableTextForColors, getTeamColors, getTeamLogoPath } from '@/lib/utils/team-utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Franchise History — East v. West',
  description: 'Permanent East v. West franchise history and statistical reference pages.',
};

export default async function FranchiseHistoryIndexPage() {
  const dataset = await getLeagueStatsDatasetV2();
  const franchises = [...dataset.franchises].sort((a, b) => b.titles - a.titles || b.regularWins - a.regularWins || a.teamName.localeCompare(b.teamName));

  return (
    <main className="container mx-auto max-w-[1400px] px-4 py-8">
      <div className="text-sm text-[var(--muted)]"><Link href="/history" className="hover:underline">History</Link> / Franchise History</div>
      <div className="mt-2 border-b-4 border-[var(--accent)] pb-4">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-[var(--muted)]">East v. West Reference</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Franchise History</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">Permanent franchise pages combining season results, players, games, records, All-EVW honors and league milestones.</p>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {franchises.map((franchise) => {
          const colors = getTeamColors(franchise.teamName);
          const textColor = getReadableTextForColors([colors.primary, colors.secondary]);
          return (
            <Link
              key={franchise.teamName}
              href={`/history/franchises/${franchiseHistoryId(franchise)}`}
              className="group overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-4 p-4" style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary || colors.primary})`, color: textColor }}>
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white/90 p-1">
                  <Image src={getTeamLogoPath(franchise.teamName)} alt={`${franchise.teamName} logo`} fill sizes="64px" className="object-contain p-1" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xl font-black">{franchise.teamName}</div>
                  <div className="mt-1 text-xs font-semibold opacity-90">{franchise.firstSeason === franchise.lastSeason ? franchise.firstSeason : `${franchise.firstSeason}–${franchise.lastSeason}`}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-px bg-[var(--border)]">
                <div className="bg-[var(--surface)] p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Titles</div><div className="mt-1 text-xl font-black">{franchise.titles}</div></div>
                <div className="bg-[var(--surface)] p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Wins</div><div className="mt-1 text-xl font-black">{franchise.regularWins}</div></div>
                <div className="bg-[var(--surface)] p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Playoff W</div><div className="mt-1 text-xl font-black">{franchise.playoffWins}</div></div>
              </div>
              <div className="p-4 text-sm text-[var(--muted)]">
                {describeFranchiseRecord(franchise)}
                <div className="mt-2 font-bold text-[var(--accent)] group-hover:underline">Open franchise history →</div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
