/** Readable text color (#111 or #fff) for a hex background. */
export function readableOn(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.6 ? '#111111' : '#ffffff';
}

export const BRACKET_MATCH_H = 108;
export const BRACKET_GAP = 24;
export const BRACKET_CONN_W = 44;
export const BRACKET_HEADER_H = 28;

export function bracketCardTopY(ri: number, gi: number): number {
  const mt1 = ri === 0 ? 0 : ((BRACKET_MATCH_H + BRACKET_GAP) * Math.pow(2, ri - 1)) / 2;
  const mtN = ri === 0 ? BRACKET_GAP : ((BRACKET_MATCH_H + BRACKET_GAP) * Math.pow(2, ri - 1));
  return mt1 + gi * (BRACKET_MATCH_H + mtN);
}

export function bracketColHeight(ri: number, n: number): number {
  const mt1 = ri === 0 ? 0 : ((BRACKET_MATCH_H + BRACKET_GAP) * Math.pow(2, ri - 1)) / 2;
  const mtN = ri === 0 ? BRACKET_GAP : ((BRACKET_MATCH_H + BRACKET_GAP) * Math.pow(2, ri - 1));
  return mt1 + n * BRACKET_MATCH_H + Math.max(0, n - 1) * mtN;
}

export const WINNERS_FINAL_LABELS = ['Championship', '3rd Place Game', '5th Place Game'];
export const LOSERS_FINAL_LABELS = ['8th Place Game', '10th Place Game', '12th Place Game', 'Last Place Game'];

export function winnersRoundLabel(r: number, totalRounds: number): string {
  if (r === totalRounds) return 'Finals';
  if (r === totalRounds - 1) return 'Semifinals';
  return 'First Round';
}

export function losersRoundLabel(r: number, totalRounds: number, rIdx: number): string {
  if (r === totalRounds) return 'Final Places';
  return `Consolation Round ${rIdx + 1}`;
}
