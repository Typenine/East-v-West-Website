import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import { renderNewsletterData } from '@/lib/newsletter/template';
import {
  loadPublishedPowerRankingIssues,
  type PublishedPowerRankingIssue,
} from '@/lib/newsletter/power-ranking-archive';

export const dynamic = 'force-dynamic';

const SEASONS = [CURRENT_SEASON, ...Object.keys(LEAGUE_IDS.PREVIOUS)]
  .sort((a, b) => Number(b) - Number(a));

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function issueLabel(issue: PublishedPowerRankingIssue) {
  if (issue.episodeType === 'preseason' || issue.week === 900) return 'Preseason';
  if (issue.week >= 900) return issue.episodeType?.replace(/_/g, ' ') || 'Special';
  return `Week ${issue.week}`;
}

function publishedLabel(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function PowerRankingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await (searchParams ?? Promise.resolve({}))) as Record<string, string | string[] | undefined>;
  const requestedSeason = paramValue(sp.season);
  const season = requestedSeason && SEASONS.includes(requestedSeason)
    ? requestedSeason
    : CURRENT_SEASON;

  const issues = await loadPublishedPowerRankingIssues(Number(season)).catch(() => []);
  const requestedIssue = paramValue(sp.issue);
  const selected = issues.find((issue) => issue.id === requestedIssue) ?? issues[0] ?? null;

  const rendered = selected ? renderNewsletterData(selected.newsletter) : null;
  const rankingHtml = rendered?.htmlSections.find((section) => section.type === 'PowerRankings')?.html ?? '';

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader
        title="Power Rankings"
        subtitle="Mason and Westy’s published rankings, pulled directly from the newsletter"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/standings"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-bold transition hover:bg-white/5"
            >
              Standings
            </Link>
            {season === CURRENT_SEASON ? (
              <Link
                href="/playoff-lab"
                className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-bold transition hover:bg-white/5"
              >
                Playoff Lab
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-4 sm:px-5">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">
          Newsletter synced
        </div>
        <p className="mt-1.5 max-w-4xl text-sm leading-6 text-[var(--muted)]">
          These are the exact Power Rankings published in the newsletter, including each pundit&apos;s order, movement, introduction, and team blurbs. Publishing a new newsletter with Power Rankings automatically makes that issue the current ranking and adds the previous one to the history.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Power ranking season">
        {SEASONS.map((year) => {
          const active = year === season;
          return (
            <Link
              key={year}
              href={`/power-rankings?season=${year}`}
              className={
                active
                  ? 'rounded-full border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-black text-white'
                  : 'rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--muted)] transition hover:text-[var(--text)]'
              }
            >
              {year}
            </Link>
          );
        })}
      </div>

      {issues.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-8 text-center">
          <div className="text-lg font-black">No published Power Rankings for {season}</div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Rankings will appear here automatically when a published newsletter contains a Power Rankings section.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2" aria-label="Published Power Ranking history">
              {issues.map((issue, index) => {
                const active = issue.id === selected?.id;
                return (
                  <Link
                    key={issue.id}
                    href={`/power-rankings?season=${season}&issue=${encodeURIComponent(issue.id)}`}
                    className={
                      active
                        ? 'rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-left text-white'
                        : 'rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-2.5 text-left text-[var(--muted)] transition hover:text-[var(--text)]'
                    }
                  >
                    <span className="block text-xs font-black">
                      {issueLabel(issue)}{index === 0 ? ' · Current' : ''}
                    </span>
                    <span className={active ? 'mt-0.5 block text-[10px] text-white/75' : 'mt-0.5 block text-[10px] text-[var(--muted)]'}>
                      {publishedLabel(issue.publishedAt)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {selected ? (
            <section className="mt-5">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">
                    {issueLabel(selected)} · Published {publishedLabel(selected.publishedAt)}
                  </div>
                  <h2 className="mt-1 text-xl font-black text-[var(--text)]">{selected.title}</h2>
                </div>
                <Link href="/newsletter" className="text-xs font-bold text-[var(--accent)] hover:underline">
                  Open newsletter archive →
                </Link>
              </div>

              {rankingHtml ? (
                <div
                  className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-4 text-black sm:p-6"
                  dangerouslySetInnerHTML={{ __html: rankingHtml }}
                />
              ) : (
                <div className="rounded-xl border border-amber-400/35 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-100/90">
                  This published issue contains Power Rankings data, but the ranking section could not be rendered.
                </div>
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
