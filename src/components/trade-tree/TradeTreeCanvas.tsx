/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Layout constants and basic styles
const NODE_W = 220;
const NODE_H = 56;

function buildTradeColorMap(edges: EVWGraphEdge[]): Map<string, string> {
  const ids = Array.from(new Set(edges.filter(e => e.kind === "traded" && e.tradeId).map(e => e.tradeId as string)));
  const map = new Map<string, string>();
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  };
  ids.forEach((id) => {
    const hue = hash(id) % 360;
    map.set(id, `hsl(${hue} 60% 45%)`);
  });
  return map;
}

function nodeStyleFor(kind: EVWGraphNode["type"]): React.CSSProperties {
  switch (kind) {
    case "player":
      return { background: "#DBEAFE", border: "1px solid #60A5FA", borderRadius: 8 };
    case "pick":
      return { background: "#DCFCE7", border: "1px solid #34D399", borderRadius: 8 };
    case "trade":
    default:
      return { background: "#F3F4F6", border: "1px solid #9CA3AF", borderRadius: 8 };
  }
}

export type TradeTreeCanvasProps = {
  graph: TradeGraph;
  rootId?: string;
  tradeColorMap?: Map<string, string>;
  height?: number;
  onNodeClick?: (node: EVWGraphNode) => void;
};

export default function TradeTreeCanvas({ graph, tradeColorMap: tradeColorMapProp, height = 640, onNodeClick }: TradeTreeCanvasProps) {
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const initialFitDone = useRef(false);

  // Compute color map for traded edges
  const tradeColorMap = useMemo(() => tradeColorMapProp ?? buildTradeColorMap(graph.edges), [tradeColorMapProp, graph.edges]);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Build ELK layout when graph changes (client-only dynamic import)
  useEffect(() => {
    let cancelled = false;

    async function layout() {
      try {
        // Use the browser-bundled build to avoid 'web-worker' resolution issues in prod builds
        const ELKMod = await import("elkjs/lib/elk.bundled.js");
        const ELKClass: any = (ELKMod as any).default ?? (ELKMod as any);
        const elk = new ELKClass();

        const elkGraph = {
          id: "root",
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.direction": "RIGHT",
            "elk.spacing.nodeNode": "40",
            "elk.layered.spacing.nodeNodeBetweenLayers": "90",
            "elk.spacing.edgeNode": "30",
            "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
          },
          children: graph.nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
          edges: graph.edges.map((e) => ({ id: e.id, sources: [e.from], targets: [e.to] })),
        } as const;

        const res = await elk.layout(elkGraph as any);
        if (cancelled) return;

        const pos = new Map<string, { x: number; y: number }>();
        (res.children || []).forEach((c: any) => {
          pos.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
        });

        const rfNodes: Node[] = graph.nodes.map((n) => ({
          id: n.id,
          position: pos.get(n.id) ?? { x: Math.random() * 10, y: Math.random() * 10 },
          data: { label: n.label, node: n },
          style: nodeStyleFor(n.type),
          draggable: true,
        }));

        const rfEdges: Edge[] = graph.edges.map((e) => {
          const color = e.kind === "traded" && e.tradeId ? (tradeColorMap.get(e.tradeId) || "#6B7280") : "#9CA3AF";
          const dashed = e.kind === "became";
          return {
            id: e.id,
            source: e.from,
            target: e.to,
            style: { stroke: color, strokeWidth: 2, strokeDasharray: dashed ? "6 4" : undefined },
            markerEnd: { type: MarkerType.ArrowClosed, color },
          };
        });

        setNodes(rfNodes);
        setEdges(rfEdges);

        // Fit view after first layout
        requestAnimationFrame(() => {
          if (!initialFitDone.current) {
            try {
              rfRef.current?.fitView({ padding: 0.2, duration: 400 });
              initialFitDone.current = true;
            } catch {}
          }
        });
      } catch {
        // In case ELK fails, fall back to a simple column layout
        const rfNodes: Node[] = graph.nodes.map((n, i) => ({
          id: n.id,
          position: { x: (i % 6) * (NODE_W + 40), y: Math.floor(i / 6) * (NODE_H + 40) },
          data: { label: n.label, node: n },
          style: nodeStyleFor(n.type),
          draggable: true,
        }));
        const rfEdges: Edge[] = graph.edges.map((e) => ({
          id: e.id,
          source: e.from,
          target: e.to,
          style: { stroke: "#9CA3AF", strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#9CA3AF" },
        }));
        if (!cancelled) {
          setNodes(rfNodes);
          setEdges(rfEdges);
        }
      }
    }

    layout();
    return () => {
      cancelled = true;
    };
  }, [graph.nodes, graph.edges, tradeColorMap]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const onNodeClickInternal = useCallback((_: React.MouseEvent, node: Node) => {
    const meta = node?.data?.node as EVWGraphNode | undefined;
    if (!meta) return;
    onNodeClick?.(meta);
  }, [onNodeClick]);

  return (
    <div style={{ height }} className="border rounded overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClickInternal}
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
    </div>
  );
}
