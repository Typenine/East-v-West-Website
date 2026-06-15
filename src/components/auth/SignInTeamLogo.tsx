'use client';

import { useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { getTeamLogoPath, getTeamColors } from '@/lib/utils/team-utils';
import { teamAccent } from '@/lib/ui/broadcast-styles';

export type SignInTeamLogoSize = 'sm' | 'md' | 'lg' | 'hero';

const SIZE_MAP: Record<
  SignInTeamLogoSize,
  { outer: string; inner: string; px: number; pad: string }
> = {
  sm: { outer: 'h-11 w-11', inner: 'h-8 w-8', px: 32, pad: 'p-1' },
  md: { outer: 'h-16 w-16', inner: 'h-12 w-12', px: 48, pad: 'p-1.5' },
  lg: { outer: 'h-20 w-20', inner: 'h-14 w-14', px: 60, pad: 'p-2' },
  hero: { outer: 'h-28 w-28 sm:h-32 sm:w-32', inner: 'h-20 w-20 sm:h-24 sm:w-24', px: 96, pad: 'p-2.5' },
};

type SignInTeamLogoProps = {
  team: string;
  size?: SignInTeamLogoSize;
  className?: string;
};

export default function SignInTeamLogo({ team, size = 'md', className }: SignInTeamLogoProps) {
  const [failed, setFailed] = useState(false);
  const colors = getTeamColors(team);
  const accent = teamAccent(team);
  const logo = getTeamLogoPath(team);
  const dims = SIZE_MAP[size];

  return (
    <div
      className={['relative shrink-0 rounded-full', dims.outer, className].filter(Boolean).join(' ')}
      style={{
        background: `linear-gradient(145deg, ${colors.secondary} 0%, ${colors.primary} 100%)`,
        boxShadow: `0 0 0 2px ${accent}55, 0 8px 24px ${colors.secondary}44`,
      }}
      aria-hidden="true"
    >
      <div
        className={[
          'absolute inset-[3px] flex items-center justify-center overflow-hidden rounded-full',
          dims.pad,
        ].join(' ')}
        style={{
          background: 'linear-gradient(180deg, rgba(24,29,42,0.95) 0%, rgba(13,17,24,0.98) 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
        }}
      >
        {failed ? (
          <span className="text-xl font-extrabold" style={{ color: accent }}>
            {team.charAt(0).toUpperCase()}
          </span>
        ) : (
          <Image
            src={logo}
            alt=""
            width={dims.px}
            height={dims.px}
            sizes={`${dims.px}px`}
            priority={size === 'hero'}
            className={`${dims.inner} object-contain drop-shadow-sm`}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </div>
  );
}

export function signInTeamTileStyle(team: string, hovered = false): CSSProperties {
  const colors = getTeamColors(team);
  const accent = teamAccent(team);
  return {
    background: `linear-gradient(160deg, ${colors.primary}22 0%, rgba(13,17,24,0.92) 55%, ${colors.secondary}18 100%)`,
    boxShadow: hovered
      ? `inset 0 0 0 1px ${accent}66, 0 6px 20px ${colors.secondary}33, inset 0 3px 0 ${colors.secondary}`
      : `inset 0 0 0 1px ${accent}33, inset 0 3px 0 ${colors.secondary}`,
  };
}

export function signInTeamBannerStyle(team: string): CSSProperties {
  const colors = getTeamColors(team);
  return {
    background: `linear-gradient(90deg, ${colors.secondary}28 0%, ${colors.primary}14 50%, transparent 100%)`,
    borderLeft: `3px solid ${colors.secondary}`,
  };
}
