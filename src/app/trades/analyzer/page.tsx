'use client';

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { TradeValue } from '@/lib/types/trade-analyzer';

// --- League teams (mirrored from constants to keep this client-only) ---
const TEAM_NAMES = [
  'Belltown Raptors', 'Double Trouble', 'Elemental Heroes',
  'Mt. Lebanon Cake Eaters', 'Belleview Badgers', 'BeerNeverBrokeMyHeart',
  'Detroit Dawgs', 'bop pop', "Minshew's Maniacs", 'Red Pandas',
  'The Lone Ginger', 'Bimg Bamg Boomg',
].sort();

type ValueSource = 'avg' | 'ktc' | 'fc';

// --- Types ---

interface SelectedAsset {
  key: string;
  name: string;
  position: string;
  nflTeam: string;
  value: number;      // avg
  fcValue: number | null;
  ktcValue: number | null;
  age?: number;
  trend: number;
  isPick: boolean;
}

interface AnalysisResult {
  rawRatio: number;
  adjustedRatio: number;
  verdict: string;
  winner: 'A' | 'B' | null;
  diff: number;
  sideAGrade: string;
  sideBGrade: string;
  notes: string[];
  counterHint: string | null;
}

// --- Analysis Logic ---


function getDisplayValue(asset: SelectedAsset, source: ValueSource): number {
  if (source === 'fc') return asset.fcValue ?? asset.value;
  if (source === 'ktc') return asset.ktcValue ?? asset.value;
  return asset.value;
}

function getGradeLetter(ratio: number, isWinner: boolean): string {
  if (ratio >= 0.95) return 'A';
  if (ratio >= 0.90) return isWinner ? 'A-' : 'B+';
  if (ratio >= 0.80) return isWinner ? 'B+' : 'B';
  if (ratio >= 0.70) return isWinner ? 'B' : 'C+';
  if (ratio >= 0.60) return isWinner ? 'B-' : 'C';
  return isWinner ? 'A' : 'D';
}

function gradeColor(grade: string): string {
  if (grade === 'A' || grade === 'A-') return '#22c55e';
  if (grade === 'B+' || grade === 'B') return '#eab308';
  if (grade === 'B-' || grade === 'C+') return '#f97316';
  if (grade === 'C' || grade === 'D') return '#ef4444';
  return 'var(--muted)';
}

function buildPosSummary(assets: SelectedAsset[]): string {
  const counts: Record<string, number> = {};
  for (const a of assets) {
    const pos = a.isPick ? 'Pick' : (a.position || '?');
    counts[pos] = (counts[pos] || 0) + 1;
  }
  const order = ['QB', 'RB', 'WR', 'TE', 'K', 'Pick'];
  return [...order.filter((p) => counts[p]).map((p) => `${counts[p]} ${p}`),
    ...Object.keys(counts).filter((p) => !order.includes(p)).map((p) => `${counts[p]} ${p}`)
  ].join(' · ');
}

function getAvgAge(assets: SelectedAsset[]): number | null {
  const ages = assets.filter((a) => !a.isPick && (a.age ?? 0) > 0).map((a) => a.age!);
  if (!ages.length) return null;
  return Math.round((ages.reduce((s, x) => s + x, 0) / ages.length) * 10) / 10;
}

function assetFromValue(v: TradeValue, isPick: boolean): SelectedAsset {
  return {
    key: v.sleeperId, name: v.name, position: v.position, nflTeam: v.team,
    value: v.value, fcValue: v.fcValue, ktcValue: v.ktcValue,
    age: v.age, trend: v.trend, isPick,
  };
}

// 1. Stud premium — applied to any player meeting the threshold (not just the single best).
//    Slightly reduced per-tier vs single-player version since multiple players can qualify.
function studMultiplier(value: number): number {
  if (value >= 8500) return 1.13;
  if (value >= 7000) return 1.09;
  if (value >= 5500) return 1.06;
  if (value >= 4000) return 1.03;
  return 1.0;
}

// 2. Dynasty age curve — same current value ≠ same trade value. Upside matters.
//    KTC/FC partially price this in but not fully; this adds dynasty-specific forward weight.
function ageFactor(age: number | undefined): number {
  if (age == null || age <= 0) return 1.0;
  if (age <= 22) return 1.08;
  if (age <= 24) return 1.04;
  if (age <= 26) return 1.0;
  if (age <= 28) return 0.95;
  if (age <= 30) return 0.88;
  return 0.80;
}

// 3. Depth discount — combines position-order cost (clutter) with value-relative cost (throwaway pieces).
//    Takes whichever is more restrictive, so 4 benchwarmers and a 3rd roster piece both get penalized.
function depthDiscount(idx: number, rawValue: number, dealBest: number): number {
  const posDiscount = idx <= 1 ? 1.0 : idx === 2 ? 0.92 : idx === 3 ? 0.85 : 0.78;
  const ratio = dealBest > 0 ? rawValue / dealBest : 1;
  const valDiscount = ratio >= 0.70 ? 1.0
    : ratio >= 0.50 ? 0.94
    : ratio >= 0.30 ? 0.86
    : ratio >= 0.15 ? 0.74
    : 0.62;
  return Math.min(posDiscount, valDiscount);
}

function effectiveTotal(
  assets: SelectedAsset[],
  source: ValueSource,
  dealBest: number,
): { total: number; premiumAssets: string[]; discountApplied: boolean } {
  if (!assets.length) return { total: 0, premiumAssets: [], discountApplied: false };
  const sorted = [...assets].sort((a, b) => getDisplayValue(b, source) - getDisplayValue(a, source));
  const premiumAssets: string[] = [];
  let discountApplied = false;

  const total = sorted.reduce((sum, asset, idx) => {
    const raw = getDisplayValue(asset, source);
    let v = raw;

    // Age is already priced into KTC/FC raw values — applying it again double-counts.
    // Age differences are surfaced in the notes chip, not the effective math.

    // Stud premium for any qualifying player
    const sm = studMultiplier(raw);
    if (sm > 1.0) { v *= sm; premiumAssets.push(asset.name); }

    // Depth discount
    const dd = depthDiscount(idx, raw, dealBest);
    if (dd < 1.0) discountApplied = true;
    v *= dd;

    return sum + v;
  }, 0);

  return { total, premiumAssets, discountApplied };
}

