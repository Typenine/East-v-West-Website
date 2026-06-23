'use client';

import { useState, useEffect, useMemo, useRef, useCallback, Suspense, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import type { TradeValue } from '@/lib/types/trade-analyzer';
import SectionHeader from '@/components/ui/SectionHeader';
import {
  BroadcastPanel,
  BroadcastAccentBadge,
  BroadcastSectionLabel,
  BroadcastSubmitButton,
  PANEL,
  broadcastFaintTextStyle,
  broadcastMutedTextStyle,
  broadcastBodyTextStyle,
} from '@/components/ui/BroadcastPanel';
import Chip from '@/components/ui/Chip';

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
  ratio: number;
  verdict: string;
  winner: 'A' | 'B' | null;
  diff: number;          // effective-value gap between sides
  effA: number;          // effective total, Side A
  effB: number;          // effective total, Side B
  rawA: number;          // raw market total, Side A
  rawB: number;          // raw market total, Side B
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

// Winner always caps at 'A' (you got a fair-or-better deal). Loser grade drops as trade tilts.
// Thresholds aligned with verdict bands: 0.95 = Fair, 0.85 = Slight Edge, 0.70 = Uneven.
function getGradeLetter(ratio: number, isWinner: boolean): string {
  if (ratio >= 0.95) return 'A';          // fair zone — both sides
  if (isWinner) return 'A';              // winner always caps at A
  if (ratio >= 0.85) return 'B+';
  if (ratio >= 0.70) return 'B';
  if (ratio >= 0.55) return 'C+';
  if (ratio >= 0.40) return 'C';
  if (ratio >= 0.30) return 'D';
  return 'F';
}

function gradeColor(grade: string): string {
  if (grade === 'A+' || grade === 'A' || grade === 'A-') return '#22c55e';
  if (grade === 'B+' || grade === 'B') return '#eab308';
  if (grade === 'B-' || grade === 'C+') return '#f97316';
  if (grade === 'C' || grade === 'D' || grade === 'F') return '#ef4444';
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

// Stud premium — applied to any player meeting the threshold (not just the single best).
// Thresholds are calibrated on the "avg" 0-10000 scale; callers pass a per-source-normalized
// value (raw × studScale) so the same elite tier triggers regardless of which source is active.
// (Age is intentionally NOT modeled — FC/KTC already price it into the raw value.)
function studMultiplier(normValue: number): number {
  if (normValue >= 8500) return 1.13;
  if (normValue >= 7000) return 1.09;
  if (normValue >= 5500) return 1.06;
  if (normValue >= 4000) return 1.03;
  return 1.0;
}

// Depth discount — combines position-order cost (clutter) with value-relative cost (throwaway pieces).
// Takes whichever is more restrictive. The value ratio is relative to the SIDE'S OWN best player,
// so a fine player isn't penalized merely because the other side happens to hold a bigger stud.
function depthDiscount(idx: number, rawValue: number, sideBest: number): number {
  const posDiscount = idx <= 1 ? 1.0 : idx === 2 ? 0.92 : idx === 3 ? 0.85 : 0.78;
  const ratio = sideBest > 0 ? rawValue / sideBest : 1;
  const valDiscount = ratio >= 0.70 ? 1.0
    : ratio >= 0.50 ? 0.94
    : ratio >= 0.30 ? 0.86
    : ratio >= 0.15 ? 0.74
    : 0.62;
  // Only apply the position-order penalty when the asset is meaningfully below the side's best.
  // Near-equal-value pieces (ratio ≥ 0.85) should not be penalized for being "3rd in order".
  const effectivePosPenalty = ratio >= 0.85 ? 1.0 : posDiscount;
  return Math.min(effectivePosPenalty, valDiscount);
}

// Single source of truth for a side's effective value. Stud premium rewards concentrated value;
// depth discount penalizes clutter/throwaway pieces. Together these capture the consolidation
// effect, so no separate consolidation bonus is needed anywhere downstream.
function effectiveTotal(
  assets: SelectedAsset[],
  source: ValueSource,
  studScale: number,
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

function analyzeTrade(sideA: SelectedAsset[], sideB: SelectedAsset[], source: ValueSource, studScale: number): AnalysisResult {
  const rawA = sideA.reduce((s, a) => s + getDisplayValue(a, source), 0);
  const rawB = sideB.reduce((s, a) => s + getDisplayValue(a, source), 0);

  if (sideA.length === 0 || sideB.length === 0 || (rawA === 0 && rawB === 0)) {
    return { ratio: 1, verdict: 'Add assets to analyze', winner: null, diff: 0, effA: rawA, effB: rawB, rawA, rawB, sideAGrade: '—', sideBGrade: '—', notes: [], counterHint: null };
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

  let verdict: string;
  if (ratio >= 0.95) verdict = 'Fair Trade';
  else if (ratio >= 0.85) verdict = 'Slight Edge';
  else if (ratio >= 0.70) verdict = 'Uneven';
  else verdict = 'One-Sided';

  const sideAGrade = getGradeLetter(ratio, winner === 'A' || winner === null);
  const sideBGrade = getGradeLetter(ratio, winner === 'B' || winner === null);

  let counterHint: string | null = null;
  if (ratio < 0.85 && winner && diff > 0)
    counterHint = `Side ${winner === 'A' ? 'B' : 'A'} is short ~${formatValue(Math.round(diff))} pts. Adding or swapping a player would help balance this.`;

  return { ratio, verdict, winner, diff, effA, effB, rawA, rawB, sideAGrade, sideBGrade, notes, counterHint };
}

// --- Helpers ---

function formatValue(v: number): string {
  return v.toLocaleString();
}

const PANEL_SHELL_STYLE = {
  background: PANEL.card,
  boxShadow: `inset 0 0 0 1px ${PANEL.border}, 0 4px 18px rgba(0,0,0,0.30)`,
} as const;

const ANALYZER_DROPDOWN_STYLE = {
  background: '#131822',
  borderColor: 'rgba(255,255,255,0.16)',
  boxShadow: '0 18px 48px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.08)',
} as const;

const ANALYZER_FIELD_STYLE = {
  background: '#1a2030',
  borderColor: 'rgba(255,255,255,0.18)',
  color: PANEL.text,
} as const;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

function useClickOutside(ref: RefObject<HTMLElement | null>, handler: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let remove: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      const onPointerDown = (e: PointerEvent) => {
        if (ref.current?.contains(e.target as Node)) return;
        handler();
      };
      document.addEventListener('pointerdown', onPointerDown);
      remove = () => document.removeEventListener('pointerdown', onPointerDown);
    }, 0);
    return () => {
      clearTimeout(timer);
      remove?.();
    };
  }, [enabled, handler, ref]);
}

