/**
 * Newsletter Publish Endpoint
 * Saves an already-generated preview newsletter to the database.
 * Accepts the newsletter JSON + HTML from the client (no re-generation).
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { saveNewsletter } from '@/server/db/newsletter-queries';

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

    console.log(`[Publish] Newsletter published: Season ${season} Week ${week}`);
    return NextResponse.json({ success: true, message: `Season ${season} Week ${week} published successfully.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Publish] Failed to save newsletter:', message);
    return NextResponse.json({ error: `Failed to publish: ${message}` }, { status: 500 });
  }
}
