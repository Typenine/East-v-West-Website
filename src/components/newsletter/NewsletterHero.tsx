import type { ReactNode } from 'react';
import { LEAGUE_LOGO } from './utils';

export function NewsletterHero({ loading, issueCount, releaseCount }: {
  loading: boolean;
  issueCount: number;
  releaseCount: number;
}) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(125deg,#111827_0%,#182842_52%,#0b5f98_100%)] px-5 py-6 text-white shadow-2xl sm:px-8 sm:py-8">
      <div className="absolute inset-y-0 left-0 w-2 bg-[linear-gradient(#be161e,#ef4444,#0b5f98)]" />
      <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="relative flex items-start gap-4 sm:items-center sm:gap-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 p-2 shadow-lg backdrop-blur sm:h-20 sm:w-20">
          <img src={LEAGUE_LOGO} alt="East v. West logo" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.28em] text-red-200 sm:text-xs">East v. West Newsroom</p>
          <h1 className="text-balance text-3xl font-black leading-tight tracking-tight sm:text-5xl">League Newsletter</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200 sm:text-base">
            Every issue has its own title, direct link, mobile contents menu, and numbered PDF download.
          </p>
        </div>
      </div>
      {!loading && issueCount > 0 && (
        <div className="relative mt-5 flex flex-wrap gap-2 text-xs font-bold text-slate-100">
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">{issueCount} published {issueCount === 1 ? 'issue' : 'issues'}</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">{releaseCount} release {releaseCount === 1 ? 'date' : 'dates'}</span>
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">PDF export enabled</span>
        </div>
      )}
    </section>
  );
}

export function Spinner() {
  return <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[var(--border)] border-t-[#be161e]" />;
}

export function StatusCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-5 py-14 text-center shadow-sm ${className}`}>{children}</div>;
}
