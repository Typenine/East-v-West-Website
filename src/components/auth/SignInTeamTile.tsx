'use client';

import { useState } from 'react';
import SignInTeamLogo, { signInTeamTileStyle } from '@/components/auth/SignInTeamLogo';
import { teamAccent, PANEL } from '@/lib/ui/broadcast-styles';

type SignInTeamTileProps = {
  team: string;
  onSelect: (team: string) => void;
  layout?: 'card' | 'row';
};

export default function SignInTeamTile({ team, onSelect, layout = 'card' }: SignInTeamTileProps) {
  const [hovered, setHovered] = useState(false);
  const accent = teamAccent(team);

  if (layout === 'row') {
    return (
      <button
        type="button"
        onClick={() => onSelect(team)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-3 min-h-[56px] text-left transition-all duration-200 hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        style={signInTeamTileStyle(team, hovered)}
      >
        <SignInTeamLogo team={team} size="sm" />
        <span className="text-sm font-semibold leading-tight" style={{ color: PANEL.text }}>
          {team}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(team)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex w-full flex-col items-center gap-2.5 rounded-xl px-3 py-4 min-h-[120px] text-center transition-all duration-200 hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      style={signInTeamTileStyle(team, hovered)}
    >
      <SignInTeamLogo team={team} size="md" />
      <span
        className="text-xs sm:text-sm font-semibold leading-snug line-clamp-2 px-1"
        style={{ color: PANEL.text }}
      >
        {team}
      </span>
      <span
        className="h-0.5 w-8 rounded-full"
        style={{ background: accent }}
        aria-hidden="true"
      />
    </button>
  );
}
