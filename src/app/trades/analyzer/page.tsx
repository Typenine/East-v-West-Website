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

function analyzeTrade(sideA: SelectedAsset[], sideB: SelectedAsset[], source: ValueSource): AnalysisResult {
  const totalA = sideA.reduce((s, a) => s + getDisplayValue(a, source), 0);
  const totalB = sideB.reduce((s, a) => s + getDisplayValue(a, source), 0);

  if (totalA === 0 && totalB === 0) {
    return { rawRatio: 1, adjustedRatio: 1, verdict: 'Add assets to analyze', winner: null, diff: 0, sideAGrade: '—', sideBGrade: '—', notes: [], counterHint: null };
  }

  const max = Math.max(totalA, totalB, 1);
  const rawRatio = Math.min(totalA, totalB) / max;
  const notes: string[] = [];
  let adjustedRatio = rawRatio;

  const bestA = sideA.length > 0 ? Math.max(...sideA.map((a) => getDisplayValue(a, source))) : 0;
  const bestB = sideB.length > 0 ? Math.max(...sideB.map((a) => getDisplayValue(a, source))) : 0;
  const bestSide = bestA >= bestB ? 'A' : 'B';
  if (Math.abs(bestA - bestB) > 1000 && sideA.length > 0 && sideB.length > 0) {
    if ((bestSide === 'A' && totalA >= totalB) || (bestSide === 'B' && totalB >= totalA))
      adjustedRatio = Math.max(0, adjustedRatio - 0.03);
    notes.push(`Side ${bestSide} gets the best player in the deal`);
  }

  if (sideA.length > 0 && sideB.length > 0 && Math.abs(sideA.length - sideB.length) >= 2)
    notes.push(`Side ${sideA.length < sideB.length ? 'A' : 'B'} consolidates talent (fewer pieces)`);

  const picksA = sideA.filter((a) => a.isPick).length;
  const picksB = sideB.filter((a) => a.isPick).length;
  if (picksA !== picksB) notes.push(`Side ${picksA > picksB ? 'A' : 'B'} acquires more draft capital`);

  const ageA = getAvgAge(sideA);
  const ageB = getAvgAge(sideB);
  if (ageA !== null && ageB !== null && Math.abs(ageA - ageB) >= 2)
    notes.push(`Side ${ageA < ageB ? 'A' : 'B'} gets younger (avg ${Math.min(ageA, ageB).toFixed(1)} vs ${Math.max(ageA, ageB).toFixed(1)})`);

  const winner: 'A' | 'B' | null = totalA > totalB ? 'A' : totalB > totalA ? 'B' : null;
  const diff = Math.abs(totalA - totalB);

  let verdict: string;
  if (adjustedRatio >= 0.92) verdict = 'Fair Trade';
  else if (adjustedRatio >= 0.80) verdict = 'Slight Edge';
  else if (adjustedRatio >= 0.65) verdict = 'Uneven';
  else verdict = 'One-Sided';

  const sideAGrade = getGradeLetter(adjustedRatio, winner === 'A' || winner === null);
  const sideBGrade = getGradeLetter(adjustedRatio, winner === 'B' || winner === null);

  let counterHint: string | null = null;
  if (adjustedRatio < 0.80 && winner && diff > 0)
    counterHint = `Side ${winner === 'A' ? 'B' : 'A'} is short ~${formatValue(diff)} pts. Adding or swapping a player would help balance this.`;

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

function AssetChip({ asset, source, onRemove }: { asset: SelectedAsset; source: ValueSource; onRemove: () => void }) {
  const dv = getDisplayValue(asset, source);
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] px-3 py-2 shadow-[var(--shadow-soft)]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center text-sm font-medium text-[var(--text)]">
          <span className="truncate">{asset.name}</span>
          {!asset.isPick && <TrendArrow trend={asset.trend} />}
        </div>
        <div className="text-xs text-[var(--muted)]">
          {asset.isPick ? 'Draft Pick' : `${asset.position} · ${asset.nflTeam || 'FA'}${asset.age ? ` · Age ${asset.age.toFixed(0)}` : ''}`}
          <span className="ml-2 font-medium" style={{ color: 'var(--accent)' }}>{formatValue(dv)}</span>
        </div>
      </div>
      <button onClick={onRemove} className="text-[var(--muted)] hover:text-[var(--danger)] transition-colors text-lg leading-none shrink-0" aria-label={`Remove ${asset.name}`}>×</button>
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

interface PickGroup { year: string; picks: TradeValue[]; }

function PickSelector({ values, excluded, onSelect }: { values: TradeValue[]; excluded: Set<string>; onSelect: (a: SelectedAsset) => void; }) {
  const grouped = useMemo(() => {
    const byYear = new Map<string, TradeValue[]>();
    for (const p of values.filter((v) => v.isPick && !excluded.has(v.sleeperId))) {
      const year = p.name.match(/^(\d{4})/)?.[1] ?? 'Other';
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(p);
    }
    for (const arr of byYear.values()) arr.sort((a, b) => b.value - a.value);
    return Array.from(byYear.keys()).sort().map((y) => ({ year: y, picks: byYear.get(y)! } as PickGroup));
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
              {g.picks.map((v) => (
                <button key={v.sleeperId} onClick={() => { onSelect(assetFromValue(v, true)); setOpen(false); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[var(--surface)] transition-colors border-b border-[var(--border)] last:border-b-0">
                  <span className="text-sm text-[var(--text)]">{v.name.replace(/^\d{4}\s*/, '')}</span>
                  <span className="float-right text-xs font-medium" style={{ color: 'var(--accent)' }}>{formatValue(v.value)}</span>
                </button>
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

function ValueSourceToggle({ source, onChange }: { source: ValueSource; onChange: (s: ValueSource) => void }) {
  return (
    <div className="flex rounded-[var(--radius-card)] border border-[var(--border)] overflow-hidden text-xs">
      {(['avg', 'ktc', 'fc'] as ValueSource[]).map((s) => (
        <button key={s} onClick={() => onChange(s)}
          className="px-3 py-1.5 font-medium transition-colors uppercase"
          style={source === s ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface)', color: 'var(--muted)' }}>
          {s}
        </button>
      ))}
    </div>
  );
}

function TradeSide({ label, color, assets, values, excluded, source, grade, onAdd, onRemove, onClear }: {
  label: string; color: string; assets: SelectedAsset[]; values: TradeValue[];
  excluded: Set<string>; source: ValueSource; grade: string;
  onAdd: (a: SelectedAsset) => void; onRemove: (k: string) => void; onClear: () => void;
}) {
  const total = assets.reduce((s, a) => s + getDisplayValue(a, source), 0);
  const posSummary = buildPosSummary(assets);
  const avgAge = getAvgAge(assets);

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <h3 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wide">{label}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-[var(--text)] opacity-50">{grade}</span>
          <span className="text-sm font-bold" style={{ color }}>{formatValue(total)}</span>
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
        {assets.map((a) => <AssetChip key={a.key} asset={a} source={source} onRemove={() => onRemove(a.key)} />)}
      </div>
    </div>
  );
}

function FairnessMeter({ analysis }: { analysis: AnalysisResult }) {
  if (analysis.verdict === 'Add assets to analyze')
    return <div className="text-center py-4 text-sm text-[var(--muted)]">Add assets to both sides to see the analysis</div>;

  const { adjustedRatio, verdict, winner, diff, notes, counterHint } = analysis;
  const pct = Math.round(adjustedRatio * 100);
  let verdictStyle: React.CSSProperties = {};
  if (adjustedRatio >= 0.92) verdictStyle = { color: '#22c55e' };
  else if (adjustedRatio >= 0.80) verdictStyle = { color: 'var(--gold)' };
  else if (adjustedRatio >= 0.65) verdictStyle = { color: '#f59e0b' };
  else verdictStyle = { color: 'var(--danger)' };

  return (
    <div className="py-4">
      <div className="flex gap-0.5 mb-4 h-4 rounded-full overflow-hidden bg-[var(--surface-strong)]">
        <div className="rounded-l-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: 'var(--accent)' }} />
        <div className="rounded-r-full transition-all duration-500" style={{ width: `${100 - pct}%`, backgroundColor: 'var(--danger)' }} />
      </div>
      <div className="text-center">
        <div className="text-xl font-bold" style={verdictStyle}>{verdict}</div>
        <div className="text-sm text-[var(--muted)] mt-1">
          {pct}% balanced{winner && diff > 0 && <span className="ml-1">· Side {winner} wins by {formatValue(diff)}</span>}
        </div>
        {notes.length > 0 && (
          <div className="mt-3 space-y-1">
            {notes.map((n, i) => <div key={i} className="text-xs text-[var(--muted)] italic">• {n}</div>)}
          </div>
        )}
        {counterHint && (
          <div className="mt-3 mx-auto max-w-sm px-4 py-2 rounded-[var(--radius-card)] bg-[var(--surface-strong)] border border-[var(--border)] text-xs text-[var(--muted)] text-left">
            💡 {counterHint}
          </div>
        )}
      </div>
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
  const [dataSources, setDataSources] = useState<{ fantasyCalc: boolean; keepTradeCut: boolean } | null>(null);
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
  const totalA = sideA.reduce((s, a) => s + getDisplayValue(a, source), 0);
  const totalB = sideB.reduce((s, a) => s + getDisplayValue(a, source), 0);

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
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Trade Analyzer</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Dynasty · Superflex · 12-Team · PPR</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {dataSources && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
                <span className={`w-2 h-2 rounded-full ${dataSources.fantasyCalc ? 'bg-green-500' : 'bg-red-500'}`} title="FantasyCalc" />
                <span>FC</span>
                <span className={`w-2 h-2 rounded-full ml-1 ${dataSources.keepTradeCut ? 'bg-green-500' : 'bg-red-500'}`} title="KeepTradeCut" />
                <span>KTC</span>
              </div>
            )}
            <ValueSourceToggle source={source} onChange={setSource} />
          </div>
        )}
      </div>

      <div className="rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] p-4 md:p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col md:flex-row gap-6">
          <TradeSide label="Side A" color="var(--accent)" assets={sideA} values={values} excluded={excluded} source={source}
            grade={analysis.sideAGrade} onAdd={(a) => setSideA((p) => [...p, a])} onRemove={(k) => setSideA((p) => p.filter((x) => x.key !== k))} onClear={() => setSideA([])} />
          <div className="hidden md:flex items-center"><div className="w-px h-full bg-[var(--border)]" /></div>
          <div className="md:hidden border-t border-[var(--border)]" />
          <TradeSide label="Side B" color="var(--danger)" assets={sideB} values={values} excluded={excluded} source={source}
            grade={analysis.sideBGrade} onAdd={(a) => setSideB((p) => [...p, a])} onRemove={(k) => setSideB((p) => p.filter((x) => x.key !== k))} onClear={() => setSideB([])} />
        </div>
        <div className="mt-6 pt-4 border-t border-[var(--border)]">
          <FairnessMeter analysis={analysis} />
        </div>
      </div>

      {(sideA.length > 0 || sideB.length > 0) && (
        <div className="mt-6 rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] p-4 md:p-6 shadow-[var(--shadow-soft)]">
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
