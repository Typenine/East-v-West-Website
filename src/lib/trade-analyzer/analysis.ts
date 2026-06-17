/**
 * Trade analysis logic — shared between the web UI and MCP tools.
 * Pure functions; no I/O, no side effects.
 */

export type ValueSource = 'avg' | 'ktc' | 'fc';

export interface TradeAsset {
  key: string;
  name: string;
  position: string;
  nflTeam: string;
  value: number;
  fcValue: number | null;
  ktcValue: number | null;
  age?: number;
  trend: number;
  isPick: boolean;
}

export interface AnalysisResult {
  ratio: number;
  verdict: string;
  winner: 'A' | 'B' | null;
  diff: number;
  effA: number;
  effB: number;
  rawA: number;
  rawB: number;
  sideAGrade: string;
  sideBGrade: string;
  notes: string[];
  counterHint: string | null;
}

export function getDisplayValue(asset: TradeAsset, source: ValueSource): number {
  if (source === 'fc') return asset.fcValue ?? asset.value;
  if (source === 'ktc') return asset.ktcValue ?? asset.value;
  return asset.value;
}

// Winner always caps at 'A' (you got a fair-or-better deal). Loser grade drops as trade tilts.
// Thresholds aligned with verdict bands: 0.95 = Fair, 0.85 = Slight Edge, 0.70 = Uneven.
export function getGradeLetter(ratio: number, isWinner: boolean): string {
  if (ratio >= 0.95) return 'A';          // fair zone — both sides
  if (isWinner) return 'A';              // winner always caps at A
  if (ratio >= 0.85) return 'B+';
  if (ratio >= 0.70) return 'B';
  if (ratio >= 0.55) return 'C+';
  if (ratio >= 0.40) return 'C';
  if (ratio >= 0.30) return 'D';
  return 'F';
}

export function buildPosSummary(assets: TradeAsset[]): string {
  const counts: Record<string, number> = {};
  for (const a of assets) {
    const pos = a.isPick ? 'Pick' : (a.position || '?');
    counts[pos] = (counts[pos] || 0) + 1;
  }
  const order = ['QB', 'RB', 'WR', 'TE', 'K', 'Pick'];
  return [
    ...order.filter((p) => counts[p]).map((p) => `${counts[p]} ${p}`),
    ...Object.keys(counts).filter((p) => !order.includes(p)).map((p) => `${counts[p]} ${p}`),
  ].join(' · ');
}

export function getAvgAge(assets: TradeAsset[]): number | null {
  const ages = assets.filter((a) => !a.isPick && (a.age ?? 0) > 0).map((a) => a.age!);
  if (!ages.length) return null;
  return Math.round((ages.reduce((s, x) => s + x, 0) / ages.length) * 10) / 10;
}

// Stud premium: concentrated value is worth more than equivalent depth.
function studMultiplier(value: number): number {
  if (value >= 8500) return 1.13;
  if (value >= 7000) return 1.09;
  if (value >= 5500) return 1.06;
  if (value >= 4000) return 1.03;
  return 1.0;
}

// Depth discount: additional assets on the same side face clutter/throwaway penalties.
function depthDiscount(idx: number, rawValue: number, sideBest: number): number {
  const posDiscount = idx <= 1 ? 1.0 : idx === 2 ? 0.92 : idx === 3 ? 0.85 : 0.78;
  const ratio = sideBest > 0 ? rawValue / sideBest : 1;
  const valDiscount =
    ratio >= 0.70 ? 1.0
    : ratio >= 0.50 ? 0.94
    : ratio >= 0.30 ? 0.86
    : ratio >= 0.15 ? 0.74
    : 0.62;
  // Only apply the position-order penalty when the asset is meaningfully below the side's best.
  // Near-equal-value pieces (ratio ≥ 0.85) should not be penalized for being "3rd in order".
  const effectivePosPenalty = ratio >= 0.85 ? 1.0 : posDiscount;
  return Math.min(effectivePosPenalty, valDiscount);
}

export function effectiveTotal(
  assets: TradeAsset[],
  source: ValueSource,
  studScale: number = 1,
): { total: number; perPlayer: Map<string, number> } {
  const perPlayer = new Map<string, number>();
  if (!assets.length) return { total: 0, perPlayer };
  const sorted = [...assets].sort((a, b) => getDisplayValue(b, source) - getDisplayValue(a, source));
  const sideBest = getDisplayValue(sorted[0], source);
  let total = 0;
  sorted.forEach((asset, idx) => {
    const raw = getDisplayValue(asset, source);
    const v = raw * studMultiplier(raw * studScale) * depthDiscount(idx, raw, sideBest);
    perPlayer.set(asset.key, Math.round(v));
    total += v;
  });
  return { total: Math.round(total), perPlayer };
}

export function analyzeTrade(
  sideA: TradeAsset[],
  sideB: TradeAsset[],
  source: ValueSource = 'avg',
  studScale: number = 1,
): AnalysisResult {
  const rawA = sideA.reduce((s, a) => s + getDisplayValue(a, source), 0);
  const rawB = sideB.reduce((s, a) => s + getDisplayValue(a, source), 0);

  if (!sideA.length || !sideB.length || (rawA === 0 && rawB === 0)) {
    return {
      ratio: 1, verdict: 'No assets to analyze', winner: null,
      diff: 0, effA: rawA, effB: rawB, rawA, rawB,
      sideAGrade: '—', sideBGrade: '—', notes: [], counterHint: null,
    };
  }

  const effA = effectiveTotal(sideA, source, studScale).total;
  const effB = effectiveTotal(sideB, source, studScale).total;
  const notes: string[] = [];
  const ratio = Math.min(effA, effB) / Math.max(effA, effB, 1);

  const ageA = getAvgAge(sideA);
  const ageB = getAvgAge(sideB);
  if (ageA !== null && ageB !== null && Math.abs(ageA - ageB) >= 2)
    notes.push(`Side ${ageA < ageB ? 'A' : 'B'} gets younger (avg ${Math.min(ageA, ageB).toFixed(1)} vs ${Math.max(ageA, ageB).toFixed(1)})`);

  const winner: 'A' | 'B' | null = effA > effB ? 'A' : effB > effA ? 'B' : null;
  const diff = Math.abs(effA - effB);

  const verdict =
    ratio >= 0.95 ? 'Fair Trade'
    : ratio >= 0.85 ? 'Slight Edge'
    : ratio >= 0.70 ? 'Uneven'
    : 'One-Sided';

  const sideAGrade = getGradeLetter(ratio, winner === 'A' || winner === null);
  const sideBGrade = getGradeLetter(ratio, winner === 'B' || winner === null);

  const counterHint = ratio < 0.85 && winner && diff > 0
    ? `Side ${winner === 'A' ? 'B' : 'A'} is short ~${diff.toLocaleString()} pts. Adding or swapping a player would help balance this.`
    : null;

  return { ratio, verdict, winner, diff, effA, effB, rawA, rawB, sideAGrade, sideBGrade, notes, counterHint };
}
