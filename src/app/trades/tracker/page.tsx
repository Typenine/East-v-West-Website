'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface GraphNodeBase { id: string; type: 'player' | 'pick' | 'trade'; label: string }
interface PlayerNode extends GraphNodeBase { type: 'player'; playerId: string }
interface PickNode extends GraphNodeBase { type: 'pick'; season: string; round: number; slot: number; pickInRound?: number; becameName?: string }
interface TradeNode extends GraphNodeBase { type: 'trade'; tradeId: string; date: string; teams: string[] }

interface GraphEdge { id: string; from: string; to: string; kind: 'traded' | 'became'; tradeId?: string }

interface TradeGraph { nodes: Array<PlayerNode | PickNode | TradeNode>; edges: GraphEdge[] }

export const dynamic = 'force-dynamic';

// Global type order for stable sorting (module scope to avoid Hook deps)
const TYPE_ORDER: Record<PlayerNode['type'] | PickNode['type'] | TradeNode['type'], number> = {
  player: 0,
  pick: 1,
  trade: 2,
};

// Build a consistent color per tradeId using a simple hash -> hue mapping
function buildTradeColorMap(edges: GraphEdge[]): Map<string, string> {
  const ids = Array.from(new Set(edges.filter(e => e.kind === 'traded' && e.tradeId).map(e => e.tradeId as string)));
  const map = new Map<string, string>();
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  };
  ids.forEach((id) => {
    const hue = (hash(id) % 360);
    const color = `hsl(${hue} 60% 45%)`;
    map.set(id, color);
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

  const [graph, setGraph] = useState<TradeGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGraph = async () => {
      setError(null);
      setGraph(null);
      if (!query) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/trade-tree?${query}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to fetch graph');
        setGraph(data.graph);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch graph';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    fetchGraph();
  }, [query]);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Trade Tracker</h1>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="font-semibold mb-2">Root</h2>
        <div className="text-sm text-gray-600">
          {rootType === 'player' ? (
            <div>Player ID: <code>{playerId || '—'}</code></div>
          ) : (
            <div>Pick: <code>{season || '—'} R{round || '—'} S{slot || '—'}</code></div>
          )}
          <div className="mt-3">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              Depth
              <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs border text-gray-700">{depthLocal}</span>
            </label>
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
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="font-semibold mb-3">Graph</h2>
        {loading && <div className="text-gray-500">Loading graph…</div>}
        {error && <div className="text-red-600">{error}</div>}
        {!loading && !error && graph && (
          <div>
            <div className="mb-3 text-sm text-gray-700">
              Nodes: {graph.nodes.length} • Edges: {graph.edges.length}
            </div>
            {(() => {
              // Build legend entries: tradeId -> date + teams + color
              const colorMap = buildTradeColorMap(graph.edges);
              const tradeNodes = graph.nodes.filter((n) => n.type === 'trade') as TradeNode[];
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
                      <li key={e.id} className="flex items-center gap-2" title={`Trade ${e.id}`}>
                        <span className="inline-block w-8 h-0.5" style={{ backgroundColor: e.color }} />
                        <span className="text-gray-700">{e.date}</span>
                        <span className="text-gray-400">•</span>
                        <span className="truncate">{e.teams.join(' ↔ ')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}
            <GraphCanvas
              graph={graph}
              rootId={rootType === 'player' ? `player:${playerId}` : `pick:${season}-${round}-${slot}`}
              tradeColorMap={buildTradeColorMap(graph.edges)}
            />
            <div className="mt-2 text-xs text-gray-500">
              Legend: <span className="inline-block w-3 h-3 bg-blue-100 border border-blue-400 align-middle mr-1"/> Player •
              <span className="inline-block w-3 h-3 bg-green-100 border border-green-400 align-middle mx-1"/> Pick •
              <span className="inline-block w-3 h-3 bg-gray-100 border border-gray-400 align-middle mx-1"/> Trade •
              <span className="inline-block border-t-2 border-gray-400 align-middle mx-1 w-6"/> traded •
              <span className="inline-block border-t-2 border-dashed border-gray-400 align-middle mx-1 w-6"/> became
            </div>
          </div>
        )}
        {!loading && !error && !graph && (
          <div className="text-gray-500">Provide a root query to view a trade graph.</div>
        )}
      </div>
    </div>
  );
}

export default function TradeTrackerPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8">Loading tracker…</div>}>
      <TradeTrackerContent />
    </Suspense>
  );
}

