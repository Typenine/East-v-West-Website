import { and, desc, eq } from 'drizzle-orm';
import type { Newsletter } from '@/lib/newsletter/types';
import { getDb } from '@/server/db/client';
import { newsletters } from '@/server/db/schema';

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
  const db = getDb();
  const rows = await db
    .select({
      id: newsletters.id,
      title: newsletters.title,
      season: newsletters.season,
      week: newsletters.week,
      episodeType: newsletters.episodeType,
      publishedAt: newsletters.publishedAt,
      generatedAt: newsletters.generatedAt,
      content: newsletters.content,
    })
    .from(newsletters)
    .where(and(
      eq(newsletters.season, season),
      eq(newsletters.status, 'published'),
    ))
    .orderBy(desc(newsletters.publishedAt), desc(newsletters.generatedAt));

  return rows
    .filter((row) =>
      Array.isArray(row.content?.sections)
      && row.content.sections.some((section) => section.type === 'PowerRankings'),
    )
    .map((row) => ({
      id: row.id,
      title: row.title?.trim() || fallbackTitle(row.season, row.week, row.episodeType),
      season: row.season,
      week: row.week,
      episodeType: row.episodeType ?? null,
      publishedAt: (row.publishedAt ?? row.generatedAt).toISOString(),
      generatedAt: row.generatedAt.toISOString(),
      newsletter: row.content as Newsletter,
    }));
}

function fallbackTitle(season: number, week: number, episodeType: string | null) {
  if (episodeType === 'preseason' || week === 900) return `${season} Preseason Preview`;
  if (week >= 900) return `${season} ${episodeType || 'Special'}`;
  return `${season} Week ${week} Newsletter`;
}
