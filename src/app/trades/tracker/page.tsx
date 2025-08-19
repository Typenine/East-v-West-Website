'use client';

import { Suspense, useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NextDynamic from 'next/dynamic';
import type { GraphNode as EVWGraphNode, GraphEdge as EVWGraphEdge, TradeGraph as EVWTradeGraph } from '@/lib/utils/trade-graph';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import Label from '@/components/ui/Label';

export const dynamic = 'force-dynamic';

// Dynamically load the React Flow-based canvas on the client only
const TradeTreeCanvas = NextDynamic(() => import('@/components/trade-tree/TradeTreeCanvas'), { ssr: false });

// Build a consistent color per tradeId (distinct hex hues)
function buildTradeColorMap(edges: EVWGraphEdge[]): Map<string, string> {
  const ids = Array.from(new Set(edges.filter(e => e.kind === 'traded' && e.tradeId).map(e => e.tradeId as string)));
  const map = new Map<string, string>();
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  };
  const hslToHex = (h: number, s: number, l: number) => {
    s /= 100; l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  };
  ids.forEach((id, idx) => {
    const hue = (hash(id) + idx * 47) % 360;
    map.set(id, hslToHex(hue, 70, 45));
  });
  return map;
}

function TradeTrackerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rootType = searchParams.get('rootType') || 'player';
  const playerId = searchParams.get('playerId') || '';
  const season = searchParams.get('season') || '';
  const round = searchParams.get('round') || '';
  const slot = searchParams.get('slot') || '';
  const depth = searchParams.get('depth') || '2';

  // Depth slider local state (debounce commits on release)
  const [depthLocal, setDepthLocal] = useState<number>(() => {
    const n = Number(depth);
    return Number.isFinite(n) ? Math.max(1, Math.min(6, n)) : 2;
  });
  useEffect(() => {
    const n = Number(depth);
    setDepthLocal(Number.isFinite(n) ? Math.max(1, Math.min(6, n)) : 2);
  }, [depth]);
  const commitDepth = (v: number) => {
    const sp = new URLSearchParams();
    sp.set('rootType', rootType);
    sp.set('depth', String(v));
    if (rootType === 'player' && playerId) {
      sp.set('playerId', playerId);
    } else if (rootType === 'pick' && season && round && slot) {
      sp.set('season', season);
      sp.set('round', round);
      sp.set('slot', slot);
    }
    router.replace(`/trades/tracker?${sp.toString()}`);
  };

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('rootType', rootType);
    sp.set('depth', depth);
    if (rootType === 'player' && playerId) {
      sp.set('playerId', playerId);
    } else if (rootType === 'pick' && season && round && slot) {
      sp.set('season', season);
      sp.set('round', round);
      sp.set('slot', slot);
    }
    return sp.toString();
  }, [rootType, playerId, season, round, slot, depth]);

  const [graph, setGraph] = useState<EVWTradeGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    setError(null);
    setGraph(null);
    if (!query) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/trade-tree?${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch graph');
      setGraph(data.graph as EVWTradeGraph);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch graph';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Trade Tracker" />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Root</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-[var(--muted)]">
            {rootType === 'player' ? (
              <div>Player ID: <code>{playerId || '—'}</code></div>
            ) : (
              <div>Pick: <code>{season || '—'} R{round || '—'} S{slot || '—'}</code></div>
            )}
            <div className="mt-3">
              <Label htmlFor="depth-slider" className="font-medium flex items-center gap-2">
                Depth
                <span className="inline-block rounded-full evw-surface border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text)]">{depthLocal}</span>
              </Label>
              <input
                type="range"
                min={1}
                max={6}
                step={1}
                value={depthLocal}
                onChange={(e) => setDepthLocal(Number((e.target as HTMLInputElement).value))}
                onMouseUp={() => commitDepth(depthLocal)}
                onTouchEnd={() => commitDepth(depthLocal)}
                onKeyUp={(e) => { if (e.key === 'Enter') commitDepth(depthLocal); }}
                className="w-full mt-1"
                aria-label="Depth slider"
                id="depth-slider"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Graph</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <LoadingState message="Loading graph..." />}
          {error && <ErrorState message={error} retry={fetchGraph} />}
          {!loading && !error && graph && (
            <div>
              <div className="mb-3 text-sm text-[var(--muted)]">
                Nodes: {graph.nodes.length} • Edges: {graph.edges.length}
              </div>
              {(() => {
                // Build legend entries: tradeId -> date + teams + color
                const colorMap = buildTradeColorMap(graph.edges);
                type TradeNode = Extract<EVWGraphNode, { type: 'trade' }>;
                const tradeNodes = graph.nodes.filter((n): n is TradeNode => n.type === 'trade');
                const byId = new Map(tradeNodes.map((t) => [t.tradeId, t]));
                const entries = Array.from(colorMap.keys()).map((tid) => {
                  const tn = byId.get(tid);
                  return tn ? { id: tid, date: tn.date, teams: tn.teams || [], color: colorMap.get(tid)! } : null;
                }).filter(Boolean) as Array<{ id: string; date: string; teams: string[]; color: string }>;
                entries.sort((a, b) => a.date.localeCompare(b.date));
                return entries.length ? (
                  <div className="mb-3">
                    <h3 className="text-sm font-medium mb-1">Trades in view</h3>
                    <ul className="space-y-1 text-sm">
                      {entries.map((e) => (
                        <li key={e.id} className="flex items-center gap-2" title={`${e.teams.join(' ↔ ')} (${e.date})`}>
                          <span className="inline-block w-8 align-middle" style={{ backgroundColor: e.color, height: 3 }} />
                          <span className="truncate">{e.teams.join(' ↔ ')} ({e.date})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null;
              })()}
              <TradeTreeCanvas
                graph={graph}
                rootId={rootType === 'player' ? `player:${playerId}` : `pick:${season}-${round}-${slot}`}
                height={640}
                onNodeClick={(n: EVWGraphNode) => {
                  if (n.type === 'player') {
                    const id = n.playerId;
                    router.push(`/trades/tracker?rootType=player&playerId=${encodeURIComponent(id)}`);
                  } else if (n.type === 'pick') {
                    router.push(`/trades/tracker?rootType=pick&season=${encodeURIComponent(n.season)}&round=${n.round}&slot=${n.slot}`);
                  }
                }}
              />
              <div className="mt-2 text-xs text-[var(--muted)]">
                Legend: <span className="inline-block w-3 h-3 bg-blue-100 border border-blue-400 align-middle mr-1"/> Player •
                <span className="inline-block w-3 h-3 bg-green-100 border border-green-400 align-middle mx-1"/> Pick •
                <span className="inline-block w-3 h-3 bg-gray-100 border border-gray-400 align-middle mx-1"/> Trade •
                <span className="inline-block border-t-2 border-gray-400 align-middle mx-1 w-6"/> traded •
                <span className="inline-block border-t-2 border-dashed border-gray-400 align-middle mx-1 w-6"/> became
              </div>
            </div>
          )}
          {!loading && !error && !graph && (
            <div className="text-[var(--muted)]">Provide a root query to view a trade graph.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function TradeTrackerPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8"><LoadingState message="Loading tracker..." /></div>}>
      <TradeTrackerContent />
    </Suspense>
  );
}
