'use client';

import { useSearchParams } from 'next/navigation';
import SignInForm from '@/components/auth/SignInForm';

export const dynamic = 'force-dynamic';

export default function LoginContent() {
  const search = useSearchParams();
  const next = search?.get('next') || '/';

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      <SignInForm defaultNext={next} variant="page" />
    </div>
  );
}
