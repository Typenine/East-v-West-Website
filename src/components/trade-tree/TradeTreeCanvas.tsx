/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { TradeGraph, GraphNode as EVWGraphNode } from "@/lib/utils/trade-graph";
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

// Layout constants and basic styles (two-lane bracket layout)
const NODE_W = 180;
const LANE_W = 840; // content width per lane
const LANE_GUTTER = 56; // fixed gutter between lanes
const ROW_SPACING = 104; // vertical spacing between rows/sections
const ASSET_H = 60; // visual height of asset node content
const BAND_HEADER_H = 44;
const BAND_PAD_X = 12;
const BAND_PAD_Y = 14;
const GUTTER_X = 32; // generous gutters
const BRACKET_RED = 'var(--danger)';

// Note: per-trade color mapping removed in favor of a unified bracket color for clarity

function labelFor(n: EVWGraphNode): string {
  if (n.type === "trade") {
    const teams = (n.teams || []).filter(Boolean).join(" ↔ ");
    if (teams && n.date) return `${teams} (${n.date})`;
    if (teams) return teams;
    return n.date ? `Trade (${n.date})` : "Trade";
  }
  return n.label;
}

function nodeStyleFor(kind: EVWGraphNode["type"]): React.CSSProperties {
  // Neutral dark cards with team-colored accent bars for readability
  switch (kind) {
    case "player":
      return { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-soft)", width: NODE_W };
    case "pick":
      return { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-soft)", width: NODE_W };
    case "trade":
    default:
      return { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-soft)", width: NODE_W };
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
  const icon = n.type === 'player' ? '🧍' : n.type === 'pick' ? '🏈' : '🛡️';
  const chip = data.chip as string | undefined;
  const isDim = data.dim === true;
  const accent = (data.accent as string | undefined) ?? 'var(--muted)';
  const tooltip = data.tooltip as string | undefined;
  const pulse = data.pulse === true;

  const [hovered, setHovered] = React.useState(false);
  const longPressTimer = React.useRef<number | null>(null);

  const startLongPress = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      data.onActivate?.(id);
    }, 450);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  return (
    <div
      onMouseEnter={() => { setHovered(true); data.onHover?.(id, true); }}
      onMouseLeave={() => { setHovered(false); data.onHover?.(id, false); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          data.onActivate?.(id);
        }
      }}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchCancel={cancelLongPress}
      tabIndex={0}
      role="button"
      aria-label={data.ariaLabel as string | undefined}
      className={`px-3 py-3 rounded-md text-[13px] shadow-sm border relative ${isDim ? 'opacity-30' : 'opacity-100'}`}
      style={{ ...(data.style || {}) }}
    >
      {pulse && (
        <>
          <span className="absolute inset-0 rounded-md border-2 opacity-60 pointer-events-none" style={{ borderColor: BRACKET_RED }} />
          <span className="absolute inset-0 rounded-md border-2 animate-ping opacity-40 pointer-events-none" style={{ borderColor: BRACKET_RED }} />
        </>
      )}
      <div className="flex items-center gap-2">
        <span className="shrink-0">{icon}</span>
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: accent, boxShadow: '0 0 0 1px color-mix(in srgb, var(--text) 35%, transparent)' }} />
        <span className="font-semibold truncate" title={data.label}>{data.label}</span>
      </div>
      {chip && (
        <div className="mt-1 text-[11px]">
          <span className="inline-block rounded px-1 py-0.5 border" style={{ background: 'color-mix(in srgb, var(--text) 6%, transparent)', borderColor: 'color-mix(in srgb, var(--text) 20%, transparent)' }} title={chip}>{chip}</span>
        </div>
      )}
      {tooltip && hovered && (
        <div className="absolute z-10 -top-2 left-1/2 -translate-x-1/2 -translate-y-full bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] text-[11px] leading-snug px-2 py-1 rounded shadow-lg pointer-events-none w-64">
          {tooltip}
        </div>
      )}
    </div>
  );
}

