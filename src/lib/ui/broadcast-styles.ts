import { getTeamColors } from '@/lib/utils/team-utils';
import { readableAccentOnDark } from '@/lib/trades/trade-card-model';
import { TRADE_CARD_PANEL as PANEL } from '@/lib/trades/trade-card-panel';

export { PANEL };

const DEFAULT_ACCENT = '#9CA3AF';

export function teamAccent(team?: string | null): string {
  if (!team) return DEFAULT_ACCENT;
  return readableAccentOnDark(getTeamColors(team));
}

export const broadcastLabelClass =
  'block text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5';
export const broadcastFieldClass =
  'block w-full rounded border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-50';
export const broadcastFieldStyle = {
  background: PANEL.tintMedium,
  borderColor: PANEL.hairline,
  color: PANEL.text,
} as const;
export const broadcastScrollBoxClass = 'max-h-64 overflow-auto space-y-1 rounded border p-2';
export const broadcastScrollBoxStyle = {
  background: PANEL.tintSoft,
  borderColor: PANEL.hairline,
} as const;
export const broadcastMutedTextStyle = { color: PANEL.muted } as const;
export const broadcastFaintTextStyle = { color: PANEL.faint } as const;
export const broadcastBodyTextStyle = { color: PANEL.text } as const;

export function broadcastChipButtonClass(active: boolean): string {
  return [
    'rounded border px-3 py-2 text-sm transition-colors',
    active
      ? 'border-[var(--panel-border)] text-[var(--panel-text)]'
      : 'border-transparent text-[var(--panel-muted)] hover:text-[var(--panel-text)] hover:border-[var(--panel-hairline)]',
  ].join(' ');
}
