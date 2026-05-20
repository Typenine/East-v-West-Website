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

// --- Helpers ---

function getFairnessLabel(ratio: number): { label: string; color: string } {
  if (ratio >= 0.9) return { label: 'Fair Trade', color: 'text-green-400' };
  if (ratio >= 0.75) return { label: 'Slight Edge', color: 'text-yellow-400' };
  return { label: 'One-Sided', color: 'text-red-400' };
}

function formatValue(v: number): string {
  return v.toLocaleString();
}

// --- Components ---

function AssetChip({ asset, onRemove }: { asset: SelectedAsset; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-white truncate">{asset.name}</div>
        <div className="text-xs text-gray-400">
          {asset.isPick ? 'Draft Pick' : `${asset.position} · ${asset.team || 'FA'}`}
          <span className="ml-2 text-emerald-400">{formatValue(asset.value)}</span>
        </div>
      </div>
      <button
        onClick={onRemove}
        className="text-gray-500 hover:text-red-400 transition-colors text-lg leading-none"
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
        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg bg-gray-900 border border-white/10 shadow-xl">
          {filtered.map((v) => (
            <button
              key={v.sleeperId}
              onClick={() => handleSelect(v)}
              className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors border-b border-white/5 last:border-b-0"
            >
              <span className="text-sm text-white">{v.name}</span>
              <span className="ml-2 text-xs text-gray-400">{v.position} · {v.team || 'FA'}</span>
              <span className="float-right text-xs text-emerald-400">{formatValue(v.value)}</span>
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

  if (picks.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors text-left"
      >
        + Add Draft Pick
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg bg-gray-900 border border-white/10 shadow-xl">
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
              className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors border-b border-white/5 last:border-b-0"
            >
              <span className="text-sm text-white">{v.name}</span>
              <span className="float-right text-xs text-emerald-400">{formatValue(v.value)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TradeSide({
  label,
  assets,
  values,
  excluded,
  onAdd,
  onRemove,
}: {
  label: string;
  assets: SelectedAsset[];
  values: TradeValue[];
  excluded: Set<string>;
  onAdd: (asset: SelectedAsset) => void;
  onRemove: (key: string) => void;
}) {
  const total = assets.reduce((sum, a) => sum + a.value, 0);

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">{label}</h3>
        <span className="text-sm font-bold text-emerald-400">{formatValue(total)}</span>
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
          <div className="text-center text-gray-600 text-sm py-6">Add players or picks</div>
        )}
        {assets.map((a) => (
          <AssetChip key={a.key} asset={a} onRemove={() => onRemove(a.key)} />
        ))}
      </div>
    </div>
  );
}

function FairnessMeter({ sideA, sideB }: { sideA: number; sideB: number }) {
  if (sideA === 0 && sideB === 0) {
    return (
      <div className="text-center py-4">
        <div className="text-sm text-gray-500">Add assets to both sides to see the analysis</div>
      </div>
    );
  }

  const max = Math.max(sideA, sideB, 1);
  const min = Math.min(sideA, sideB);
  const ratio = max > 0 ? min / max : 1;
  const percentBalanced = Math.round(ratio * 100);
  const { label, color } = getFairnessLabel(ratio);

  const diff = Math.abs(sideA - sideB);
  const winner = sideA > sideB ? 'Side A' : sideB > sideA ? 'Side B' : null;

  // Bar widths
  const aWidth = max > 0 ? (sideA / max) * 100 : 50;
  const bWidth = max > 0 ? (sideB / max) * 100 : 50;

  return (
    <div className="py-4">
      {/* Bar */}
      <div className="flex gap-1 mb-3 h-3 rounded-full overflow-hidden bg-white/5">
        <div
          className="bg-blue-500 rounded-l-full transition-all duration-500"
          style={{ width: `${aWidth}%` }}
        />
        <div
          className="bg-orange-500 rounded-r-full transition-all duration-500"
          style={{ width: `${bWidth}%` }}
        />
      </div>

      {/* Verdict */}
      <div className="text-center">
        <div className={`text-lg font-bold ${color}`}>{label}</div>
        <div className="text-sm text-gray-400">
          {percentBalanced}% balanced
          {winner && diff > 0 && (
            <span className="ml-1">· {winner} wins by {formatValue(diff)}</span>
          )}
        </div>
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

  const totalA = sideA.reduce((s, a) => s + a.value, 0);
  const totalB = sideB.reduce((s, a) => s + a.value, 0);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-6">Trade Analyzer</h1>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
          <span className="ml-3 text-gray-400">Loading trade values...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-white mb-6">Trade Analyzer</h1>
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-6 text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors text-sm"
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
        <h1 className="text-2xl font-bold text-white">Trade Analyzer</h1>
        <p className="text-sm text-gray-400 mt-1">
          Evaluate proposed trades using averaged dynasty values from FantasyCalc and KeepTradeCut (Superflex)
        </p>
      </div>

      {/* Trade Builder */}
      <div className="rounded-xl bg-white/[0.02] border border-white/10 p-4 md:p-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Side A */}
          <TradeSide
            label="Side A"
            assets={sideA}
            values={values}
            excluded={excludedKeys}
            onAdd={(a) => setSideA((prev) => [...prev, a])}
            onRemove={(key) => setSideA((prev) => prev.filter((a) => a.key !== key))}
          />

          {/* Divider */}
          <div className="hidden md:flex items-center">
            <div className="w-px h-full bg-white/10" />
          </div>
          <div className="md:hidden border-t border-white/10" />

          {/* Side B */}
          <TradeSide
            label="Side B"
            assets={sideB}
            values={values}
            excluded={excludedKeys}
            onAdd={(a) => setSideB((prev) => [...prev, a])}
            onRemove={(key) => setSideB((prev) => prev.filter((a) => a.key !== key))}
          />
        </div>

        {/* Fairness Meter */}
        <div className="mt-6 pt-4 border-t border-white/10">
          <FairnessMeter sideA={totalA} sideB={totalB} />
        </div>
      </div>

      {/* Value Breakdown */}
      {(sideA.length > 0 || sideB.length > 0) && (
        <div className="mt-6 rounded-xl bg-white/[0.02] border border-white/10 p-4 md:p-6">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-4">Value Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Side A breakdown */}
            <div>
              <div className="text-xs text-blue-400 font-medium mb-2">SIDE A — {formatValue(totalA)} total</div>
              <div className="space-y-1">
                {sideA.map((a) => (
                  <div key={a.key} className="flex justify-between text-sm">
                    <span className="text-gray-300 truncate">{a.name}</span>
                    <span className="text-gray-500 ml-2 shrink-0">{formatValue(a.value)}</span>
                  </div>
                ))}
                {sideA.length === 0 && <div className="text-xs text-gray-600">No assets</div>}
              </div>
            </div>
            {/* Side B breakdown */}
            <div>
              <div className="text-xs text-orange-400 font-medium mb-2">SIDE B — {formatValue(totalB)} total</div>
              <div className="space-y-1">
                {sideB.map((a) => (
                  <div key={a.key} className="flex justify-between text-sm">
                    <span className="text-gray-300 truncate">{a.name}</span>
                    <span className="text-gray-500 ml-2 shrink-0">{formatValue(a.value)}</span>
                  </div>
                ))}
                {sideB.length === 0 && <div className="text-xs text-gray-600">No assets</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Source attribution */}
      <div className="mt-4 text-center text-xs text-gray-600">
        Values sourced from FantasyCalc and KeepTradeCut · Dynasty Superflex · Updated every 6 hours
      </div>
    </div>
  );
}
