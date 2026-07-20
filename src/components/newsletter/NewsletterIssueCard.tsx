'use client';

import { useRef } from 'react';
import NewsletterFrame from './NewsletterFrame';
import { Spinner } from './NewsletterHero';
import type {
  NewsletterData,
  NewsletterFrameHandle,
  NewsletterMeta,
  OutlineItem,
} from './types';
import {
  LEAGUE_LOGO,
  displayIssueTitle,
  episodeLabel,
  formatPublishedTime,
} from './utils';

export default function NewsletterIssueCard({
  issue,
  groupIndex,
  isOpen,
  isLatest,
  data,
  loading,
  error,
  outline,
  pdfLoading,
  onToggle,
  onRetry,
  onDownload,
  onOutline,
  onFrame,
}: {
  issue: NewsletterMeta;
  groupIndex: number;
  isOpen: boolean;
  isLatest: boolean;
  data?: NewsletterData;
  loading: boolean;
  error?: string;
  outline: OutlineItem[];
  pdfLoading: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onDownload: () => void;
  onOutline: (items: OutlineItem[]) => void;
  onFrame: (handle: NewsletterFrameHandle | null) => void;
}) {
  const title = displayIssueTitle(issue);
  const frameRef = useRef<NewsletterFrameHandle | null>(null);

  return (
    <article id={`newsletter-${issue.id}`} className={`scroll-mt-24 overflow-hidden rounded-3xl border bg-[var(--surface)] shadow-sm transition ${isOpen ? 'border-[#0b5f98]/55 shadow-lg' : 'border-[var(--border)] hover:border-[#0b5f98]/35'}`}>
      <div className="flex items-stretch">
        <div className={`w-1.5 shrink-0 ${groupIndex % 2 === 0 ? 'bg-[#be161e]' : 'bg-[#0b5f98]'}`} />
        <button type="button" aria-expanded={isOpen} aria-controls={`newsletter-content-${issue.id}`} onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-4 text-left sm:px-5 sm:py-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[linear-gradient(135deg,rgba(190,22,30,0.10),rgba(11,95,152,0.13))] p-1.5 sm:h-14 sm:w-14">
            <img src={LEAGUE_LOGO} alt="" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#0b5f98]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#3b93cb]">{episodeLabel(issue)}</span>
              {isLatest && <span className="rounded-full bg-[#be161e]/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-red-400">Latest</span>}
            </div>
            <h4 className="text-balance text-base font-black leading-snug text-[var(--text)] sm:text-xl">{title}</h4>
            <p className="mt-1 text-xs text-[var(--muted)]">Season {issue.season} · Published {formatPublishedTime(issue)}</p>
          </div>
          <span className={`shrink-0 text-xl font-bold text-[var(--muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span>
        </button>
      </div>

      {isOpen && (
        <div id={`newsletter-content-${issue.id}`} className="border-t border-[var(--border)]">
          <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max min-w-full items-center gap-2">
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">Jump to</span>
                  {outline.length > 0 ? outline.map(item => (
                    <button key={`${issue.id}-${item.index}`} type="button" onClick={() => frameRef.current?.scrollToSection(item.index)} className="max-w-[220px] shrink-0 truncate rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-bold text-[var(--text)] hover:border-[#0b5f98]/60 hover:text-[#3b93cb]" title={item.label}>
                      {item.index + 1}. {item.label}
                    </button>
                  )) : <span className="text-xs text-[var(--muted)]">Contents load with the issue.</span>}
                </div>
              </div>
              <button type="button" onClick={onDownload} disabled={!data || loading || pdfLoading} className="shrink-0 rounded-xl bg-[linear-gradient(135deg,#be161e,#9f1219)] px-3.5 py-2 text-xs font-black text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm">
                {pdfLoading ? 'Building PDF...' : 'Download PDF'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-14 text-center"><Spinner /><p className="mt-3 text-sm text-[var(--muted)]">Loading {title}...</p></div>
          ) : error && !data ? (
            <div className="px-5 py-12 text-center">
              <p className="font-semibold text-red-400">{error}</p>
              <button type="button" onClick={onRetry} className="mt-4 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--text)]">Try Again</button>
            </div>
          ) : data ? (
            <div>
              {error && <div className="border-b border-red-500/25 bg-red-500/10 px-4 py-2 text-center text-xs font-semibold text-red-400">{error}</div>}
              <NewsletterFrame ref={handle => { frameRef.current = handle; onFrame(handle); }} html={data.html} title={title} onOutline={onOutline} />
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
