import { Suspense } from 'react';
import HistoryContent from './HistoryContent';

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8">Loading...</div>}>
      <HistoryContent />
    </Suspense>
  );
}