function AnalyzerMobileSheet({ open, onClose, title, children, placement = 'bottom' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; placement?: 'bottom' | 'top' }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const isTop = placement === 'top';

  return createPortal(
    <div className={`fixed inset-0 z-[200] flex flex-col ${isTop ? 'justify-start pt-[max(0.5rem,env(safe-area-inset-top))]' : 'justify-end'}`}>
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={onClose} />
      <div
        className={`relative flex w-full flex-col overflow-hidden border ${isTop ? 'mx-3 max-h-[min(70vh,28rem)] rounded-2xl' : 'max-h-[min(85vh,32rem)] rounded-t-2xl border-t'}`}
        style={ANALYZER_DROPDOWN_STYLE}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
          <span className="text-sm font-bold uppercase tracking-wider" style={broadcastBodyTextStyle}>{title}</span>
          <button type="button" onClick={onClose} className="px-2 py-1 text-2xl leading-none" style={broadcastFaintTextStyle} aria-label="Close">×</button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain py-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AnalyzerDropdownSurface({
  open,
  onClose,
  title,
  isMobile,
  children,
  mobilePlacement = 'bottom',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  isMobile: boolean;
  children: ReactNode;
  mobilePlacement?: 'bottom' | 'top';
}) {
  if (!open) return null;
  if (isMobile) {
    return (
      <AnalyzerMobileSheet open={open} onClose={onClose} title={title} placement={mobilePlacement}>
        {children}
      </AnalyzerMobileSheet>
    );
  }
  return <AnalyzerDropdownMenu>{children}</AnalyzerDropdownMenu>;
}

function AnalyzerDropdownMenu({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={[
        'absolute z-[100] mt-2 left-0 w-max min-w-full max-w-[min(calc(100vw-2rem),24rem)] max-h-80 overflow-y-auto rounded-lg border py-1',
        className,
      ].filter(Boolean).join(' ')}
      style={ANALYZER_DROPDOWN_STYLE}
    >
      {children}
    </div>
  );
}

function AnalyzerDropdownItem({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-11 touch-manipulation text-left px-3 py-3 transition-colors hover:bg-white/10 active:bg-white/15 focus-visible:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/25"
    >
      {children}
    </button>
  );
}

function AnalyzerMenuTrigger({ children, onClick, active }: { children: ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className="w-full min-h-11 touch-manipulation rounded-md border px-3 py-2.5 text-sm font-semibold text-left transition-colors hover:bg-white/[0.12] active:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      style={{
        background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.09)',
        borderColor: active ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.18)',
        color: PANEL.text,
      }}
    >
      {children}
    </button>
  );
}

function AnalyzerFieldInput(props: React.ComponentProps<'input'>) {
  const { className, style, ...rest } = props;
  return (
    <input
      {...rest}
      className={[
        'block w-full min-h-11 touch-manipulation rounded-md border px-3 py-2.5 text-base sm:text-sm placeholder:text-[rgba(233,237,245,0.5)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
        className,
      ].filter(Boolean).join(' ')}
      style={{ ...ANALYZER_FIELD_STYLE, ...style }}
    />
  );
}

function AnalyzerDropdownSection({ children }: { children: ReactNode }) {
  return (
    <div
      className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider sticky top-0 z-[1] border-b"
      style={{ color: PANEL.text, background: '#131822', borderColor: 'rgba(255,255,255,0.10)' }}
    >
      {children}
    </div>
  );
}

function TeamPickerInline({ selected, onSelect }: { selected: string; onSelect: (team: string) => void }) {
  return (
    <div className="mb-4 rounded-lg border overflow-hidden" style={ANALYZER_DROPDOWN_STYLE}>
      <AnalyzerDropdownSection>Select team</AnalyzerDropdownSection>
      <div className="max-h-40 overflow-y-auto">
        {TEAM_NAMES.map((t) => (
          <AnalyzerDropdownItem key={t} onClick={() => onSelect(t)}>
            <span className={`text-sm ${selected === t ? 'font-bold text-white' : 'font-medium'}`} style={selected === t ? undefined : broadcastBodyTextStyle}>
              {t}
            </span>
          </AnalyzerDropdownItem>
        ))}
      </div>
    </div>
  );
}

function TeamPickerList({ selected, onSelect }: { selected: string; onSelect: (team: string) => void }) {
  return (
    <div className="max-h-44 overflow-y-auto border-b" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
      <AnalyzerDropdownSection>Choose team</AnalyzerDropdownSection>
      {TEAM_NAMES.map((t) => (
        <AnalyzerDropdownItem key={t} onClick={() => onSelect(t)}>
          <span className={`text-sm ${selected === t ? 'font-bold text-white' : 'font-medium'}`} style={selected === t ? undefined : broadcastBodyTextStyle}>
            {t}
          </span>
        </AnalyzerDropdownItem>
      ))}
    </div>
  );
}

