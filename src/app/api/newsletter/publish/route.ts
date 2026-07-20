/**
 * Newsletter Publish Endpoint
 *
 * Publishing and announcing are separate recoverable states. A Discord outage no
 * longer makes a successful public publish look like a failed publish; the exact
 * issue remains eligible for a resend without being republished or duplicated.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { and, desc, eq } from 'drizzle-orm';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { loadNewsletter, loadNewsletterById, publishNewsletter } from '@/server/db/newsletter-queries';
import {
  buildNewsletterEmbed,
  buildNewsletterUrl,
  normalizeSiteUrl,
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

function resolvePublicSiteUrl(req: NextRequest): string {
  const configured = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://east-v-west.com');
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
  const requestOrigin = normalizeSiteUrl(forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.nextUrl.origin);
  return requestOrigin.endsWith('.vercel.app') || requestOrigin.includes('localhost') ? configured : requestOrigin;
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function postDiscordWithRetry(
  webhookUrl: string,
  payload: Parameters<typeof postToDiscordWebhook>[1],
): Promise<{ success: boolean; error?: string }> {
  const waits = [0, 1_000, 3_000];
  let lastError = 'unknown error';
  for (let attempt = 0; attempt < waits.length; attempt++) {
    if (waits[attempt] > 0) await sleep(waits[attempt]);
    try {
      const result = await postToDiscordWebhook(webhookUrl, payload);
      if (result.success) return { success: true };
      lastError = result.error ?? `attempt ${attempt + 1} failed`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { success: false, error: lastError };
}

function pendingKey(newsletterId: string): string {
  return `newsletter-pending:${newsletterId}`;
}

async function clearPendingRetry(newsletterId: string): Promise<void> {
  const db = getDb();
  await db.delete(discordNotifications).where(and(
    eq(discordNotifications.notificationType, 'newsletter_published'),
    eq(discordNotifications.dedupeKey, pendingKey(newsletterId)),
  )).catch(() => {});
}

async function markPendingRetry(input: {
  newsletterId: string;
  season: number;
  week: number;
  episodeType: string;
  publicUrl: string;
  error: string;
}): Promise<void> {
  const db = getDb();
  const key = pendingKey(input.newsletterId);
  const existing = await db.select({ id: discordNotifications.id })
    .from(discordNotifications)
    .where(and(
      eq(discordNotifications.notificationType, 'newsletter_published'),
      eq(discordNotifications.dedupeKey, key),
    ))
    .limit(1)
    .catch(() => []);
  if (existing.length > 0) return;
  await db.insert(discordNotifications).values({
    notificationType: 'newsletter_published',
    dedupeKey: key,
    meta: {
      state: 'pending_retry',
      newsletterId: input.newsletterId,
      season: input.season,
      week: input.week,
      episodeType: input.episodeType,
      publicUrl: input.publicUrl,
      error: input.error,
      queuedAt: new Date().toISOString(),
    },
  }).catch(() => {});
}

/** Verify the production newsletter webhook without posting anything. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  /** Legacy identity fallback only. Exact-ID publishing always uses stored finalized HTML. */
  html?: string;
};

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    let target = body.id ? await loadNewsletterById(body.id) : null;

    // Legacy callers may not know the immutable ID. Their HTML may identify the
    // row, but it is never trusted as the content to publish.
    if (!target && body.html) {
      const exactRows = await db.select({ id: newsletters.id }).from(newsletters).where(and(
        eq(newsletters.season, seasonNum),
        eq(newsletters.week, requestedWeek),
        eq(newsletters.html, body.html),
      )).orderBy(desc(newsletters.generatedAt)).limit(1);
      if (exactRows[0]?.id) target = await loadNewsletterById(exactRows[0].id);
    }

    if (!target) {
      const fallback = await loadNewsletter(seasonNum, requestedWeek, { includeDrafts: true });
      if (fallback) target = await loadNewsletterById(fallback.id);
    }
    if (!target) {
      return NextResponse.json({ error: `No newsletter found for Season ${seasonNum} Week ${requestedWeek}. Generate it first.` }, { status: 404 });
    }
    if (target.season !== seasonNum) {
      return NextResponse.json({ error: 'Newsletter id does not belong to the requested season.' }, { status: 400 });
    }

    const episodeType = target.episodeType || 'regular';
    const publicWeek = EPISODE_WEEK_STORAGE[episodeType] ?? target.week;
    if (target.week !== publicWeek) {
      await db.update(newsletters).set({ week: publicWeek, updatedAt: new Date() }).where(eq(newsletters.id, target.id));
      target = { ...target, week: publicWeek };
    }

    // The editor has already saved and finalized the exact row. Reading its HTML
    // from the database prevents a stale React closure from overwriting that work.
    const { found, alreadyPublished } = await publishNewsletter(target.season, target.week, { id: target.id });
    if (!found) return NextResponse.json({ error: 'Newsletter disappeared before it could be published.' }, { status: 409 });

    console.log(`[Publish] ${target.id} published. episode=${episodeType} sendDiscord=${sendDiscord}`);

    let discordPosted = false;
    let discordStatus: 'skipped' | 'posted' | 'already_posted' | 'not_configured' | 'pending_retry' = sendDiscord ? 'pending_retry' : 'skipped';
    let discordSkippedReason: string | null = sendDiscord ? null : 'sendDiscord=false';
    const siteUrl = resolvePublicSiteUrl(req);
    const publicUrl = buildNewsletterUrl(siteUrl, target.id);

    if (!sendDiscord) {
      // An intentional skip must never be picked up by the scheduled recovery job.
      await clearPendingRetry(target.id);
    } else {
      const webhookUrl = process.env.DISCORD_NEWSLETTER_WEBHOOK_URL;
      if (!webhookUrl) {
        discordStatus = 'not_configured';
        discordSkippedReason = 'DISCORD_NEWSLETTER_WEBHOOK_URL is not configured';
        await markPendingRetry({ newsletterId: target.id, season: target.season, week: target.week, episodeType, publicUrl, error: discordSkippedReason });
      } else {
        const dedupeKey = `newsletter:${target.id}`;
        const existing = resendDiscord ? [] : await db.select().from(discordNotifications).where(and(
          eq(discordNotifications.notificationType, 'newsletter_published'),
          eq(discordNotifications.dedupeKey, dedupeKey),
        )).limit(1).catch(() => []);

        if (existing.length > 0) {
          await db.update(newsletters).set({ discordPostedAt: existing[0].postedAt, updatedAt: new Date() }).where(eq(newsletters.id, target.id)).catch(() => {});
          await clearPendingRetry(target.id);
          discordStatus = 'already_posted';
          discordSkippedReason = 'already posted (dedupe)';
        } else {
          const embed = buildNewsletterEmbed({
            season: target.season,
            week: target.week,
            siteUrl,
            newsletterId: target.id,
            episodeType,
            title: target.title,
          });
          const result = await postDiscordWithRetry(webhookUrl, { embeds: [embed] });
          if (result.success) {
            const postedAt = new Date();
            await db.insert(discordNotifications).values({
              notificationType: 'newsletter_published',
              dedupeKey,
              postedAt,
              meta: { newsletterId: target.id, season: target.season, week: target.week, episodeType, publicUrl },
            }).catch(() => {});
            await db.update(newsletters).set({ discordPostedAt: postedAt, updatedAt: postedAt }).where(eq(newsletters.id, target.id)).catch(() => {});
            await clearPendingRetry(target.id);
            discordPosted = true;
            discordStatus = 'posted';
          } else {
            discordStatus = 'pending_retry';
            discordSkippedReason = `Discord announcement pending retry: ${result.error ?? 'unknown error'}`;
            await markPendingRetry({ newsletterId: target.id, season: target.season, week: target.week, episodeType, publicUrl, error: discordSkippedReason });
            console.warn(`[Publish] ${target.id} is public, Discord pending retry: ${discordSkippedReason}`);
          }
        }
      }
    }

    await updateBotMemoryFromPublish(target.season, target.week).catch(error => {
      console.warn('[Publish] Bot memory update failed (non-fatal):', error);
    });

    const announcementPending = sendDiscord && (discordStatus === 'pending_retry' || discordStatus === 'not_configured');
    const message = !sendDiscord
      ? 'Newsletter published successfully. Discord was intentionally skipped.'
      : discordStatus === 'already_posted'
        ? 'Newsletter published successfully. Discord had already been announced, so no duplicate was sent.'
        : discordStatus === 'posted'
          ? 'Newsletter published successfully and announced to Discord.'
          : 'Newsletter published successfully. The Discord announcement is pending and will be retried automatically.';

    return NextResponse.json({
      success: true,
      published: true,
      alreadyPublished,
      newsletterId: target.id,
      publicUrl,
      episodeType,
      week: target.week,
      discordPosted,
      discordStatus,
      discordSkippedReason,
      announcementPending,
      retryAvailable: announcementPending,
      message,
    }, { status: announcementPending ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Publish] Failed to publish newsletter:', message);
    return NextResponse.json({ error: `Failed to publish: ${message}` }, { status: 500 });
  }
}
