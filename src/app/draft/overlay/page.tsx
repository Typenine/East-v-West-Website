'use client';

import dynamic from 'next/dynamic';

const DraftOverlayLive = dynamic(() => import('@/components/draft-overlay/DraftOverlayLive'), { ssr: false });

/**
 * Full-screen presentation / broadcast view — same animation components and props as the draft room.
 */
export default function DraftOverlayPage() {
  return (
    <div className="fixed inset-0 z-0 min-h-[100dvh] bg-zinc-950">
      <DraftOverlayLive />
    </div>
  );
}
