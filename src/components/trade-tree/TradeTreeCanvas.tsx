/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { TradeGraph, GraphNode as EVWGraphNode, GraphEdge as EVWGraphEdge } from "@/lib/utils/trade-graph";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Edge,
  type Node,
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { getTeamColors } from "@/lib/utils/team-utils";

// Layout constants and basic styles
const NODE_W = 240;
const LANE_W = 520; // content width per lane
const LANE_GUTTER = 48; // space between lanes
const ROW_SPACING = 72; // vertical spacing between rows/sections
const ASSET_H = 56; // visual height of asset node content
const BAND_HEADER_H = 36;
const BAND_PAD_X = 12;
const BAND_PAD_Y = 10;
const GUTTER_X = 24; // ensure >= 24px gutters

function buildTradeColorMap(edges: EVWGraphEdge[]): Map<string, string> {
  const ids = Array.from(new Set(edges.filter(e => e.kind === "traded" && e.tradeId).map(e => e.tradeId as string)));
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
    const toHex = (x: number) => Math.round(255 * x).toString(16).padStart(2, "0");
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  };
  ids.forEach((id, idx) => {
    const hue = (hash(id) + idx * 47) % 360; // spread hues deterministically
    map.set(id, hslToHex(hue, 70, 45));
  });
  return map;
}

function labelFor(n: EVWGraphNode): string {
  if (n.type === "trade") {
    const teams = (n.teams || []).filter(Boolean).join(" ↔ ");
    if (teams && n.date) return `${teams} (${n.date})`;
    if (teams) return teams;
    return n.date ? `Trade (${n.date})` : "Trade";
  }
  return n.label;
}

