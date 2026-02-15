import { clearAllPendingTradeBlockEvents } from '@/server/db/queries.fixed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await clearAllPendingTradeBlockEvents();
    return Response.json({ ok: true, message: 'All pending trade block events cleared' });
  } catch (e) {
    console.error('Failed to clear trade block events:', e);
    return Response.json({ error: 'Failed to clear events' }, { status: 500 });
  }
}
