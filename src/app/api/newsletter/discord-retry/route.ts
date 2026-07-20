import { NextRequest, NextResponse } from 'next/server';
import { and, eq, like } from 'drizzle-orm';
import { isCronAuthorized } from '@/lib/server/cron-auth';
import {
  buildNewsletterEmbed,
  buildNewsletterUrl,
  normalizeSiteUrl,
  postToDiscordWebhook,
} from '@/lib/utils/discord';
import { getDb } from '@/server/db/client';
import { discordNotifications, newsletters } from '@/server/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function resolveSiteUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://east-v-west.com';
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
  const requestOrigin = normalizeSiteUrl(forwardedHost ? `${forwardedProto}://${forwardedHost}` : req.nextUrl.origin);
  return requestOrigin.endsWith('.vercel.app') || requestOrigin.includes('localhost')
    ? normalizeSiteUrl(configured)
    : requestOrigin;
}

async function postWithRetry(webhookUrl: string, payload: Parameters<typeof postToDiscordWebhook>[1]) {
  const waits = [0, 2_000, 8_000];
  let lastError = 'unknown error';
  for (const wait of waits) {
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    try {
      const result = await postToDiscordWebhook(webhookUrl, payload);
      if (result.success) return { success: true as const };
      lastError = result.error ?? lastError;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return { success: false as const, error: lastError };
}

function pendingKey(newsletterId: string): string {
  return `newsletter-pending:${newsletterId}`;
}

async function clearPending(newsletterId: string): Promise<void> {
  const db = getDb();
  await db.delete(discordNotifications).where(and(
    eq(discordNotifications.notificationType, 'newsletter_published'),
    eq(discordNotifications.dedupeKey, pendingKey(newsletterId)),
  )).catch(() => {});
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const webhookUrl = process.env.DISCORD_NEWSLETTER_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ success: false, attempted: 0, error: 'DISCORD_NEWSLETTER_WEBHOOK_URL is not configured' }, { status: 503 });
  }

  const db = getDb();
  // Only explicit publish failures create these markers. Newsletters deliberately
  // published with sendDiscord=false are never eligible for automatic recovery.
  const markers = await db.select().from(discordNotifications).where(and(
    eq(discordNotifications.notificationType, 'newsletter_published'),
    like(discordNotifications.dedupeKey, 'newsletter-pending:%'),
  )).limit(10);

  const siteUrl = resolveSiteUrl(req);
  const results: Array<{ id: string; status: 'posted' | 'repaired' | 'discarded' | 'failed'; error?: string }> = [];

  for (const marker of markers) {
    const meta = marker.meta as Record<string, unknown> | null;
    const newsletterId = typeof meta?.newsletterId === 'string'
      ? meta.newsletterId
      : marker.dedupeKey.slice('newsletter-pending:'.length);
    if (!newsletterId) continue;

    const rows = await db.select().from(newsletters).where(eq(newsletters.id, newsletterId)).limit(1);
    const newsletter = rows[0];
    if (!newsletter || newsletter.status !== 'published') {
      await clearPending(newsletterId);
      results.push({ id: newsletterId, status: 'discarded' });
      continue;
    }

    const postedKey = `newsletter:${newsletter.id}`;
    const existing = await db.select({ id: discordNotifications.id, postedAt: discordNotifications.postedAt })
      .from(discordNotifications)
      .where(and(
        eq(discordNotifications.notificationType, 'newsletter_published'),
        eq(discordNotifications.dedupeKey, postedKey),
      ))
      .limit(1)
      .catch(() => []);

    if (existing.length > 0) {
      await db.update(newsletters).set({ discordPostedAt: existing[0].postedAt, updatedAt: new Date() }).where(eq(newsletters.id, newsletter.id));
      await clearPending(newsletterId);
      results.push({ id: newsletter.id, status: 'repaired' });
      continue;
    }

    const episodeType = newsletter.episodeType || 'regular';
    const publicUrl = buildNewsletterUrl(siteUrl, newsletter.id);
    const embed = buildNewsletterEmbed({
      season: newsletter.season,
      week: newsletter.week,
      siteUrl,
      newsletterId: newsletter.id,
      episodeType,
      title: newsletter.title,
    });
    const posted = await postWithRetry(webhookUrl, { embeds: [embed] });

    if (!posted.success) {
      results.push({ id: newsletter.id, status: 'failed', error: posted.error });
      continue;
    }

    const postedAt = new Date();
    await db.insert(discordNotifications).values({
      notificationType: 'newsletter_published',
      dedupeKey: postedKey,
      postedAt,
      meta: {
        newsletterId: newsletter.id,
        season: newsletter.season,
        week: newsletter.week,
        episodeType,
        publicUrl,
        source: 'scheduled_retry',
      },
    }).catch(() => {});
    await db.update(newsletters).set({ discordPostedAt: postedAt, updatedAt: postedAt }).where(eq(newsletters.id, newsletter.id));
    await clearPending(newsletterId);
    results.push({ id: newsletter.id, status: 'posted' });
  }

  const failed = results.filter(result => result.status === 'failed').length;
  return NextResponse.json({
    success: failed === 0,
    attempted: markers.length,
    posted: results.filter(result => result.status === 'posted').length,
    repaired: results.filter(result => result.status === 'repaired').length,
    discarded: results.filter(result => result.status === 'discarded').length,
    failed,
    results,
  }, { status: failed > 0 ? 207 : 200 });
}
