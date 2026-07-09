'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

type MeResp = { authenticated?: boolean; isAdmin?: boolean; claims?: { team?: string } };
type QueueItem = { id: string; name?: string; pos?: string; nfl?: string };
type DraftResp = {
  draft?: {
    id?: string;
    status?: string;
    curOverall?: number;
    onClockTeam?: string | null;
  } | null;
  pendingPick?: { team?: string | null } | null;
};

type TradeAudioWindow = Window & {
  __evwTradeAudioCtx?: AudioContext;
  __evwTradeAudioUnlocked?: boolean;
};

function replaceTextContent() {
  if (typeof document === 'undefined' || !document.body) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const replacements: Array<[string, string]> = [
    ['Instant auto-pick', 'Instant submit'],
    ['Instant — top queued player submitted when time expires', 'Instant — top queued player submits immediately when you are on the clock'],
    ['Top queued player is sent to admin when time expires (within ~3s)', 'Manual queue — no automatic submission'],
  ];

  let node = walker.nextNode();
  while (node) {
    let text = node.textContent || '';
    for (const [from, to] of replacements) text = text.replace(from, to);
    if (text !== node.textContent) node.textContent = text;
    node = walker.nextNode();
  }
}

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
  const inFlightRef = useRef(false);
  const submittedOverallRef = useRef<number | null>(null);

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

  useEffect(() => {
    if (!pathname?.startsWith('/draft/room/team')) return;
    replaceTextContent();
    const observer = new MutationObserver(() => replaceTextContent());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (!pathname?.startsWith('/draft/room/team')) return;
    let cancelled = false;

    async function submitTopQueuedPlayerNow() {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
        const me = (await meRes.json().catch(() => ({}))) as MeResp;
        const team = me?.claims?.team;
        if (!team) return;

        let enabled = false;
        try { enabled = localStorage.getItem(`evw_draft_autopick_${team}`) === 'true'; } catch {}
        if (!enabled) return;

        const draftRes = await fetch('/api/draft', { cache: 'no-store' });
        const draftData = (await draftRes.json().catch(() => ({}))) as DraftResp;
        const draft = draftData?.draft;
        const overall = Number(draft?.curOverall || 0);
        if (!draft || draft.status !== 'LIVE' || draft.onClockTeam !== team || !overall) return;
        if (draftData.pendingPick) return;
        if (submittedOverallRef.current === overall) return;

        const qRes = await fetch('/api/draft', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'queue_get' }),
        });
        const qData = await qRes.json().catch(() => ({}));
        const queue = (Array.isArray(qData?.queue) ? qData.queue : []) as QueueItem[];
        if (!queue.length) return;

        for (const qp of queue) {
          const pickRes = await fetch('/api/draft', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'pick',
              playerId: qp.id,
              playerName: qp.name || qp.id,
              playerPos: qp.pos || null,
              playerNfl: qp.nfl || null,
            }),
          });
          const pickData = await pickRes.json().catch(() => ({}));
          if (pickRes.ok && !pickData?.error) {
            submittedOverallRef.current = overall;
            window.dispatchEvent(new CustomEvent('draft-system-update-150-instant-submit', { detail: { overall, playerId: qp.id } }));
            break;
          }
          if (pickData?.error === 'player_already_picked') continue;
          break;
        }
      } catch {
        // Keep the patch silent during the live draft room.
      } finally {
        inFlightRef.current = false;
      }
    }

    submitTopQueuedPlayerNow();
    const id = window.setInterval(submitTopQueuedPlayerNow, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pathname]);

  return null;
}
