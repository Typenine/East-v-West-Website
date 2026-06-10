/**
 * View models for the broadcast-style trade cards.
 *
 * These are precomputed server-side (see src/server/trade-feed.ts) so the
 * client renders cards without any data transformation: every label, logo
 * path, and accent color is resolved before it reaches the browser.
 *
 * This module must stay client-safe (no server imports).
 */

export type TradeCardAssetKind = 'player' | 'pick' | 'faab';

export type TradeCardAsset = {
  kind: TradeCardAssetKind;
  /** Position chip text: "WR", "PICK", "FAAB", ... */
  badge: string;
  /** Primary line: "Justin Jefferson", "2026 1st Round Pick", "$23 FAAB" */
  label: string;
  /** Secondary line: NFL team, pick outcome, etc. */
  sub?: string;
  /** Original owner of a traded pick, when different from the receiving team */
  originalOwner?: string;
  /** Team that sent this asset — set on 3+ team trades so routing is explicit */
  fromTeam?: string;
  /** Deep link into the asset tracker, when resolvable */
  trackHref?: string;
  // Filter metadata
  position?: string;
  round?: number;
  becamePosition?: string;
};

export type TradeCardTeam = {
  name: string;
  /** Resolved logo URL (league asset path) */
  logo: string;
  /** Team color adjusted to stay readable on the dark card panel */
  accent: string;
  assets: TradeCardAsset[];
};

export type TradeCardModel = {
  id: string;
  /** ISO date YYYY-MM-DD (sorting/filtering) */
  date: string;
  /** Preformatted display date, e.g. "Nov 12, 2025" */
  dateLabel: string;
  season?: string;
  week: number | null;
  status: 'completed' | 'pending' | 'vetoed';
  teams: TradeCardTeam[];
};

export type TradeFeedPayload = {
  generatedAt: number;
  trades: TradeCardModel[];
};

// ---------------------------------------------------------------------------
// Accent color resolution
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return null;
  return [r, g, b];
}

function perceivedLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function mixWithWhite(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#9CA3AF';
  const mix = rgb.map((c) => Math.round(c + (255 - c) * amount));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Pick the first team color that reads well against the dark card panel.
 * Very dark colors (e.g. near-black primaries) are skipped; if every color is
 * too dark, the primary is lightened instead. Keeps team identity without
 * letting colors hurt readability.
 */
export function readableAccentOnDark(colors: {
  primary: string;
  secondary?: string;
  tertiary?: string;
  quaternary?: string;
}): string {
  const candidates = [colors.primary, colors.secondary, colors.tertiary, colors.quaternary]
    .filter((c): c is string => Boolean(c));
  for (const c of candidates) {
    const lum = perceivedLuminance(c);
    if (lum >= 0.22 && lum <= 0.93) return c;
  }
  return mixWithWhite(colors.primary, 0.55);
}