// Returns the adjusted effective value per player (mirrors effectiveTotal logic) for display purposes.
function computePerPlayerEffectives(sideA: SelectedAsset[], sideB: SelectedAsset[], source: ValueSource): Map<string, number> {
  const allAssets = [...sideA, ...sideB];
  if (!allAssets.length) return new Map();
  const dealBest = Math.max(...allAssets.map((a) => getDisplayValue(a, source)));
  const result = new Map<string, number>();
  for (const side of [sideA, sideB]) {
    const sorted = [...side].sort((a, b) => getDisplayValue(b, source) - getDisplayValue(a, source));
    sorted.forEach((asset, idx) => {
      const raw = getDisplayValue(asset, source);
      let v = raw;
      v *= studMultiplier(raw);
      v *= depthDiscount(idx, raw, dealBest);
      result.set(asset.key, Math.round(v));
    });
  }
  return result;
}

function analyzeTrade(sideA: SelectedAsset[], sideB: SelectedAsset[], source: ValueSource): AnalysisResult {
  const rawTotalA = sideA.reduce((s, a) => s + getDisplayValue(a, source), 0);
  const rawTotalB = sideB.reduce((s, a) => s + getDisplayValue(a, source), 0);

  if (sideA.length === 0 || sideB.length === 0 || (rawTotalA === 0 && rawTotalB === 0)) {
    return { rawRatio: 1, adjustedRatio: 1, verdict: 'Add assets to analyze', winner: null, diff: 0, sideAGrade: '—', sideBGrade: '—', notes: [], counterHint: null };
  }

  const dealBest = Math.max(...[...sideA, ...sideB].map((a) => getDisplayValue(a, source)));

  const { total: effA, premiumAssets: premA, discountApplied: discA } = effectiveTotal(sideA, source, dealBest);
  const { total: effB, premiumAssets: premB, discountApplied: discB } = effectiveTotal(sideB, source, dealBest);

  const notes: string[] = [];

  const max = Math.max(effA, effB, 1);
  const rawRatio = Math.min(effA, effB) / max;
  let adjustedRatio = rawRatio;

  // Best player advantage (affects ratio only, no note)
  const bestA = Math.max(...sideA.map((a) => getDisplayValue(a, source)));
  const bestB = Math.max(...sideB.map((a) => getDisplayValue(a, source)));
  const bestSide = bestA >= bestB ? 'A' : 'B';
  if (Math.abs(bestA - bestB) > 1500) {
    if ((bestSide === 'A' && effA >= effB) || (bestSide === 'B' && effB >= effA))
      adjustedRatio = Math.max(0, adjustedRatio - 0.03);
  }

  // Piece imbalance bonus (affects ratio only, no note)
  const pieceDiff = Math.abs(sideA.length - sideB.length);
  if (pieceDiff >= 1) {
    const consolidationBonus = Math.min(0.09, pieceDiff * 0.03);
    adjustedRatio = Math.min(1.0, adjustedRatio + consolidationBonus);
  }

  const picksA = sideA.filter((a) => a.isPick).length;
  const picksB = sideB.filter((a) => a.isPick).length;

  const ageA = getAvgAge(sideA);
  const ageB = getAvgAge(sideB);
  if (ageA !== null && ageB !== null && Math.abs(ageA - ageB) >= 2)
    notes.push(`Side ${ageA < ageB ? 'A' : 'B'} gets younger (avg ${Math.min(ageA, ageB).toFixed(1)} vs ${Math.max(ageA, ageB).toFixed(1)})`);

  const winner: 'A' | 'B' | null = effA > effB ? 'A' : effB > effA ? 'B' : null;
  // 4. Fix: use effective diff so counter hint winner is consistent with verdict
  const diff = Math.abs(effA - effB);

  let verdict: string;
  if (adjustedRatio >= 0.92) verdict = 'Fair Trade';
  else if (adjustedRatio >= 0.80) verdict = 'Slight Edge';
  else if (adjustedRatio >= 0.65) verdict = 'Uneven';
  else verdict = 'One-Sided';

  const sideAGrade = getGradeLetter(adjustedRatio, winner === 'A' || winner === null);
  const sideBGrade = getGradeLetter(adjustedRatio, winner === 'B' || winner === null);

  let counterHint: string | null = null;
  if (adjustedRatio < 0.80 && winner && diff > 0)
    counterHint = `Side ${winner === 'A' ? 'B' : 'A'} is short ~${formatValue(Math.round(diff))} pts. Adding or swapping a player would help balance this.`;

  return { rawRatio, adjustedRatio, verdict, winner, diff, sideAGrade, sideBGrade, notes, counterHint };
}

// --- Helpers ---

function formatValue(v: number): string {
  return v.toLocaleString();
}

// --- Components ---

function TrendArrow({ trend }: { trend: number }) {
  if (trend > 100) return <span className="text-xs font-bold ml-1" style={{ color: '#22c55e' }}>↑</span>;
  if (trend < -100) return <span className="text-xs font-bold ml-1" style={{ color: 'var(--danger)' }}>↓</span>;
  return null;
}

