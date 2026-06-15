'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TEAM_NAMES } from '@/lib/constants/league';
import { getTeamColors } from '@/lib/utils/team-utils';
import { clearLastTeam, getLastTeam, setLastTeam } from '@/lib/auth/last-team';
import { BroadcastPanel, BroadcastSectionLabel } from '@/components/ui/BroadcastPanel';
import { teamAccent, PANEL, broadcastMutedTextStyle } from '@/lib/ui/broadcast-styles';
import Button from '@/components/ui/Button';
import Label from '@/components/ui/Label';
import { Modal } from '@/components/ui/Modal';
import PinPad from '@/components/auth/PinPad';
import SignInTeamLogo, { signInTeamBannerStyle } from '@/components/auth/SignInTeamLogo';
import SignInTeamTile from '@/components/auth/SignInTeamTile';

type Step = 'welcome' | 'pickTeam' | 'enterPin';

export type SignInFormProps = {
  defaultNext?: string;
  onSuccess?: () => void;
  variant?: 'page' | 'embedded';
};

export default function SignInForm({ defaultNext = '/', onSuccess, variant = 'page' }: SignInFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('pickTeam');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const adminRef = useRef<HTMLInputElement | null>(null);

  const activeTeam = selectedTeam;
  const accent = teamAccent(activeTeam);
  const teamColors = activeTeam ? getTeamColors(activeTeam) : null;

  useEffect(() => {
    const last = getLastTeam();
    if (last) {
      setSelectedTeam(last);
      setStep('welcome');
    } else {
      setStep('pickTeam');
    }
    setHydrated(true);
  }, []);

  const handleLogin = useCallback(async () => {
    if (!activeTeam || !pin) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ team: activeTeam, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Login failed');
      setLastTeam(activeTeam);
      onSuccess?.();
      router.push(defaultNext);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [activeTeam, pin, defaultNext, onSuccess, router]);

  const selectTeam = (team: string) => {
    setSelectedTeam(team);
    setPin('');
    setError(null);
    setStep('enterPin');
  };

  const switchTeam = () => {
    clearLastTeam();
    setSelectedTeam(null);
    setPin('');
    setError(null);
    setStep('pickTeam');
  };

  const goBackToPicker = () => {
    setPin('');
    setError(null);
    setStep('pickTeam');
  };

  const handleAdminLogin = async () => {
    if (!adminPin) return;
    try {
      setAdminLoading(true);
      setAdminError(null);
      const r = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: adminPin.trim() }),
      });
      if (!r.ok) throw new Error('Invalid PIN');
      setAdminOpen(false);
      setAdminPin('');
      router.push('/admin/users');
    } catch (e) {
      setAdminError(e instanceof Error ? e.message : 'Admin login failed');
    } finally {
      setAdminLoading(false);
    }
  };

  const onPinFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loading && activeTeam && pin) void handleLogin();
  };

  if (!hydrated) {
    return (
      <BroadcastPanel accent={accent} title="Sign In" bodyClassName="py-8 text-center">
        <p className="text-sm" style={broadcastMutedTextStyle}>Loading…</p>
      </BroadcastPanel>
    );
  }

  const isPicker = step === 'pickTeam';
  const wrapperClass =
    variant === 'page'
      ? isPicker
        ? 'max-w-3xl mx-auto w-full'
        : 'max-w-lg mx-auto w-full'
      : 'w-full';

  return (
    <div className={wrapperClass}>
      <BroadcastPanel
        accent={accent}
        title="Sign In"
        meta={step === 'welcome' ? 'Welcome back' : step === 'enterPin' ? 'Enter PIN' : 'Pick team'}
      >
        <form onSubmit={onPinFormSubmit} className="space-y-5">
          {step === 'welcome' && activeTeam && teamColors ? (
            <div
              className="flex flex-col items-center gap-4 rounded-2xl px-4 py-6 sm:px-6 sm:py-8 text-center"
              style={{
                background: `radial-gradient(ellipse 80% 70% at 50% 0%, ${teamColors.secondary}35 0%, ${teamColors.primary}12 45%, transparent 75%)`,
                boxShadow: `inset 0 0 0 1px ${accent}22`,
              }}
            >
              <SignInTeamLogo team={activeTeam} size="hero" />
              <div>
                <p className="text-xl sm:text-2xl font-extrabold tracking-tight" style={{ color: PANEL.text }}>
                  {activeTeam}
                </p>
                <p className="text-sm mt-1.5" style={{ color: accent }}>
                  Enter your PIN to continue
                </p>
              </div>
              <button
                type="button"
                onClick={switchTeam}
                className="text-sm underline-offset-2 hover:underline min-h-[44px] px-2"
                style={{ color: PANEL.muted }}
              >
                Switch team
              </button>
            </div>
          ) : null}

          {step === 'enterPin' && activeTeam ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={goBackToPicker}
                className="flex items-center gap-2 min-h-[44px] text-sm font-medium transition-colors hover:opacity-80"
                style={{ color: PANEL.muted }}
              >
                <span aria-hidden="true">←</span> Change team
              </button>
              <div
                className="flex items-center gap-4 rounded-xl px-4 py-3"
                style={signInTeamBannerStyle(activeTeam)}
              >
                <SignInTeamLogo team={activeTeam} size="md" />
                <div>
                  <p className="font-bold text-base" style={{ color: PANEL.text }}>
                    {activeTeam}
                  </p>
                  <p className="text-xs mt-0.5 font-medium uppercase tracking-wider" style={{ color: accent }}>
                    Team PIN
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {step === 'pickTeam' ? (
            <div>
              <BroadcastSectionLabel accent={accent}>Select your team</BroadcastSectionLabel>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {TEAM_NAMES.map((team) => (
                  <li key={team} className="list-none">
                    <SignInTeamTile team={team} onSelect={selectTeam} layout="card" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {(step === 'welcome' || step === 'enterPin') && activeTeam ? (
            <div>
              <Label htmlFor="sign-in-pin" className="sr-only">
                PIN
              </Label>
              <PinPad
                id="sign-in-pin"
                value={pin}
                onChange={setPin}
                disabled={loading}
                accent={accent}
              />
            </div>
          ) : null}

          {error ? (
            <div
              className="text-sm font-medium rounded-lg px-3 py-2"
              style={{
                color: 'var(--danger)',
                background: 'rgba(186,16,16,0.12)',
                boxShadow: 'inset 0 0 0 1px rgba(186,16,16,0.25)',
              }}
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {(step === 'welcome' || step === 'enterPin') && activeTeam ? (
            <div
              className="sticky bottom-0 -mx-5 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6"
              style={{
                background: `linear-gradient(to top, ${PANEL.card} 70%, transparent)`,
              }}
            >
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={!pin || loading}
                className="min-h-[48px]"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
            </div>
          ) : null}
        </form>

        <div className="mt-6 pt-4 text-center" style={{ borderTop: `1px solid ${PANEL.hairline}` }}>
          <button
            type="button"
            onClick={() => {
              setAdminOpen(true);
              setTimeout(() => adminRef.current?.focus(), 0);
            }}
            className="text-xs font-medium uppercase tracking-wider min-h-[44px] px-3 transition-opacity hover:opacity-80"
            style={{ color: PANEL.faint }}
          >
            Commissioner sign-in
          </button>
        </div>
      </BroadcastPanel>

      <Modal
        open={adminOpen}
        onClose={() => {
          setAdminOpen(false);
          setAdminPin('');
          setAdminError(null);
        }}
        title="Commissioner sign-in"
        autoFocusPanel={false}
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="admin-pin">Admin PIN</Label>
            <input
              ref={adminRef}
              id="admin-pin"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={12}
              placeholder="Enter admin PIN"
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && adminPin && !adminLoading) void handleAdminLogin();
              }}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 min-h-[44px] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-strong)]"
            />
          </div>
          {adminError ? (
            <div className="text-sm text-[var(--danger)]" role="alert">
              {adminError}
            </div>
          ) : null}
          <div className="flex items-center gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setAdminOpen(false);
                setAdminPin('');
                setAdminError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!adminPin || adminLoading}
              onClick={() => void handleAdminLogin()}
            >
              {adminLoading ? 'Verifying…' : 'Enter'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
