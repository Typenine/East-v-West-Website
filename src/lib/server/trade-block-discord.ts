import { getTeamLogoPath } from '@/lib/utils/team-utils';
import { normalizeSiteUrl, type DiscordEmbed } from '@/lib/utils/discord';
import type { TradeBlockReportResult } from '@/lib/server/trade-block-narrative';

const DISCORD_FIELD_MAX = 1024;
const DISCORD_ASSET_FIELD_TARGET = 900;
const MAX_REMOVED_LINES = 5;
const MAX_NARRATIVE_CHANGES = 4;
const TRADE_BLOCK_PUBLIC_ROOT = 'https://east-v-west-website.vercel.app';

function truncateField(text: string, max = DISCORD_FIELD_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function cappedBulletList(items: string[], maxItems: number): string {
  if (items.length === 0) return '—';
  const visible = items.slice(0, maxItems).map((item) => `• ${item}`);
  const remaining = items.length - visible.length;
  if (remaining > 0) visible.push(`• +${remaining} more removed`);
  return visible.join('\n');
}

function allAssetBulletFields(items: string[]): string[] {
  if (items.length === 0) return [];

  const chunks: string[] = [];
  let current = '';

  for (const item of items) {
    const line = `• ${item}`;
    const candidate = current ? `${current}\n${line}` : line;

    if (candidate.length <= DISCORD_ASSET_FIELD_TARGET) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);
    current = truncateField(line, DISCORD_ASSET_FIELD_TARGET);
  }

  if (current) chunks.push(current);
  return chunks;
}

function summarizeLargeUpdate(report: TradeBlockReportResult): string {
  const parts: string[] = [];
  if (report.added.length > 0) parts.push(`${report.added.length} added`);
  if (report.removed.length > 0) parts.push(`${report.removed.length} removed`);

  if (parts.length === 0) {
    return `${report.teamName} updated its trade preferences.`;
  }

  return `League sources: ${report.teamName} made a trade-block update with ${parts.join(' and ')}. The full trade block is linked below.`;
}

function lookingForValue(report: TradeBlockReportResult): string | null {
  const parts: string[] = [];

  if (report.wantsAfter) {
    parts.push(report.wantsAfter);
  } else if (report.wantsBefore && !report.wantsAfter) {
    parts.push('No written target currently listed.');
  }

  if (report.wantsTagsAdded && report.wantsTagsAdded.length > 0) {
    parts.push(`Seeking: ${report.wantsTagsAdded.join(', ')}`);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

function publicSiteRoot(baseUrl: string): string {
  const normalizedBase = normalizeSiteUrl(baseUrl);
  if (normalizedBase.includes('localhost') || normalizedBase.includes('127.0.0.1')) {
    return normalizedBase;
  }

  // Discord links must stay externally reachable even when the custom domain DNS is broken.
  // Do not trust NEXT_PUBLIC_SITE_URL or VERCEL_PROJECT_PRODUCTION_URL here because either
  // may resolve to the custom east-v-west.com domain.
  return TRADE_BLOCK_PUBLIC_ROOT;
}

export function tradeBlockTeamUrl(baseUrl: string, teamName: string): string {
  const root = publicSiteRoot(baseUrl);
  return `${root}/trades/block?team=${encodeURIComponent(teamName)}`;
}

export function tradeBlockTeamElementId(teamName: string): string {
  return `trade-block-team-${encodeURIComponent(teamName)}`;
}

export function absoluteAssetUrl(baseUrl: string, path: string): string {
  const root = publicSiteRoot(baseUrl);
  return `${root}${path.startsWith('/') ? path : `/${path}`}`;
}

export function buildTradeBlockDiscordEmbed(
  report: TradeBlockReportResult,
  baseUrl: string,
): DiscordEmbed {
  const teamUrl = tradeBlockTeamUrl(baseUrl, report.teamName);
  const logoUrl = absoluteAssetUrl(baseUrl, getTeamLogoPath(report.teamName));

  const fields: NonNullable<DiscordEmbed['fields']> = [];

  const addedFields = allAssetBulletFields(report.added);
  for (let i = 0; i < addedFields.length; i++) {
    fields.push({
      name: i === 0 ? `📤 Added (${report.added.length})` : '📤 Added (continued)',
      value: addedFields[i],
      inline: false,
    });
  }

  if (report.removed.length > 0) {
    fields.push({
      name: `📥 Removed (${report.removed.length})`,
      value: truncateField(cappedBulletList(report.removed, MAX_REMOVED_LINES)),
      inline: false,
    });
  }

  const wants = lookingForValue(report);
  if (wants) {
    fields.push({
      name: '🎯 Looking for',
      value: truncateField(wants),
      inline: false,
    });
  }

  if (report.faabLabel) {
    fields.push({
      name: '💵 FAAB',
      value: report.faabLabel,
      inline: true,
    });
  }

  fields.push({
    name: '🔗 Full trade block',
    value: `[View ${report.teamName}'s trade block](${teamUrl})`,
    inline: false,
  });

  const changeCount = report.added.length + report.removed.length;
  const narrative = changeCount <= MAX_NARRATIVE_CHANGES && report.narrative
    ? report.narrative
    : summarizeLargeUpdate(report);
  const descriptionParts = [narrative];
  if (report.hashtag) descriptionParts.push(report.hashtag);
  const description = descriptionParts.filter(Boolean).join(' ').trim();

  return {
    title: report.title,
    description: description ? truncateField(description, 900) : undefined,
    url: teamUrl,
    color: 0xbe161e,
    author: {
      name: report.teamName,
      icon_url: logoUrl,
    },
    thumbnail: { url: logoUrl },
    fields,
    timestamp: report.updatedAt,
    footer: { text: 'East v. West · Trade Block' },
  };
}