function AssetChip({ asset, source, sideTotal, barColor, onRemove }: {
  asset: SelectedAsset; source: ValueSource; sideTotal: number; barColor: string; onRemove: () => void;
}) {
  const dv = getDisplayValue(asset, source);
  const pct = sideTotal > 0 ? Math.min(100, Math.round((dv / sideTotal) * 100)) : 0;
  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] px-3 py-2 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center text-sm font-medium text-[var(--text)]">
            <span className="truncate">{asset.name}</span>
            {!asset.isPick && <TrendArrow trend={asset.trend} />}
          </div>
          <div className="text-xs text-[var(--muted)]">
            {asset.isPick ? 'Draft Pick' : `${asset.position} · ${asset.nflTeam || 'FA'}${asset.age ? ` · Age ${asset.age.toFixed(0)}` : ''}`}
            <span className="ml-2 font-medium" style={{ color: barColor }}>{formatValue(dv)}</span>
            {sideTotal > 0 && <span className="ml-1 opacity-50">{pct}%</span>}
          </div>
        </div>
        <button onClick={onRemove} className="text-[var(--muted)] hover:text-[var(--danger)] transition-colors text-lg leading-none shrink-0" aria-label={`Remove ${asset.name}`}>×</button>
      </div>
      {sideTotal > 0 && (
        <div className="mt-1.5 h-1 rounded-full bg-[var(--surface-strong)] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.7 }} />
        </div>
      )}
    </div>
  );
}

