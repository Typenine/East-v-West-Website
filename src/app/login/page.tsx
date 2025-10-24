'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import { TEAM_NAMES } from '@/lib/constants/league';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Button from '@/components/ui/Button';
import { useRouter, useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

function LoginContent() {
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const search = useSearchParams();

  const handleLogin = async () => {
    if (!selectedTeam || !pin) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team: selectedTeam, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Login failed');
      const next = search?.get('next') || '/';
      router.push(next);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <Label className="mb-2 block">Select Your Team</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {TEAM_NAMES.map((team) => {
                    const active = selectedTeam === team;
                    const style = getTeamColorStyle(team, 'secondary');
                    return (
                      <button
                        key={team}
                        type="button"
                        onClick={() => setSelectedTeam(team)}
                        className={`rounded-lg border transition hover-lift focus:outline-none focus:ring-2 focus:ring-[var(--accent-strong)] ${active ? 'ring-2 ring-[var(--accent-strong)]' : ''}`}
                        aria-pressed={active}
                      >
                        <div className="p-3 flex flex-col items-center justify-center gap-2">
                          <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center" style={style}>
                            <Image src={getTeamLogoPath(team)} alt={team} width={36} height={36} className="object-contain" />
                          </div>
                          <div className="text-xs text-center line-clamp-2">{team}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label htmlFor="pin" className="mb-2 block">PIN</Label>
                <input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  placeholder="Enter your PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-strong)]"
                />
              </div>

              {error && (
                <div className="text-sm text-red-500" role="alert">{error}</div>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={handleLogin} disabled={!selectedTeam || !pin || loading} variant="primary">
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
                <Button onClick={() => { setSelectedTeam(null); setPin(''); setError(null); }} variant="ghost">
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8"><Card><CardContent>Loading…</CardContent></Card></div>}>
      <LoginContent />
    </Suspense>
  );
}
