import { NextRequest, NextResponse } from 'next/server';
import { getTradeSubgraphByRoot, RootSelector } from '@/lib/utils/trade-graph';
import { fetchTradesAllTime } from '@/lib/utils/trades';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const rootType = searchParams.get('rootType');
    const depthParam = searchParams.get('depth');
    const depth = depthParam ? Math.max(1, Math.min(6, Number(depthParam) || 2)) : 2;

    let root: RootSelector | null = null;

    if (rootType === 'player') {
      const playerId = searchParams.get('playerId') || '';
      if (!playerId) {
        return NextResponse.json({ error: 'Missing playerId' }, { status: 400 });
      }
      root = { type: 'player', playerId };
    } else if (rootType === 'pick') {
      const season = searchParams.get('season') || '';
      const round = Number(searchParams.get('round'));
      const slot = Number(searchParams.get('slot'));
      if (!season || !Number.isFinite(round) || !Number.isFinite(slot)) {
        return NextResponse.json({ error: 'Missing or invalid pick parameters: season, round, slot' }, { status: 400 });
      }
      root = { type: 'pick', season, round, slot };
    } else {
      return NextResponse.json({ error: 'Missing or invalid rootType. Use player|pick' }, { status: 400 });
    }

    const trades = await fetchTradesAllTime();
    const graph = getTradeSubgraphByRoot(trades, root, { depth });

    return NextResponse.json({ graph, meta: { depth } }, { status: 200 });
  } catch (err) {
    console.error('Trade Tree API error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
