'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

type TradeAudioWindow = Window & {
  __evwTradeAudioCtx?: AudioContext;
  __evwTradeAudioUnlocked?: boolean;
};

function isDraftAudioPath(pathname: string | null | undefined) {
  return Boolean(
    pathname?.startsWith('/draft/overlay') ||
    pathname?.startsWith('/draft/room/team') ||
    pathname?.startsWith('/admin/draft')
  );
}

function getTradeAudioContext() {
  if (typeof window === 'undefined') return null;
  const w = window as TradeAudioWindow;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!w.__evwTradeAudioCtx) w.__evwTradeAudioCtx = new AudioCtx();
  return w.__evwTradeAudioCtx;
}

function unlockDraftAudio() {
  if (typeof window === 'undefined') return;
  const w = window as TradeAudioWindow;
  if (w.__evwTradeAudioUnlocked) return;
  const ctx = getTradeAudioContext();
  if (!ctx) return;

  try {
    void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
    w.__evwTradeAudioUnlocked = true;
  } catch {
    // Some browsers still require a later user gesture; keep the listener active.
  }
}

export default function DraftSystemUpdate150ClientPatch() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isDraftAudioPath(pathname)) return;
    const unlock = () => unlockDraftAudio();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, [pathname]);

  useEffect(() => {
    if (!pathname?.startsWith('/draft/room/team')) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('select, option')) return;

      const selectedRow = target.closest('button.w-full') as HTMLButtonElement | null;
      if (!selectedRow || selectedRow.disabled) return;
      if (!String(selectedRow.className || '').includes('bg-yellow-400/20')) return;

      // Player rows previously only toggled off when the small position badge was clicked.
      // Use that existing inner toggle as the canonical state update so the outer row works too.
      const innerToggle = selectedRow.querySelector('button[type="button"]') as HTMLButtonElement | null;
      if (!innerToggle || innerToggle.disabled || innerToggle.contains(target)) return;

      event.preventDefault();
      event.stopPropagation();
      innerToggle.click();
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [pathname]);

  return null;
}
