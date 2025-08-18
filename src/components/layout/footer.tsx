'use client';

import { CURRENT_YEAR, LEAGUE_IDS } from '@/lib/constants/league';

export default function Footer() {
  return (
    <footer className="evw-surface text-[var(--text)] border-t border-[var(--border)] py-6 mt-auto" role="contentinfo" aria-label="Site footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="mb-2 sm:mb-0 text-sm text-[var(--muted)]">
            © {CURRENT_YEAR} East v. West Fantasy Football
          </div>
          <div className="text-sm text-[var(--muted)]">
            League ID: {LEAGUE_IDS.CURRENT}
          </div>
        </div>
      </div>
    </footer>
  );
}