// Simple SVG-based graph renderer with columnar layout by BFS depth from root
function GraphCanvas({ graph, rootId, tradeColorMap: tradeColorMapProp }: { graph: TradeGraph; rootId: string; tradeColorMap?: Map<string, string> }) {
  const router = useRouter();
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Build adjacency for BFS
  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      if (!m.has(a)) m.set(a, new Set());
      if (!m.has(b)) m.set(b, new Set());
      m.get(a)!.add(b);
      m.get(b)!.add(a);
    };
    graph.edges.forEach((e) => add(e.from, e.to));
    return m;
  }, [graph.edges]);

  // Distances from root
  const dist = useMemo(() => {
    const d = new Map<string, number>();
    if (!graph.nodes.some((n) => n.id === rootId)) return d;
    const q: Array<string> = [rootId];
    d.set(rootId, 0);
    while (q.length) {
      const v = q.shift()!;
      const nv = adj.get(v);
      if (!nv) continue;
      const dv = d.get(v)!;
      for (const nb of nv) {
        if (!d.has(nb)) {
          d.set(nb, dv + 1);
          q.push(nb);
        }
      }
    }
    return d;
  }, [adj, graph.nodes, rootId]);

  const columns = useMemo(() => {
    // Group nodes by distance (depth). Unreached nodes grouped at the end.
    const byDepth = new Map<number, TradeGraph['nodes']>();
    const unreached: TradeGraph['nodes'] = [];
    graph.nodes.forEach((n) => {
      const dn = dist.get(n.id);
      if (dn === undefined) {
        unreached.push(n);
      } else {
        const arr = byDepth.get(dn) ?? [];
        arr.push(n);
        byDepth.set(dn, arr);
      }
    });
    const maxDepth = Math.max(0, ...Array.from(byDepth.keys()));
    const cols: TradeGraph['nodes'][] = [];
    for (let i = 0; i <= maxDepth; i++) {
      const arr = (byDepth.get(i) ?? []).slice().sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.label.localeCompare(b.label));
      cols.push(arr);
    }
    if (unreached.length) cols.push(unreached);
    return cols;
  }, [graph.nodes, dist]);

  // Layout constants
  const nodeW = 220;
  const nodeH = 56;
  const colW = 260;
  const rowH = 90;
  const margin = 20;

  // Compute positions
  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number }>();
    columns.forEach((col, ci) => {
      col.forEach((n, ri) => {
        const x = margin + ci * colW;
        const y = margin + ri * rowH;
        pos.set(n.id, { x, y });
      });
    });
    return pos;
  }, [columns]);

  const width = margin * 2 + Math.max(1, columns.length) * colW + nodeW - (colW - nodeW);
  const height = margin * 2 + Math.max(1, Math.max(0, ...columns.map((c) => c.length))) * rowH + nodeH - (rowH - nodeH);

  // Color mapping per tradeId (for traded edges)
  const tradeColorMap = useMemo(() => tradeColorMapProp ?? buildTradeColorMap(graph.edges), [tradeColorMapProp, graph.edges]);

  const tradedMarkerIds = useMemo(() => {
    // Build a stable key for each trade color
    const entries: Array<{ id: string; color: string }> = [];
    for (const [id, color] of tradeColorMap.entries()) entries.push({ id, color });
    return entries;
  }, [tradeColorMap]);

  return (
    <div className="overflow-auto border rounded" style={{ height: Math.min(height + 20, 640) }}>
      <div className="relative" style={{ width, height }}>
        <svg className="absolute inset-0" width={width} height={height}>
          <defs>
            {tradedMarkerIds.map(({ id, color }) => (
              <marker key={id} id={`arrow-traded-${id}`} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L9,3 z" fill={color} />
              </marker>
            ))}
            <marker id="arrow-became" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#9CA3AF" />
            </marker>
          </defs>
          {graph.edges.map((e) => {
            const a = positions.get(e.from);
            const b = positions.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + nodeW / 2;
            const y1 = a.y + nodeH / 2;
            const x2 = b.x + nodeW / 2;
            const y2 = b.y + nodeH / 2;
            const color = e.kind === 'traded' && e.tradeId ? (tradeColorMap.get(e.tradeId) || '#6B7280') : '#9CA3AF';
            const marker = e.kind === 'became' ? 'url(#arrow-became)' : (e.tradeId ? `url(#arrow-traded-${e.tradeId})` : undefined);
            const dash = e.kind === 'became' ? '6 4' : undefined;
            const isHighlighted = !hoverId || e.from === hoverId || e.to === hoverId;
            return (
              <line
                key={e.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeWidth={2}
                strokeDasharray={dash}
                markerEnd={marker}
                opacity={isHighlighted ? 1 : 0.2}
              />
            );
          })}
        </svg>

        {columns.map((col, ci) => (
          <div key={ci} className="absolute" style={{ left: margin + ci * colW, top: 0, width: nodeW }}>
            {col.map((n, ri) => {
              const key = `${n.id}-${ri}`;
              const { x, y } = positions.get(n.id)!;
              const isRoot = n.id === rootId;
              const base =
                n.type === 'player'
                  ? 'bg-blue-100 border-blue-400'
                  : n.type === 'pick'
                  ? 'bg-green-100 border-green-400'
                  : 'bg-gray-100 border-gray-400';
              const onClick = () => {
                if (n.type === 'player') {
                  const id = (n as PlayerNode).playerId;
                  router.push(`/trades/tracker?rootType=player&playerId=${encodeURIComponent(id)}`);
                } else if (n.type === 'pick') {
                  const p = n as PickNode;
                  router.push(`/trades/tracker?rootType=pick&season=${encodeURIComponent(p.season)}&round=${p.round}&slot=${p.slot}`);
                }
              };
              const onMouseEnter = () => setHoverId(n.id);
              const onMouseLeave = () => setHoverId(null);
              const isDimmed = hoverId && hoverId !== n.id && !(adj.get(hoverId)?.has(n.id));
              return (
                <div
                  key={key}
                  className={`absolute border rounded px-3 py-2 shadow-sm ${base} ${isRoot ? 'ring-2 ring-indigo-500' : ''} ${n.type !== 'trade' ? 'cursor-pointer hover:shadow-md transition' : ''}`}
                  style={{ left: x - (margin + ci * colW), top: y, width: nodeW, height: nodeH }}
                  onClick={onClick}
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  aria-label={`Node ${n.label}`}
                  role={n.type !== 'trade' ? 'button' : undefined}
                  tabIndex={n.type !== 'trade' ? 0 : -1}
                  onKeyDown={(e) => {
                    if (n.type !== 'trade' && (e.key === 'Enter' || e.key === ' ')) onClick();
                  }}
                >
                  <div className="text-2xs uppercase tracking-wide text-gray-600" style={{ opacity: isDimmed ? 0.4 : 1 }}>{n.type}</div>
                  <div className="text-sm font-medium truncate" title={n.label} style={{ opacity: isDimmed ? 0.4 : 1 }}>{n.label}</div>
                  {n.type === 'pick' && (
                    <div className="text-xs text-gray-700 truncate" style={{ opacity: isDimmed ? 0.4 : 1 }}>
                      R{(n as PickNode).round} P{(n as PickNode).pickInRound ?? (n as PickNode).slot}
                      {(n as PickNode).becameName ? ` → ${(n as PickNode).becameName}` : ''}
                    </div>
                  )}
                  {n.type === 'trade' && (
                    <div className="text-xs text-gray-700 truncate" style={{ opacity: isDimmed ? 0.4 : 1 }}>
                      {((n as TradeNode).teams || []).join(' ↔ ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
