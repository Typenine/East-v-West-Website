"use client";

import { createContext, useContext } from "react";

export interface PlayerModalContextValue {
  /** Opens the site-wide player quick-view modal. `name` is an optional label to show while the profile loads. */
  openPlayer: (playerId: string, name?: string) => void;
}

export const PlayerModalContext = createContext<PlayerModalContextValue | null>(null);

/** Returns null when no `PlayerModalProvider` is mounted — callers should fall back to navigation. */
export function usePlayerModal(): PlayerModalContextValue | null {
  return useContext(PlayerModalContext);
}
