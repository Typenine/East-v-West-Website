import Link from 'next/link';
import { CURRENT_SEASON, getGameweekMode, type GameweekModeTone } from '@/lib/constants/league';

export default function SeasonWeekHeader({
  week,
}: {
  week: number;
  matchupCount: number;
}) {
  const mode = getGameweekMode(week);

  const tones: Record<GameweekModeTone, { border: string; badge: string; subtitle: string }> = {
    opening: {
      border: 'border-emerald-400/35',
      badge: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20',
      subtitle: 'text-emerald-200/90',
    },
    rivalry: {
      border: 'border-amber-400/40',
      badge: 'border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20',
      subtitle: 'text-amber-200/90',
    },
    'east-west': {
      border: 'border-sky-400/40',
      badge: 'border-sky-400/40 bg-sky-400/10 text-sky-300 hover:bg-sky-400/20',
      subtitle: 'text-sky-200/90',
    },
    deadline: {
      border: 'border-orange-400/40',
      badge: 'border-orange-400/40 bg-orange-400/10 text-orange-300 hover:bg-orange-400/20',
      subtitle: 'text-orange-200/90',
    },
    playoffs: {
      border: 'border-violet-400/40',
      badge: 'border-violet-400/40 bg-violet-400/10 text-violet-300 hover:bg-violet-400/20',
      subtitle: 'text-violet-200/90',
    },
    championship: {
      border: 'border-yellow-300/45',
      badge: 'border-yellow-300/45 bg-yellow-300/10 text-yellow-200 hover:bg-yellow-300/20',
      subtitle: 'text-yellow-100/90',
    },
  };
  const tone = mode ? tones[mode.tone] : null;

  return (
    <section className="mb-6 sm:mb-8">
      <div
        className={`flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between ${
          tone?.border ?? 'border-[var(--border)]'
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
            {mode ? (
              <Link
                href={mode.href}
                className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] transition ${tone?.badge ?? ''}`}
              >
                {mode.label}
              </Link>
            ) : null}
          </div>
          <p className={`mt-1 text-sm ${mode ? `font-semibold ${tone?.subtitle ?? ''}` : 'text-[var(--muted)]'}`}>
            {mode?.subtitle ?? `Week ${week}`}
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
