// Trade graph types and scaffolding utilities

import { Trade } from '@/lib/utils/trades';

// Node kinds in the trade graph
export type GraphNode =
  | { id: string; type: 'player'; label: string; playerId: string }
  | { id: string; type: 'pick'; label: string; season: string; round: number; slot: number }
  | { id: string; type: 'trade'; label: string; tradeId: string; date: string };

export type GraphEdge = {
  id: string;
  from: string; // source node id
  to: string;   // target node id
  kind: 'traded' | 'became';
};

export type TradeGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type RootSelector =
  | { type: 'player'; playerId: string }
  | { type: 'pick'; season: string; round: number; slot: number };

// Build a full trade graph from the provided trades
export function buildTradeGraph(trades: Trade[]): TradeGraph {
  const nodesById = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();

  const ensureNode = (node: GraphNode) => {
    if (!nodesById.has(node.id)) nodesById.set(node.id, node);
  };

  for (const trade of trades) {
    // Trade node
    const tradeNodeId = `trade:${trade.id}`;
    ensureNode({ id: tradeNodeId, type: 'trade', label: `Trade ${trade.date}`, tradeId: trade.id, date: trade.date });

    // Assets received by each team in this trade
    trade.teams.forEach((team, teamIndex) => {
      team.assets.forEach((asset, assetIndex) => {
        if (asset.type === 'player') {
          if (!asset.playerId) return; // skip if missing stable id
          const playerNodeId = `player:${asset.playerId}`;
          ensureNode({ id: playerNodeId, type: 'player', label: asset.name, playerId: asset.playerId });
          const edgeId = `traded:${trade.id}:${teamIndex}:${assetIndex}`;
          if (!edgeIds.has(edgeId)) {
            edges.push({ id: edgeId, from: tradeNodeId, to: playerNodeId, kind: 'traded' });
            edgeIds.add(edgeId);
          }
        } else if (asset.type === 'pick') {
          const season = asset.year;
          const round = asset.round;
          const slot = asset.draftSlot ?? asset.pickInRound; // prefer stable draftSlot
          if (!season || typeof round !== 'number' || !Number.isFinite(slot as number)) return;
          const pickNodeId = `pick:${season}-${round}-${slot as number}`;
          const pickLabel = asset.name || `${season} R${round} S${slot as number}`;
          ensureNode({ id: pickNodeId, type: 'pick', label: pickLabel, season, round, slot: slot as number });
          const edgeId = `traded:${trade.id}:${teamIndex}:${assetIndex}`;
          if (!edgeIds.has(edgeId)) {
            edges.push({ id: edgeId, from: tradeNodeId, to: pickNodeId, kind: 'traded' });
            edgeIds.add(edgeId);
          }

          // If the pick became a player, connect with 'became'
          const becamePlayerId = asset.becamePlayerId;
          const becameName = asset.became as string | undefined;
          if (becamePlayerId) {
            const playerNodeId = `player:${becamePlayerId}`;
            ensureNode({ id: playerNodeId, type: 'player', label: becameName || becamePlayerId, playerId: becamePlayerId });
            const becameEdgeId = `became:${season}-${round}-${slot as number}:${becamePlayerId}`;
            if (!edgeIds.has(becameEdgeId)) {
              edges.push({ id: becameEdgeId, from: pickNodeId, to: playerNodeId, kind: 'became' });
              edgeIds.add(becameEdgeId);
            }
          }
        }
      });
    });
  }

  return { nodes: Array.from(nodesById.values()), edges };
}

// Extract a subgraph around a root asset (stubbed)
export function getTradeSubgraphByRoot(
  trades: Trade[],
  root: RootSelector,
  options: { depth?: number } = {}
): TradeGraph {
  const depth = Math.max(1, Math.min(10, options.depth ?? 2));
  const full = buildTradeGraph(trades);

  // Build adjacency (undirected for traversal)
  const adj = new Map<string, Set<string>>();
  const addAdj = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };
  full.edges.forEach((e) => addAdj(e.from, e.to));

  const rootId = root.type === 'player'
    ? `player:${root.playerId}`
    : `pick:${root.season}-${root.round}-${root.slot}`;

  if (!full.nodes.some((n) => n.id === rootId)) {
    // If the root doesn't exist in the graph yet (e.g., player never involved in trades), return just the root node
    if (root.type === 'player') {
      return { nodes: [{ id: rootId, type: 'player', label: `Player ${root.playerId}`, playerId: root.playerId }], edges: [] };
    } else {
      return { nodes: [{ id: rootId, type: 'pick', label: `${root.season} R${root.round} S${root.slot}`, season: root.season, round: root.round, slot: root.slot }], edges: [] };
    }
  }

  // BFS from root up to depth
  const visited = new Set<string>([rootId]);
  const queue: Array<{ id: string; d: number }> = [{ id: rootId, d: 0 }];
  while (queue.length) {
    const { id, d } = queue.shift()!;
    if (d >= depth) continue;
    const neighbors = adj.get(id);
    if (!neighbors) continue;
    for (const nb of neighbors) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push({ id: nb, d: d + 1 });
      }
    }
  }

  const nodes = full.nodes.filter((n) => visited.has(n.id));
  const edges = full.edges.filter((e) => visited.has(e.from) && visited.has(e.to));
  return { nodes, edges };
}
