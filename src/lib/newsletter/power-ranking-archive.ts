import type { Newsletter } from '@/lib/newsletter/types';
import {
  listNewslettersMeta,
  loadNewsletterById,
} from '@/server/db/newsletter-queries';

export type PublishedPowerRankingIssue = {
  id: string;
  title: string;
  season: number;
  week: number;
  episodeType: string | null;
  publishedAt: string;
  generatedAt: string;
  newsletter: Newsletter;
};

export async function loadPublishedPowerRankingIssues(
  season: number,
): Promise<PublishedPowerRankingIssue[]> {
  const metas = await listNewslettersMeta(season);
  const loaded = await Promise.all(
    metas.map(async (meta) => {
      const issue = await loadNewsletterById(meta.id);
      if (!issue || issue.status !== 'published') return null;

      const sections = issue.newsletter?.sections;
      if (!Array.isArray(sections) || !sections.some((section) => section.type === 'PowerRankings')) {
        return null;
      }

      return {
        id: issue.id,
        title: meta.title?.trim() || fallbackTitle(meta.season, meta.week, meta.episodeType),
        season: meta.season,
        week: meta.week,
        episodeType: meta.episodeType ?? null,
        publishedAt: meta.publishedAt ?? meta.generatedAt,
        generatedAt: meta.generatedAt,
        newsletter: issue.newsletter as Newsletter,
      } satisfies PublishedPowerRankingIssue;
    }),
  );

  return loaded
    .filter((issue): issue is PublishedPowerRankingIssue => issue !== null)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

function fallbackTitle(season: number, week: number, episodeType: string | null) {
  if (episodeType === 'preseason' || week === 900) return `${season} Preseason Preview`;
  if (week >= 900) return `${season} ${episodeType || 'Special'}`;
  return `${season} Week ${week} Newsletter`;
}
