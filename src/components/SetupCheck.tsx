'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import LandingPage from '@/app/(landing)/page';

/**
 * Client component that checks if setup is complete.
 * If not, shows the landing page (unless already on a setup page).
 */
export default function SetupCheck({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [setupComplete, setSetupComplete] = useState(true); // Assume complete initially to avoid flash

  useEffect(() => {
    // Skip check if already on setup pages or API routes
    if (pathname?.startsWith('/setup') || pathname?.startsWith('/api')) {
      setChecked(true);
      return;
    }

    async function checkSetup() {
      try {
        const res = await fetch('/api/setup/status');
        if (res.ok) {
          const data = await res.json();
          if (!data.setupCompleted) {
            setSetupComplete(false);
          }
        }
      } catch {
        // If API fails, assume setup is complete (don't block the site)
      }
      setChecked(true);
    }

    checkSetup();
  }, [pathname]);

  // Show loading while checking
  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  // Show landing page if setup not complete
  if (!setupComplete) {
    return <LandingPage />;
  }

  return <>{children}</>;
}
