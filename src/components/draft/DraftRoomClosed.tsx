'use client';

import Link from 'next/link';
import CountdownTimer from '@/components/ui/countdown-timer';
import { NEXT_DRAFT_ROOM_DATE } from '@/lib/draft/access';

export default function DraftRoomClosed() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: 'linear-gradient(135deg, #be161e18 0%, #bf994418 100%), #0a0a0e' }}
    >
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <div className="text-xs font-bold uppercase tracking-[0.28em] text-zinc-500 mb-3">
            East v. West Draft Room
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-3">No Active Draft</h1>
          <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto">
            The 2026 rookie draft is complete. The draft room will reopen for the 2027 East v. West Rookie Draft.
          </p>
        </div>

        <CountdownTimer
          targetDate={NEXT_DRAFT_ROOM_DATE}
          title="Countdown to the 2027 Rookie Draft"
          emphasis
        />

        <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/70 px-5 py-4 text-center">
          <div className="text-white font-bold">Saturday, July 10, 2027 · 1:00 PM ET</div>
          <div className="text-zinc-400 text-sm mt-1">Denver, Colorado</div>
        </div>

        <div className="mt-7 text-center">
          <Link
            href="/draft"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Back to Draft Central
          </Link>
        </div>
      </div>
    </div>
  );
}
