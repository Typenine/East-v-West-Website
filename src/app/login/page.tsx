import { Suspense } from 'react';
import LoginContent from './LoginContent';
import { Card, CardContent } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8"><Card><CardContent>Loading…</CardContent></Card></div>}>
      <LoginContent />
    </Suspense>
  );
}