function AnalyzerMainPanel({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <article
      className="rounded-2xl transition-shadow duration-200 hover:shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
      style={PANEL_SHELL_STYLE}
    >
      <div className="h-[3px] w-full" style={{ background: 'var(--accent)' }} aria-hidden="true" />
      <div
        className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6"
        style={{ background: PANEL.headerBg, borderBottom: `1px solid ${PANEL.hairline}` }}
      >
        <span className="text-[11px] font-extrabold uppercase tracking-[0.3em]" style={broadcastBodyTextStyle}>
          {title}
        </span>
        {meta ? (
          <div className="text-xs font-semibold tabular-nums" style={broadcastMutedTextStyle}>
            {meta}
          </div>
        ) : null}
      </div>
      <div className="px-5 py-4 sm:px-6 overflow-visible">{children}</div>
    </article>
  );
}

// --- Components ---

function TrendArrow({ trend }: { trend: number }) {
  if (trend > 100) return <span className="text-xs font-bold ml-1 text-green-400">↑</span>;
  if (trend < -100) return <span className="text-xs font-bold ml-1" style={{ color: 'var(--danger)' }}>↓</span>;
  return null;
}

function AssetChip({ asset, source, sideTotal, barColor, onRemove }: {
  asset: SelectedAsset; source: ValueSource; sideTotal: number; barColor: string; onRemove: () => void;
}) {
  const dv = getDisplayValue(asset, source);
  const pct = sideTotal > 0 ? Math.min(100, Math.round((dv / sideTotal) * 100)) : 0;
  const posLabel = asset.isPick ? 'Pick' : asset.position;
  return (
    <div
      className="rounded border px-3 py-2.5"
      style={{ background: 'rgba(255,255,255,0.04)', borderColor: PANEL.hairline }}
    >
      <div className="flex items-start gap-2">
        {!asset.isPick && (
          <BroadcastAccentBadge accent={barColor} className="mt-0.5 w-11">
            {posLabel}
          </BroadcastAccentBadge>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center text-sm font-semibold leading-5" style={broadcastBodyTextStyle}>
            <span className="truncate">{asset.name}</span>
            {!asset.isPick && <TrendArrow trend={asset.trend} />}
          </div>
          <div className="text-xs leading-4 mt-0.5" style={broadcastMutedTextStyle}>
            {asset.isPick ? 'Draft Pick' : `${asset.nflTeam || 'FA'}${asset.age ? ` · Age ${asset.age.toFixed(0)}` : ''}`}
            <span className="ml-2 font-semibold tabular-nums" style={{ color: barColor }}>{formatValue(dv)}</span>
            {sideTotal > 0 && <span className="ml-1 opacity-60">{pct}%</span>}
          </div>
        </div>
        <button onClick={onRemove} className="transition-colors text-lg leading-none shrink-0 p-0.5" style={broadcastFaintTextStyle} aria-label={`Remove ${asset.name}`}>×</button>
      </div>
      {sideTotal > 0 && (
        <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.85 }} />
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
  const isMobile = useIsMobile();

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return values.filter((v) => !excluded.has(v.sleeperId) && !v.isPick && v.name.toLowerCase().includes(q)).slice(0, 20);
  }, [query, values, excluded]);

  const close = useCallback(() => setOpen(false), []);
  const showResults = open && query.trim().length > 0;
  useClickOutside(containerRef, close, showResults && !isMobile);

  const getVal = useCallback((v: TradeValue) =>
    source === 'fc' ? (v.fcValue ?? v.value) : source === 'ktc' ? (v.ktcValue ?? v.value) : v.value,
  [source]);

  const resultList = (
    <>
      {filtered.length === 0 ? (
        <div className="px-3 py-4 text-sm" style={broadcastMutedTextStyle}>No players found</div>
      ) : (
        filtered.map((v) => (
          <AnalyzerDropdownItem key={v.sleeperId} onClick={() => { onSelect(assetFromValue(v, false)); setQuery(''); setOpen(false); }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold" style={broadcastBodyTextStyle}>
                  <span className="truncate">{v.name}</span>
                  {v.trend > 100 && <span className="text-xs text-green-400">↑</span>}
                  {v.trend < -100 && <span className="text-xs" style={{ color: 'var(--danger)' }}>↓</span>}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(233,237,245,0.72)' }}>
                  {v.position} · {v.team || 'FA'}{v.age ? ` · ${v.age.toFixed(0)}y` : ''}
                </div>
              </div>
              <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{formatValue(getVal(v))}</span>
            </div>
          </AnalyzerDropdownItem>
        ))
      )}
    </>
  );

  return (
    <div ref={containerRef} className={`relative ${showResults ? 'z-40' : 'z-20'}`}>
      <AnalyzerFieldInput
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search players..."
      />
      <AnalyzerDropdownSurface open={showResults} onClose={close} title="Search players" isMobile={isMobile} mobilePlacement="top">
        {resultList}
      </AnalyzerDropdownSurface>
    </div>
  );
}

const ROUND_LABEL: Record<number, string> = { 1: '1st Round', 2: '2nd Round', 3: '3rd Round', 4: '4th Round' };
const TIER_RANK: Record<string, number> = { EARLY: 0, MID: 1, LATE: 2 };

function pickRound(sleeperId: string): number {
  const m = sleeperId.match(/PICK_\d{4}_(\d)_/);
  return m ? parseInt(m[1]) : 99;
}
function pickSlot(sleeperId: string): number | null {
  const m = sleeperId.match(/PICK_\d{4}_\d+_(\d{2})$/);
  return m ? parseInt(m[1], 10) : null;
}
function isTierPickId(sleeperId: string): boolean {
  return /PICK_\d{4}_\d+_(EARLY|MID|LATE)$/.test(sleeperId);
}
function pickTierRank(sleeperId: string): number {
  const m = sleeperId.match(/_(EARLY|MID|LATE)$/);
  return m ? (TIER_RANK[m[1]] ?? 3) : 3;
}

interface PickRoundGroup { round: number; label: string; picks: TradeValue[]; }
interface PickYearGroup { year: string; rounds: PickRoundGroup[]; }

function PickSelector({ values, excluded, onSelect }: { values: TradeValue[]; excluded: Set<string>; onSelect: (a: SelectedAsset) => void; }) {
  const grouped = useMemo(() => {
    const allPicks = values.filter((v) => v.isPick && !excluded.has(v.sleeperId));
    const numbered = allPicks.filter((v) => pickSlot(v.sleeperId) !== null);
    const tier = allPicks.filter((v) => isTierPickId(v.sleeperId));

    // Prefer numbered slot picks (1.01, 1.02, …); use tier picks only when no slots exist for that year/round.
    const numberedYearRounds = new Set(
      numbered.map((p) => `${p.name.match(/^(\d{4})/)?.[1] ?? 'Other'}_${pickRound(p.sleeperId)}`),
    );
    const picksToShow = [
      ...numbered,
      ...tier.filter((p) => {
        const year = p.name.match(/^(\d{4})/)?.[1] ?? 'Other';
        return !numberedYearRounds.has(`${year}_${pickRound(p.sleeperId)}`);
      }),
    ];

    const byYear = new Map<string, Map<number, TradeValue[]>>();
    for (const p of picksToShow) {
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
        const picks = byRound.get(round)!.sort((a, b) => {
          const slotA = pickSlot(a.sleeperId);
          const slotB = pickSlot(b.sleeperId);
          if (slotA !== null && slotB !== null) return slotA - slotB;
          if (slotA !== null) return -1;
          if (slotB !== null) return 1;
          return pickTierRank(a.sleeperId) - pickTierRank(b.sleeperId) || b.value - a.value;
        });
        rounds.push({ round, label: ROUND_LABEL[round] ?? `Round ${round}`, picks });
      }
      years.push({ year, rounds });
    }
    return years;
  }, [values, excluded]);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open && !isMobile);

  if (!grouped.length) return null;

  const pickList = (
    <>
      {grouped.map((g) => (
        <div key={g.year}>
          <AnalyzerDropdownSection>{g.year} Picks</AnalyzerDropdownSection>
          {g.rounds.map((rg) => (
            <div key={rg.round}>
              <div
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b"
                style={{ color: 'var(--accent)', background: 'rgba(11,95,152,0.22)', borderColor: 'rgba(255,255,255,0.08)' }}
              >
                {rg.label}
              </div>
              {rg.picks.map((v) => {
                const slot = pickSlot(v.sleeperId);
                const label = slot !== null
                  ? `${rg.round}.${String(slot).padStart(2, '0')}`
                  : v.name.replace(/^\d{4}\s*/, '');
                return (
                <AnalyzerDropdownItem key={v.sleeperId} onClick={() => { onSelect(assetFromValue(v, true)); setOpen(false); }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium" style={broadcastBodyTextStyle}>{label}</span>
                    <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{formatValue(v.value)}</span>
                  </div>
                </AnalyzerDropdownItem>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </>
  );

  return (
    <div ref={ref} className="relative z-20 min-w-0">
      <AnalyzerMenuTrigger active={open} onClick={() => setOpen((v) => !v)}>
        + Draft Pick
      </AnalyzerMenuTrigger>
      <AnalyzerDropdownSurface open={open} onClose={close} title="Draft picks" isMobile={isMobile}>
        {pickList}
      </AnalyzerDropdownSurface>
    </div>
  );
}

function RosterPicker({ values, excluded, onAdd }: { values: TradeValue[]; excluded: Set<string>; onAdd: (a: SelectedAsset) => void; }) {
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState('');
  const [roster, setRoster] = useState<{ id: string; name: string; pos: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open && !isMobile);

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

  const rosterList = (
    <>
      <TeamPickerList selected={team} onSelect={loadTeam} />
      {busy && <div className="px-3 py-4 text-sm text-center" style={broadcastMutedTextStyle}>Loading roster…</div>}
      {!busy && team && matched.length === 0 && (
        <div className="px-3 py-4 text-sm text-center" style={broadcastMutedTextStyle}>No matched players found</div>
      )}
      {matched.map((p) => (
        <AnalyzerDropdownItem key={p.id} onClick={() => { onAdd(assetFromValue(p.tv!, false)); setOpen(false); }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={broadcastBodyTextStyle}>{p.name}</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(233,237,245,0.72)' }}>{p.pos}</div>
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>{formatValue(p.tv!.value)}</span>
          </div>
        </AnalyzerDropdownItem>
      ))}
    </>
  );

  return (
    <div ref={ref} className="relative z-20 min-w-0">
      <AnalyzerMenuTrigger active={open} onClick={() => setOpen((v) => !v)}>
        Load from roster…
      </AnalyzerMenuTrigger>
      <AnalyzerDropdownSurface open={open} onClose={close} title="Load from roster" isMobile={isMobile}>
        {rosterList}
      </AnalyzerDropdownSurface>
    </div>
  );
}

function ValueSourceToggle({ source, onChange, ktcAvailable }: { source: ValueSource; onChange: (s: ValueSource) => void; ktcAvailable: boolean }) {
  const isDisabled = (s: ValueSource) => !ktcAvailable && (s === 'ktc' || s === 'avg');
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Value source">
      {(['avg', 'ktc', 'fc'] as ValueSource[]).map((s) => (
        <Chip
          key={s}
          variant="accent"
          size="sm"
          selected={source === s}
          disabled={isDisabled(s)}
          title={isDisabled(s) ? 'KTC unavailable (blocked by server)' : undefined}
          onClick={() => !isDisabled(s) && onChange(s)}
          className={isDisabled(s) ? 'opacity-40 cursor-not-allowed' : 'uppercase'}
        >
          {s}
        </Chip>
      ))}
    </div>
  );
}

function TradeSide({ label, color, assets, values, excluded, source, grade, effTotal, onAdd, onRemove, onClear }: {
  label: string; color: string; assets: SelectedAsset[]; values: TradeValue[];
  excluded: Set<string>; source: ValueSource; grade: string;
  effTotal: number;
  onAdd: (a: SelectedAsset) => void; onRemove: (k: string) => void; onClear: () => void;
}) {
  const rawTotal = assets.reduce((s, a) => s + getDisplayValue(a, source), 0);

  // The side's headline number is its effective value — the same figure that drives the
  // verdict, fairness bar, and grade. The adjustment chip shows how far effective sits from
  // raw market value: a positive delta from stud premium, a negative one from depth/clutter.
  const adjustment = assets.length > 0 ? effTotal - rawTotal : 0;
  const showAdjustment = assets.length > 0 && Math.abs(adjustment) >= 100;
  const displayTotal = assets.length > 0 ? effTotal : rawTotal;

  const posSummary = buildPosSummary(assets);
  const avgAge = getAvgAge(assets);
  const gc = gradeColor(grade);

  return (
    <div className="flex-1 min-w-0 relative z-20">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <BroadcastSectionLabel accent={color}>{label}</BroadcastSectionLabel>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {grade !== '—' && (
            <BroadcastAccentBadge accent={gc} className="!h-6 px-2">
              {grade}
            </BroadcastAccentBadge>
          )}
          <span className="text-sm font-extrabold tabular-nums tracking-tight" style={{ color }}>{formatValue(displayTotal)}</span>
          {assets.length > 0 && (
            <button onClick={onClear} className="text-[10px] font-bold uppercase tracking-wider transition-opacity hover:opacity-80 ml-0.5" style={broadcastFaintTextStyle}>Clear</button>
          )}
        </div>
      </div>

      {posSummary && (
        <div className="text-[11px] mb-2.5" style={broadcastFaintTextStyle}>
          {posSummary}{avgAge !== null && ` · Avg age ${avgAge.toFixed(1)}`}
        </div>
      )}

      <div className="space-y-2 mb-3">
        <PlayerSearch values={values} excluded={excluded} source={source} onSelect={onAdd} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <PickSelector values={values} excluded={excluded} onSelect={onAdd} />
          <RosterPicker values={values} excluded={excluded} onAdd={onAdd} />
        </div>
      </div>

      <div className="space-y-2 min-h-[80px]">
        {assets.length === 0 && <div className="text-center text-sm py-6" style={broadcastMutedTextStyle}>Add players or picks</div>}
        {assets.map((a) => <AssetChip key={a.key} asset={a} source={source} sideTotal={rawTotal} barColor={color} onRemove={() => onRemove(a.key)} />)}
        {showAdjustment && (
          <div className="flex items-center justify-between px-3 py-2 rounded border border-dashed" style={{ borderColor: PANEL.hairline, background: 'rgba(255,255,255,0.03)' }}>
            <span className="text-xs italic" style={broadcastFaintTextStyle}>{adjustment >= 0 ? 'Stud premium' : 'Depth discount'}</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: adjustment >= 0 ? '#4ade80' : '#fb923c' }}>
              {adjustment >= 0 ? '+' : '−'}{formatValue(Math.abs(adjustment))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function FairnessMeter({ analysis, allAssets }: { analysis: AnalysisResult; allAssets: SelectedAsset[] }) {
  if (analysis.verdict === 'Add assets to analyze')
    return <div className="text-center py-4 text-sm" style={broadcastMutedTextStyle}>Add assets to both sides to see the analysis</div>;

  const { ratio, verdict, winner, diff, notes, counterHint, effA, effB } = analysis;
  const grand = effA + effB;
  const pctA = grand > 0 ? Math.round((effA / grand) * 100) : 50;
  const pctB = 100 - pctA;

  let verdictColor = '#4ade80';
  if (ratio < 0.65) verdictColor = '#f87171';
  else if (ratio < 0.80) verdictColor = '#fb923c';
  else if (ratio < 0.92) verdictColor = '#facc15';

  return (
    <div>
      <div className="flex h-7 rounded-full overflow-hidden mb-1 ring-1 ring-white/10">
        <div className="flex items-center justify-end pr-2 transition-all duration-500 text-xs font-bold text-white/90"
          style={{ width: `${pctA}%`, backgroundColor: 'var(--accent)' }}>
          {pctA > 18 && `${pctA}%`}
        </div>
        <div className="flex items-center justify-start pl-2 transition-all duration-500 text-xs font-bold text-white/90"
          style={{ width: `${pctB}%`, backgroundColor: 'var(--danger)' }}>
          {pctB > 18 && `${pctB}%`}
        </div>
      </div>
      <div className="flex justify-between text-xs mb-5" style={broadcastMutedTextStyle}>
        <span style={{ color: 'var(--accent)' }}>Side A · {formatValue(effA)}</span>
        <span style={{ color: 'var(--danger)' }}>Side B · {formatValue(effB)}</span>
      </div>

      <div className="text-center">
        <div className="text-3xl font-extrabold uppercase tracking-[0.12em]" style={{ color: verdictColor }}>{verdict}</div>
        {winner && diff > 0 && (
          <div className="text-sm mt-1" style={broadcastMutedTextStyle}>
            Side {winner} wins by <span className="font-semibold" style={broadcastBodyTextStyle}>{formatValue(diff)}</span>
          </div>
        )}

        {notes.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {notes.map((n, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded border" style={{ ...broadcastFaintTextStyle, borderColor: PANEL.hairline, background: 'rgba(255,255,255,0.04)' }}>
                {n}
              </span>
            ))}
          </div>
        )}

        {counterHint && (
          <div className="mt-3 mx-auto max-w-sm px-4 py-2 rounded border text-xs text-left" style={{ ...broadcastMutedTextStyle, borderColor: PANEL.hairline, background: 'rgba(255,255,255,0.03)' }}>
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
    <BroadcastSubmitButton accent="var(--accent)" type="button" onClick={copy}>
      {copied ? '✓ Link copied!' : 'Share trade link'}
    </BroadcastSubmitButton>
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
    .filter((d) => d.diff >= 1500)
    .sort((a, b) => b.diff - a.diff);

  if (!disagreements.length) return null;

  const lines = disagreements.slice(0, 2).map((d) => {
    const higher = d.ktcHigher ? 'KTC' : 'FC';
    const lower = d.ktcHigher ? 'FC' : 'KTC';
    return `${higher} values ${d.name} ${formatValue(d.diff)} pts higher than ${lower}`;
  });

  const color = disagreements[0].diff >= 2000 ? '#f97316' : '#eab308';
  const extra = disagreements.length > 2 ? ` · +${disagreements.length - 2} more` : '';

  return (
    <div className="mt-2 flex justify-center">
      <span className="text-xs px-3 py-1 rounded text-center border" style={{ color, backgroundColor: color + '18', borderColor: color + '44' }}>
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
    <BroadcastPanel title="Position Breakdown" accent="var(--accent)" className="mt-5">
      <div className="space-y-2">
        {allPos.map((pos) => {
          const a = ga.get(pos) ?? { count: 0, value: 0 };
          const b = gb.get(pos) ?? { count: 0, value: 0 };
          return (
            <div key={pos} className="grid items-center gap-x-3 text-sm" style={{ gridTemplateColumns: '2.5rem 1fr auto 1fr' }}>
              <BroadcastAccentBadge accent="var(--accent)" className="!w-10 justify-center">{pos}</BroadcastAccentBadge>
              <div className="text-right">
                {a.count > 0
                  ? <><span style={{ color: 'var(--accent)' }}>{a.count}×</span><span className="text-xs ml-1 tabular-nums" style={broadcastMutedTextStyle}>{formatValue(a.value)}</span></>
                  : <span className="text-xs opacity-20" style={broadcastFaintTextStyle}>—</span>}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider" style={broadcastFaintTextStyle}>vs</span>
              <div>
                {b.count > 0
                  ? <><span style={{ color: 'var(--danger)' }}>{b.count}×</span><span className="text-xs ml-1 tabular-nums" style={broadcastMutedTextStyle}>{formatValue(b.value)}</span></>
                  : <span className="text-xs opacity-20" style={broadcastFaintTextStyle}>—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </BroadcastPanel>
  );
}

// --- Roster suggestion panel: team-specific balance suggestions ---

function RosterSuggestionPanel({ analysis, values, sideA, sideB, gap, onAddA, onAddB }: {
  analysis: AnalysisResult;
  values: TradeValue[];
  sideA: SelectedAsset[];
  sideB: SelectedAsset[];
  gap: number;
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
    if (!roster.length || gap <= 0) return [];
    const min = gap * (1 - tolerance), max = gap * (1 + tolerance);
    return roster
      .map((p) => ({ ...p, tv: valMap.get(p.id) }))
      .filter((p) => p.tv && !excluded.has(p.id) && p.tv.value >= min && p.tv.value <= max)
      .sort((a, b) => Math.abs(a.tv!.value - gap) - Math.abs(b.tv!.value - gap))
      .slice(0, 6);
  }, [roster, valMap, excluded, gap]);

  if (analysis.ratio >= 0.80 || !analysis.winner) return null;
  const shortSide = analysis.winner === 'A' ? 'B' : 'A';

  return (
    <BroadcastPanel
      title={`Balance Side ${shortSide}`}
      meta={`~${formatValue(Math.round(gap))} pts`}
      accent="var(--danger)"
      className="mt-5"
    >
      <TeamPickerInline selected={team} onSelect={loadTeam} />

      {busy && <div className="text-sm" style={broadcastMutedTextStyle}>Loading roster…</div>}
      {team && !busy && rosterMatches.length === 0 && (
        <div className="text-xs" style={broadcastFaintTextStyle}>No players on this roster match the gap (~{formatValue(Math.round(gap))} pts ±35%).</div>
      )}
      {rosterMatches.length > 0 && (
        <>
          <BroadcastSectionLabel accent="var(--danger)">From {team}</BroadcastSectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {rosterMatches.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded border px-2.5 py-2" style={{ background: 'rgba(255,255,255,0.04)', borderColor: PANEL.hairline }}>
                <div className="min-w-0 mr-2">
                  <div className="text-xs font-semibold truncate" style={broadcastBodyTextStyle}>{p.name}</div>
                  <div className="text-[10px] tabular-nums" style={broadcastMutedTextStyle}>{p.pos} · <span className="text-accent">{formatValue(p.tv!.value)}</span></div>
                </div>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <BroadcastSubmitButton accent="var(--accent)" type="button" onClick={() => onAddA(assetFromValue(p.tv!, false))}>+A</BroadcastSubmitButton>
                  <BroadcastSubmitButton accent="var(--danger)" type="button" onClick={() => onAddB(assetFromValue(p.tv!, false))}>+B</BroadcastSubmitButton>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </BroadcastPanel>
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
  const [dataSources, setDataSources] = useState<{ fantasyCalc: boolean; keepTradeCut: boolean; fcCount?: number; ktcCount?: number; ktcMatchRate?: number } | null>(null);
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

  // Per-source normalization for the stud premium: map each source's top player to ~9999 so the
  // premium thresholds (tuned on the avg scale) fire on the same player tier under FC/KTC/avg.
  const studScale = useMemo(() => {
    let m = 0;
    for (const v of values) {
      if (v.isPick) continue;
      const dv = source === 'fc' ? (v.fcValue ?? v.value) : source === 'ktc' ? (v.ktcValue ?? v.value) : v.value;
      if (dv > m) m = dv;
    }
    return m > 0 ? 9999 / m : 1;
  }, [values, source]);

  const analysis = useMemo(() => analyzeTrade(sideA, sideB, source, studScale), [sideA, sideB, source, studScale]);
  const totalA = analysis.rawA;
  const totalB = analysis.rawB;

  // Suggestions: when both sides have assets, target the effective gap (what the losing side
  // needs to add). When only one side has assets, suggest comparable players for reference.
  const suggestions = useMemo(() => {
    const all = [...sideA, ...sideB];
    if (all.length === 0 || values.length === 0) return [];
    const getVal = (v: TradeValue) =>
      source === 'fc' ? (v.fcValue ?? v.value) : source === 'ktc' ? (v.ktcValue ?? v.value) : v.value;
    const oneSide = sideA.length > 0 ? sideA : sideB;
    const target = sideA.length > 0 && sideB.length > 0
      ? analysis.diff
      : effectiveTotal(oneSide, source, studScale).total;
    return values
      .filter((v) => !excluded.has(v.sleeperId) && getVal(v) > 0)
      .sort((a, b) => Math.abs(getVal(a) - target) - Math.abs(getVal(b) - target))
      .slice(0, 8);
  }, [sideA, sideB, analysis.diff, values, excluded, source, studScale]);

  const suggestionMode: 'balance' | 'compare' = sideA.length > 0 && sideB.length > 0 ? 'balance' : 'compare';
  // Which side is behind (on effective value) and needs the suggested player
  const needsSide: 'A' | 'B' | null = suggestionMode === 'balance'
    ? (analysis.winner === 'A' ? 'B' : analysis.winner === 'B' ? 'A' : null)
    : null;

  const showSuggestions = suggestions.length > 0 && !suggestDismissed;

  // Reset dismissed state when trade is fully cleared
  useEffect(() => {
    if (sideA.length === 0 && sideB.length === 0) setSuggestDismissed(false);
  }, [sideA.length, sideB.length]);

  if (loading) return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Trade Analyzer" subtitle="Dynasty · Superflex · 12-Team · PPR" />
      <BroadcastPanel title="Loading" accent="var(--accent)">
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--accent)] border-t-transparent" />
          <span className="ml-3" style={broadcastMutedTextStyle}>Loading trade values…</span>
        </div>
      </BroadcastPanel>
    </div>
  );

  if (error) return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Trade Analyzer" subtitle="Dynasty · Superflex · 12-Team · PPR" />
      <BroadcastPanel title="Error" accent="var(--danger)">
        <div className="text-center py-8">
          <p style={{ color: 'var(--danger)' }}>{error}</p>
          <div className="mt-4">
            <BroadcastSubmitButton accent="var(--danger)" type="button" onClick={() => window.location.reload()}>
              Retry
            </BroadcastSubmitButton>
          </div>
        </div>
      </BroadcastPanel>
    </div>
  );

  return (
    <>
    <div className={`container mx-auto px-4 py-8${showSuggestions ? ' pb-24' : ''}`}>
      <SectionHeader
        title="Trade Analyzer"
        subtitle="Dynasty · Superflex · 12-Team · PPR"
        actions={isAdmin ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {dataSources && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                <span className={`w-2 h-2 rounded-full ${dataSources.fantasyCalc ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>FC {dataSources.fcCount != null ? `(${dataSources.fcCount})` : ''}</span>
                <span className={`w-2 h-2 rounded-full ml-1 ${dataSources.keepTradeCut ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>KTC {dataSources.ktcCount != null ? `(${dataSources.ktcCount})` : ''}{dataSources.ktcMatchRate != null ? ` · ${dataSources.ktcMatchRate}% matched` : ''}</span>
              </div>
            )}
            <ValueSourceToggle source={source} onChange={setSource} ktcAvailable={!!(dataSources?.ktcCount && dataSources.ktcCount > 0)} />
          </div>
        ) : undefined}
      />

      <AnalyzerMainPanel title="Build Trade">
        <div className="flex flex-col md:flex-row md:items-stretch gap-6">
          <TradeSide label="Side A" color="var(--accent)" assets={sideA} values={values} excluded={excluded} source={source}
            grade={analysis.sideAGrade} effTotal={analysis.effA}
            onAdd={(a) => setSideA((p) => [...p, a])} onRemove={(k) => setSideA((p) => p.filter((x) => x.key !== k))} onClear={() => setSideA([])} />
          <div className="hidden md:flex items-center justify-center shrink-0 px-1">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.22em] px-3 py-1.5 rounded-full border"
              style={{ color: PANEL.faint, borderColor: PANEL.hairline, background: 'rgba(255,255,255,0.04)' }}
            >
              VS
            </span>
          </div>
          <div className="md:hidden border-t" style={{ borderColor: PANEL.hairline }} />
          <TradeSide label="Side B" color="var(--danger)" assets={sideB} values={values} excluded={excluded} source={source}
            grade={analysis.sideBGrade} effTotal={analysis.effB}
            onAdd={(a) => setSideB((p) => [...p, a])} onRemove={(k) => setSideB((p) => p.filter((x) => x.key !== k))} onClear={() => setSideB([])} />
        </div>
        <div className="mt-6 pt-4 border-t" style={{ borderColor: PANEL.hairline }}>
          <div className="rounded border p-4 md:p-5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: PANEL.hairline }}>
            <FairnessMeter analysis={analysis} allAssets={[...sideA, ...sideB]} />
          </div>
        </div>
      </AnalyzerMainPanel>

      {(sideA.length > 0 || sideB.length > 0) && (
        <PositionBreakdown sideA={sideA} sideB={sideB} source={source} />
      )}

      {(sideA.length > 0 && sideB.length > 0) && (
        <RosterSuggestionPanel
          analysis={analysis}
          values={values}
          sideA={sideA}
          sideB={sideB}
          gap={analysis.diff}
          onAddA={(a) => setSideA((p) => [...p, a])}
          onAddB={(a) => setSideB((p) => [...p, a])}
        />
      )}

      {(sideA.length > 0 || sideB.length > 0) && (
        <BroadcastPanel title="Value Breakdown" accent="var(--accent)" className="mt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[{ side: sideA, total: totalA, color: 'var(--accent)', label: 'A' }, { side: sideB, total: totalB, color: 'var(--danger)', label: 'B' }].map(({ side, total, color, label }) => (
              <div key={label}>
                <BroadcastSectionLabel accent={color}>Side {label} · {formatValue(total)} total</BroadcastSectionLabel>
                <div className="space-y-1.5">
                  {side.map((a) => (
                    <div key={a.key} className="flex justify-between text-sm gap-2">
                      <span className="truncate font-medium" style={broadcastBodyTextStyle}>{a.name}</span>
                      <span className="shrink-0 tabular-nums" style={broadcastMutedTextStyle}>{formatValue(getDisplayValue(a, source))}</span>
                    </div>
                  ))}
                  {side.length === 0 && <div className="text-xs" style={broadcastFaintTextStyle}>No assets</div>}
                </div>
              </div>
            ))}
          </div>
        </BroadcastPanel>
      )}

      {(sideA.length > 0 || sideB.length > 0) && (
        <div className="mt-5 flex justify-center gap-3 flex-wrap">
          <ShareButton sideA={sideA} sideB={sideB} />
          <BroadcastSubmitButton accent="var(--danger)" type="button" onClick={() => { setSideA([]); setSideB([]); }}>
            Reset Trade
          </BroadcastSubmitButton>
        </div>
      )}

      <div className="mt-5 text-center text-xs" style={broadcastFaintTextStyle}>
        Values from FantasyCalc &amp; KeepTradeCut · Updated every 6 hours
      </div>
    </div>

    {/* Suggestion strip — sticky bottom, non-intrusive */}
    {showSuggestions && (
      <div
        className="fixed bottom-0 left-0 right-0 z-40 border-t"
        style={{ ...PANEL_SHELL_STYLE, borderTopColor: PANEL.border, backdropFilter: 'blur(12px)' }}
      >
        <div className="h-[2px] w-full" style={{ background: 'var(--accent)' }} aria-hidden="true" />
        <div className="container mx-auto px-4 py-2.5 flex items-center gap-3">
          <div className="shrink-0 hidden sm:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={broadcastFaintTextStyle}>
              {suggestionMode === 'balance' ? 'Balance trade' : 'Compare'}
            </div>
            {suggestionMode === 'balance' && needsSide && (
              <div className="text-[9px] mt-0.5" style={broadcastFaintTextStyle}>add to Side {needsSide}</div>
            )}
          </div>
          <div className="flex gap-2 flex-1 overflow-x-auto pb-0.5">
            {suggestions.map((v) => {
              const val = source === 'fc' ? (v.fcValue ?? v.value) : source === 'ktc' ? (v.ktcValue ?? v.value) : v.value;
              return (
                <div
                  key={v.sleeperId}
                  className="flex items-center gap-2 rounded border px-2.5 py-1.5 shrink-0"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: PANEL.hairline }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold whitespace-nowrap" style={broadcastBodyTextStyle}>
                      {v.isPick ? v.name.replace(/^\d{4}\s*/, '') : v.name}
                    </div>
                    <div className="text-xs whitespace-nowrap tabular-nums" style={broadcastMutedTextStyle}>
                      {v.isPick ? 'Pick' : `${v.position}${v.team ? ` · ${v.team}` : ''}`}
                      {' · '}<span className="text-accent">{formatValue(val)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 ml-1">
                    <div style={{ opacity: needsSide === 'B' ? 0.25 : 1 }}>
                      <BroadcastSubmitButton
                        accent="var(--accent)"
                        type="button"
                        onClick={() => setSideA((p) => [...p, assetFromValue(v, v.isPick)])}
                      >
                        +
                      </BroadcastSubmitButton>
                    </div>
                    <div style={{ opacity: needsSide === 'A' ? 0.25 : 1 }}>
                      <BroadcastSubmitButton
                        accent="var(--danger)"
                        type="button"
                        onClick={() => setSideB((p) => [...p, assetFromValue(v, v.isPick)])}
                      >
                        +
                      </BroadcastSubmitButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => setSuggestDismissed(true)}
            className="transition-opacity hover:opacity-80 text-xl leading-none shrink-0 p-1"
            style={broadcastFaintTextStyle}
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
        <SectionHeader title="Trade Analyzer" subtitle="Dynasty · Superflex · 12-Team · PPR" />
        <BroadcastPanel title="Loading" accent="var(--accent)">
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--accent)] border-t-transparent" />
          </div>
        </BroadcastPanel>
      </div>
    }>
      <TradeAnalyzerContent />
    </Suspense>
  );
}
