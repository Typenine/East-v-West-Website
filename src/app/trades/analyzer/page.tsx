'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { TradeValue } from '@/lib/types/trade-analyzer';

// --- Types ---

interface SelectedAsset {
  key: string;
  name: string;
  position: string;
  team: string;
  value: number;
  isPick: boolean;
}

interface AnalysisResult {
  rawRatio: number;
  adjustedRatio: number;
  verdict: string;
  verdictColor: string;
  winner: 'A' | 'B' | null;
  diff: number;
  sideAGrade: string;
  sideBGrade: string;
  notes: string[];
}

// --- Analysis Logic ---

function getValueTier(value: number): string {
  if (value >= 8000) return 'Elite';
  if (value >= 6000) return 'Star';
  if (value >= 4000) return 'Starter';
  if (value >= 2000) return 'Depth';
  return 'Flier';
}

function getGradeLetter(ratio: number, isWinner: boolean): string {
  if (ratio >= 0.95) return 'A';
  if (ratio >= 0.90) return isWinner ? 'A-' : 'B+';
  if (ratio >= 0.80) return isWinner ? 'B+' : 'B';
  if (ratio >= 0.70) return isWinner ? 'B' : 'C+';
  if (ratio >= 0.60) return isWinner ? 'B-' : 'C';
  return isWinner ? 'A' : 'D';
}

function analyzeTrade(sideA: SelectedAsset[], sideB: SelectedAsset[]): AnalysisResult {
  const totalA = sideA.reduce((s, a) => s + a.value, 0);
  const totalB = sideB.reduce((s, a) => s + a.value, 0);

  if (totalA === 0 && totalB === 0) {
    return {
      rawRatio: 1, adjustedRatio: 1, verdict: 'Add assets to analyze', verdictColor: 'color-muted',
      winner: null, diff: 0, sideAGrade: '—', sideBGrade: '—', notes: [],
    };
  }

  const max = Math.max(totalA, totalB, 1);
  const min = Math.min(totalA, totalB);
  const rawRatio = min / max;

  // Adjustments for better analysis
  const notes: string[] = [];
  let adjustedRatio = rawRatio;

  // 1. "Best player in the trade" bonus — the side getting the single best asset
  //    has a slight edge because consolidation > distribution in dynasty
  const bestA = sideA.length > 0 ? Math.max(...sideA.map((a) => a.value)) : 0;
  const bestB = sideB.length > 0 ? Math.max(...sideB.map((a) => a.value)) : 0;
  const bestPlayerSide = bestA >= bestB ? 'A' : 'B';
  if (Math.abs(bestA - bestB) > 1000 && sideA.length > 0 && sideB.length > 0) {
    // Give ~3% bonus to the side with the best player
    if (bestPlayerSide === 'A' && totalA >= totalB) {
      adjustedRatio = Math.max(0, adjustedRatio - 0.03);
    } else if (bestPlayerSide === 'B' && totalB >= totalA) {
      adjustedRatio = Math.max(0, adjustedRatio - 0.03);
    }
    notes.push(`${bestPlayerSide === 'A' ? 'Side A' : 'Side B'} gets the best player in the deal`);
  }

  // 2. Asset count imbalance — trading fewer pieces for many is generally better
  if (sideA.length > 0 && sideB.length > 0) {
    const countDiff = Math.abs(sideA.length - sideB.length);
    if (countDiff >= 2) {
      const fewerSide = sideA.length < sideB.length ? 'A' : 'B';
      notes.push(`${fewerSide === 'A' ? 'Side A' : 'Side B'} consolidates talent (fewer pieces)`);
    }
  }

  // 3. Youth premium — picks and young players add long-term upside
  const picksA = sideA.filter((a) => a.isPick).length;
  const picksB = sideB.filter((a) => a.isPick).length;
  if (picksA > 0 || picksB > 0) {
    const morePicks = picksA > picksB ? 'A' : picksB > picksA ? 'B' : null;
    if (morePicks) {
      notes.push(`${morePicks === 'A' ? 'Side A' : 'Side B'} acquires more draft capital`);
    }
  }

  // Determine winner
  const winner: 'A' | 'B' | null = totalA > totalB ? 'A' : totalB > totalA ? 'B' : null;
  const diff = Math.abs(totalA - totalB);

  // Verdict
  let verdict: string;
  let verdictColor: string;
  if (adjustedRatio >= 0.92) {
    verdict = 'Fair Trade';
    verdictColor = 'color-success';
  } else if (adjustedRatio >= 0.80) {
    verdict = 'Slight Edge';
    verdictColor = 'color-warning';
  } else if (adjustedRatio >= 0.65) {
    verdict = 'Uneven';
    verdictColor = 'color-caution';
  } else {
    verdict = 'One-Sided';
    verdictColor = 'color-danger';
  }

  // Grades
  const sideAGrade = totalA === 0 && totalB === 0 ? '—' : getGradeLetter(adjustedRatio, winner === 'A' || winner === null);
  const sideBGrade = totalA === 0 && totalB === 0 ? '—' : getGradeLetter(adjustedRatio, winner === 'B' || winner === null);

  return { rawRatio, adjustedRatio, verdict, verdictColor, winner, diff, sideAGrade, sideBGrade, notes };
}

