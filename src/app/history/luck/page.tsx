import type { Metadata } from 'next';
import Link from 'next/link';
import { CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import { calculateHistoricalLuck } from '@/lib/fantasy/historical-luck';
import { getLeagueStatsDatasetV2 } from '@/lib/stats/league-stats-v2';
import { getTeamsData } from '@/lib/utils/sleeper-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = {
  title: 'Historical Luck Index — East v. West',
  description: 'Cumulative expected wins and schedule luck, updated after every completed week.',
};

const signed = (n: number) => (n > 0 ? '+' : '') + n.toFixed(2);
const luckColor = (n: number) => n > 0.005 ? 'text-emerald-400' :
  n < -0.005 ? 'text-rose-400' : 'text-[var(--muted)]';

export default async function HistoricalLuckPage({
  searchParams,
}: { searchParams: Promise<{ week?: string }> }) {
  const [dataset, standings] = await Promise.all([
    getLeagueStatsDatasetV2(),
    getTeamsData(LEAGUE_IDS.CURRENT, { forceFresh: true, timeoutMs: 6000, retries: 1 }),
  ]);
  if (standings.length < 2) throw new Error('Current league standings unavailable.');

  // Official Sleeper W/L/T controls when a week is final. This excludes
  // incomplete Sunday/Monday scores even if Sleeper already reports points.
  const completedWeek = Math.min(14, ...standings.map((t) => t.wins + t.losses + t.ties));
  const params = await searchParams;
  const requested = Number(params.week);
  const week = params.week && Number.isInteger(requested)
    ? Math.max(0, Math.min(requested, completedWeek)) : completedWeek;

  const report = calculateHistoricalLuck(dataset.games, CURRENT_SEASON, week, standings.length);
  if (week > 0 && report.teams.length !== standings.length) {
    throw new Error('The completed-week scoring archive is incomplete. Try again after the next stats refresh.');
  }
  const luckiest = report.teams[0];
  const unluckiest = report.teams[report.teams.length - 1];

  return (
    <main className="container mx-auto max-w-[1400px] px-4 py-8">
      <nav className="text-sm text-[var(--muted)]">
        <Link href="/standings" className="hover:underline">Standings</Link> / Historical Luck
      </nav>
      <div className="mt-3 border-b-4 border-[var(--accent)] pb-5">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-[var(--muted)]">
          East v. West Analytics
        </div>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Historical Luck Index</h1>
        <p className="mt-2 max-w-4xl text-sm text-[var(--muted)]">
          How many games should each team have won based on its weekly scores?
          The reference pool grows after every completed regular-season week, starting in 2023.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-[var(--border)] px-3 py-2">
            {CURRENT_SEASON} through Week {week}
          </span>
          <span className="rounded-full border border-[var(--border)] px-3 py-2">
            {report.baselineCount} historical scores
          </span>
          <span className="rounded-full border border-[var(--border)] px-3 py-2">
            League scoring average: {report.baselineAverage.toFixed(2)}
          </span>
          <a className="rounded-full border border-[var(--accent)] px-3 py-2 font-bold text-[var(--accent)]"
             href="/history/luck">Refresh</a>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Historical luck week selector">
        <span className="mr-2 text-xs font-bold uppercase text-[var(--muted)]">View as of</span>
        {Array.from({ length: completedWeek + 1 }, (_, w) => (
          <Link key={w} href={'/history/luck?week=' + w}
            aria-current={w === week ? 'page' : undefined}
            className={'rounded-md border px-3 py-2 text-xs font-bold ' +
              (w === week ? 'border-[var(--accent)] text-[var(--accent)]' :
                'border-[var(--border)] hover:border-[var(--accent)]')}>
            {w ? 'Week ' + w : 'Preseason'}
          </Link>
        ))}
      </div>

      {week === 0 ? (
        <section className="mt-7 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          Historical scores are loaded. Luck rankings will appear after Week 1 is finalized.
        </section>
      ) : (
        <>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {[
              { title: 'Luckiest', team: luckiest },
              { title: 'Unluckiest', team: unluckiest },
            ].map(({ title, team }) => (
              <section key={title} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
                <div className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">
                  {title} by historical scoring
                </div>
                <h2 className="mt-2 text-xl font-black">{team.name}</h2>
                <div className={'mt-1 text-3xl font-black tabular-nums ' + luckColor(team.historicalLuck)}>
                  {signed(team.historicalLuck)} wins
                </div>
              </section>
            ))}
          </div>
          <section className="mt-6 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            <div className="p-5">
              <h2 className="text-xl font-black">{CURRENT_SEASON} luck rankings</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Positive = more wins than expected. Historical and All-Play models remain separate.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--surface-strong)] text-xs font-black uppercase text-[var(--muted)]">
                  <tr>
                    <th scope="col" className="px-4 py-3">Rank</th>
                    <th scope="col" className="px-4 py-3">Team</th>
                    <th scope="col" className="px-4 py-3">Record</th>
                    <th scope="col" className="px-4 py-3 text-right">Hist. expected</th>
                    <th scope="col" className="px-4 py-3 text-right">Hist. luck</th>
                    <th scope="col" className="px-4 py-3 text-right">All-Play expected</th>
                    <th scope="col" className="px-4 py-3 text-right">All-Play luck</th>
                  </tr>
                </thead>
                <tbody>
                  {report.teams.map((t, index) => (
                    <tr key={t.rosterId} className="border-t border-[var(--border)] hover:bg-white/5">
                      <td className="px-4 py-3">{index + 1}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold">
                        <Link href={'/teams/' + t.rosterId} className="hover:underline">{t.name}</Link>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {t.wins}-{t.losses}{t.ties ? '-' + t.ties : ''}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.historicalExpected.toFixed(2)}</td>
                      <td className={'px-4 py-3 text-right font-bold tabular-nums ' + luckColor(t.historicalLuck)}>
                        {signed(t.historicalLuck)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.allPlayExpected.toFixed(2)}</td>
                      <td className={'px-4 py-3 text-right font-bold tabular-nums ' + luckColor(t.allPlayLuck)}>
                        {signed(t.allPlayLuck)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-xl font-black">Weekly breakdown</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Expand a team to inspect its score and both expected-win probabilities each week.
            </p>
            <div className="mt-4 space-y-2">
              {report.teams.map((t) => (
                <details key={t.rosterId} className="rounded-lg border border-[var(--border)] p-3">
                  <summary className="cursor-pointer text-sm font-bold">
                    {t.name} · {t.historicalExpected.toFixed(2)} historical expected wins
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead><tr className="text-[var(--muted)]">
                        <th className="py-2">Week</th><th>Score</th><th>Result</th>
                        <th>Historical win chance</th><th>All-Play win chance</th>
                      </tr></thead>
                      <tbody>{t.weeks.map((w) => (
                        <tr key={w.week} className="border-t border-[var(--border)]">
                          <td className="py-2">{w.week}</td>
                          <td>{w.score.toFixed(2)}</td><td>{w.result}</td>
                          <td>{(w.historicalProbability * 100).toFixed(1)}%</td>
                          <td>{(w.allPlayProbability * 100).toFixed(1)}%</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
      <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
        <h2 className="text-lg font-black">How the model works</h2>
        <p className="mt-2 text-[var(--muted)]">
          For each weekly score, count the percentage of all completed league regular-season scores
          it would beat. Equal scores count as half a win. Add the weekly percentages to get
          expected wins. Actual wins minus expected wins is the luck differential.
        </p>
        <p className="mt-2 text-[var(--muted)]">
          The reference includes every team and completed regular-season week since 2023.
          Partial games and postseason results do not count. The underlying league statistics
          refresh automatically, and the rankings recalculate on every page load.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          {report.seasonCounts.map((item) => (
            <span key={item.year} className="rounded-full border border-[var(--border)] px-3 py-1">
              {item.year}: {item.count} scores
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
