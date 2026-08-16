import type { Metadata } from 'next';
import Link from 'next/link';
import { getLeagueStatsDatasetV2 } from '@/lib/stats/league-stats-v2';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Weekly Gamebooks — East v. West',
  description: 'Week-by-week East v. West historical scorebooks, matchup results and player leaders.',
};

export default async function GamebookIndexPage() {
  const dataset = await getLeagueStatsDatasetV2();
  const rows = dataset.seasons
    .map((season) => ({
      season,
      weeks: Array.from(new Set(dataset.games.filter((game) => game.season === season).map((game) => game.week))).sort((a, b) => a - b),
    }))
    .filter((row) => row.weeks.length)
    .sort((a, b) => b.season.localeCompare(a.season));

  return (
    <main className="container mx-auto max-w-[1300px] px-4 py-8">
      <div className="text-sm text-[var(--muted)]"><Link href="/history" className="hover:underline">History</Link> / Weekly Gamebooks</div>
      <div className="mt-2 border-b-4 border-[var(--accent)] pb-4">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-[var(--muted)]">League Archive</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Weekly Historical Gamebooks</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">A permanent scorebook for every recorded East v. West week: matchup results, league scoring context, player leaders, positional leaders and milestones.</p>
      </div>

      <div className="mt-7 space-y-7">
        {rows.map((row) => (
          <section key={row.season} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-end justify-between gap-4 border-b border-[var(--border)] pb-3">
              <div><div className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">Season</div><h2 className="text-2xl font-black">{row.season}</h2></div>
              <Link href="/history/stats?tab=seasons" className="text-xs font-bold text-[var(--accent)] hover:underline">Season statistics →</Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {row.weeks.map((week) => <Link key={week} href={`/history/gamebook/${row.season}/${week}`} className="min-w-20 rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-center text-sm font-black hover:border-[var(--accent)] hover:text-[var(--accent)]">Week {week}</Link>)}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
