'use client';

import { Suspense, useRef, useState } from 'react';
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
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const adminRef = useRef<HTMLInputElement | null>(null);
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
        credentials: 'include',
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

  const handleAdminLogin = async () => {
    if (!adminPin) return;
    try {
      setAdminLoading(true);
      setAdminError(null);
      const r = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: adminPin.trim() })
      });
      if (!r.ok) throw new Error('Invalid PIN');
      setAdminOpen(false);
      setAdminPin('');
      // stay on login page; no redirect
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : 'Admin login failed');
    } finally {
      setAdminLoading(false);
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
              <div className="flex items-center justify-center">
                <button
                  type="button"
                  className="w-16 h-16 rounded-full accent-gradient text-on-brand font-bold text-sm shadow hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  aria-label="Admin sign-in"
                  onClick={() => { setAdminOpen(true); setTimeout(() => adminRef.current?.focus(), 0); }}
                  title="Admin"
                >
                  EVW
                </button>
              </div>
              {adminOpen && (
                <div className="evw-surface border border-[var(--border)] rounded-[var(--radius-card)] p-3">
                  <Label htmlFor="admin-pin" className="mb-1 block">Admin PIN</Label>
                  <div className="flex items-center gap-2">
                    <input
                      ref={adminRef}
                      id="admin-pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-strong)]"
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
                      placeholder="Enter admin PIN"
                    />
                    <Button onClick={handleAdminLogin} disabled={!adminPin || adminLoading}>{adminLoading ? 'Verifying…' : 'Enter'}</Button>
                    <Button variant="secondary" onClick={() => { setAdminOpen(false); setAdminPin(''); setAdminError(null); }}>Cancel</Button>
                  </div>
                  {adminError && <div className="text-sm text-[var(--danger)] mt-2">{adminError}</div>}
                </div>
              )}
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
                  name="pin"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]*"
                  maxLength={12}
                  placeholder="Enter your PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
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