function PlayerSearch({ values, excluded, source, onSelect }: {
  values: TradeValue[];
  excluded: Set<string>;
  source: ValueSource;
  onSelect: (a: SelectedAsset) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return values.filter((v) => !excluded.has(v.sleeperId) && !v.isPick && v.name.toLowerCase().includes(q)).slice(0, 20);
  }, [query, values, excluded]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!containerRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const getVal = useCallback((v: TradeValue) =>
    source === 'fc' ? (v.fcValue ?? v.value) : source === 'ktc' ? (v.ktcValue ?? v.value) : v.value,
  [source]);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text" value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => query.trim() && setOpen(true)}
        placeholder="Search players..."
        className="w-full rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-[var(--radius-card)] bg-[var(--surface-strong)] border border-[var(--border)] shadow-xl">
          {filtered.map((v) => (
            <button key={v.sleeperId} onClick={() => { onSelect(assetFromValue(v, false)); setQuery(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-[var(--surface)] transition-colors border-b border-[var(--border)] last:border-b-0">
              <span className="text-sm text-[var(--text)]">{v.name}</span>
              {v.trend > 100 && <span className="text-xs ml-1" style={{ color: '#22c55e' }}>↑</span>}
              {v.trend < -100 && <span className="text-xs ml-1" style={{ color: 'var(--danger)' }}>↓</span>}
              <span className="ml-2 text-xs text-[var(--muted)]">{v.position} · {v.team || 'FA'}{v.age ? ` · ${v.age.toFixed(0)}y` : ''}</span>
              <span className="float-right text-xs font-medium" style={{ color: 'var(--accent)' }}>{formatValue(getVal(v))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ROUND_LABEL: Record<number, string> = { 1: '1st Round', 2: '2nd Round', 3: '3rd Round', 4: '4th Round' };
const TIER_RANK: Record<string, number> = { EARLY: 0, MID: 1, LATE: 2 };

function pickRound(sleeperId: string): number {
  const m = sleeperId.match(/PICK_\d{4}_(\d)_/);
  return m ? parseInt(m[1]) : 99;
}
function pickTierRank(sleeperId: string): number {
  const m = sleeperId.match(/_(EARLY|MID|LATE)$/);
  return m ? (TIER_RANK[m[1]] ?? 3) : 3;
}

interface PickRoundGroup { round: number; label: string; picks: TradeValue[]; }
interface PickYearGroup { year: string; rounds: PickRoundGroup[]; }

function PickSelector({ values, excluded, onSelect }: { values: TradeValue[]; excluded: Set<string>; onSelect: (a: SelectedAsset) => void; }) {
  const grouped = useMemo(() => {
    const byYear = new Map<string, Map<number, TradeValue[]>>();
    for (const p of values.filter((v) => v.isPick && !excluded.has(v.sleeperId))) {
      const year = p.name.match(/^(\d{4})/)?.[1] ?? 'Other';
      const round = pickRound(p.sleeperId);
      if (!byYear.has(year)) byYear.set(year, new Map());
      const byRound = byYear.get(year)!;
      if (!byRound.has(round)) byRound.set(round, []);
      byRound.get(round)!.push(p);
    }
    const years: PickYearGroup[] = [];
    for (const year of Array.from(byYear.keys()).sort()) {
      const byRound = byYear.get(year)!;
      const rounds: PickRoundGroup[] = [];
      for (const round of Array.from(byRound.keys()).sort((a, b) => a - b)) {
        const picks = byRound.get(round)!.sort((a, b) =>
          pickTierRank(a.sleeperId) - pickTierRank(b.sleeperId) || b.value - a.value
        );
        rounds.push({ round, label: ROUND_LABEL[round] ?? `Round ${round}`, picks });
      }
      years.push({ year, rounds });
    }
    return years;
  }, [values, excluded]);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (!grouped.length) return null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className="w-full rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors text-left">
        + Add Draft Pick
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-[var(--radius-card)] bg-[var(--surface-strong)] border border-[var(--border)] shadow-xl">
          {grouped.map((g) => (
            <div key={g.year}>
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)] bg-[var(--surface)] border-b border-[var(--border)] sticky top-0">{g.year} Picks</div>
              {g.rounds.map((rg) => (
                <div key={rg.round}>
                  <div className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider border-b border-[var(--border)]"
                    style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 6%, var(--surface-strong))' }}>
                    {rg.label}
                  </div>
                  {rg.picks.map((v) => (
                    <button key={v.sleeperId} onClick={() => { onSelect(assetFromValue(v, true)); setOpen(false); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface)] transition-colors border-b border-[var(--border)] last:border-b-0">
                      <span className="text-sm text-[var(--text)]">{v.name.replace(/^\d{4}\s*/, '')}</span>
                      <span className="float-right text-xs font-medium" style={{ color: 'var(--accent)' }}>{formatValue(v.value)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RosterPicker({ values, excluded, onAdd }: { values: TradeValue[]; excluded: Set<string>; onAdd: (a: SelectedAsset) => void; }) {
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState('');
  const [roster, setRoster] = useState<{ id: string; name: string; pos: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const valMap = useMemo(() => { const m = new Map<string, TradeValue>(); for (const v of values) m.set(v.sleeperId, v); return m; }, [values]);

  async function loadTeam(t: string) {
    setTeam(t); setBusy(true);
    try {
      const res = await fetch(`/api/draft/team-roster?team=${encodeURIComponent(t)}`);
      const data = await res.json();
      setRoster(data.players || []);
    } catch { setRoster([]); } finally { setBusy(false); }
  }

  const matched = useMemo(() => roster.map((p) => ({ ...p, tv: valMap.get(p.id) })).filter((p) => p.tv && !excluded.has(p.id)), [roster, valMap, excluded]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className="w-full rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors text-left">
        Load from roster…
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-[var(--radius-card)] bg-[var(--surface-strong)] border border-[var(--border)] shadow-xl">
          <div className="p-2 border-b border-[var(--border)]">
            <select value={team} onChange={(e) => loadTeam(e.target.value)}
              className="w-full rounded bg-[var(--surface)] border border-[var(--border)] px-2 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]">
              <option value="">Select a team…</option>
              {TEAM_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {busy && <div className="px-3 py-3 text-xs text-[var(--muted)] text-center">Loading…</div>}
          {!busy && team && matched.length === 0 && <div className="px-3 py-3 text-xs text-[var(--muted)] text-center">No matched players found</div>}
          <div className="max-h-52 overflow-y-auto">
            {matched.map((p) => (
              <button key={p.id} onClick={() => onAdd(assetFromValue(p.tv!, false))}
                className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface)] transition-colors border-b border-[var(--border)] last:border-b-0">
                <span className="text-sm text-[var(--text)]">{p.name}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">{p.pos}</span>
                <span className="float-right text-xs font-medium" style={{ color: 'var(--accent)' }}>{formatValue(p.tv!.value)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ValueSourceToggle({ source, onChange, ktcAvailable }: { source: ValueSource; onChange: (s: ValueSource) => void; ktcAvailable: boolean }) {
  const disabled = (s: ValueSource) => !ktcAvailable && (s === 'ktc' || s === 'avg');
  return (
    <div className="flex rounded-[var(--radius-card)] border border-[var(--border)] overflow-hidden text-xs">
      {(['avg', 'ktc', 'fc'] as ValueSource[]).map((s) => (
        <button key={s} onClick={() => !disabled(s) && onChange(s)}
          title={disabled(s) ? 'KTC unavailable (blocked by server)' : undefined}
          className={`px-3 py-1.5 font-medium transition-colors uppercase${disabled(s) ? ' cursor-not-allowed' : ''}`}
          style={disabled(s)
            ? { background: 'var(--surface)', color: 'var(--border)', cursor: 'not-allowed' }
            : source === s
              ? { background: 'var(--accent)', color: '#fff' }
              : { background: 'var(--surface)', color: 'var(--muted)' }}>
          {s}
        </button>
      ))}
    </div>
  );
}

// Consolidation display rate: matches KTC's observed ~40% for mid-tier, ~28-35% for elite.
// Applied to the fewer-piece side to show their structural advantage.
function consolidationDisplayRate(rawTotal: number): number {
  if (rawTotal >= 7000) return 0.30;
  if (rawTotal >= 4000) return 0.35;
  return 0.40;
}

function TradeSide({ label, color, assets, values, excluded, source, grade, effectiveValues, tradeActive, isFewer, pieceDiff, onAdd, onRemove, onClear }: {
  label: string; color: string; assets: SelectedAsset[]; values: TradeValue[];
  excluded: Set<string>; source: ValueSource; grade: string;
  effectiveValues?: Map<string, number>;
  tradeActive: boolean;
  isFewer: boolean;
  pieceDiff: number;
  onAdd: (a: SelectedAsset) => void; onRemove: (k: string) => void; onClear: () => void;
}) {
  const rawTotal = assets.reduce((s, a) => s + getDisplayValue(a, source), 0);

  // Display adjustment: stud premium + consolidation rate (both always positive).
  // Age is NOT included — raw values already price it in.
  const studBoost = assets.reduce((s, a) => {
    const raw = getDisplayValue(a, source);
    return s + (studMultiplier(raw) - 1.0) * raw;
  }, 0);
  const consolidationBoost = (tradeActive && isFewer && pieceDiff >= 1)
    ? rawTotal * consolidationDisplayRate(rawTotal) * Math.min(1.5, pieceDiff)
    : 0;
  const displayAdjustment = Math.round(studBoost + consolidationBoost);
  const showAdjustment = tradeActive && assets.length > 0 && displayAdjustment >= 100;
  const displayTotal = showAdjustment ? rawTotal + displayAdjustment : rawTotal;

  const posSummary = buildPosSummary(assets);
  const avgAge = getAvgAge(assets);
  const gc = gradeColor(grade);

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <h3 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wide">{label}</h3>
        </div>
        <div className="flex items-center gap-2">
          {grade !== '—' && (
            <span className="text-sm font-bold px-2 py-0.5 rounded-full" style={{ color: gc, backgroundColor: gc + '22', border: `1px solid ${gc}55` }}>
              {grade}
            </span>
          )}
          <span className="text-sm font-bold" style={{ color }}>{formatValue(displayTotal)}</span>
          {assets.length > 0 && (
            <button onClick={onClear} className="text-xs text-[var(--muted)] hover:text-[var(--danger)] transition-colors">Clear</button>
          )}
        </div>
      </div>

      {posSummary && (
        <div className="text-[11px] text-[var(--muted)] mb-2 opacity-80">
          {posSummary}{avgAge !== null && ` · Avg age ${avgAge.toFixed(1)}`}
        </div>
      )}

      <div className="space-y-2 mb-3">
        <PlayerSearch values={values} excluded={excluded} source={source} onSelect={onAdd} />
        <PickSelector values={values} excluded={excluded} onSelect={onAdd} />
        <RosterPicker values={values} excluded={excluded} onAdd={onAdd} />
      </div>

      <div className="space-y-2 min-h-[80px]">
        {assets.length === 0 && <div className="text-center text-[var(--muted)] text-sm py-6 opacity-60">Add players or picks</div>}
        {assets.map((a) => <AssetChip key={a.key} asset={a} source={source} sideTotal={rawTotal} barColor={color} onRemove={() => onRemove(a.key)} />)}
        {showAdjustment && (
          <div className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] bg-[var(--surface-strong)] opacity-80">
            <span className="text-xs text-[var(--muted)] italic">Value Adjustment</span>
            <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>
              +{formatValue(displayAdjustment)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function FairnessMeter({ analysis, totalA, totalB, allAssets }: { analysis: AnalysisResult; totalA: number; totalB: number; allAssets: SelectedAsset[] }) {
  if (analysis.verdict === 'Add assets to analyze')
    return <div className="text-center py-4 text-sm text-[var(--muted)]">Add assets to both sides to see the analysis</div>;

  const { adjustedRatio, verdict, winner, diff, notes, counterHint } = analysis;
  const grand = totalA + totalB;
  const pctA = grand > 0 ? Math.round((totalA / grand) * 100) : 50;
  const pctB = 100 - pctA;

  let verdictColor = '#22c55e';
  if (adjustedRatio < 0.65) verdictColor = '#ef4444';
  else if (adjustedRatio < 0.80) verdictColor = '#f97316';
  else if (adjustedRatio < 0.92) verdictColor = '#eab308';

  return (
    <div className="py-2">
      {/* Side-by-side value bar */}
      <div className="flex h-7 rounded-full overflow-hidden mb-1">
        <div className="flex items-center justify-end pr-2 transition-all duration-500 text-xs font-bold text-white/90"
          style={{ width: `${pctA}%`, backgroundColor: 'var(--accent)' }}>
          {pctA > 18 && `${pctA}%`}
        </div>
        <div className="flex items-center justify-start pl-2 transition-all duration-500 text-xs font-bold text-white/90"
          style={{ width: `${pctB}%`, backgroundColor: 'var(--danger)' }}>
          {pctB > 18 && `${pctB}%`}
        </div>
      </div>
      <div className="flex justify-between text-xs text-[var(--muted)] mb-4">
        <span style={{ color: 'var(--accent)' }}>Side A · {formatValue(totalA)}</span>
        <span style={{ color: 'var(--danger)' }}>Side B · {formatValue(totalB)}</span>
      </div>

      {/* Verdict */}
      <div className="text-center">
        <div className="text-2xl font-bold" style={{ color: verdictColor }}>{verdict}</div>
        {winner && diff > 0 && (
          <div className="text-sm text-[var(--muted)] mt-1">
            Side {winner} wins by <span className="font-semibold text-[var(--text)]">{formatValue(diff)}</span>
          </div>
        )}

        {/* Notes as chips */}
        {notes.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {notes.map((n, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-[var(--surface-strong)] border border-[var(--border)] text-[var(--muted)]">
                {n}
              </span>
            ))}
          </div>
        )}

        {counterHint && (
          <div className="mt-3 mx-auto max-w-sm px-4 py-2 rounded-[var(--radius-card)] bg-[var(--surface-strong)] border border-[var(--border)] text-xs text-[var(--muted)] text-left">
            💡 {counterHint}
          </div>
        )}
      </div>
      <ConfidenceBadge assets={allAssets} />
    </div>
  );
}

function ShareButton({ sideA, sideB }: { sideA: SelectedAsset[]; sideB: SelectedAsset[] }) {
  const [copied, setCopied] = useState(false);
  if (!sideA.length && !sideB.length) return null;
  async function copy() {
    const p = new URLSearchParams();
    if (sideA.length) p.set('a', sideA.map((x) => x.key).join(','));
    if (sideB.length) p.set('b', sideB.map((x) => x.key).join(','));
    await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?${p}`).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="px-4 py-2 text-sm rounded-[var(--radius-card)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors">
      {copied ? '✓ Link copied!' : 'Share trade link'}
    </button>
  );
}

// --- Confidence badge: flags when FC and KTC meaningfully disagree on a player ---

function ConfidenceBadge({ assets }: { assets: SelectedAsset[] }) {
  const disagreements = assets
    .filter((a) => !a.isPick && (a.fcValue ?? 0) > 0 && (a.ktcValue ?? 0) > 0)
    .map((a) => ({
      name: a.name,
      diff: Math.abs((a.fcValue ?? 0) - (a.ktcValue ?? 0)),
      ktcHigher: (a.ktcValue ?? 0) > (a.fcValue ?? 0),
    }))
    .filter((d) => d.diff >= 350)
    .sort((a, b) => b.diff - a.diff);

  if (!disagreements.length) return null;

  const lines = disagreements.slice(0, 2).map((d) => {
    const higher = d.ktcHigher ? 'KTC' : 'FC';
    const lower = d.ktcHigher ? 'FC' : 'KTC';
    return `${higher} values ${d.name} ${formatValue(d.diff)} pts higher than ${lower}`;
  });

  const color = disagreements[0].diff >= 1200 ? '#f97316' : '#eab308';
  const extra = disagreements.length > 2 ? ` · +${disagreements.length - 2} more` : '';

  return (
    <div className="mt-2 flex justify-center">
      <span className="text-xs px-3 py-1 rounded-full text-center" style={{ color, backgroundColor: color + '18', border: `1px solid ${color}44` }}>
        ⚠ {lines.join(' · ')}{extra}
      </span>
    </div>
  );
}

// --- Position breakdown: side-by-side positional composition ---

const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'Pick'];

function PositionBreakdown({ sideA, sideB, source }: { sideA: SelectedAsset[]; sideB: SelectedAsset[]; source: ValueSource }) {
  if (!sideA.length && !sideB.length) return null;

  function groupByPos(assets: SelectedAsset[]) {
    const m = new Map<string, { count: number; value: number }>();
    for (const a of assets) {
      const pos = a.isPick ? 'Pick' : (a.position || '?');
      const cur = m.get(pos) ?? { count: 0, value: 0 };
      m.set(pos, { count: cur.count + 1, value: cur.value + getDisplayValue(a, source) });
    }
    return m;
  }

  const ga = groupByPos(sideA);
  const gb = groupByPos(sideB);
  const allPos = [...new Set([...ga.keys(), ...gb.keys()])].sort((x, y) => {
    const ix = POS_ORDER.indexOf(x), iy = POS_ORDER.indexOf(y);
    return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy);
  });
  if (!allPos.length) return null;

  return (
    <div className="mt-4 rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] p-4 md:p-5 shadow-[var(--shadow-soft)]">
      <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">Position Breakdown</h2>
      <div className="space-y-2">
        {allPos.map((pos) => {
          const a = ga.get(pos) ?? { count: 0, value: 0 };
          const b = gb.get(pos) ?? { count: 0, value: 0 };
          return (
            <div key={pos} className="grid items-center gap-x-3 text-sm" style={{ gridTemplateColumns: '2.5rem 1fr auto 1fr' }}>
              <span className="text-xs font-bold text-[var(--muted)] uppercase text-center">{pos}</span>
              <div className="text-right">
                {a.count > 0
                  ? <><span style={{ color: 'var(--accent)' }}>{a.count}×</span><span className="text-[var(--muted)] text-xs ml-1">{formatValue(a.value)}</span></>
                  : <span className="text-[var(--muted)] opacity-20 text-xs">—</span>}
              </div>
              <span className="text-xs text-[var(--muted)] opacity-25">vs</span>
              <div>
                {b.count > 0
                  ? <><span style={{ color: 'var(--danger)' }}>{b.count}×</span><span className="text-[var(--muted)] text-xs ml-1">{formatValue(b.value)}</span></>
                  : <span className="text-[var(--muted)] opacity-20 text-xs">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Roster suggestion panel: team-specific balance suggestions ---

function RosterSuggestionPanel({ analysis, values, sideA, sideB, rawDiff, onAddA, onAddB }: {
  analysis: AnalysisResult;
  values: TradeValue[];
  sideA: SelectedAsset[];
  sideB: SelectedAsset[];
  rawDiff: number;
  onAddA: (a: SelectedAsset) => void;
  onAddB: (a: SelectedAsset) => void;
}) {
  const [team, setTeam] = useState('');
  const [roster, setRoster] = useState<{ id: string; name: string; pos: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const valMap = useMemo(() => {
    const m = new Map<string, TradeValue>();
    for (const v of values) m.set(v.sleeperId, v);
    return m;
  }, [values]);

  const excluded = useMemo(() => new Set([...sideA, ...sideB].map((a) => a.key)), [sideA, sideB]);

  async function loadTeam(t: string) {
    setTeam(t);
    if (!t) { setRoster([]); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/draft/team-roster?team=${encodeURIComponent(t)}`);
      const data = await res.json();
      setRoster(data.players || []);
    } catch { setRoster([]); } finally { setBusy(false); }
  }

  const tolerance = 0.35;
  const rosterMatches = useMemo(() => {
    if (!roster.length || rawDiff <= 0) return [];
    const min = rawDiff * (1 - tolerance), max = rawDiff * (1 + tolerance);
    return roster
      .map((p) => ({ ...p, tv: valMap.get(p.id) }))
      .filter((p) => p.tv && !excluded.has(p.id) && p.tv.value >= min && p.tv.value <= max)
      .sort((a, b) => Math.abs(a.tv!.value - rawDiff) - Math.abs(b.tv!.value - rawDiff))
      .slice(0, 6);
  }, [roster, valMap, excluded, rawDiff]);

  if (analysis.adjustedRatio >= 0.80 || !analysis.winner) return null;
  const shortSide = analysis.winner === 'A' ? 'B' : 'A';

  return (
    <div className="mt-4 rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] p-4 md:p-5 shadow-[var(--shadow-soft)]">
      <h2 className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-3">
        Balance Side {shortSide} · needs ~{formatValue(Math.round(rawDiff))} pts from a roster
      </h2>
      <select value={team} onChange={(e) => loadTeam(e.target.value)}
        className="w-full max-w-xs rounded-[var(--radius-card)] bg-[var(--surface-strong)] border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] mb-3">
        <option value="">Select a team to check their roster…</option>
        {TEAM_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      {busy && <div className="text-xs text-[var(--muted)]">Loading roster…</div>}
      {team && !busy && rosterMatches.length === 0 && (
        <div className="text-xs text-[var(--muted)] opacity-60">No players on this roster match the gap (~{formatValue(Math.round(rawDiff))} pts ±35%).</div>
      )}
      {rosterMatches.length > 0 && (
        <>
          <div className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-2">From {team}</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {rosterMatches.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-[var(--radius-card)] bg-[var(--surface-strong)] border border-[var(--border)] px-2.5 py-2">
                <div className="min-w-0 mr-2">
                  <div className="text-xs font-semibold text-[var(--text)] truncate">{p.name}</div>
                  <div className="text-[10px] text-[var(--muted)]">{p.pos} · <span style={{ color: 'var(--accent)' }}>{formatValue(p.tv!.value)}</span></div>
                </div>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => onAddA(assetFromValue(p.tv!, false))}
                    className="text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full"
                    style={{ background: 'var(--accent)', color: '#fff' }}>+A</button>
                  <button onClick={() => onAddB(assetFromValue(p.tv!, false))}
                    className="text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full"
                    style={{ background: 'var(--danger)', color: '#fff' }}>+B</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// --- Main content (needs Suspense for useSearchParams) ---

function TradeAnalyzerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [values, setValues] = useState<TradeValue[]>([]);
  const [valuesMap, setValuesMap] = useState<Map<string, TradeValue>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sideA, setSideA] = useState<SelectedAsset[]>([]);
  const [sideB, setSideB] = useState<SelectedAsset[]>([]);
  const [source, setSource] = useState<ValueSource>('avg');
  const [isAdmin, setIsAdmin] = useState(false);
  const [dataSources, setDataSources] = useState<{ fantasyCalc: boolean; keepTradeCut: boolean; fcCount?: number; ktcCount?: number } | null>(null);
  const [suggestDismissed, setSuggestDismissed] = useState(false);
  const urlInitialized = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const [valRes, meRes] = await Promise.all([
          fetch('/api/trade-analyzer/values'),
          fetch('/api/auth/me'),
        ]);
        if (!valRes.ok) throw new Error(`Failed to load values (${valRes.status})`);
        const data = await valRes.json();
        const vals = Object.values(data.values) as TradeValue[];
        const map = new Map<string, TradeValue>();
        for (const v of vals) map.set(v.sleeperId, v);
        setValues(vals);
        setValuesMap(map);
        if (data.sources) setDataSources(data.sources);
        if (meRes.ok) {
          const me = await meRes.json();
          setIsAdmin(!!me.isAdmin);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load trade values');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Decode URL params into trade state once values are loaded
  useEffect(() => {
    if (loading || urlInitialized.current || valuesMap.size === 0) return;
    urlInitialized.current = true;
    const aKeys = (searchParams.get('a') || '').split(',').filter(Boolean);
    const bKeys = (searchParams.get('b') || '').split(',').filter(Boolean);
    if (aKeys.length) setSideA(aKeys.map((k) => valuesMap.get(k)).filter(Boolean).map((v) => assetFromValue(v!, v!.isPick)));
    if (bKeys.length) setSideB(bKeys.map((k) => valuesMap.get(k)).filter(Boolean).map((v) => assetFromValue(v!, v!.isPick)));
  }, [loading, valuesMap, searchParams]);

  // Sync trade state to URL
  useEffect(() => {
    if (!urlInitialized.current) return;
    const p = new URLSearchParams();
    if (sideA.length) p.set('a', sideA.map((x) => x.key).join(','));
    if (sideB.length) p.set('b', sideB.map((x) => x.key).join(','));
    const qs = p.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  }, [sideA, sideB, router]);

  const excluded = useMemo(() => { const s = new Set<string>(); for (const a of [...sideA, ...sideB]) s.add(a.key); return s; }, [sideA, sideB]);
  const analysis = useMemo(() => analyzeTrade(sideA, sideB, source), [sideA, sideB, source]);
  const playerEffectives = useMemo(() => computePerPlayerEffectives(sideA, sideB, source), [sideA, sideB, source]);
  const totalA = sideA.reduce((s, a) => s + getDisplayValue(a, source), 0);
  const totalB = sideB.reduce((s, a) => s + getDisplayValue(a, source), 0);

  // Suggestions: when both sides have assets, target the gap (what the losing side needs to add).
  // When only one side has assets, suggest comparable players for reference.
  const suggestions = useMemo(() => {
    const all = [...sideA, ...sideB];
    if (all.length === 0 || values.length === 0) return [];
    const getVal = (v: TradeValue) =>
      source === 'fc' ? (v.fcValue ?? v.value) : source === 'ktc' ? (v.ktcValue ?? v.value) : v.value;
    const target = sideA.length > 0 && sideB.length > 0
      ? Math.abs(totalA - totalB)
      : sideA.length > 0 ? totalA : totalB;
    return values
      .filter((v) => !excluded.has(v.sleeperId) && getVal(v) > 0)
      .sort((a, b) => Math.abs(getVal(a) - target) - Math.abs(getVal(b) - target))
      .slice(0, 8);
  }, [sideA, sideB, totalA, totalB, values, excluded, source]);

  const suggestionMode: 'balance' | 'compare' = sideA.length > 0 && sideB.length > 0 ? 'balance' : 'compare';
  // Which side is behind and needs the suggested player
  const needsSide: 'A' | 'B' | null = suggestionMode === 'balance'
    ? (totalA >= totalB ? 'B' : 'A')
    : null;

  const showSuggestions = suggestions.length > 0 && !suggestDismissed;

  // Reset dismissed state when trade is fully cleared
  useEffect(() => {
    if (sideA.length === 0 && sideB.length === 0) setSuggestDismissed(false);
  }, [sideA.length, sideB.length]);

  if (loading) return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[var(--text)] mb-6">Trade Analyzer</h1>
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--accent)] border-t-transparent" />
        <span className="ml-3 text-[var(--muted)]">Loading trade values…</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[var(--text)] mb-6">Trade Analyzer</h1>
      <div className="rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--danger)] p-6 text-center">
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <button onClick={() => window.location.reload()}
          className="mt-3 px-4 py-2 rounded-[var(--radius-card)] border border-[var(--danger)] text-sm hover:opacity-80 transition-colors"
          style={{ color: 'var(--danger)' }}>Retry</button>
      </div>
    </div>
  );

  return (
    <>
    <div className={`container mx-auto px-4 py-8${showSuggestions ? ' pb-28' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Trade Analyzer</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Dynasty · Superflex · 12-Team · PPR</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {dataSources && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                <span className={`w-2 h-2 rounded-full ${dataSources.fantasyCalc ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>FC {dataSources.fcCount != null ? `(${dataSources.fcCount})` : ''}</span>
                <span className={`w-2 h-2 rounded-full ml-1 ${dataSources.keepTradeCut ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>KTC {dataSources.ktcCount != null ? `(${dataSources.ktcCount})` : ''}</span>
              </div>
            )}
            <ValueSourceToggle source={source} onChange={setSource} ktcAvailable={!!(dataSources?.ktcCount && dataSources.ktcCount > 0)} />
          </div>
        )}
      </div>

      <div className="rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] p-4 md:p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col md:flex-row gap-6">
          {(() => {
            const tradeActive = sideA.length > 0 && sideB.length > 0;
            const pd = Math.abs(sideA.length - sideB.length);
            return (
              <>
                <TradeSide label="Side A" color="var(--accent)" assets={sideA} values={values} excluded={excluded} source={source}
                  grade={analysis.sideAGrade} effectiveValues={playerEffectives} tradeActive={tradeActive}
                  isFewer={sideA.length < sideB.length} pieceDiff={pd}
                  onAdd={(a) => setSideA((p) => [...p, a])} onRemove={(k) => setSideA((p) => p.filter((x) => x.key !== k))} onClear={() => setSideA([])} />
                <div className="hidden md:flex items-center"><div className="w-px h-full bg-[var(--border)]" /></div>
                <div className="md:hidden border-t border-[var(--border)]" />
                <TradeSide label="Side B" color="var(--danger)" assets={sideB} values={values} excluded={excluded} source={source}
                  grade={analysis.sideBGrade} effectiveValues={playerEffectives} tradeActive={tradeActive}
                  isFewer={sideB.length < sideA.length} pieceDiff={pd}
                  onAdd={(a) => setSideB((p) => [...p, a])} onRemove={(k) => setSideB((p) => p.filter((x) => x.key !== k))} onClear={() => setSideB([])} />
              </>
            );
          })()}
        </div>
        <div className="mt-6 pt-4 border-t border-[var(--border)]">
          <FairnessMeter analysis={analysis} totalA={totalA} totalB={totalB} allAssets={[...sideA, ...sideB]} />
        </div>
      </div>

      {(sideA.length > 0 || sideB.length > 0) && (
        <PositionBreakdown sideA={sideA} sideB={sideB} source={source} />
      )}

      {(sideA.length > 0 && sideB.length > 0) && (
        <RosterSuggestionPanel
          analysis={analysis}
          values={values}
          sideA={sideA}
          sideB={sideB}
          rawDiff={Math.abs(totalA - totalB)}
          onAddA={(a) => setSideA((p) => [...p, a])}
          onAddB={(a) => setSideB((p) => [...p, a])}
        />
      )}

      {(sideA.length > 0 || sideB.length > 0) && (
        <div className="mt-4 rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] p-4 md:p-6 shadow-[var(--shadow-soft)]">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">Value Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[{ side: sideA, total: totalA, color: 'var(--accent)', label: 'A' }, { side: sideB, total: totalB, color: 'var(--danger)', label: 'B' }].map(({ side, total, color, label }) => (
              <div key={label}>
                <div className="text-xs font-semibold mb-2" style={{ color }}>SIDE {label} — {formatValue(total)} total</div>
                <div className="space-y-1">
                  {side.map((a) => (
                    <div key={a.key} className="flex justify-between text-sm">
                      <span className="text-[var(--text)] truncate">{a.name}</span>
                      <span className="text-[var(--muted)] ml-2 shrink-0">{formatValue(getDisplayValue(a, source))}</span>
                    </div>
                  ))}
                  {side.length === 0 && <div className="text-xs text-[var(--muted)] opacity-50">No assets</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(sideA.length > 0 || sideB.length > 0) && (
        <div className="mt-4 flex justify-center gap-3 flex-wrap">
          <ShareButton sideA={sideA} sideB={sideB} />
          <button onClick={() => { setSideA([]); setSideB([]); }}
            className="px-4 py-2 text-sm rounded-[var(--radius-card)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--text)] transition-colors">
            Reset Trade
          </button>
        </div>
      )}

      <div className="mt-4 text-center text-xs text-[var(--muted)] opacity-60">
        Values from FantasyCalc &amp; KeepTradeCut · Updated every 6 hours
      </div>
    </div>

    {/* Suggestion strip — sticky bottom, non-intrusive */}
    {showSuggestions && (
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--border)] shadow-2xl"
        style={{ background: 'var(--surface-strong)', backdropFilter: 'blur(12px)' }}>
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <div className="shrink-0 hidden sm:block">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
              {suggestionMode === 'balance' ? 'Balance trade' : 'Compare'}
            </div>
            {suggestionMode === 'balance' && needsSide && (
              <div className="text-[9px] text-[var(--muted)] opacity-60">add to Side {needsSide}</div>
            )}
          </div>
          <div className="flex gap-2 flex-1 overflow-x-auto pb-0.5">
            {suggestions.map((v) => {
              const val = source === 'fc' ? (v.fcValue ?? v.value) : source === 'ktc' ? (v.ktcValue ?? v.value) : v.value;
              return (
                <div key={v.sleeperId}
                  className="flex items-center gap-2 rounded-[var(--radius-card)] border border-[var(--border)] px-2.5 py-1.5 shrink-0"
                  style={{ background: 'var(--surface)' }}>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--text)] whitespace-nowrap">
                      {v.isPick ? v.name.replace(/^\d{4}\s*/, '') : v.name}
                    </div>
                    <div className="text-xs text-[var(--muted)] whitespace-nowrap">
                      {v.isPick ? 'Pick' : `${v.position}${v.team ? ` · ${v.team}` : ''}`}
                      {' · '}<span style={{ color: 'var(--accent)' }}>{formatValue(val)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 ml-1">
                    <button
                      onClick={() => setSideA((p) => [...p, assetFromValue(v, v.isPick)])}
                      className="text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full transition-opacity hover:opacity-90"
                      style={{
                        background: 'var(--accent)', color: '#fff',
                        opacity: needsSide === 'B' ? 0.25 : 1,
                      }}>
                      +
                    </button>
                    <button
                      onClick={() => setSideB((p) => [...p, assetFromValue(v, v.isPick)])}
                      className="text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full transition-opacity hover:opacity-90"
                      style={{
                        background: 'var(--danger)', color: '#fff',
                        opacity: needsSide === 'A' ? 0.25 : 1,
                      }}>
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => setSuggestDismissed(true)}
            className="text-[var(--muted)] hover:text-[var(--text)] transition-colors text-xl leading-none shrink-0"
            aria-label="Dismiss suggestions">
            ×
          </button>
        </div>
      </div>
    )}
    </>
  );
}

export default function TradeAnalyzerPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      </div>
    }>
      <TradeAnalyzerContent />
    </Suspense>
  );
}
