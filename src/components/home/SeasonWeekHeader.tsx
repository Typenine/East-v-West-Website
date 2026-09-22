import Link from 'next/link';
import { CURRENT_SEASON, isRivalryWeek } from '@/lib/constants/league';

export default function SeasonWeekHeader({
  week,
}: {
  week: number;
  matchupCount: number;
}) {
  const rivalryWeek = isRivalryWeek(week);

  return (
    <section className="mb-6 sm:mb-8">
      <div
        className={`flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between ${
          rivalryWeek ? 'border-amber-400/40' : 'border-[var(--border)]'
        }`}
      >
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--muted)]">
            East v. West
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">
              {CURRENT_SEASON} Season · Week {week}
            </h1>
            {rivalryWeek ? (
              <Link
                href="/rivalries"
                className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300 transition hover:bg-amber-400/20"
              >
                Rivalry Week
              </Link>
            ) : null}
          </div>
          <p className={`mt-1 text-sm ${rivalryWeek ? 'font-semibold text-amber-200/90' : 'text-[var(--muted)]'}`}>
            {rivalryWeek
              ? 'Rivals meet across the league. Bragging rights are on the line.'
              : week === 1
                ? 'Week 1 upcoming'
                : `Week ${week}`}
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
