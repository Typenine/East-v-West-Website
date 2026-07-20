'use client';

import NewsletterIssueCard from './NewsletterIssueCard';
import { NewsletterHero, Spinner, StatusCard } from './NewsletterHero';
import { useNewsletterArchive } from './useNewsletterArchive';
import { formatReleaseDate } from './utils';

export default function NewsletterArchive() {
  const archive = useNewsletterArchive();

  return (
    <main className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-8 lg:px-8">
      <NewsletterHero
        loading={archive.loading}
        issueCount={archive.issues.length}
        releaseCount={archive.releaseGroups.length}
      />

      {archive.isOffseason && archive.issues.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-[var(--text)]">
          <span className="font-bold text-amber-500">Offseason edition.</span>{' '}
          Special issues and the complete {archive.currentSeason} archive remain available below.
        </div>
      )}

      {archive.loading ? (
        <StatusCard><Spinner /><p className="mt-4 text-sm text-[var(--muted)]">Loading the newsroom...</p></StatusCard>
      ) : archive.catalogError ? (
        <StatusCard className="border-red-500/35 bg-red-500/10">
          <p className="font-semibold text-red-400">{archive.catalogError}</p>
        </StatusCard>
      ) : archive.issues.length === 0 ? (
        <StatusCard>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#be161e,#0b5f98)] text-2xl font-black text-white">EVW</div>
          <h2 className="text-xl font-bold text-[var(--text)]">No published newsletter yet</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">The first {archive.currentSeason} issue will appear here when it is released.</p>
        </StatusCard>
      ) : (
        <div className="space-y-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black tracking-tight text-[var(--text)] sm:text-2xl">Published Issues</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Several issues can remain open when newsletters are released together.</p>
            </div>
            {archive.issues[0] && !archive.openIds.has(archive.issues[0].id) && (
              <button type="button" onClick={archive.openLatest} className="rounded-xl bg-[#be161e] px-4 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-[#9f1219]">
                Open Latest Issue
              </button>
            )}
          </div>

          {archive.releaseGroups.map(group => (
            <section key={group.key} className="space-y-3">
              <div className="border-b border-[var(--border)] pb-2">
                <h3 className="font-extrabold text-[var(--text)]">{formatReleaseDate(group.items[0])}</h3>
                <p className="text-xs text-[var(--muted)]">{group.items.length} {group.items.length === 1 ? 'issue' : 'issues'} released</p>
              </div>

              <div className="space-y-3">
                {group.items.map((issue, groupIndex) => (
                  <NewsletterIssueCard
                    key={issue.id}
                    issue={issue}
                    groupIndex={groupIndex}
                    isOpen={archive.openIds.has(issue.id)}
                    isLatest={issue.id === archive.issues[0]?.id}
                    data={archive.issueData[issue.id]}
                    loading={archive.loadingIds.has(issue.id)}
                    error={archive.issueErrors[issue.id]}
                    outline={archive.outlines[issue.id] ?? []}
                    pdfLoading={archive.pdfIssueId === issue.id}
                    onToggle={() => archive.toggleIssue(issue.id)}
                    onRetry={() => void archive.loadIssue(issue.id)}
                    onDownload={() => void archive.downloadPdf(issue)}
                    onOutline={items => archive.setOutline(issue.id, items)}
                    onFrame={handle => archive.setFrame(issue.id, handle)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="mt-8 rounded-3xl border border-[var(--border)] bg-[linear-gradient(135deg,rgba(190,22,30,0.06),rgba(11,95,152,0.08))] p-5 sm:p-7">
        <h2 className="text-lg font-black text-[var(--text)]">About the Newsletter</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--muted)]">
          East v. West newsletters cover weekly results, trades, power rankings, predictions, draft analysis, and special events. Each issue combines Mason Reed&apos;s reactions and rivalry coverage with Trent Weston&apos;s statistical analysis.
        </p>
      </section>
    </main>
  );
}
