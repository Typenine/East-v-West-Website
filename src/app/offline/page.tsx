import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Offline | East v. West',
};

export default function OfflinePage() {
  return (
    <section className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)]">Connection unavailable</p>
        <h1 className="mt-3 text-3xl font-bold text-[var(--text)]">East v. West is offline</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          Live league data, voting, and draft tools require an internet connection. Reconnect and try again.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white"
        >
          Try again
        </Link>
      </div>
    </section>
  );
}
