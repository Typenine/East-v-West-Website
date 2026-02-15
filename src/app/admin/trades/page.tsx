import { Suspense } from 'react';
import AdminTradesContent from './AdminTradesContent';

export const dynamic = 'force-dynamic';

export default function AdminTradesPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8">Loading…</div>}>
      <AdminTradesContent />
    </Suspense>
  );
}
