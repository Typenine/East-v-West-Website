'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Button from '@/components/ui/Button';
import ErrorState from '@/components/ui/error-state';
import LoadingState from '@/components/ui/loading-state';
import { useRouter } from 'next/navigation';

export default function TradeBlockPage() {
  const [team, setTeam] = useState<string | null>(null);
  const [wants, setWants] = useState('');
  const [offers, setOffers] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const me = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!me.ok) {
          router.push(`/login?next=${encodeURIComponent('/trade-block')}`);
          return;
        }
        const j = await me.json();
        const t = (j?.claims?.team as string) || null;
        if (!t) {
          router.push(`/login?next=${encodeURIComponent('/trade-block')}`);
          return;
        }
        if (cancelled) return;
        setTeam(t);
        const r = await fetch('/api/trade-block', { cache: 'no-store' });
        if (!r.ok) throw new Error('Failed to load');
        const data = await r.json();
        if (!cancelled) {
          setWants(data?.wants || '');
          setOffers(data?.offers || '');
        }
      } catch (e: unknown) {
        if (!cancelled) setError('Unable to load trade block.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [router]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const r = await fetch('/api/trade-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wants, offers }),
      });
      if (!r.ok) throw new Error('Save failed');
    } catch (e: unknown) {
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState message="Loading trade block..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Trade Block {team ? `— ${team}` : ''}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <Label htmlFor="wants" className="mb-1 block">Looking For</Label>
                <textarea
                  id="wants"
                  value={wants}
                  onChange={(e) => setWants(e.target.value)}
                  rows={5}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-strong)]"
                  placeholder="Positions, profiles, picks, etc."
                />
              </div>
              <div>
                <Label htmlFor="offers" className="mb-1 block">Available</Label>
                <textarea
                  id="offers"
                  value={offers}
                  onChange={(e) => setOffers(e.target.value)}
                  rows={6}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-strong)]"
                  placeholder="Players or picks you might move"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleSave} disabled={saving} variant="primary">
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
