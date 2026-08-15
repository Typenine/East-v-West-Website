"use client";

import Link from 'next/link';
import { AnchorHTMLAttributes, MouseEvent } from 'react';
import { usePlayerModal } from '@/components/players/PlayerModalContext';

export type PlayerLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  /** Sleeper player id — the canonical, roster/name-independent identifier. */
  playerId: string;
  /** Display name (or any node) to render as the link's contents. */
  children: React.ReactNode;
  /** When true, renders plain text (no link) — useful when playerId is unknown/missing. */
  disabled?: boolean;
};

/**
 * Shared, lightweight link to a player's canonical profile at `/players/[playerId]`.
 *
 * When a `PlayerModalProvider` is mounted (it is, site-wide, via layout.tsx), a plain left
 * click opens the player quick-view modal instead of navigating — modifier-clicks (cmd/ctrl,
 * shift, middle-click) still navigate normally so "open in new tab" keeps working. Without a
 * provider mounted (or with JS disabled), this degrades to a normal link to the profile page.
 *
 * Intentionally does no data fetching of its own — it only needs a player id and a
 * name/label to render, so it's safe to use inside large loops (rosters, lineups,
 * draft boards, transaction lists, etc.) without any performance cost.
 */
export default function PlayerLink({ playerId, children, disabled, className, onClick, ...props }: PlayerLinkProps) {
  const modal = usePlayerModal();

  if (disabled || !playerId) {
    return <span className={className}>{children}</span>;
  }
  const classes = ['hover:underline underline-offset-2', className].filter(Boolean).join(' ');

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || !modal) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    modal.openPlayer(playerId, typeof children === 'string' ? children : undefined);
  };

  return (
    <Link href={`/players/${encodeURIComponent(playerId)}`} className={classes} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
