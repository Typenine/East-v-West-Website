'use client';

import type { ReactNode } from 'react';
import { PANEL } from '@/lib/ui/broadcast-styles';

const STATUS_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  voting: { color: '#93c5fd', bg: 'rgba(59,130,246,0.14)', border: 'rgba(59,130,246,0.35)' },
  voted_on: { color: '#93c5fd', bg: 'rgba(59,130,246,0.14)', border: 'rgba(59,130,246,0.35)' },
  vote_passed: { color: '#86efac', bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.35)' },
  vote_failed: { color: '#fca5a5', bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.35)' },
  vague: { color: '#fcd34d', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.35)' },
  ballot: { color: '#86efac', bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.35)' },
  category: { color: PANEL.text, bg: 'rgba(255,255,255,0.06)', border: PANEL.hairline },
  endorsement: { color: PANEL.muted, bg: 'rgba(255,255,255,0.04)', border: PANEL.hairline },
  endorsement_ready: { color: '#86efac', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)' },
};

export function SuggestionStatusBadge({
  children,
  variant = 'category',
}: {
  children: ReactNode;
  variant?: keyof typeof STATUS_STYLES;
}) {
  const style = STATUS_STYLES[variant] ?? STATUS_STYLES.category;
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{
        color: style.color,
        background: style.bg,
        boxShadow: `inset 0 0 0 1px ${style.border}`,
      }}
    >
      {children}
    </span>
  );
}

export function TeamTagBadge({ team, color }: { team: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold"
      style={{
        color,
        background: `${color}18`,
        boxShadow: `inset 0 0 0 1px ${color}44`,
      }}
    >
      {team}
    </span>
  );
}
