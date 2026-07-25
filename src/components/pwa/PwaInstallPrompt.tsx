'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

type InstallChoice = {
  outcome: 'accepted' | 'dismissed';
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

const DISMISSED_AT_KEY = 'evw-pwa-install-dismissed-at';
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}

function recentlyDismissed(): boolean {
  try {
    const dismissedAt = Number(window.localStorage.getItem(DISMISSED_AT_KEY) || 0);
    return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
  } catch {
    // Installation still works when storage is unavailable.
  }
}

export default function PwaInstallPrompt() {
  const pathname = usePathname();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<'native' | 'ios' | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (pathname !== '/') return;
    if (isStandalone() || recentlyDismissed()) return;
    if (!window.matchMedia('(max-width: 767px)').matches) return;

    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    let iosTimer: number | undefined;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setMode('native');
      setVisible(true);
    };

    const handleInstalled = () => {
      setVisible(false);
      setInstallPrompt(null);
      setMode(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    if (isIos) {
      iosTimer = window.setTimeout(() => {
        setMode('ios');
        setVisible(true);
      }, 1600);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      if (iosTimer !== undefined) window.clearTimeout(iosTimer);
    };
  }, [pathname]);

  if (!visible || !mode || pathname !== '/') return null;

  const dismiss = () => {
    rememberDismissal();
    setVisible(false);
  };

  const install = async () => {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'dismissed') rememberDismissal();
    setVisible(false);
    setInstallPrompt(null);
  };

  return (
    <aside
      aria-label="Install East v. West app"
      className="fixed left-3 right-3 z-[80] md:hidden"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl">
        <Image
          src="/assets/teams/East v West Logos/Official East v. West Logo.png"
          alt=""
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-xl object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[var(--text)]">Install East v. West</p>
          <p className="mt-0.5 text-xs leading-5 text-[var(--muted)]">
            {mode === 'ios'
              ? 'Tap the Share button, then choose Add to Home Screen.'
              : 'Add the league to your home screen for a full-screen app experience.'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            {mode === 'native' ? (
              <button
                type="button"
                onClick={() => void install()}
                className="min-h-10 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white"
              >
                Install
              </button>
            ) : (
              <button
                type="button"
                onClick={dismiss}
                className="min-h-10 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white"
              >
                Got it
              </button>
            )}
            {mode === 'native' ? (
              <button
                type="button"
                onClick={dismiss}
                className="min-h-10 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
              >
                Not now
              </button>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
        >
          ×
        </button>
      </div>
    </aside>
  );
}
