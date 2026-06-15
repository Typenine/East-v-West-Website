import { Suspense } from 'react';
import LoginContent from './LoginContent';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-6 sm:py-8">
          <div className="max-w-lg mx-auto w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center text-sm text-[var(--muted)]">
            Loading…
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
