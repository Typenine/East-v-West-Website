'use client';

import Link from 'next/link';
import { BroadcastPanel } from '@/components/ui/BroadcastPanel';

export default function CompactDraftLink() {
  return (
    <section className="mb-10 sm:mb-12">
      <BroadcastPanel accent="#6366f1" title="Draft Central">
        <p className="text-sm mb-3" style={{ color: 'rgba(233,237,245,0.7)' }}>
          Full draft order, pick ownership, prospect boards, scouting reports,
          and draft-trip details are all in Draft Central.
        </p>
        <Link
          href="/draft"
          className="inline-block rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
          style={{ background: '#6366f1', color: '#fff' }}
        >
          Open Draft Central →
        </Link>
      </BroadcastPanel>
    </section>
  );
}
