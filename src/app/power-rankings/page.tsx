'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastTeamLogo } from '@/components/ui/BroadcastPanel';
import { CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import { TEAM_COLORS } from '@/lib/constants/team-colors';
import type { NewsletterMeta } from '@/components/newsletter/types';

type DisplayRankingItem = {
  rank: number;
  team: string;
  blurb: string;
  movementLabel?: string;
  movementDirection?: 'up' | 'down' | 'neutral';
  movementDescription?: string;
  record?: string;
  pointsFor?: number;
};

type DisplayPowerRankings = {
  masonRankings: DisplayRankingItem[];
  westyRankings: DisplayRankingItem[];
  bot1_intro?: string;
  bot2_intro?: string;
  source: 'structured' | 'uploaded-pdf';
};

type RankingIssue = {
  meta: NewsletterMeta;
  rankings: DisplayPowerRankings;
};

const SEASONS = [CURRENT_SEASON, ...Object.keys(LEAGUE_IDS.PREVIOUS)]
  .sort((a, b) => Number(b) - Number(a));

function publishedDate(meta: NewsletterMeta) {
  return new Date(meta.publishedAt || meta.generatedAt);
}

function issueLabel(meta: NewsletterMeta) {
  if (meta.episodeType === 'preseason' || meta.week === 900) return 'Preseason';
  if (meta.week >= 900) return (meta.episodeType || 'Special').replace(/_/g, ' ');
  return `Week ${meta.week}`;
}

function formatPublished(meta: NewsletterMeta) {
  return publishedDate(meta).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fillMissingMovement(
  current: DisplayRankingItem[],
  previous?: DisplayRankingItem[],
): DisplayRankingItem[] {
  return current.map((item) => {
    if (item.movementLabel) return item;

    const prior = previous?.find((candidate) => candidate.team === item.team);
    if (!prior) {
      return {
        ...item,
        movementLabel: '→',
        movementDirection: 'neutral',
        movementDescription: 'No prior ranking comparison available',
      };
    }

    const delta = prior.rank - item.rank;
    if (delta > 0) {
      return {
        ...item,
        movementLabel: `↑${delta}`,
        movementDirection: 'up',
        movementDescription: `Moved up ${delta} spot${delta === 1 ? '' : 's'} from No. ${prior.rank}`,
      };
    }
    if (delta < 0) {
      const amount = Math.abs(delta);
      return {
        ...item,
        movementLabel: `↓${amount}`,
        movementDirection: 'down',
        movementDescription: `Moved down ${amount} spot${amount === 1 ? '' : 's'} from No. ${prior.rank}`,
      };
    }

    return {
      ...item,
      movementLabel: '→',
      movementDirection: 'neutral',
      movementDescription: `No change from No. ${prior.rank}`,
    };
  });
}

function completeMovement(
  current: DisplayPowerRankings,
  previous?: DisplayPowerRankings,
): DisplayPowerRankings {
  return {
    ...current,
    masonRankings: fillMissingMovement(current.masonRankings, previous?.masonRankings),
    westyRankings: fillMissingMovement(current.westyRankings, previous?.westyRankings),
  };
}

function teamColor(team: string) {
  const direct = TEAM_COLORS[team];
  if (direct?.primary) return direct.primary;
  const key = Object.keys(TEAM_COLORS).find((name) => name.toLowerCase() === team.toLowerCase());
  return key ? TEAM_COLORS[key].primary : '#374151';
}

function PunditIntro({
  name,
  text,
}: {
  name: string;
  text?: string;
}) {
  if (!text?.trim()) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">{name}</div>
      <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{text}</p>
    </div>
  );
}

function MovementBadge({ item }: { item: DisplayRankingItem }) {
  if (!item.movementLabel) return null;

  const className =
    item.movementDirection === 'up'
      ? 'text-emerald-300'
      : item.movementDirection === 'down'
        ? 'text-rose-300'
        : 'text-[var(--muted)]';

  return (
    <span
      className={`text-xs font-black tabular-nums ${className}`}
      title={item.movementDescription}
      aria-label={item.movementDescription}
    >
      {item.movementLabel}
    </span>
  );
}

function RankingRow({ item }: { item: DisplayRankingItem }) {
  const accent = teamColor(item.team);

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3.5 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="w-16 shrink-0 pt-0.5">
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xl font-black tabular-nums text-[var(--text)]">#{item.rank}</span>
            <MovementBadge item={item} />
          </div>
        </div>

        <BroadcastTeamLogo team={item.team} accent={accent} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-sm font-black text-[var(--text)] sm:text-base">{item.team}</h3>
            {item.record && typeof item.pointsFor === 'number' ? (
              <span className="text-[11px] font-semibold tabular-nums text-[var(--muted)]">
                {item.record} · {item.pointsFor.toFixed(1)} PF
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{item.blurb}</p>
        </div>
      </div>
    </article>
  );
}

function RankingBoard({
  name,
  label,
  intro,
  rankings,
}: {
  name: string;
  label: string;
  intro?: string;
  rankings: DisplayRankingItem[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 sm:px-5">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
          <h2 className="mt-0.5 text-lg font-black text-[var(--text)]">{name}</h2>
        </div>
        <div className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--muted)]">
          1–12
        </div>
      </div>

      <div className="space-y-3 p-3 sm:p-4">
        <PunditIntro name={name} text={intro} />
        {rankings
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .map((item) => (
            <RankingRow key={`${name}-${item.rank}-${item.team}`} item={item} />
          ))}
      </div>
    </section>
  );
}

export default function PowerRankingsPage() {
  const [season, setSeason] = useState(CURRENT_SEASON);
  const [issues, setIssues] = useState<RankingIssue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedSeason = params.get('season');
    if (requestedSeason && SEASONS.includes(requestedSeason)) {
      setSeason(requestedSeason);
    }
    setSelectedId(params.get('issue'));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const listRes = await fetch(`/api/newsletter?list=true&season=${season}`, { cache: 'no-store' });
        const listJson = await listRes.json() as { items?: NewsletterMeta[]; error?: string };
        if (!listRes.ok) throw new Error(listJson.error || 'Failed to load newsletter catalog.');

        const published = (listJson.items ?? [])
          .filter((item) => item.status === 'published')
          .sort((a, b) => publishedDate(b).getTime() - publishedDate(a).getTime());

        const loaded = await Promise.all(
          published.map(async (meta): Promise<RankingIssue | null> => {
            const rankingsRes = await fetch(
              `/api/newsletter/power-rankings?id=${encodeURIComponent(meta.id)}`,
            );
            if (!rankingsRes.ok) return null;

            const payload = await rankingsRes.json() as {
              success?: boolean;
              rankings?: DisplayPowerRankings;
            };
            if (payload.success === false || !payload.rankings) return null;

            return { meta, rankings: payload.rankings };
          }),
        );

        if (cancelled) return;

        const baseIssues = loaded.filter((item): item is RankingIssue => item !== null);
        const rankingIssues = baseIssues.map((issue, index) => ({
          ...issue,
          rankings: completeMovement(issue.rankings, baseIssues[index + 1]?.rankings),
        }));
        setIssues(rankingIssues);

        setSelectedId((current) => {
          if (current && rankingIssues.some((item) => item.meta.id === current)) return current;
          return rankingIssues[0]?.meta.id ?? null;
        });
      } catch (err) {
        if (cancelled) return;
        setIssues([]);
        setSelectedId(null);
        setError(err instanceof Error ? err.message : 'Failed to load Power Rankings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [season]);

  const selected = useMemo(
    () => issues.find((item) => item.meta.id === selectedId) ?? issues[0] ?? null,
    [issues, selectedId],
  );

  const chooseIssue = (id: string) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('season', season);
    url.searchParams.set('issue', id);
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  };

  const chooseSeason = (year: string) => {
    setSeason(year);
    setSelectedId(null);
    const url = new URL(window.location.href);
    url.searchParams.set('season', year);
    url.searchParams.delete('issue');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader
        title="Power Rankings"
        subtitle="Mason and Westy’s published rankings, synced directly from the newsletter"
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
          The rankings and commentary come directly from the published newsletter. New published rankings become current automatically, while this page presents them in the same visual style as the rest of the league site.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" aria-label="Power ranking season">
        {SEASONS.map((year) => (
          <button
            key={year}
            type="button"
            onClick={() => chooseSeason(year)}
            className={
              year === season
                ? 'rounded-full border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-black text-white'
                : 'rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--muted)] transition hover:text-[var(--text)]'
            }
          >
            {year}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-8 text-center text-sm text-[var(--muted)]">
          Loading published Power Rankings...
        </div>
      ) : error ? (
        <div className="mt-5 rounded-2xl border border-red-500/35 bg-red-500/10 p-5 text-sm text-red-300">
          {error}
        </div>
      ) : issues.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-8 text-center">
          <div className="text-lg font-black">No published Power Rankings for {season}</div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            They will appear here automatically after a published newsletter contains a Power Rankings section or an uploaded PDF with extractable Power Rankings.
          </p>
        </div>
      ) : selected ? (
        <>
          <div className="mt-5 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2" aria-label="Published Power Ranking history">
              {issues.map((issue, index) => {
                const active = issue.meta.id === selected.meta.id;
                return (
                  <button
                    key={issue.meta.id}
                    type="button"
                    onClick={() => chooseIssue(issue.meta.id)}
                    className={
                      active
                        ? 'rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 py-2.5 text-left text-white'
                        : 'rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-2.5 text-left text-[var(--muted)] transition hover:text-[var(--text)]'
                    }
                  >
                    <span className="block text-xs font-black">
                      {issueLabel(issue.meta)}{index === 0 ? ' · Current' : ''}
                    </span>
                    <span className={active ? 'mt-0.5 block text-[10px] text-white/75' : 'mt-0.5 block text-[10px] text-[var(--muted)]'}>
                      {formatPublished(issue.meta)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <section className="mt-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 sm:px-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">
                  {issueLabel(selected.meta)} · Published {formatPublished(selected.meta)}
                </div>
                <h2 className="mt-1 text-lg font-black text-[var(--text)]">
                  {selected.meta.title || `${season} ${issueLabel(selected.meta)} Newsletter`}
                </h2>
              </div>
              <Link
                href={`/newsletter?season=${season}&issue=${encodeURIComponent(selected.meta.id)}`}
                className="text-xs font-bold text-[var(--accent)] hover:underline"
              >
                Open full newsletter →
              </Link>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <RankingBoard
                name="Mason Reed"
                label="Mason's rankings"
                intro={selected.rankings.bot1_intro}
                rankings={selected.rankings.masonRankings}
              />
              <RankingBoard
                name="Westy"
                label="Westy's rankings"
                intro={selected.rankings.bot2_intro}
                rankings={selected.rankings.westyRankings}
              />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
