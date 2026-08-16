"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayerModalContext, type PlayerModalContextValue } from "@/components/players/PlayerModalContext";
import PlayerQuickViewModal from "@/components/players/PlayerQuickViewModal";

/**
 * Mounted once near the root of the app (see layout.tsx). Owns the open/closed state for the
 * site-wide player quick-view modal so any component can call `usePlayerModal().openPlayer(id)`
 * without threading modal state through props.
 *
 * The modal is also the default destination for ordinary same-tab links to `/players/[id]`.
 * That keeps legacy/direct player links consistent with the shared PlayerLink component while
 * preserving modifier-clicks, new-tab links, and explicit full-profile links as navigation.
 */
export default function PlayerModalProvider({ children }: { children: React.ReactNode }) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [name, setName] = useState<string | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const openPlayer = useCallback((id: string, label?: string) => {
    setPlayerId(id);
    setName(label);
    setOpen(true);
  }, []);

  const onClose = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    const handlePlayerLinkClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      if (anchor.dataset.playerProfileFull === "true") return;
      if (anchor.target && anchor.target !== "_self") return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      const match = url.pathname.match(/^\/players\/([^/]+)\/?$/);
      if (!match) return;

      let id: string;
      try {
        id = decodeURIComponent(match[1]);
      } catch {
        id = match[1];
      }
      if (!id) return;

      event.preventDefault();
      openPlayer(id, anchor.textContent?.trim() || undefined);
    };

    document.addEventListener("click", handlePlayerLinkClick);
    return () => document.removeEventListener("click", handlePlayerLinkClick);
  }, [openPlayer]);

  const value = useMemo<PlayerModalContextValue>(() => ({ openPlayer }), [openPlayer]);

  return (
    <PlayerModalContext.Provider value={value}>
      {children}
      <PlayerQuickViewModal open={open} onClose={onClose} playerId={playerId} name={name} />
    </PlayerModalContext.Provider>
  );
}
