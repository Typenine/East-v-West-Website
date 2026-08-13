import { getTeamLogoPath } from '@/lib/utils/team-utils';
import { normalizeSiteUrl, type DiscordEmbed } from '@/lib/utils/discord';
import type { TradeBlockReportResult } from '@/lib/server/trade-block-narrative';

const DISCORD_FIELD_MAX = 1024;
const MAX_ASSET_LINES = 5;
const MAX_NARRATIVE_CHANGES = 4;

function truncateField(text: string, max = DISCORD_FIELD_MAX): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function bulletList(items: string[], maxItems = MAX_ASSET_LINES): string {
  if (items.length === 0) return '—';
  const visible = items.slice(0, maxItems).map((item) => `• ${item}`);
  const remaining = items.length - visible.length;
  if (remaining > 0) visible.push(`• +${remaining} more on the full trade block`);
  return visible.join('\n');
}

function summarizeLargeUpdate(report: TradeBlockReportResult): string {
  const parts: string[] = [];
  if (report.added.length > 0) parts.push(`${report.added.length} added`);
  if (report.removed.length > 0) parts.push(`${report.removed.length} removed`);

  if (parts.length === 0) {
    return `${report.teamName} updated its trade preferences.`;
  }

  return `League sources: ${report.teamName} made a trade-block update with ${parts.join(' and ')}. The full list is linked below.`;
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
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return normalizeSiteUrl(configured);
  if (baseUrl.includes('vercel.app') || baseUrl.includes('eastvswest.win')) return normalizeSiteUrl();
  return normalizeSiteUrl(baseUrl);
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

  if (report.added.length > 0) {
    fields.push({
      name: `📤 Added (${report.added.length})`,
      value: truncateField(bulletList(report.added)),
      inline: false,
    });
  }

  if (report.removed.length > 0) {
    fields.push({
      name: `📥 Removed (${report.removed.length})`,
      value: truncateField(bulletList(report.removed)),
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

  if (report.contactLabel) {
    fields.push({
      name: '📞 Contact',
      value: report.contactLabel,
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
