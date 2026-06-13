import { Suspense } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import TradeBlockTab from '@/components/trades/TradeBlockTab';
import { TradeCardSkeleton } from '@/components/trades/TradeCard';

export default function TradeBlockPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <SectionHeader title="Trade Block" />
          <div className="space-y-5" role="status" aria-live="polite" aria-busy="true">
            <TradeCardSkeleton />
            <TradeCardSkeleton />
          </div>
        </div>
      }
    >
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Trade Block" />
        <TradeBlockTab />
      </div>
    </Suspense>
  );
}
