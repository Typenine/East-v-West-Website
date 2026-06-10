import { Suspense } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { TradeCardSkeleton } from '@/components/trades/TradeCard';
import { getTradeFeed } from '@/server/trade-feed';
import type { TradeFeedPayload } from '@/lib/trades/trade-card-model';
import TradesFeedClient from './TradesFeedClient';

// The heavy Sleeper aggregation runs server-side (cached in-memory with
// stale-while-revalidate). ISR keeps the rendered page fast: visitors get
// cached HTML with the cards already in it while regeneration happens in
// the background.
export const revalidate = 60;

function TradesSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Trades" />
      <div className="space-y-5" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading trades…</span>
        {Array.from({ length: 3 }).map((_, i) => (
          <TradeCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

async function TradesFeed() {
  let feed: TradeFeedPayload;
  try {
    feed = await getTradeFeed();
  } catch {
    // Render the shell with an empty payload; the client refreshes in the
    // background and surfaces a retry action if the data stays unavailable.
    feed = { generatedAt: 0, trades: [] };
  }
  return <TradesFeedClient initialFeed={feed} />;
}

export default function TradesPage() {
  return (
    <Suspense fallback={<TradesSkeleton />}>
      <TradesFeed />
    </Suspense>
  );
}
