import Link from 'next/link';
import { CURRENT_SEASON } from '@/lib/constants/league';

export default function SeasonWeekHeader({
  week,
}: {
  week: number;
  matchupCount: number;
}) {
  return (
    <section className="mb-6 sm:mb-8">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--muted)]">
            East v. West
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">
            {CURRENT_SEASON} Season · Week {week}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {week === 1 ? 'Week 1 upcoming' : `Week ${week}`}
          </p>
        </div>

        <Link
          href="/matchups"
          className="w-fit rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text)] transition hover:bg-[var(--surface-2)]"
        >
          Full schedule
        </Link>
      </div>
    </section>
  );
}