// --- Helpers ---

function formatValue(v: number): string {
  return v.toLocaleString();
}

// --- Components ---

function AssetChip({ asset, onRemove }: { asset: SelectedAsset; onRemove: () => void }) {
  const tier = getValueTier(asset.value);
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] px-3 py-2 shadow-[var(--shadow-soft)]">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text)] truncate">{asset.name}</div>
        <div className="text-xs text-[var(--muted)]">
          {asset.isPick ? 'Draft Pick' : `${asset.position} · ${asset.team || 'FA'}`}
          <span className="ml-2 font-medium" style={{ color: 'var(--accent)' }}>{formatValue(asset.value)}</span>
          <span className="ml-1 opacity-60">({tier})</span>
        </div>
      </div>
      <button
        onClick={onRemove}
        className="text-[var(--muted)] hover:text-[var(--danger)] transition-colors text-lg leading-none"
        aria-label={`Remove ${asset.name}`}
      >
        ×
      </button>
    </div>
  );
}

function PlayerSearch({
  values,
  excluded,
  onSelect,
  placeholder,
}: {
  values: TradeValue[];
  excluded: Set<string>;
  onSelect: (asset: SelectedAsset) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return values
      .filter((v) => !excluded.has(v.sleeperId) && !v.isPick && v.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [query, values, excluded]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((v: TradeValue) => {
    onSelect({
      key: v.sleeperId,
      name: v.name,
      position: v.position,
      team: v.team,
      value: v.value,
      isPick: false,
    });
    setQuery('');
    setOpen(false);
  }, [onSelect]);

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => query.trim() && setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-[var(--radius-card)] bg-[var(--surface-strong)] border border-[var(--border)] shadow-xl">
          {filtered.map((v) => (
            <button
              key={v.sleeperId}
              onClick={() => handleSelect(v)}
              className="w-full text-left px-3 py-2 hover:bg-[var(--surface)] transition-colors border-b border-[var(--border)] last:border-b-0"
            >
              <span className="text-sm text-[var(--text)]">{v.name}</span>
              <span className="ml-2 text-xs text-[var(--muted)]">{v.position} · {v.team || 'FA'}</span>
              <span className="float-right text-xs font-medium" style={{ color: 'var(--accent)' }}>{formatValue(v.value)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PickSelector({
  values,
  excluded,
  onSelect,
}: {
  values: TradeValue[];
  excluded: Set<string>;
  onSelect: (asset: SelectedAsset) => void;
}) {
  const picks = useMemo(() => {
    return values
      .filter((v) => v.isPick && !excluded.has(v.sleeperId))
      .sort((a, b) => b.value - a.value);
  }, [values, excluded]);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (picks.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors text-left"
      >
        + Add Draft Pick
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-[var(--radius-card)] bg-[var(--surface-strong)] border border-[var(--border)] shadow-xl">
          {picks.map((v) => (
            <button
              key={v.sleeperId}
              onClick={() => {
                onSelect({
                  key: v.sleeperId,
                  name: v.name,
                  position: 'PICK',
                  team: '',
                  value: v.value,
                  isPick: true,
                });
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-[var(--surface)] transition-colors border-b border-[var(--border)] last:border-b-0"
            >
              <span className="text-sm text-[var(--text)]">{v.name}</span>
              <span className="float-right text-xs font-medium" style={{ color: 'var(--accent)' }}>{formatValue(v.value)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TradeSide({
  label,
  color,
  assets,
  values,
  excluded,
  grade,
  onAdd,
  onRemove,
}: {
  label: string;
  color: string;
  assets: SelectedAsset[];
  values: TradeValue[];
  excluded: Set<string>;
  grade: string;
  onAdd: (asset: SelectedAsset) => void;
  onRemove: (key: string) => void;
}) {
  const total = assets.reduce((sum, a) => sum + a.value, 0);

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="text-sm font-semibold text-[var(--text)] uppercase tracking-wide">{label}</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-[var(--text)] opacity-60">{grade}</span>
          <span className="text-sm font-bold" style={{ color }}>{formatValue(total)}</span>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        <PlayerSearch
          values={values}
          excluded={excluded}
          onSelect={onAdd}
          placeholder="Search players..."
        />
        <PickSelector values={values} excluded={excluded} onSelect={onAdd} />
      </div>

      <div className="space-y-2 min-h-[80px]">
        {assets.length === 0 && (
          <div className="text-center text-[var(--muted)] text-sm py-6 opacity-60">Add players or picks</div>
        )}
        {assets.map((a) => (
          <AssetChip key={a.key} asset={a} onRemove={() => onRemove(a.key)} />
        ))}
      </div>
    </div>
  );
}

function FairnessMeter({ analysis }: { analysis: AnalysisResult }) {
  if (analysis.verdict === 'Add assets to analyze') {
    return (
      <div className="text-center py-4">
        <div className="text-sm text-[var(--muted)]">Add assets to both sides to see the analysis</div>
      </div>
    );
  }

  const { adjustedRatio, verdict, winner, diff, notes } = analysis;
  const percentBalanced = Math.round(adjustedRatio * 100);

  // Determine color class for verdict
  let verdictStyle: React.CSSProperties = {};
  if (adjustedRatio >= 0.92) verdictStyle = { color: '#22c55e' };
  else if (adjustedRatio >= 0.80) verdictStyle = { color: 'var(--gold)' };
  else if (adjustedRatio >= 0.65) verdictStyle = { color: '#f59e0b' };
  else verdictStyle = { color: 'var(--danger)' };

  return (
    <div className="py-4">
      {/* Bar */}
      <div className="flex gap-0.5 mb-4 h-4 rounded-full overflow-hidden bg-[var(--surface-strong)]">
        <div
          className="rounded-l-full transition-all duration-500"
          style={{ width: `${percentBalanced}%`, backgroundColor: 'var(--accent)' }}
        />
        <div
          className="rounded-r-full transition-all duration-500"
          style={{ width: `${100 - percentBalanced}%`, backgroundColor: 'var(--danger)' }}
        />
      </div>

      {/* Verdict */}
      <div className="text-center">
        <div className="text-xl font-bold" style={verdictStyle}>{verdict}</div>
        <div className="text-sm text-[var(--muted)] mt-1">
          {percentBalanced}% balanced
          {winner && diff > 0 && (
            <span className="ml-1">· Side {winner} wins by {formatValue(diff)}</span>
          )}
        </div>
        {notes.length > 0 && (
          <div className="mt-3 space-y-1">
            {notes.map((note, i) => (
              <div key={i} className="text-xs text-[var(--muted)] italic">• {note}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main Page ---

export default function TradeAnalyzerPage() {
  const [values, setValues] = useState<TradeValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sideA, setSideA] = useState<SelectedAsset[]>([]);
  const [sideB, setSideB] = useState<SelectedAsset[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/trade-analyzer/values');
        if (!res.ok) throw new Error(`Failed to load values (${res.status})`);
        const data = await res.json();
        const vals = Object.values(data.values) as TradeValue[];
        setValues(vals);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load trade values');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const excludedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const a of sideA) keys.add(a.key);
    for (const b of sideB) keys.add(b.key);
    return keys;
  }, [sideA, sideB]);

  const analysis = useMemo(() => analyzeTrade(sideA, sideB), [sideA, sideB]);
  const totalA = sideA.reduce((s, a) => s + a.value, 0);
  const totalB = sideB.reduce((s, a) => s + a.value, 0);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-6">Trade Analyzer</h1>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--accent)] border-t-transparent" />
          <span className="ml-3 text-[var(--muted)]">Loading trade values...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-6">Trade Analyzer</h1>
        <div className="rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--danger)] p-6 text-center">
          <p style={{ color: 'var(--danger)' }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 rounded-[var(--radius-card)] border border-[var(--danger)] text-sm transition-colors hover:opacity-80"
            style={{ color: 'var(--danger)' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text)]">Trade Analyzer</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Evaluate proposed trades using averaged dynasty values from FantasyCalc &amp; KeepTradeCut · 12-Team Superflex PPR
        </p>
      </div>

      {/* Trade Builder */}
      <div className="rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] p-4 md:p-6 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Side A */}
          <TradeSide
            label="Side A"
            color="var(--accent)"
            assets={sideA}
            values={values}
            excluded={excludedKeys}
            grade={analysis.sideAGrade}
            onAdd={(a) => setSideA((prev) => [...prev, a])}
            onRemove={(key) => setSideA((prev) => prev.filter((a) => a.key !== key))}
          />

          {/* Divider */}
          <div className="hidden md:flex items-center">
            <div className="w-px h-full bg-[var(--border)]" />
          </div>
          <div className="md:hidden border-t border-[var(--border)]" />

          {/* Side B */}
          <TradeSide
            label="Side B"
            color="var(--danger)"
            assets={sideB}
            values={values}
            excluded={excludedKeys}
            grade={analysis.sideBGrade}
            onAdd={(a) => setSideB((prev) => [...prev, a])}
            onRemove={(key) => setSideB((prev) => prev.filter((a) => a.key !== key))}
          />
        </div>

        {/* Fairness Meter */}
        <div className="mt-6 pt-4 border-t border-[var(--border)]">
          <FairnessMeter analysis={analysis} />
        </div>
      </div>

      {/* Value Breakdown */}
      {(sideA.length > 0 || sideB.length > 0) && (
        <div className="mt-6 rounded-[var(--radius-card)] bg-[var(--surface)] border border-[var(--border)] p-4 md:p-6 shadow-[var(--shadow-soft)]">
          <h2 className="text-sm font-semibold text-[var(--muted)] uppercase tracking-wide mb-4">Value Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Side A breakdown */}
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--accent)' }}>
                SIDE A — {formatValue(totalA)} total
              </div>
              <div className="space-y-1">
                {sideA.map((a) => (
                  <div key={a.key} className="flex justify-between text-sm">
                    <span className="text-[var(--text)] truncate">{a.name}</span>
                    <span className="text-[var(--muted)] ml-2 shrink-0">{formatValue(a.value)}</span>
                  </div>
                ))}
                {sideA.length === 0 && <div className="text-xs text-[var(--muted)] opacity-50">No assets</div>}
              </div>
            </div>
            {/* Side B breakdown */}
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--danger)' }}>
                SIDE B — {formatValue(totalB)} total
              </div>
              <div className="space-y-1">
                {sideB.map((a) => (
                  <div key={a.key} className="flex justify-between text-sm">
                    <span className="text-[var(--text)] truncate">{a.name}</span>
                    <span className="text-[var(--muted)] ml-2 shrink-0">{formatValue(a.value)}</span>
                  </div>
                ))}
                {sideB.length === 0 && <div className="text-xs text-[var(--muted)] opacity-50">No assets</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reset button */}
      {(sideA.length > 0 || sideB.length > 0) && (
        <div className="mt-4 text-center">
          <button
            onClick={() => { setSideA([]); setSideB([]); }}
            className="px-4 py-2 text-sm rounded-[var(--radius-card)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--text)] transition-colors"
          >
            Reset Trade
          </button>
        </div>
      )}

      {/* Source attribution */}
      <div className="mt-4 text-center text-xs text-[var(--muted)] opacity-60">
        Values sourced from FantasyCalc &amp; KeepTradeCut · Dynasty Superflex · 12-Team · PPR · Updated every 6 hours
      </div>
    </div>
  );
}
