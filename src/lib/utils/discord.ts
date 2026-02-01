/**
 * Discord Webhook Utilities
 * Shared helpers for posting to Discord with proper rate limiting and error handling
 */

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
  footer?: { text: string; icon_url?: string };
  thumbnail?: { url: string };
  image?: { url: string };
  author?: { name: string; url?: string; icon_url?: string };
}

export interface DiscordWebhookPayload {
  content?: string;
  embeds?: DiscordEmbed[];
  allowed_mentions?: { parse: string[] };
}

/**
 * Post to a Discord webhook with rate limit handling
 * Returns true if successful, false otherwise
 */
export async function postToDiscordWebhook(
  webhookUrl: string,
  payload: DiscordWebhookPayload
): Promise<{ success: boolean; error?: string }> {
  // Always include allowed_mentions: { parse: [] } for safety
  const safePayload: DiscordWebhookPayload = {
    ...payload,
    allowed_mentions: { parse: [] },
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safePayload),
    });

    if (res.status === 429) {
      // Rate limited - wait and retry once
      const data = await res.json().catch(() => ({}));
      const retryAfter = (data as { retry_after?: number }).retry_after || 5;
      console.log(`[Discord] Rate limited, waiting ${retryAfter}s...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));

      const retry = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(safePayload),
      });

      if (!retry.ok) {
        return { success: false, error: `Retry failed: ${retry.status}` };
      }
      return { success: true };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Build a newsletter published embed
 */
export function buildNewsletterEmbed(options: {
  season: number;
  week: number;
  siteUrl: string;
  highlights?: string[];
}): DiscordEmbed {
  const { season, week, siteUrl, highlights } = options;

  const description = highlights && highlights.length > 0
    ? highlights.map(h => `• ${h}`).join('\n')
    : 'Check out the latest matchup recaps, power rankings, and predictions!';

  return {
    title: `📰 Weekly Newsletter – Week ${week}`,
    description,
    url: `${siteUrl}/newsletter`,
    color: 0xbe161e, // League red color
    fields: [
      {
        name: '📊 What\'s Inside',
        value: '• Matchup Recaps\n• Power Rankings\n• Trade Analysis\n• Next Week Predictions',
        inline: true,
      },
      {
        name: '🔗 Read Now',
        value: `[View Newsletter](${siteUrl}/newsletter)`,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: `Season ${season} • East v. West`,
    },
  };
}

/**
 * Build a trade notification embed
 */
export function buildTradeEmbed(options: {
  isComplete: boolean;
  teams: Array<{ name: string; gets: string[]; gives: string[] }>;
  week: number;
  siteUrl: string;
  timestamp?: Date;
}): DiscordEmbed {
  const { isComplete, teams, week, siteUrl, timestamp } = options;

  const fields: DiscordEmbed['fields'] = [];
  for (const team of teams) {
    const gets = team.gets.length > 0 ? team.gets.join('\n') : 'Nothing';
    const gives = team.gives.length > 0 ? team.gives.join('\n') : 'Nothing';
    fields.push({
      name: `📥 ${team.name} receives`,
      value: gets,
      inline: true,
    });
    fields.push({
      name: `📤 ${team.name} sends`,
      value: gives,
      inline: true,
    });
    // Spacer for layout
    fields.push({ name: '\u200B', value: '\u200B', inline: true });
  }

  return {
    title: isComplete ? '✅ Trade Completed' : '🔔 Trade Accepted',
    description: `A trade has been ${isComplete ? 'completed' : 'accepted'} in the league!`,
    color: isComplete ? 0x00ff00 : 0xffaa00,
    fields,
    timestamp: (timestamp || new Date()).toISOString(),
    footer: {
      text: `Week ${week} • View all trades`,
    },
    url: `${siteUrl}/transactions`,
  };
}
