import { Suspense } from 'react';
import TradesContent, { TradesSkeletonPage } from './TradesContent';

export default function TradesPage() {
  return (
    <Suspense fallback={<TradesSkeletonPage />}>
      <TradesContent />
    </Suspense>
  );
}
