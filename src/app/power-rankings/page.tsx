'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import { TEAM_COLORS } from '@/lib/constants/team-colors';
import type { NewsletterData, NewsletterMeta } from '@/components/newsletter/types';
import type {
  IndependentPowerRankingsSection,
  IndependentRankingItem,
} from '@/lib/newsletter/weekly-recap-types';

type RankingIssue = {
  meta: NewsletterMeta;
  data: NewsletterData;
  rankings: IndependentPowerRankingsSection;
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

function movement(item: IndependentRankingItem) {
  if (item.movement === 'new') return 'NEW';
  if (item.movement === 'same') return '—';
  return `${item.movement === 'up' ? '▲' : '▼'} ${item.movementAmount}`;
}

function teamColor(team: string) {
  const direct = TEAM_COLORS[team];
  if (direct?.primary) return direct.primary;
  const key = Object.keys(TEAM_COLORS).find((name) => name.toLowerCase() === team.toLowerCase());
  return key ? TEAM_COLORS[key].primary : '#374151';
}

function IntroBlock({
  name,
  text,
  accent,
}: {
  name: string;
  text?: string;
  accent: string;
}) {
  if (!text?.trim()) return null;

  return (
    <div
      className="my-3 bg-white px-6 py-5 shadow-sm"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div
        className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.13em]"
        style={{ color: accent }}
      >
        {name}
      </div>
      <div className="whitespace-pre-wrap font-serif text-base leading-7 text-[#374151]">
        {text}
      </div>
    </div>
  );
}

function RankingCard({
  item,
  speaker,
}: {
  item: IndependentRankingItem;
  speaker: 'Mason Reed' | 'Westy';
}) {
  const accent = speaker === 'Mason Reed' ? '#be161e' : '#0b5f98';
  const moveColor =
    item.movement === 'up'
      ? '#047857'
      : item.movement === 'down'
        ? '#b91c1c'
        : '#6b7280';

  return (
    <div
      className="mb-3 grid grid-cols-[70px_1fr] gap-4 border border-[#e5e7eb] bg-white px-5 py-4 sm:gap-[18px]"
      style={{ borderLeft: `5px solid ${accent}` }}
    >
      <div>
        <div
          className="text-[11px] font-extrabold uppercase tracking-[0.1em]"
          style={{ color: accent }}
        >
          {speaker}
        </div>
        <div className="font-serif text-[32px] font-extrabold leading-none text-[#111827]">
          #{item.rank}
        </div>
        <div className="mt-1 text-[11px] font-bold" style={{ color: moveColor }}>
          {movement(item)}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span
            className="inline-block h-[9px] w-[9px] rounded-full"
            style={{ background: teamColor(item.team) }}
            aria-hidden="true"
          />
          <strong className="font-serif text-xl text-[#111827]">{item.team}</strong>
          <span className="text-xs text-[#6b7280]">
            {item.record} · {item.pointsFor.toFixed(1)} PF
          </span>
        </div>
        <div className="font-serif text-[15px] leading-7 text-[#374151]">{item.blurb}</div>
      </div>
    </div>
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
            const issueRes = await fetch(`/api/newsletter?id=${encodeURIComponent(meta.id)}`, { cache: 'no-store' });
            if (!issueRes.ok) return null;

            const data = await issueRes.json() as NewsletterData & { success?: boolean };
            if (data.success === false) return null;

            const section = data.newsletter.sections.find((item) => item.type === 'PowerRankings');
            if (!section?.data) return null;

            const rankings = section.data as IndependentPowerRankingsSection;
            if (!Array.isArray(rankings.masonRankings) || !Array.isArray(rankings.westyRankings)) {
              return null;
            }

            return { meta, data, rankings };
          }),
        );

        if (cancelled) return;

        const rankingIssues = loaded.filter((item): item is RankingIssue => item !== null);
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

  const interleaved = useMemo(() => {
    if (!selected) return [];
    const output: Array<{ key: string; item: IndependentRankingItem; speaker: 'Mason Reed' | 'Westy' }> = [];
    for (let rank = 1; rank <= 12; rank += 1) {
      const mason = selected.rankings.masonRankings.find((item) => item.rank === rank);
      const westy = selected.rankings.westyRankings.find((item) => item.rank === rank);
      if (mason) output.push({ key: `mason-${rank}`, item: mason, speaker: 'Mason Reed' });
      if (westy) output.push({ key: `westy-${rank}`, item: westy, speaker: 'Westy' });
    }
    return output;
  }, [selected]);

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
          Publishing a newsletter with a Power Rankings section automatically makes that issue the current ranking here. The page uses the exact published orders, introductions, movement, records, PF totals, and team blurbs.
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
            They will appear here automatically after a newsletter containing Power Rankings is published.
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

          <section className="mt-5 overflow-hidden rounded-2xl border border-[var(--border)] bg-[#f7f7f5] p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#6b7280]">
                  {issueLabel(selected.meta)} · Published {formatPublished(selected.meta)}
                </div>
                <h2 className="mt-1 text-xl font-black text-[#111827]">
                  {selected.meta.title || `${season} ${issueLabel(selected.meta)} Newsletter`}
                </h2>
              </div>
              <Link
                href={`/newsletter?season=${season}&issue=${encodeURIComponent(selected.meta.id)}`}
                className="text-xs font-bold text-[#be161e] hover:underline"
              >
                Open full newsletter →
              </Link>
            </div>

            <div className="mb-7 overflow-hidden rounded-md border-t-4 border-[#be161e] bg-[#0d0d0d] px-8 py-6">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-[#be161e]">
                East v. West
              </div>
              <h3 className="font-serif text-3xl font-bold text-white">WEEKLY POWER RANKINGS</h3>
              <div className="mt-2 text-[13px] text-white/55">Independent lists, interleaved by rank</div>
            </div>

            <IntroBlock name="Mason Reed" text={selected.rankings.bot1_intro} accent="#be161e" />
            <IntroBlock name="Westy" text={selected.rankings.bot2_intro} accent="#0b5f98" />

            <div className="mt-[22px]">
              {interleaved.map(({ key, item, speaker }) => (
                <RankingCard key={key} item={item} speaker={speaker} />
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
