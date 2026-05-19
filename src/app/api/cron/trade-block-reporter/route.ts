export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * RETIRED: This cron (trade-block-flusher) is superseded by the immediate narrative
 * webhook fired directly from /api/me/trade-block (PUT). No event queue writers remain.
 */
export async function GET() {
  return Response.json({ ok: true, retired: true, message: 'Trade-block-flusher retired; webhook now fires immediately from /api/me/trade-block.' });
}
