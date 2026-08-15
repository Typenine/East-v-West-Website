"use client";

import { useCallback, useMemo, useState } from "react";
import { PlayerModalContext, type PlayerModalContextValue } from "@/components/players/PlayerModalContext";
import PlayerQuickViewModal from "@/components/players/PlayerQuickViewModal";

/**
 * Mounted once near the root of the app (see layout.tsx). Owns the open/closed state for the
 * site-wide player quick-view modal so any component can call `usePlayerModal().openPlayer(id)`
 * without threading modal state through props.
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

  const value = useMemo<PlayerModalContextValue>(() => ({ openPlayer }), [openPlayer]);

  return (
    <PlayerModalContext.Provider value={value}>
      {children}
      <PlayerQuickViewModal open={open} onClose={onClose} playerId={playerId} name={name} />
    </PlayerModalContext.Provider>
  );
}
