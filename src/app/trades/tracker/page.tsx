import { Suspense } from 'react';
import TradeTrackerContent from './TrackerContent';
import LoadingState from '@/components/ui/loading-state';

export default function TradeTrackerPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8"><LoadingState message="Loading tracker..." /></div>}>
      <TradeTrackerContent />
    </Suspense>
  );
}
