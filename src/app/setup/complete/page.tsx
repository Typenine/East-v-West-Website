'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

export default function SetupCompletePage() {
  const router = useRouter();
  const [leagueName, setLeagueName] = useState('Your League');

  useEffect(() => {
    async function loadLeague() {
      try {
        const res = await fetch('/api/setup/status');
        if (res.ok) {
          const data = await res.json();
          if (data.leagueName) {
            setLeagueName(data.leagueName);
          }
        }
      } catch {
        // Ignore
      }
    }
    loadLeague();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)] py-12 px-4 flex items-center justify-center">
      <div className="max-w-xl mx-auto text-center">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500 text-white mb-6">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-[var(--text)] mb-3">
            Setup Complete!
          </h1>
          <p className="text-lg text-[var(--muted)]">
            {leagueName} is ready to go.
          </p>
        </div>

        <Card className="p-6 text-left">
          <h2 className="font-semibold text-[var(--text)] mb-4">Next Steps</h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-xs">1</span>
              <span className="text-[var(--muted)]">
                <strong className="text-[var(--text)]">Share invite links</strong> with your league members so they can claim their teams
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-xs">2</span>
              <span className="text-[var(--muted)]">
                <strong className="text-[var(--text)]">Customize your site</strong> in the admin panel - add more content, tweak settings
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-xs">3</span>
              <span className="text-[var(--muted)]">
                <strong className="text-[var(--text)]">Explore your league</strong> - check out standings, matchups, and history
              </span>
            </li>
          </ul>
        </Card>

        <div className="mt-8 flex gap-4 justify-center">
          <Button
            variant="secondary"
            onClick={() => router.push('/admin')}
          >
            Go to Admin
          </Button>
          <Button onClick={() => router.push('/')}>
            View Your Site
          </Button>
        </div>
      </div>
    </div>
  );
}
