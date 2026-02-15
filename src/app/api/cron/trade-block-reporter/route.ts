import { NextRequest } from 'next/server';
import { flushTradeBlockEvents } from '@/lib/server/trade-block-flusher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const result = await flushTradeBlockEvents();
    return Response.json({ 
      ok: true, 
      processed: result.processed, 
      sent: result.sent,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error('Trade block reporter cron failed:', e);
    return Response.json({ 
      error: 'Failed to flush events',
      message: e instanceof Error ? e.message : 'Unknown error'
    }, { status: 500 });
  }
}
