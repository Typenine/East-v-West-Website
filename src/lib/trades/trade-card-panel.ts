/**
 * Broadcast palette shared by trade cards, trade block cards, and the home/
 * transactions "broadcast" panels. Values resolve to theme-aware CSS variables
 * (defined in globals.css) so the cards flip from dark to light with the theme.
 */
export const TRADE_CARD_PANEL = {
  card: 'var(--panel-card)',
  border: 'var(--panel-border)',
  hairline: 'var(--panel-hairline)',
  headerBg: 'var(--panel-header-bg)',
  text: 'var(--panel-text)',
  muted: 'var(--panel-muted)',
  faint: 'var(--panel-faint)',
  shadow: 'var(--panel-shadow)',
  insetTop: 'var(--panel-inset-top)',
  surface: 'var(--panel-surface)',
  field: 'var(--panel-field)',
  /** Inner-cell tint scale (lighten on dark / darken on light). */
  tintSoft: 'var(--panel-tint-soft)',
  tint: 'var(--panel-tint)',
  tintMedium: 'var(--panel-tint-medium)',
  tintStrong: 'var(--panel-tint-strong)',
  tintStronger: 'var(--panel-tint-stronger)',
} as const;
