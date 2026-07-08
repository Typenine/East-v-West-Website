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

export default function DraftSystemUpdate150ClientPatch() {
  const pathname = usePathname();
  const inFlightRef = useRef(false);
  const submittedOverallRef = useRef<number | null>(null);

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
