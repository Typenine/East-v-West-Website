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


/** Moderate consolidation: keep the strongest asset on each side at market value.
 * Interpolate the value retained by additional assets relative to the best asset
 * in the entire trade, with a modest further discount for deeper pieces.
 */
const RETENTION_CURVE = [[0, 0.25], [0.15, 0.35], [0.30, 0.50], [0.50, 0.70], [0.70, 0.85], [0.85, 0.95], [1, 1]];

function retainedFraction(ratio: number, index: number): number {
  const r = Math.max(0, Math.min(1, ratio));
  const upper = RETENTION_CURVE.findIndex(([x]) => x >= r);
  const [x1, y1] = RETENTION_CURVE[Math.max(0, upper)];
  const [x0, y0] = RETENTION_CURVE[Math.max(0, upper - 1)];
  const quality = x1 === x0 ? y1 : y0 + (y1 - y0) * (r - x0) / (x1 - x0);
  const depth = Math.min(0.18, 0.04 * Math.max(0, index - 1)) * (1 - r);
  return quality * (1 - depth);
}

export function effectiveTotal(
  assets: TradeAsset[],
  source: ValueSource,
  opposingBest: number = 0,
): { total: number; perPlayer: Map<string, number> } {
  const perPlayer = new Map<string, number>();
  if (!assets.length) return { total: 0, perPlayer };
  const sorted = [...assets].sort((a, b) => getDisplayValue(b, source) - getDisplayValue(a, source) || a.key.localeCompare(b.key));
  const raw = sorted.map((asset) => Math.max(0, getDisplayValue(asset, source)));
  const reference = Math.max(raw[0], opposingBest, 1);
  const adjusted = raw.map((v, i) => i === 0 ? v : v * retainedFraction(v / reference, i));
  const rawTotal = raw.reduce((s, v) => s + v, 0);
  const initialTotal = adjusted.reduce((s, v) => s + v, 0);

  // Monotonic safeguard: adding a new highest-value asset must never lower the
  // package total by changing the reference for all existing pieces. The best
  // value of any suffix is a lower bound on the full package. Usually inactive.
  let total = initialTotal;
  for (let start = 1; start < raw.length; start++) {
    const anchor = Math.max(raw[start], opposingBest, 1);
    let candidate = raw[start];
    for (let i = start + 1; i < raw.length; i++) {
      candidate += raw[i] * retainedFraction(raw[i] / anchor, i - start);
    }
    total = Math.max(total, candidate);
  }
  const relief = rawTotal > initialTotal ? (total - initialTotal) / (rawTotal - initialTotal) : 0;
  // Allocate any safeguard relief across discounted pieces, with cumulative
  // rounding so item-level totals reconcile to the displayed package total.
  let cumulative = 0;
  let rounded = 0;
  sorted.forEach((asset, i) => {
    cumulative += adjusted[i] + (raw[i] - adjusted[i]) * relief;
    const next = Math.round(cumulative);
    perPlayer.set(asset.key, next - rounded);
    rounded = next;
  });
  return { total: rounded, perPlayer };
}

export function analyzeTrade(
  sideA: TradeAsset[],
  sideB: TradeAsset[],
  source: ValueSource = 'avg',
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

  const bestA = Math.max(0, ...sideA.map((asset) => getDisplayValue(asset, source)));
  const bestB = Math.max(0, ...sideB.map((asset) => getDisplayValue(asset, source)));
  const effA = effectiveTotal(sideA, source, bestB).total;
  const effB = effectiveTotal(sideB, source, bestA).total;
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
