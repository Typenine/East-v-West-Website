/**
 * Newsletter Publish Endpoint
 *
 * The only place a newsletter becomes publicly visible. Generation always saves a
 * draft. Publishing targets one exact catalog row, makes it public, and normally
 * announces it to Discord.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { and, desc, eq } from 'drizzle-orm';
import { isAdminCookieValue } from '@/lib/auth/admin';
import {
  loadNewsletter,
  loadNewsletterById,
  markNewsletterDiscordPosted,
  publishNewsletter,
} from '@/server/db/newsletter-queries';
import {
  buildNewsletterEmbed,
  postToDiscordWebhook,
  verifyDiscordWebhook,
} from '@/lib/utils/discord';
import { updateBotMemoryFromPublish } from '@/lib/newsletter/publish-memory';
import { EPISODE_WEEK_STORAGE } from '@/lib/newsletter/queue-target';
import { getDb } from '@/server/db/client';
import { discordNotifications, newsletters } from '@/server/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminCookieValue(cookieStore.get('evw_admin')?.value);
}

/**
 * Verify the production newsletter webhook without posting anything.
 * The admin catalog uses this for a launch-readiness status indicator.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const health = await verifyDiscordWebhook(process.env.DISCORD_NEWSLETTER_WEBHOOK_URL);
  return NextResponse.json({
    success: health.configured && health.reachable,
    configured: health.configured,
    reachable: health.reachable,
    status: health.status ?? null,
    error: health.error ?? null,
    message: !health.configured
      ? 'Newsletter Discord webhook is not configured in production.'
      : health.reachable
        ? 'Newsletter Discord webhook is configured and reachable. No message was sent.'
        : `Newsletter Discord webhook is configured but could not be reached${health.error ? `: ${health.error}` : '.'}`,
  });
}

type PublishBody = {
  season: number;
  week: number;
  id?: string;
  sendDiscord?: boolean;
  resendDiscord?: boolean;
  html?: string;
};

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: PublishBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const seasonNum = Number(body.season);
  const requestedWeek = Number(body.week);
  const sendDiscord = body.sendDiscord !== false;
  const resendDiscord = body.resendDiscord === true;

  if (!Number.isFinite(seasonNum) || !Number.isFinite(requestedWeek)) {
    return NextResponse.json({ error: 'Missing or invalid required fields: season, week' }, { status: 400 });
  }

  try {
    const db = getDb();

    // Resolve the exact target before changing anything. Catalog actions send an id.
    // Direct post-generation publishing sends the rendered HTML, so match that exact
    // saved draft before falling back to the newest row in the slot.
    let target = body.id ? await loadNewsletterById(body.id) : null;

    if (!target && body.html) {
      const exactRows = await db
        .select({ id: newsletters.id })
        .from(newsletters)
        .where(and(
          eq(newsletters.season, seasonNum),
          eq(newsletters.week, requestedWeek),
          eq(newsletters.html, body.html),
        ))
        .orderBy(desc(newsletters.generatedAt))
        .limit(1);
      if (exactRows[0]?.id) target = await loadNewsletterById(exactRows[0].id);
    }

    if (!target) {
      const fallback = await loadNewsletter(seasonNum, requestedWeek, { includeDrafts: true });
      if (fallback) target = await loadNewsletterById(fallback.id);
    }

    if (!target) {
      return NextResponse.json({
        error: `No newsletter found for Season ${seasonNum} Week ${requestedWeek}. Generate it first.`,
      }, { status: 404 });
    }

    if (target.season !== seasonNum) {
      return NextResponse.json({ error: 'Newsletter id does not belong to the requested season.' }, { status: 400 });
    }

    const episodeType = target.episodeType || 'regular';
    const publicWeek = EPISODE_WEEK_STORAGE[episodeType] ?? target.week;

    // Manual weekless generation historically used week 0. Move that exact row to
    // its permanent public/archive slot before publishing so pre-draft, post-draft,
    // preseason, and offseason issues never collide.
    if (target.week !== publicWeek) {
      await db
        .update(newsletters)
        .set({ week: publicWeek, updatedAt: new Date() })
        .where(eq(newsletters.id, target.id));
      target = { ...target, week: publicWeek };
    }

    const { found, alreadyPublished } = await publishNewsletter(target.season, target.week, {
      id: target.id,
      html: body.html,
    });

    if (!found) {
      return NextResponse.json({ error: 'Newsletter disappeared before it could be published.' }, { status: 409 });
    }

    console.log(`[Publish] ${target.id} published. episode=${episodeType} sendDiscord=${sendDiscord}`);

    let discordPosted = false;
    let discordSatisfied = !sendDiscord;
    let discordStatus: 'skipped' | 'posted' | 'already_posted' | 'not_configured' | 'failed' = sendDiscord ? 'failed' : 'skipped';
    let discordSkippedReason: string | null = sendDiscord ? null : 'sendDiscord=false';

    if (sendDiscord) {
      const webhookUrl = process.env.DISCORD_NEWSLETTER_WEBHOOK_URL;
      const siteUrl = process.env.SITE_URL || 'https://east-v-west.com';

      if (!webhookUrl) {
        discordStatus = 'not_configured';
        discordSkippedReason = 'DISCORD_NEWSLETTER_WEBHOOK_URL is not configured';
      } else {
        try {
          // Dedupe by immutable newsletter id, not season-week. Weekless editions can
          // therefore be announced independently and republishing the same issue stays safe.
          const dedupeKey = `newsletter:${target.id}`;
          const existing = resendDiscord
            ? []
            : await db
                .select()
                .from(discordNotifications)
                .where(and(
                  eq(discordNotifications.notificationType, 'newsletter_published'),
                  eq(discordNotifications.dedupeKey, dedupeKey),
                ))
                .limit(1)
                .catch(() => []);

          if (existing.length > 0) {
            // Repair the newsletter row if the webhook succeeded previously but its
            // timestamp write failed. Do not send a duplicate message.
            await markNewsletterDiscordPosted(target.season, target.week);
            discordStatus = 'already_posted';
            discordSatisfied = true;
            discordSkippedReason = 'already posted (dedupe)';
          } else {
            const embed = buildNewsletterEmbed({
              season: target.season,
              week: target.week,
              siteUrl,
              episodeType,
              title: target.title,
            });
            const result = await postToDiscordWebhook(webhookUrl, { embeds: [embed] });

            if (result.success) {
              await db.insert(discordNotifications).values({
                notificationType: 'newsletter_published',
                dedupeKey,
                meta: {
                  newsletterId: target.id,
                  season: target.season,
                  week: target.week,
                  episodeType,
                },
              }).catch(() => {});
              await markNewsletterDiscordPosted(target.season, target.week);
              discordPosted = true;
              discordSatisfied = true;
              discordStatus = 'posted';
            } else {
              discordStatus = 'failed';
              discordSkippedReason = `Discord post failed: ${result.error ?? 'unknown error'}`;
            }
          }
        } catch (discordError) {
          discordStatus = 'failed';
          discordSkippedReason = `Discord notification error: ${discordError instanceof Error ? discordError.message : String(discordError)}`;
          console.warn('[Publish] Discord notification failed:', discordError);
        }
      }
    }

    // Editorial-memory updates must never change the publish result.
    await updateBotMemoryFromPublish(target.season, target.week).catch(error => {
      console.warn('[Publish] Bot memory update failed (non-fatal):', error);
    });

    if (sendDiscord && !discordSatisfied) {
      const error = `Newsletter is public, but Discord was not sent: ${discordSkippedReason ?? 'unknown error'}.`;
      return NextResponse.json({
        success: false,
        published: true,
        alreadyPublished,
        newsletterId: target.id,
        episodeType,
        week: target.week,
        discordPosted,
        discordStatus,
        discordSkippedReason,
        error,
        message: error,
      }, { status: discordStatus === 'not_configured' ? 503 : 502 });
    }

    const message = !sendDiscord
      ? 'Newsletter published successfully. Discord was intentionally skipped.'
      : discordStatus === 'already_posted'
        ? 'Newsletter published successfully. Discord had already been announced, so no duplicate was sent.'
        : 'Newsletter published successfully and announced to Discord.';

    return NextResponse.json({
      success: true,
      published: true,
      alreadyPublished,
      newsletterId: target.id,
      episodeType,
      week: target.week,
      discordPosted,
      discordStatus,
      discordSkippedReason,
      message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Publish] Failed to publish newsletter:', message);
    return NextResponse.json({ error: `Failed to publish: ${message}` }, { status: 500 });
  }
}