function nodeStyleFor(kind: EVWGraphNode["type"], teamName?: string): React.CSSProperties {
  const colors = teamName ? getTeamColors(teamName) : undefined;
  switch (kind) {
    case "player":
      return { background: colors?.primary ?? "#DBEAFE", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" };
    case "pick":
      return { background: colors?.secondary ?? "#DCFCE7", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" };
    case "trade":
    default:
      return { background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 10 };
  }
}

// Parse trade meta from an edge id like traded:<tradeId>:<teamIndex>:<assetIndex>
function parseTradeEdgeId(edgeId: string): { tradeId: string; teamIndex: number } | null {
  if (!edgeId.startsWith("traded:")) return null;
  const parts = edgeId.split(":");
  if (parts.length < 3) return null;
  const tradeId = parts[1];
  const teamIndex = Number(parts[2]);
  if (!Number.isFinite(teamIndex)) return null;
  return { tradeId, teamIndex };
}

export type TradeTreeCanvasProps = {
  graph: TradeGraph;
  rootId?: string;
  height?: number;
  onNodeClick?: (node: EVWGraphNode) => void;
};

// --- Custom Node Renderers ---
function AssetNode({ data, id }: any) {
  const n = data.node as EVWGraphNode;
  const icon = n.type === 'player' ? '👤' : n.type === 'pick' ? '🎟️' : '🛡️';
  const chip = data.chip as string | undefined;
  const isDim = data.dim === true;
  return (
    <div
      onMouseEnter={() => data.onHover?.(id, true)}
      onMouseLeave={() => data.onHover?.(id, false)}
      className={`px-3 py-2 rounded-md text-sm shadow-sm border ${isDim ? 'opacity-30' : 'opacity-100'}`}
      style={{ ...(data.style || {}) }}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0">{icon}</span>
        <span className="font-medium truncate" title={data.label}>{data.label}</span>
      </div>
      {chip && (
        <div className="mt-1 text-[11px]">
          <span className="inline-block rounded bg-white/20 border border-white/30 px-1 py-0.5" title={chip}>{chip}</span>
        </div>
      )}
    </div>
  );
}

function BandNode({ data, id }: any) {
  const title = data.title as string;
  const collapsed = data.collapsed === true;
  const isDim = data.dim === true;
  return (
    <div className={`rounded-md border bg-gray-50 ${isDim ? 'opacity-30' : 'opacity-100'}`}>
      <div className="flex items-center justify-between px-3" style={{ height: BAND_HEADER_H }}>
        <button
          className="text-gray-700 hover:text-black text-xs font-medium flex items-center gap-2"
          onClick={() => data.onToggle?.(id)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <span className={`inline-block transition-transform ${collapsed ? '' : 'rotate-90'}`}>▶</span>
          <span className="truncate">{title}</span>
        </button>
      </div>
      {/* children rendered by React Flow as separate nodes with parentNode=this */}
    </div>
  );
}

function JunctionNode() {
  // Invisible 1x1 junction used to merge/split bracket connectors
  return <div style={{ width: 1, height: 1, pointerEvents: 'none', opacity: 0 }} />;
}

const nodeTypes = { asset: AssetNode, band: BandNode, junction: JunctionNode } as const;

export default function TradeTreeCanvas({ graph, height = 640, onNodeClick }: TradeTreeCanvasProps) {
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const initialFitDone = useRef(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selected, setSelected] = useState<EVWGraphNode | null>(null);
  const [collapsedBands, setCollapsedBands] = useState<Record<string, boolean>>({});
  const [bandCenters, setBandCenters] = useState<Record<string, { x: number; y: number }>>({});
  const [baseNodes, setBaseNodes] = useState<Node[]>([]);
  const [baseEdges, setBaseEdges] = useState<Edge[]>([]);
  const [bandLabels, setBandLabels] = useState<Record<string, string>>({});

  // Two-lane layout computation (top-to-bottom, orthogonal edges). No data shape changes, only rendering.
  useEffect(() => {
    // Build trade meta map
    const tradeNodes = graph.nodes.filter((n): n is Extract<EVWGraphNode, { type: "trade" }> => n.type === "trade");
    const tradeById = new Map(tradeNodes.map(t => [t.tradeId, t]));
    const sortedTrades = [...tradeNodes].sort((a, b) => a.date.localeCompare(b.date));
    const rootTeams: [string, string] = sortedTrades.length && sortedTrades[0].teams.length >= 2
      ? [sortedTrades[0].teams[0], sortedTrades[0].teams[1]]
      : ["Team A", "Team B"];

    // Asset -> trade history (receipts)
    const history = new Map<string, Array<{ tradeId: string; teamIndex: number; date: string }>>();
    graph.edges.forEach((e) => {
      if (e.kind !== "traded" || !e.tradeId) return;
      const meta = parseTradeEdgeId(e.id);
      const t = tradeById.get(e.tradeId);
      if (!meta || !t) return;
      const list = history.get(e.to) || [];
      list.push({ tradeId: meta.tradeId, teamIndex: meta.teamIndex, date: t.date });
      history.set(e.to, list);
    });
    history.forEach((list) => list.sort((a, b) => a.date.localeCompare(b.date)));

    // Current owner per asset (based on last receipt in history)
    const currentOwner = new Map<string, string>();
    for (const n of graph.nodes) {
      if (n.type === "player" || n.type === "pick") {
        const list = history.get(n.id) || [];
        const last = list[list.length - 1];
        if (last) {
          const tr = tradeById.get(last.tradeId);
          const ownerTeam = tr?.teams?.[last.teamIndex];
          if (ownerTeam) currentOwner.set(n.id, ownerTeam);
        }
      }
    }

    // Group into per-lane transaction bands (by tradeId where that laneTeam received assets)
    const laneTeamBySide: Record<'left' | 'right', string> = { left: rootTeams[0], right: rootTeams[1] };
    const bandByLane: Record<'left' | 'right', Array<{ tradeId: string; date: string; otherTeams: string; assets: EVWGraphNode[] }>> = { left: [], right: [] };

    for (const t of sortedTrades) {
      for (const side of ["left", "right"] as const) {
        const laneTeam = laneTeamBySide[side];
        const teamIdx = t.teams.findIndex((nm) => nm === laneTeam);
        if (teamIdx < 0) continue;
        // assets in this trade received by this lane team
        const assets: EVWGraphNode[] = [];
        graph.edges.forEach((e) => {
          if (e.kind !== "traded" || e.tradeId !== t.tradeId) return;
          const meta = parseTradeEdgeId(e.id);
          if (!meta || meta.teamIndex !== teamIdx) return;
          const node = graph.nodes.find((nn) => nn.id === e.to);
          if (node && (node.type === 'player' || node.type === 'pick')) assets.push(node);
        });
        if (assets.length) {
          const otherTeams = t.teams.filter((nm) => nm !== laneTeam).join(" + ");
          bandByLane[side].push({ tradeId: t.tradeId, date: t.date, otherTeams, assets });
        }
      }
    }

    // Build nodes/edges with lane headers, bands, assets
    let yLeft = 60; // below lane header
    let yRight = 60;
    const rfNodes: Node[] = [];
    const rfEdges: Edge[] = [];
    const centers: Record<string, { x: number; y: number }> = {};
    const labels: Record<string, string> = {};
    const colorMap = buildTradeColorMap(graph.edges);

    const laneLeftId = "lane:left";
    const laneRightId = "lane:right";
    rfNodes.push({ id: laneLeftId, position: { x: 0, y: 0 }, data: { label: `ACQUIRED BY ${rootTeams[0].toUpperCase()}` }, style: { width: LANE_W, height: 48, background: "#111827", color: "#fff", borderRadius: 8, padding: 8, fontWeight: 700, letterSpacing: 0.5 }, draggable: false, selectable: false });
    rfNodes.push({ id: laneRightId, position: { x: LANE_W + LANE_GUTTER, y: 0 }, data: { label: `ACQUIRED BY ${rootTeams[1].toUpperCase()}` }, style: { width: LANE_W, height: 48, background: "#111827", color: "#fff", borderRadius: 8, padding: 8, fontWeight: 700, letterSpacing: 0.5 }, draggable: false, selectable: false });

    const perRow = Math.max(1, Math.floor((LANE_W - (BAND_PAD_X * 2)) / (NODE_W + GUTTER_X)));
    const isCollapsed = (bandId: string, indexWithinLane: number) => {
      // default collapsed if not in state: collapsed after first 2
      if (bandId in collapsedBands) return !!collapsedBands[bandId];
      return indexWithinLane >= 2;
    };

    for (const side of ["left", "right"] as const) {
      const laneX = side === "left" ? 0 : (LANE_W + LANE_GUTTER);
      const bands = bandByLane[side];
      for (let bi = 0; bi < bands.length; bi++) {
        const b = bands[bi];
        const bandId = `band:${b.tradeId}:${side}`;
        const collapsed = isCollapsed(bandId, bi);
        const assetCount = b.assets.length;
        const rows = collapsed ? 0 : Math.max(0, Math.ceil(assetCount / perRow));
        const bandHeight = BAND_HEADER_H + (rows > 0 ? (BAND_PAD_Y + rows * ASSET_H + (rows - 1) * 12 + BAND_PAD_Y) : 0);
        const bandY = side === 'left' ? yLeft : yRight;
        rfNodes.push({
          id: bandId,
          type: 'band',
          position: { x: laneX, y: bandY },
          data: { title: `TO ${b.otherTeams.toUpperCase()} FOR: ${b.date}`, collapsed, onToggle: (id: string) => setCollapsedBands((prev) => ({ ...prev, [id]: !prev[id] })) },
          style: { width: LANE_W, height: bandHeight },
          sourcePosition: 'bottom',
          targetPosition: 'top',
          draggable: false,
          selectable: false,
        });
        labels[bandId] = `${b.date} • ${laneTeamBySide[side]} acquired from ${b.otherTeams}`;

        // Add bracket-style connectors: assets traded away by this lane in this trade → band
        // Determine out-assets for this lane in this trade by looking at prior owners in history
        const outAssets: EVWGraphNode[] = [];
        for (const n of graph.nodes) {
          if (!(n.type === 'player' || n.type === 'pick')) continue;
          const list = history.get(n.id) || [];
          const idx = list.findIndex(h => h.tradeId === b.tradeId);
          if (idx <= 0) continue; // either not involved or first sighting (no prior owner info)
          const prev = list[idx - 1];
          const prevTrade = tradeById.get(prev.tradeId);
          const curr = list[idx];
          const currTrade = tradeById.get(curr.tradeId);
          if (!prevTrade || !currTrade) continue;
          const prevOwner = prevTrade.teams?.[prev.teamIndex];
          const currOwner = currTrade.teams?.[curr.teamIndex];
          if (prevOwner === laneTeamBySide[side] && currOwner !== laneTeamBySide[side]) {
            outAssets.push(n);
          }
        }
        if (outAssets.length) {
          // Create a hidden junction node slightly above the band header center
          const junctionId = `junction:${bandId}`;
          const jx = laneX + LANE_W / 2;
          const jy = bandY + Math.max(8, BAND_HEADER_H * 0.4);
          rfNodes.push({ id: junctionId, type: 'junction', position: { x: jx, y: jy }, sourcePosition: 'bottom', targetPosition: 'top', draggable: false, selectable: false });
          // Edges from each outgoing asset to the junction (merge)
          const joinColor = colorMap.get(b.tradeId) || '#B91C1C';
          outAssets.forEach((n) => {
            rfEdges.push({ id: `join:${n.id}:${junctionId}`, source: n.id, target: junctionId, type: 'step', style: { stroke: joinColor, strokeWidth: 4 } });
          });
          // Single edge from junction to the band header (label)
          rfEdges.push({ id: `join:${junctionId}:${bandId}`, source: junctionId, target: bandId, type: 'step', style: { stroke: joinColor, strokeWidth: 4 } });
        }

        // place assets as children when expanded
        if (!collapsed) {
          const assetIds: string[] = [];
          b.assets.forEach((n, ai) => {
            const row = Math.floor(ai / perRow);
            const gridCol = ai % perRow;
            const x = BAND_PAD_X + gridCol * (NODE_W + GUTTER_X);
            const y = BAND_HEADER_H + BAND_PAD_Y + row * (ASSET_H + 12);
            const owner = currentOwner.get(n.id);
            const chip = n.type === "pick" && (n as any).season ? `${(n as any).pickInRound ? (n as any).pickInRound : `${(n as any).round}.${(n as any).slot?.toString().padStart(2,'0')}`} (${(n as any).season})${(n as any).becameName ? ` → ${(n as any).becameName}` : ""}` : undefined;
            rfNodes.push({
              id: n.id,
              type: 'asset',
              parentId: bandId,
              extent: 'parent',
              position: { x, y },
              sourcePosition: 'top',
              targetPosition: 'top',
              data: { label: labelFor(n), node: n, chip, onHover: (nid: string, on: boolean) => setHoverId(on ? nid : null), style: nodeStyleFor(n.type, owner) },
              draggable: false,
            });
            assetIds.push(n.id);
          });
          // Create inbound junction inside band to split to assets (bracket style)
          if (assetIds.length) {
            const inJunctionId = `junctionIn:${bandId}`;
            const jxIn = LANE_W / 2; // relative to band
            const jyIn = BAND_HEADER_H + Math.max(6, BAND_PAD_Y * 0.5);
            rfNodes.push({ id: inJunctionId, type: 'junction', parentId: bandId, position: { x: jxIn, y: jyIn }, sourcePosition: 'bottom', targetPosition: 'top', draggable: false, selectable: false });
            const strokeColor = colorMap.get(b.tradeId) || '#374151';
            // band -> junction inside
            rfEdges.push({ id: `bandedge:${bandId}:${inJunctionId}`, source: bandId, target: inJunctionId, type: 'step', style: { stroke: strokeColor, strokeWidth: 4 } });
            // junction -> each asset
            assetIds.forEach((aid) => {
              rfEdges.push({ id: `bandedge:${inJunctionId}:${aid}`, source: inJunctionId, target: aid, type: 'step', style: { stroke: strokeColor, strokeWidth: 4 } });
            });
          }
        }

        // record center for legend navigation
        centers[bandId] = { x: laneX + LANE_W / 2, y: bandY + BAND_HEADER_H / 2 };
        if (side === 'left') yLeft += bandHeight + ROW_SPACING; else yRight += bandHeight + ROW_SPACING;
      }
    }

    // Dashed conversion edges (pick -> player)
    graph.edges.filter(e => e.kind === 'became').forEach((e) => {
      rfEdges.push({ id: e.id, source: e.from, target: e.to, type: 'step', style: { stroke: '#6B7280', strokeWidth: 3, strokeDasharray: '6 4' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#6B7280' } });
    });

    setBaseNodes(rfNodes);
    setBaseEdges(rfEdges);
    setBandCenters(centers);
    setBandLabels(labels);

    // Fit after render
    requestAnimationFrame(() => {
      try {
        if (!initialFitDone.current) {
          rfRef.current?.fitView({ padding: 0.12, duration: 400 });
          initialFitDone.current = true;
        }
      } catch {}
    });
  }, [graph.nodes, graph.edges, collapsedBands]);

  // Hover/path highlighting: dim non-path nodes/edges
  useEffect(() => {
    if (!hoverId) {
      setNodes(baseNodes);
      setEdges(baseEdges);
      return;
    }
    // Build adjacency from current edges
    const adj = new Map<string, Set<string>>();
    const add = (a: string, b: string) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a)!.add(b); };
    baseEdges.forEach((e) => { add(e.source, e.target); add(e.target, e.source); });
    const seen = new Set<string>([hoverId]);
    const q = [hoverId];
    while (q.length) {
      const id = q.shift()!;
      const nb = adj.get(id);
      if (!nb) continue;
      nb.forEach((x) => { if (!seen.has(x)) { seen.add(x); q.push(x); } });
    }
    const newNodes = baseNodes.map((n) => ({ ...n, data: { ...(n.data || {}), dim: !seen.has(n.id) } }));
    const newEdges = baseEdges.map((e) => ({ ...e, style: { ...(e.style || {}), opacity: (seen.has(e.source) && seen.has(e.target)) ? 1 : 0.2 } }));
    setNodes(newNodes);
    setEdges(newEdges);
  }, [hoverId, baseNodes, baseEdges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const onNodeClickInternal = useCallback((_: React.MouseEvent, node: Node) => {
    const meta = node?.data?.node as EVWGraphNode | undefined;
    if (!meta) return;
    setSelected(meta);
    onNodeClick?.(meta);
  }, [onNodeClick]);

  return (
    <div ref={wrapperRef} style={{ height }} className="border rounded overflow-hidden relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClickInternal}
        onNodeMouseEnter={(_: React.MouseEvent, n: Node) => setHoverId(n.id)}
        onNodeMouseLeave={() => setHoverId(null)}
        nodesDraggable={false}
        nodeTypes={nodeTypes as any}
        onInit={(instance: ReactFlowInstance) => {
          rfRef.current = instance;
          // try fit once if nodes already set
          if (!initialFitDone.current && nodes.length) {
            try {
              instance.fitView({ padding: 0.2, duration: 400 });
              initialFitDone.current = true;
            } catch {}
          }
        }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap pannable zoomable />
        <Controls position="bottom-right" />
        <Background gap={16} />
      </ReactFlow>

      {/* Floating Legend / Key */}
      <div className="absolute top-2 right-2 bg-white/90 backdrop-blur border rounded shadow p-2 text-xs space-y-2 w-72 max-h-[60%] overflow-auto">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Legend</div>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-0.5 rounded border text-[11px] hover:bg-gray-50"
              onClick={async () => {
                try {
                  const el = wrapperRef.current as HTMLElement;
                  const mod = await import('html-to-image');
                  const dataUrl = await mod.toPng(el, { backgroundColor: 'white' });
                  const a = document.createElement('a');
                  a.href = dataUrl; a.download = 'trade-tree.png'; a.click();
                } catch {
                  alert('Install html-to-image to enable export: npm i html-to-image');
                }
              }}>Export PNG</button>
            <button
              className="px-2 py-0.5 rounded border text-[11px] hover:bg-gray-50"
              onClick={async () => {
                try {
                  const el = wrapperRef.current as HTMLElement;
                  const mod = await import('html-to-image');
                  const dataUrl = await mod.toSvg(el);
                  const a = document.createElement('a');
                  a.href = dataUrl; a.download = 'trade-tree.svg'; a.click();
                } catch {
                  alert('Install html-to-image to enable export: npm i html-to-image');
                }
              }}>Export SVG</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded" style={{ background: '#111827' }} />
          <span>Lane header</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block border-t-2 w-6" style={{ borderColor: '#374151', borderTopStyle: 'solid' }} />
          <span>Trade (band → asset)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block border-t-2 w-6" style={{ borderColor: '#6B7280', borderTopStyle: 'dashed' }} />
          <span>Pick → Player</span>
        </div>
        <div className="mt-2">
          <div className="font-semibold mb-1">Transaction bands</div>
          <ul className="space-y-1">
            {Object.keys(bandCenters).map((id) => (
              <li key={id}>
                <button
                  className="text-left hover:underline"
                  onClick={() => {
                    const c = bandCenters[id];
                    if (!c) return;
                    rfRef.current?.setCenter?.(c.x, c.y, { zoom: 1.2, duration: 400 });
                  }}
                >{bandLabels[id] ?? id.replace('band:', '').replace(':left',' (L)').replace(':right',' (R)')}</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-[10px] text-gray-500">Hover to trace path; click a node for details; scroll to zoom, drag to pan.</div>
      </div>

      {/* Simple side panel for node details */}
      {selected && (
        <div className="absolute top-0 right-0 h-full w-80 bg-white border-l shadow-lg p-3 overflow-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Details</div>
            <button className="text-gray-500 hover:text-gray-900" onClick={() => setSelected(null)}>✕</button>
          </div>
          <div className="space-y-1 text-sm">
            <div><span className="text-gray-500">Type:</span> {selected.type}</div>
            <div><span className="text-gray-500">Label:</span> {labelFor(selected)}</div>
            {selected.type === 'player' && (
              <div><span className="text-gray-500">Player ID:</span> {selected.playerId}</div>
            )}
            {selected.type === 'pick' && (
              <div>
                <div><span className="text-gray-500">Pick:</span> {selected.season} R{selected.round} S{selected.slot}</div>
                {selected.becameName && <div><span className="text-gray-500">Became:</span> {selected.becameName}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
