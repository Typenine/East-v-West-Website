'use client';

import { CURRENT_YEAR, LEAGUE_IDS } from '@/lib/constants/league';

export default function Footer() {
  return (
    <footer className="bg-slate-800 text-white py-4 mt-auto" role="contentinfo" aria-label="Site footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <div className="mb-2 sm:mb-0">
            © {CURRENT_YEAR} East v. West Fantasy Football
          </div>
          <div className="text-sm text-gray-300">
            League ID: {LEAGUE_IDS.CURRENT}
          </div>
        </div>
      </div>
    </footer>
  );
}
