import Link from 'next/link';
import { AnchorHTMLAttributes } from 'react';

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
 * Intentionally does no data fetching of its own — it only needs a player id and a
 * name/label to render, so it's safe to use inside large loops (rosters, lineups,
 * draft boards, transaction lists, etc.) without any performance cost.
 */
export default function PlayerLink({ playerId, children, disabled, className, ...props }: PlayerLinkProps) {
  if (disabled || !playerId) {
    return <span className={className}>{children}</span>;
  }
  const classes = ['hover:underline underline-offset-2', className].filter(Boolean).join(' ');
  return (
    <Link href={`/players/${encodeURIComponent(playerId)}`} className={classes} {...props}>
      {children}
    </Link>
  );
}