function BandNode({ data, id }: any) {
  const title = data.title as string;
  const collapsed = data.collapsed === true;
  const isDim = data.dim === true;
  const bus = data.bus as undefined | { rows: Array<{ busY: number; assetTopY: number; xs: number[] }>; color: string };
  const headerColor = (data.headerColor as string | undefined) ?? 'var(--text)';
  // Basic swipe-to-toggle (horizontal)
  const touchStart = React.useRef<{ x: number; y: number } | null>(null);
  const onTS = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTE = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      data.onToggle?.(id);
    }
    touchStart.current = null;
  };
  return (
    <div className={`rounded-md border bg-[var(--surface)] border-[var(--border)] ${isDim ? 'opacity-30' : 'opacity-100'}`} style={{ position: 'relative', width: '100%', height: '100%' }} onTouchStart={onTS} onTouchEnd={onTE}>
      <div className="flex flex-col items-center justify-center px-3" style={{ height: BAND_HEADER_H }}>
        <button
          className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-2"
          onClick={() => data.onToggle?.(id)}
          title={collapsed ? 'Expand' : 'Collapse'}
          style={{ color: headerColor }}
        >
          <span className={`inline-block transition-transform ${collapsed ? '' : 'rotate-90'}`}>▶</span>
          <span className="truncate">{title}</span>
        </button>
        <div className="mt-0.5 flex justify-center w-full">
          <svg width="28" height="8" viewBox="0 0 28 8" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="2" y1="2" x2="26" y2="2" stroke={BRACKET_RED} strokeWidth="3" strokeLinecap="square" />
            <line x1="2" y1="2" x2="2" y2="6" stroke={BRACKET_RED} strokeWidth="3" strokeLinecap="square" />
            <line x1="26" y1="2" x2="26" y2="6" stroke={BRACKET_RED} strokeWidth="3" strokeLinecap="square" />
          </svg>
        </div>
      </div>
      {/* Overlay bus lines to visually group assets like a bracket */}
      {!collapsed && bus?.rows?.length ? (
        <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%" viewBox={`0 0 ${LANE_W} ${Math.max(BAND_HEADER_H + 1, ...bus.rows.map(r => r.assetTopY + ASSET_H))}`}>
          {bus.rows.map((r, idx) => {
            if (!r.xs?.length) return null;
            const minX = Math.min(...r.xs);
            const maxX = Math.max(...r.xs);
            const overhang = 20;
            return (
              <g key={idx}>
                {/* main bus */}
                <g stroke={BRACKET_RED} strokeWidth={5} strokeLinecap="square">
                  <line x1={minX - overhang} y1={r.busY} x2={maxX + overhang} y2={r.busY} />
                </g>
                {/* droplines */}
                <g stroke={BRACKET_RED} strokeWidth={4} strokeLinecap="square">
                  {r.xs.map((x, j) => (
                    <line key={`d-${j}`} x1={x} y1={r.busY} x2={x} y2={r.assetTopY - 2} />
                  ))}
                </g>
                {/* T-caps at bus and near assets */}
                <g stroke={BRACKET_RED} strokeWidth={4} strokeLinecap="square">
                  {r.xs.map((x, j) => (
                    <g key={`c-${j}`}>
                      <line x1={x - 7} y1={r.busY} x2={x + 7} y2={r.busY} />
                      <line x1={x - 7} y1={r.assetTopY - 2} x2={x + 7} y2={r.assetTopY - 2} />
                    </g>
                  ))}
                </g>
              </g>
            );
          })}
        </svg>
      ) : null}
      {/* children rendered by React Flow as separate nodes with parentId=this */}
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const [collapsedBands, setCollapsedBands] = useState<Record<string, boolean>>({});
  const [bandCenters, setBandCenters] = useState<Record<string, { x: number; y: number }>>({});
  const [baseNodes, setBaseNodes] = useState<Node[]>([]);
  const [baseEdges, setBaseEdges] = useState<Edge[]>([]);
  const [bandLabels, setBandLabels] = useState<Record<string, string>>({});
  const [highlightBands, setHighlightBands] = useState<Set<string>>(new Set());
  const highlightTimers = useRef<Record<string, number>>({});
  const [compact, setCompact] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Two-lane layout computation (top-to-bottom, orthogonal edges). No data shape changes, only rendering.
  useEffect(() => {
    // Build trade meta map
    const tradeNodes = graph.nodes.filter((n): n is Extract<EVWGraphNode, { type: "trade" }> => n.type === "trade");
    const tradeById = new Map(tradeNodes.map(t => [t.tradeId, t]));
    const sortedTrades = [...tradeNodes].sort((a, b) => a.date.localeCompare(b.date));
    const rootTeams: [string, string] = sortedTrades.length && sortedTrades[0].teams.length >= 2
      ? [sortedTrades[0].teams[0], sortedTrades[0].teams[1]]
      : ["Team A", "Team B"];
    const leftLaneColors = getTeamColors(rootTeams[0]);
    const rightLaneColors = getTeamColors(rootTeams[1]);

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

    const trace = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('trace') === 'true';
    for (const t of sortedTrades) {
      for (const side of ["left", "right"] as const) {
        const laneTeam = laneTeamBySide[side];
        const counterparties = t.teams.filter((tm) => tm !== laneTeam);
        for (const counterTeam of counterparties) {
          const outAssets: EVWGraphNode[] = [];
          for (const n of graph.nodes) {
            if (!(n.type === 'player' || n.type === 'pick')) continue;
            const list = history.get(n.id) || [];
            const idx = list.findIndex(h => h.tradeId === t.tradeId);
            if (idx < 0) continue; // asset not part of this trade
            const curr = list[idx];
            const currTrade = tradeById.get(curr.tradeId);
            if (!currTrade) continue;
            const currOwner = currTrade.teams?.[curr.teamIndex];
            let prevOwner: string | undefined;
            if (idx > 0) {
              const prev = list[idx - 1];
              const prevTrade = tradeById.get(prev.tradeId);
              prevOwner = prevTrade?.teams?.[prev.teamIndex];
            } else {
              // No prior history in dataset. If this is a 2-team trade, infer sender as the other team.
              if (t.teams.length === 2 && currOwner) {
                prevOwner = t.teams.find((tm) => tm !== currOwner);
              }
            }
            if (prevOwner === laneTeam && currOwner === counterTeam) {
              outAssets.push(n);
            }
          }
          if (outAssets.length) {
            bandByLane[side].push({ tradeId: t.tradeId, date: t.date, otherTeams: counterTeam, assets: outAssets });
            if (trace) {
              // Debug: verify legs match band title
              console.table(outAssets.map((n) => {
                const list = history.get(n.id) || [];
                const idx = list.findIndex(h => h.tradeId === t.tradeId);
                const curr = list[idx];
                const currOwner = tradeById.get(curr.tradeId)?.teams?.[curr.teamIndex];
                let prevOwner: string | undefined;
                if (idx > 0) {
                  const prev = list[idx - 1];
                  prevOwner = tradeById.get(prev.tradeId)?.teams?.[prev.teamIndex];
                } else if (t.teams.length === 2 && currOwner) {
                  prevOwner = t.teams.find((tm) => tm !== currOwner);
                }
                return { fromTeamId: prevOwner, toTeamId: currOwner, date: t.date, label: labelFor(n) };
              }));
            }
          }
        }
      }
    }

    // Build nodes/edges with lane headers, bands, assets
    let yLeft = 60; // below lane header
    let yRight = 60;
    const rfNodes: Node[] = [];
    const rfEdges: Edge[] = [];
    // Track cloned node ids per asset for later connectors (e.g., pick -> player)
    const clonesByAsset = new Map<string, string[]>();
    const centers: Record<string, { x: number; y: number }> = {};
    const labels: Record<string, string> = {};
    // const colorMap = buildTradeColorMap(graph.edges); // not used when using a unified bracket color

    const laneLeftId = "lane:left";
    const laneRightId = "lane:right";

    const isCollapsed = (bandId: string, indexWithinLane: number) => {
      // default collapsed if not in state: collapsed after first 2
      if (bandId in collapsedBands) return !!collapsedBands[bandId];
      return indexWithinLane >= 2;
    };

    for (const side of ["left", "right"] as const) {
      if (side === 'right' && compact) {
        // stack below left lane
        yRight = yLeft + 60;
      }
      const laneX = side === "left" ? 0 : (compact ? 0 : (LANE_W + LANE_GUTTER));
      const bands = bandByLane[side];
      for (let bi = 0; bi < bands.length; bi++) {
        const b = bands[bi];
        const bandId = `band:${b.tradeId}:${side}`;
        const collapsed = isCollapsed(bandId, bi);
        const assetCount = b.assets.length;
        const MAX_COLS = 4;
        const rows = collapsed ? 0 : (assetCount === 0 ? 0 : (assetCount <= MAX_COLS ? 1 : Math.ceil(assetCount / MAX_COLS)));
        const bandHeight = BAND_HEADER_H + (rows > 0 ? (BAND_PAD_Y + rows * ASSET_H + (rows - 1) * 12 + BAND_PAD_Y) : 0);
        const bandY = side === 'left' ? yLeft : yRight;
        const laneAccent = side === 'left' ? leftLaneColors.primary : rightLaneColors.primary;
        const bandData: any = {
          title: `TO ${b.otherTeams.toUpperCase()} FOR: ${b.date}`,
          collapsed,
          headerColor: laneAccent,
          onToggle: (id: string) => setCollapsedBands((prev) => ({ ...prev, [id]: !prev[id] })),
        };
        rfNodes.push({
          id: bandId,
          type: 'band',
          position: { x: laneX, y: bandY },
          data: bandData,
          style: { width: LANE_W, height: bandHeight, borderColor: 'var(--border)', boxShadow: 'var(--shadow-soft)' },
          sourcePosition: 'bottom',
          targetPosition: 'top',
          draggable: false,
          selectable: false,
        });
        labels[bandId] = `TO ${b.otherTeams.toUpperCase()} FOR: ${b.date}`;
        const bandStrokeColor = BRACKET_RED;

        // Add bracket-style connectors for outgoing assets in this band
        const outAssets: EVWGraphNode[] = b.assets;
        if (outAssets.length) {
          // Create a hidden junction node slightly above the band header center
          const junctionId = `junction:${bandId}`;
          const jx = laneX + LANE_W / 2;
          const jy = bandY + Math.max(8, BAND_HEADER_H * 0.4);
          rfNodes.push({ id: junctionId, type: 'junction', position: { x: jx, y: jy }, sourcePosition: 'bottom', targetPosition: 'top', draggable: false, selectable: false });
          // Edges from each outgoing asset to the junction (merge)
          const joinColor = BRACKET_RED;
          if (!collapsed) {
            outAssets.forEach((n) => {
              const cloneId = `asset:${n.id}:${bandId}`;
              rfEdges.push({ id: `join:${cloneId}:${junctionId}`, source: cloneId, target: junctionId, type: 'step', style: { stroke: joinColor, strokeWidth: 4 }, markerEnd: { type: MarkerType.ArrowClosed, color: joinColor } });
            });
          }
          // Single edge from junction to the band header (label)
          rfEdges.push({ id: `join:${junctionId}:${bandId}`, source: junctionId, target: bandId, type: 'step', style: { stroke: joinColor, strokeWidth: 4 }, markerEnd: { type: MarkerType.ArrowClosed, color: joinColor } });

          // Across-gutter connectors: from this band's brace junction to counterpart lane's chips for the same trade
          const laneTeamName = laneTeamBySide[side];
          const otherSide = side === 'left' ? 'right' as const : 'left' as const;
          // Find the band on the opposite lane in the same trade whose counterparty is this lane team
          const oppBands = (bandByLane[otherSide] || []);
          const oppIdx = oppBands.findIndex(bb => bb.tradeId === b.tradeId && bb.otherTeams === laneTeamName);
          const oppBand = oppIdx >= 0 ? oppBands[oppIdx] : undefined;
          if (oppBand && oppBand.assets.length) {
            const laneAccent = side === 'left' ? leftLaneColors.primary : rightLaneColors.primary;
            const oppBandId = `band:${b.tradeId}:${otherSide}`;
            const oppCollapsed = isCollapsed(oppBandId, oppIdx);
            if (oppCollapsed) {
              // collapsed: single connector to the opposite band header (avoid duplicate edge ids)
              rfEdges.push({
                id: `xg:${junctionId}:${oppBandId}`,
                source: junctionId,
                target: oppBandId,
                type: 'bezier',
                style: { stroke: laneAccent, strokeWidth: 3 },
                markerEnd: { type: MarkerType.ArrowClosed, color: laneAccent },
              });
            } else {
              oppBand.assets.forEach((n) => {
                const dashed = n.type === 'pick' ? '6 4' : undefined;
                const targetCloneId = `asset:${n.id}:${oppBandId}`;
                rfEdges.push({
                  id: `xg:${junctionId}:${targetCloneId}`,
                  source: junctionId,
                  target: targetCloneId,
                  type: 'bezier',
                  style: { stroke: laneAccent, strokeWidth: 3, ...(dashed ? { strokeDasharray: dashed } : {}) },
                  markerEnd: { type: MarkerType.ArrowClosed, color: laneAccent },
                });
              });
            }
          }
        }

        // place assets as children when expanded
        if (!collapsed) {
          const assetIds: string[] = [];
          const rowsAnchors: Array<{ busY: number; assetTopY: number; xs: number[] }> = [];
          b.assets.forEach((n, ai) => {
            const MAX_COLS = 4;
            const rowsCount = assetCount <= MAX_COLS ? 1 : Math.ceil(assetCount / MAX_COLS);
            const row = assetCount <= MAX_COLS ? 0 : Math.floor(ai / MAX_COLS);
            const indexInRow = assetCount <= MAX_COLS ? ai : (ai % MAX_COLS);
            const itemsInThisRow = assetCount <= MAX_COLS
              ? assetCount
              : (row === rowsCount - 1 ? (assetCount % MAX_COLS || MAX_COLS) : MAX_COLS);
            const totalRowW = itemsInThisRow * NODE_W + (itemsInThisRow - 1) * GUTTER_X;
            const startX = Math.max(BAND_PAD_X, (LANE_W - totalRowW) / 2);
            const x = startX + indexInRow * (NODE_W + GUTTER_X);
            const y = BAND_HEADER_H + BAND_PAD_Y + row * (ASSET_H + 12);
            const owner = currentOwner.get(n.id);
            const colors = owner ? getTeamColors(owner) : undefined;
            const accent = colors?.secondary || colors?.primary || '#9CA3AF';
            const chip = n.type === "pick" && (n as any).season ? `${(n as any).pickInRound ? (n as any).pickInRound : `${(n as any).round}.${(n as any).slot?.toString().padStart(2,'0')}`} (${(n as any).season})${(n as any).becameName ? ` → ${(n as any).becameName}` : ""}` : undefined;
            const aria = `${labelFor(n)}, sent by ${laneTeamBySide[side]} to ${b.otherTeams} on ${b.date}`;
            const cloneId = `asset:${n.id}:${bandId}`;
            rfNodes.push({
              id: cloneId,
              type: 'asset',
              parentId: bandId,
              extent: 'parent',
              position: { x, y },
              sourcePosition: 'top',
              targetPosition: 'top',
              data: {
                label: labelFor(n),
                node: n,
                chip,
                accent,
                ariaLabel: aria,
                onHover: (nid: string, on: boolean) => setHoverId(on ? nid : null),
                onActivate: (nid?: string) => { setCollapsedBands((prev) => ({ ...prev, [bandId]: false })); setSelected(n); setSelectedId(nid ?? cloneId); onNodeClick?.(n); },
                style: nodeStyleFor(n.type),
                tooltip: (() => {
                  const currOwner = currentOwner.get(n.id);
                  if (n.type === 'pick') {
                    const oon = (n as any).originalOwnerName as string | undefined;
                    const parts = [labelFor(n)];
                    if (oon) parts.push(`Original owner: ${oon}`);
                    if (currOwner) parts.push(`Current owner: ${currOwner}`);
                    if ((n as any).becameName) parts.push(`Became: ${(n as any).becameName}`);
                    return parts.join('\n');
                  }
                  if (currOwner) return `${labelFor(n)}\nCurrent owner: ${currOwner}`;
                  return labelFor(n);
                })(),
              },
              draggable: false,
            });
            assetIds.push(cloneId);
            // record clone mapping for later 'became' connectors
            const arr = clonesByAsset.get(n.id) || [];
            arr.push(cloneId);
            clonesByAsset.set(n.id, arr);
            // collect anchors for bus overlay per row (longer droplines)
            if (!rowsAnchors[row]) rowsAnchors[row] = { busY: y - 28, assetTopY: y, xs: [] };
            rowsAnchors[row].xs.push(x + NODE_W / 2);
          });
          // Create inbound junction inside band to split to assets (bracket style)
          if (assetIds.length) {
            const inJunctionId = `junctionIn:${bandId}`;
            const jxIn = LANE_W / 2; // relative to band
            const jyIn = BAND_HEADER_H + Math.max(6, BAND_PAD_Y * 0.5);
            rfNodes.push({ id: inJunctionId, type: 'junction', parentId: bandId, position: { x: jxIn, y: jyIn }, sourcePosition: 'bottom', targetPosition: 'top', draggable: false, selectable: false });
            const strokeColor = bandStrokeColor;
            // band -> junction inside
            rfEdges.push({ id: `bandedge:${bandId}:${inJunctionId}`, source: bandId, target: inJunctionId, type: 'step', style: { stroke: strokeColor, strokeWidth: 0.01, opacity: 0 } });
            // junction -> each asset
            assetIds.forEach((aid) => {
              rfEdges.push({ id: `bandedge:${inJunctionId}:${aid}`, source: inJunctionId, target: aid, type: 'step', style: { stroke: strokeColor, strokeWidth: 0.01, opacity: 0 } });
            });
            // pass bus overlay data to band node for visual grouping
            bandData.bus = { rows: rowsAnchors.filter(Boolean), color: strokeColor };
          }
        }

        // record center for legend navigation
        centers[bandId] = { x: laneX + LANE_W / 2, y: bandY + BAND_HEADER_H / 2 };
        if (side === 'left') yLeft += bandHeight + ROW_SPACING; else yRight += bandHeight + ROW_SPACING;
      }
    }

    // Lane headers after computing layout so compact stacking can position right header correctly
    const rightHeaderY = compact ? (yRight - 60) : 0;
    rfNodes.push({ id: laneLeftId, position: { x: 0, y: 0 }, data: { label: `ACQUIRED BY ${rootTeams[0].toUpperCase()}` }, style: { width: LANE_W, height: 48, background: "transparent", color: leftLaneColors.primary, borderRadius: 0, padding: 8, fontWeight: 800, letterSpacing: 0.6, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `2px solid ${leftLaneColors.primary}` }, draggable: false, selectable: false });
    rfNodes.push({ id: laneRightId, position: { x: compact ? 0 : (LANE_W + LANE_GUTTER), y: rightHeaderY }, data: { label: `ACQUIRED BY ${rootTeams[1].toUpperCase()}` }, style: { width: LANE_W, height: 48, background: "transparent", color: rightLaneColors.primary, borderRadius: 0, padding: 8, fontWeight: 800, letterSpacing: 0.6, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: `2px solid ${rightLaneColors.primary}` }, draggable: false, selectable: false });

    // Dashed conversion edges (pick -> player) — connect clones when available
    graph.edges.filter(e => e.kind === 'became').forEach((e) => {
      const fromClones = clonesByAsset.get(e.from) || [];
      const toClones = clonesByAsset.get(e.to) || [];
      if (fromClones.length && toClones.length) {
        // Prefer same-band connection if possible
        const bandOf = (cid: string) => cid.split(':').slice(2).join(':'); // asset:<id>:<bandId>
        const pair = fromClones.flatMap(f => toClones.map(t => [f, t] as const)).find(([f, t]) => bandOf(f) === bandOf(t));
        const [src, dst] = pair || [fromClones[0], toClones[0]];
        rfEdges.push({ id: `became:${src}:${dst}`, source: src, target: dst, type: 'step', style: { stroke: 'var(--muted)', strokeWidth: 3, strokeDasharray: '6 4' }, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--muted)' } });
      }
      // If no clones exist yet (both collapsed), skip; edge will appear once bands are expanded and clones exist
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
  }, [graph.nodes, graph.edges, collapsedBands, compact, onNodeClick]);

  // Hover/path highlighting + legend pulse: dim non-path items and pulse band borders
  useEffect(() => {
    const applyBandPulse = (arr: Node[]) => arr.map((n) => {
      if (n.type === 'band' && highlightBands.has(n.id)) {
        return { ...n, style: { ...(n.style || {}), borderColor: BRACKET_RED, boxShadow: '0 0 0 2px color-mix(in srgb, var(--danger) 50%, transparent) inset, 0 0 0 2px color-mix(in srgb, var(--danger) 25%, transparent)' } } as Node;
      }
      return n;
    });

    const active = hoverId || selectedId;
    if (!active) {
      // still pass pulse flag to nodes if any
      const withPulseFlag = baseNodes.map((n) => ({ ...n, data: { ...(n.data || {}), pulse: n.id === pulseId } }));
      setNodes(applyBandPulse(withPulseFlag));
      setEdges(baseEdges);
      return;
    }
    // Build adjacency from current edges (undirected graph for visibility)
    const adj = new Map<string, Set<string>>();
    const add = (a: string, b: string) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a)!.add(b); };
    baseEdges.forEach((e) => { add(e.source, e.target); add(e.target, e.source); });
    const seen = new Set<string>([active]);
    const q = [active];
    while (q.length) {
      const id = q.shift()!;
      const nb = adj.get(id);
      if (!nb) continue;
      nb.forEach((x) => { if (!seen.has(x)) { seen.add(x); q.push(x); } });
    }
    const dimmed = baseNodes.map((n) => ({ ...n, data: { ...(n.data || {}), dim: !seen.has(n.id), pulse: n.id === pulseId } }));
    const withPulse = applyBandPulse(dimmed);
    const newEdges = baseEdges.map((e) => {
      const connected = seen.has(e.source) && seen.has(e.target);
      const isNearHover = (e.source === active || e.target === active);
      const baseWidth = (e.style as any)?.strokeWidth ?? 2;
      const width = connected ? (isNearHover ? Math.max(5, baseWidth + 2) : baseWidth) : baseWidth;
      const glow = isNearHover ? 'drop-shadow(0 0 2px color-mix(in srgb, var(--danger) 60%, transparent))' : undefined;
      return { ...e, style: { ...(e.style || {}), opacity: connected ? 1 : 0.2, strokeWidth: width, filter: glow } };
    });
    setNodes(withPulse);
    setEdges(newEdges);
  }, [hoverId, selectedId, baseNodes, baseEdges, highlightBands, pulseId]);

  // Trigger a brief pulse on the selected node to help orient the user
  useEffect(() => {
    if (!selectedId) return;
    setPulseId(selectedId);
    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => setPulseId(null), 1200);
    return () => {
      if (pulseTimerRef.current) {
        window.clearTimeout(pulseTimerRef.current);
        pulseTimerRef.current = null;
      }
    };
  }, [selectedId]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const onNodeClickInternal = useCallback((_: React.MouseEvent, node: Node) => {
    const meta = node?.data?.node as EVWGraphNode | undefined;
    if (!meta) return;
    // Auto-expand the parent band if this asset lives in a collapsed band
    if (node.parentId) {
      setCollapsedBands((prev) => ({ ...prev, [node.parentId!]: false }));
    } else if (node.type === 'band') {
      setCollapsedBands((prev) => ({ ...prev, [node.id]: false }));
    }
    setSelected(meta);
    setSelectedId(node.id);
    onNodeClick?.(meta);
  }, [onNodeClick]);

  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoverId(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoverId(null);
  }, []);

  // Center the viewport on the selected node (click, long-press, or keyboard activate)
  const centerOnSelected = useCallback((id: string) => {
    const n = nodes.find((nn) => nn.id === id);
    if (!n) return;
    let cx = n.position.x;
    let cy = n.position.y;
    // Use known dimensions per node type as fallbacks
    let w = 1;
    let h = 1;
    if (n.type === 'asset') { w = NODE_W; h = ASSET_H; }
    else if (n.type === 'band') { w = LANE_W; h = BAND_HEADER_H; }
    // If node is a child of a band, offset by parent position
    if (n.parentId) {
      const p = nodes.find((pp) => pp.id === n.parentId);
      if (p) { cx += p.position.x; cy += p.position.y; }
    }
    cx += w / 2; cy += h / 2;
    const curZoom = rfRef.current?.getViewport?.().zoom ?? 1;
    const targetZoom = Math.min(1.4, Math.max(0.9, curZoom < 1 ? 1.05 : curZoom));
    rfRef.current?.setCenter?.(cx, cy, { zoom: targetZoom, duration: 450 });
  }, [nodes]);

  useEffect(() => {
    if (selectedId) {
      // Wait a frame so any band expansion/layout updates are reflected before centering
      requestAnimationFrame(() => centerOnSelected(selectedId));
    }
  }, [selectedId, centerOnSelected]);

  const leftLaneNode = nodes.find((n) => n.id === 'lane:left');
  const rightLaneNode = nodes.find((n) => n.id === 'lane:right');
  const leftLaneColor = ((leftLaneNode?.style as React.CSSProperties | undefined)?.color as string) || BRACKET_RED;
  const rightLaneColor = ((rightLaneNode?.style as React.CSSProperties | undefined)?.color as string) || BRACKET_RED;

  return (
    <div ref={wrapperRef} style={{ height }} className="border border-[var(--border)] rounded overflow-hidden relative bg-[var(--surface)] text-[var(--text)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClickInternal}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
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
        <MiniMap pannable zoomable className="opacity-40 hover:opacity-100 transition-opacity" />
        <Controls position="bottom-right" />
        <Background variant="lines" gap={32} color="var(--border)" />
      </ReactFlow>

      {/* Floating Legend / Key */}
      <div className="absolute top-2 right-2 evw-surface border border-[var(--border)] rounded shadow p-2 text-xs space-y-2 w-72 max-h-[60%] overflow-auto">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Legend</div>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-0.5 rounded border border-[var(--border)] text-[11px] hover:bg-[color-mix(in_srgb,_var(--text)_8%,_transparent)]"
              onClick={() => setCompact((v) => !v)}
              title="Toggle compact stacked mode"
            >{compact ? 'Expanded' : 'Compact'}</button>
            <button
              className="px-2 py-0.5 rounded border border-[var(--border)] text-[11px] hover:bg-[color-mix(in_srgb,_var(--text)_8%,_transparent)]"
              onClick={() => {
                try { rfRef.current?.fitView({ padding: 0.12, duration: 400 }); } catch {}
              }}
              title="Reset view to fit all"
            >Reset</button>
            <button
              className="px-2 py-0.5 rounded border border-[var(--border)] text-[11px] hover:bg-[color-mix(in_srgb,_var(--text)_8%,_transparent)]"
              onClick={async () => {
                try {
                  const el = wrapperRef.current as HTMLElement;
                  const mod = await import('html-to-image');
                  const cs = getComputedStyle(document.documentElement);
                  const surface = cs.getPropertyValue('--surface').trim() || '#ffffff';
                  const dataUrl = await mod.toPng(el, { backgroundColor: surface });
                  const a = document.createElement('a');
                  a.href = dataUrl; a.download = 'trade-tree.png'; a.click();
                } catch {
                  alert('Install html-to-image to enable export: npm i html-to-image');
                }
              }}>Export PNG</button>
            <button
              className="px-2 py-0.5 rounded border border-[var(--border)] text-[11px] hover:bg-[color-mix(in_srgb,_var(--text)_8%,_transparent)]"
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
            <button
              className="px-2 py-0.5 rounded border border-[var(--border)] text-[11px] hover:bg-[color-mix(in_srgb,_var(--text)_8%,_transparent)]"
              onClick={async () => {
                try {
                  const el = wrapperRef.current as HTMLElement;
                  if (!el) return;
                  const mod = await import('html-to-image');
                  const { jsPDF } = await import('jspdf');
                  const svg2pdf = (await import('svg2pdf.js')).default;

                  // First try vector path: html-to-image -> SVG -> svg2pdf
                  let usedVector = false;
                  try {
                    const svgDataUrl = await mod.toSvg(el);
                    const svgText = svgDataUrl.startsWith('data:')
                      ? decodeURIComponent(svgDataUrl.substring(svgDataUrl.indexOf(',') + 1))
                      : svgDataUrl;
                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
                    const svgEl = svgDoc.documentElement as unknown as SVGSVGElement;
                    // If the SVG uses foreignObject (typical for html-to-image), svg2pdf can't render it reliably.
                    const hasFO = svgEl.getElementsByTagName('foreignObject').length > 0;
                    if (!hasFO) {
                      const rect = el.getBoundingClientRect();
                      const pxToPt = (px: number) => (px * 72) / 96;
                      const pdfW = Math.max(300, pxToPt(rect.width));
                      const pdfH = Math.max(200, pxToPt(rect.height));
                      const doc = new jsPDF({ unit: 'pt', format: [pdfW, pdfH] });
                      svg2pdf(svgEl, doc, { x: 0, y: 0, width: pdfW, height: pdfH });
                      doc.save('trade-tree.pdf');
                      usedVector = true;
                    }
                  } catch (svgErr) {
                    // fall back below
                    console.warn('Vector export failed; falling back to raster PDF', svgErr);
                  }

                  if (!usedVector) {
                    // Fallback: rasterize to PNG, then embed into PDF
                    const rect = el.getBoundingClientRect();
                    const pxToPt = (px: number) => (px * 72) / 96;
                    const pdfW = Math.max(300, pxToPt(rect.width));
                    const pdfH = Math.max(200, pxToPt(rect.height));
                    const cs = getComputedStyle(document.documentElement);
                    const surface = cs.getPropertyValue('--surface').trim() || '#ffffff';
                    const png = await mod.toPng(el, { backgroundColor: surface, pixelRatio: 2 });
                    const doc = new jsPDF({ unit: 'pt', format: [pdfW, pdfH] });
                    doc.addImage(png, 'PNG', 0, 0, pdfW, pdfH);
                    doc.save('trade-tree.pdf');
                  }
                } catch (err) {
                  console.error(err);
                  alert('Install html-to-image, jspdf, and svg2pdf.js to enable PDF export');
                }
              }}
            >Export PDF</button>
          </div>
        </div>
        {/* Step-through controls */}
        {Object.keys(bandCenters).length > 0 && (
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-[var(--muted)]">Step through bands</div>
            <div className="flex items-center gap-1">
              <button className="px-1.5 py-0.5 rounded border border-[var(--border)] hover:bg-[color-mix(in_srgb,_var(--text)_8%,_transparent)]" onClick={() => {
                const keys = Object.keys(bandCenters);
                if (!keys.length) return;
                const next = (stepIndex - 1 + keys.length) % keys.length;
                setStepIndex(next);
                const c = bandCenters[keys[next]];
                rfRef.current?.setCenter?.(c.x, c.y, { zoom: 1.2, duration: 400 });
              }}>Prev</button>
              <button className="px-1.5 py-0.5 rounded border border-[var(--border)] hover:bg-[color-mix(in_srgb,_var(--text)_8%,_transparent)]" onClick={() => {
                const keys = Object.keys(bandCenters);
                if (!keys.length) return;
                const next = (stepIndex + 1) % keys.length;
                setStepIndex(next);
                const c = bandCenters[keys[next]];
                rfRef.current?.setCenter?.(c.x, c.y, { zoom: 1.2, duration: 400 });
              }}>Next</button>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="inline-block w-6 h-3 rounded" style={{ background: `linear-gradient(90deg, ${leftLaneColor}, ${rightLaneColor})` }} />
          <span>Lane headers (team colors)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block border-t-4 w-8" style={{ borderColor: BRACKET_RED, borderTopStyle: 'solid' }} />
          <span>Bracket connectors</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block border-t-2 w-6" style={{ borderColor: 'var(--muted)', borderTopStyle: 'dashed' }} />
          <span>Pick → Player</span>
        </div>
        <div className="mt-2">
          <div className="font-semibold mb-1">Transaction bands</div>
          <ul className="space-y-1">
            {Object.keys(bandCenters).map((id) => (
              <li key={id}>
                <button
                  className="text-left hover:underline"
                  onMouseEnter={() => setHoverId(id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={() => {
                    const c = bandCenters[id];
                    if (!c) return;
                    rfRef.current?.setCenter?.(c.x, c.y, { zoom: 1.2, duration: 400 });
                    // Pulse highlight on the band border
                    setHighlightBands((prev) => {
                      const next = new Set(prev);
                      next.add(id);
                      return next;
                    });
                    // Clear any previous timer and schedule removal
                    if (highlightTimers.current[id]) {
                      clearTimeout(highlightTimers.current[id]);
                    }
                    highlightTimers.current[id] = window.setTimeout(() => {
                      setHighlightBands((prev) => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                      });
                    }, 1500);
                  }}
                >{bandLabels[id] ?? id.replace('band:', '').replace(':left',' (L)').replace(':right',' (R)')}</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-[10px] text-[var(--muted)]">Hover or select to trace path; click a node for details; scroll to zoom, drag to pan. Long-press nodes on touch.</div>
      </div>

      {/* Simple side panel for node details */}
      {selected && (
        <div className="absolute top-0 right-0 h-full w-80 bg-[var(--surface)] border-l border-[var(--border)] shadow-lg p-3 overflow-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Details</div>
            <button className="text-[var(--muted)] hover:text-[var(--text)]" onClick={() => { setSelected(null); setSelectedId(null); }}>✕</button>
          </div>
          <div className="space-y-1 text-sm">
            <div><span className="text-[var(--muted)]">Type:</span> {selected.type}</div>
            <div><span className="text-[var(--muted)]">Label:</span> {labelFor(selected)}</div>
            {selected.type === 'player' && (
              <div><span className="text-[var(--muted)]">Player ID:</span> {selected.playerId}</div>
            )}
            {selected.type === 'pick' && (
              <div>
                <div><span className="text-[var(--muted)]">Pick:</span> {selected.season} R{selected.round} S{selected.slot}</div>
                {(selected as any).originalOwnerName && <div><span className="text-[var(--muted)]">Original owner:</span> {(selected as any).originalOwnerName}</div>}
                {(() => {
                  // Infer current owner by finding any clone node whose underlying asset id matches selected.id
                  const node = baseNodes.find(n => (n as any).data?.node?.id === selected.id);
                  const currOwner = node?.data?.tooltip?.includes('Current owner:')
                    ? (node.data.tooltip as string).split('\n').find((l: string) => l.startsWith('Current owner:'))?.split(': ')[1]
                    : undefined;
                  return currOwner ? <div><span className="text-[var(--muted)]">Current owner:</span> {currOwner}</div> : null;
                })()}
                {selected.becameName && <div><span className="text-[var(--muted)]">Became:</span> {selected.becameName}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
