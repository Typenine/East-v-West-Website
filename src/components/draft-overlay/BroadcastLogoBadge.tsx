'use client';

/* eslint-disable @next/next/no-img-element -- Draft broadcast logos use existing public files. */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { getTeamColors } from '@/lib/constants/team-colors';
import { getBroadcastLogoUrl, LEAGUE_BROADCAST_LOGO_URL } from '@/lib/constants/broadcast-logos';
import styles from './BroadcastLogoBadge.module.css';

export interface BroadcastLogoBadgeProps {
  teamName?: string | null;
  name?: string;
  src?: string | null;
  kind?: 'team' | 'league' | 'event';
  presentation?: 'board' | 'clock' | 'hero' | 'watermark';
  size?: number;
  primary?: string;
  secondary?: string;
  className?: string;
}

function initials(name: string): string {
  return name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0])
    .slice(0, 3)
    .join('')
    .toUpperCase() || 'EVW';
}

/**
 * Reusable lightweight pseudo-3D broadcast badge. Board cells use CSS rather
 * than 48+ WebGL contexts. Cinematic reveals use DraftPick3DStage, which
 * textures a real 3D badge from the same logo URL.
 */
export default function BroadcastLogoBadge({
  teamName,
  name,
  src,
  kind = 'team',
  presentation = 'board',
  size = 48,
  primary,
  secondary,
  className = '',
}: BroadcastLogoBadgeProps) {
  const resolved = src || getBroadcastLogoUrl({
    teamName: kind === 'team' ? teamName : null,
    league: kind !== 'team',
  }) || (kind === 'team' ? null : LEAGUE_BROADCAST_LOGO_URL);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const colors = teamName ? getTeamColors(teamName) : null;
  const c1 = primary || colors?.primary || '#a4c810';
  const c2 = secondary || colors?.secondary || '#263345';
  const label = name || teamName || 'East v. West';

  useEffect(() => { setFailedSrc(null); }, [resolved]);

  const custom = {
    '--badge-primary': c1,
    '--badge-secondary': c2,
    '--badge-size': `${Math.max(24, Math.min(size, 240))}px`,
  } as CSSProperties;
  return (
    <span
      role="img"
      aria-label={label + ' logo'}
      data-presentation={presentation}
      data-kind={kind}
      className={`${styles.badge} ${className}`}
      style={custom}
      title={presentation === 'board' ? label : undefined}
    >
      <span className={styles.bevel} aria-hidden="true" />
      <span className={styles.face}>
        {!resolved || failedSrc === resolved ? (
          <span className={styles.initials} aria-hidden="true">{initials(label)}</span>
        ) : (
          <img
            key={resolved}
            src={resolved}
            alt=""
            loading={presentation === 'board' ? 'lazy' : 'eager'}
            decoding="async"
            className={styles.logo}
            onError={() => setFailedSrc(resolved)}
          />
        )}
      </span>
      <span className={styles.specular} aria-hidden="true" />
    </span>
  );
}
