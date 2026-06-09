/**
 * Newsletter Publish Endpoint
 * Saves an already-generated preview newsletter to the database.
 * Accepts the newsletter JSON + HTML from the client (no re-generation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { saveNewsletter } from '@/server/db/newsletter-queries';
import { postToDiscordWebhook, buildNewsletterEmbed } from '@/lib/utils/discord';
import { updateBotMemoryFromPublish } from '@/lib/newsletter/publish-memory';
import { getDb } from '@/server/db/client';
import { discordNotifications } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Admin auth check
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get('evw_admin')?.value;
  if (!isAdminCookieValue(adminCookie)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { season: number; week: number; newsletter: unknown; html: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { season, week, newsletter, html } = body;

  if (!season || !week || !newsletter || !html) {
    return NextResponse.json({ error: 'Missing required fields: season, week, newsletter, html' }, { status: 400 });
  }

  try {
    const meta = (newsletter as { meta?: { leagueName?: string } }).meta;
    const leagueName = meta?.leagueName || 'East v. West';

    await saveNewsletter(
      Number(season),
      Number(week),
      leagueName,
      newsletter as Parameters<typeof saveNewsletter>[3],
      html,
    );

    console.log(`[Publish] Newsletter saved to DB: Season ${season} Week ${week}`);

    // Discord announcement — single authoritative place for this notification
    const discordWebhookUrl = process.env.DISCORD_NEWSLETTER_WEBHOOK_URL;
    const siteUrl = process.env.SITE_URL || 'https://eastvswest.football';
    if (discordWebhookUrl) {
      try {
        const db = getDb();
        const dedupeKey = `${Number(season)}-${Number(week)}`;
        const existing = await db.select().from(discordNotifications)
          .where(and(eq(discordNotifications.notificationType, 'newsletter_published'), eq(discordNotifications.dedupeKey, dedupeKey)))
          .limit(1).catch(() => []);
        if (existing.length === 0) {
          console.log(`[Publish] Posting Discord embed for Season ${season} Week ${week}`);
          const embed = buildNewsletterEmbed({ season: Number(season), week: Number(week), siteUrl });
          const discordRes = await postToDiscordWebhook(discordWebhookUrl, { embeds: [embed] });
          if (discordRes.success) {
            await db.insert(discordNotifications).values({ notificationType: 'newsletter_published', dedupeKey, meta: { season, week } }).catch(() => {});
            console.log(`[Publish] Discord embed posted — Season ${season} Week ${week}`);
          } else {
            console.warn(`[Publish] Discord post failed: ${discordRes.error}`);
          }
        } else {
          console.log(`[Publish] Discord already posted for Season ${season} Week ${week} — skipping`);
        }
      } catch (discordErr) {
        console.warn('[Publish] Discord notification error (non-fatal):', discordErr);
      }
    }

    // Append editorial corrections to bot memory (non-fatal — runs after Discord webhook)
    await updateBotMemoryFromPublish(Number(season), Number(week));

    return NextResponse.json({ success: true, message: `Season ${season} Week ${week} published successfully.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Publish] Failed to save newsletter:', message);
    return NextResponse.json({ error: `Failed to publish: ${message}` }, { status: 500 });
  }
}
