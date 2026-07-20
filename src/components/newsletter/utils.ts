import type { NewsletterMeta } from './types';

export const LEAGUE_LOGO = '/assets/teams/East v West Logos/Official East v. West Logo.png';

const WEEKLESS_TYPES = new Set(['pre_draft', 'post_draft', 'preseason', 'offseason']);
const EPISODE_LABELS: Record<string, string> = {
  regular: 'Weekly Newsletter',
  trade_deadline: 'Trade Deadline Newsletter',
  playoffs_preview: 'Playoffs Preview',
  playoffs_round: 'Playoff Newsletter',
  championship: 'Championship Newsletter',
  season_finale: 'Season Finale',
  pre_draft: 'Pre-Draft Newsletter',
  post_draft: 'Post-Draft Grades',
  preseason: 'Preseason Preview',
  offseason: 'Offseason Update',
};

export function resolveNewsletterType(item: NewsletterMeta): string {
  if (item.episodeType) return item.episodeType;
  if (item.week === 900) return 'preseason';
  if (item.week === 901) return 'pre_draft';
  if (item.week === 902) return 'post_draft';
  if (item.week === 903) return 'offseason';
  return 'regular';
}

export function displayIssueTitle(item: NewsletterMeta): string {
  if (item.title?.trim()) return item.title.trim();
  const type = resolveNewsletterType(item);
  const label = EPISODE_LABELS[type] ?? 'Newsletter';
  if (WEEKLESS_TYPES.has(type) || item.week >= 900) return `${item.season} ${label}`;
  if (type === 'regular') return `Week ${item.week} Newsletter`;
  return `${label}: Week ${item.week}`;
}

export function episodeLabel(item: NewsletterMeta): string {
  return EPISODE_LABELS[resolveNewsletterType(item)] ?? 'Newsletter';
}

export function sortByPublished(a: NewsletterMeta, b: NewsletterMeta): number {
  return publishedDate(b).getTime() - publishedDate(a).getTime();
}

export function publishedDate(item: NewsletterMeta): Date {
  return new Date(item.publishedAt || item.generatedAt);
}

export function releaseDateKey(item: NewsletterMeta): string {
  const date = publishedDate(item);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatReleaseDate(item: NewsletterMeta): string {
  return publishedDate(item).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatPublishedTime(item: NewsletterMeta): string {
  return publishedDate(item).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function fileSafeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'east-v-west-newsletter';
}
