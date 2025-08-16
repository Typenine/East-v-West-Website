'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface GraphNodeBase { id: string; type: 'player' | 'pick' | 'trade'; label: string }
interface PlayerNode extends GraphNodeBase { type: 'player'; playerId: string }
interface PickNode extends GraphNodeBase { type: 'pick'; season: string; round: number; slot: number }
interface TradeNode extends GraphNodeBase { type: 'trade'; tradeId: string; date: string }

interface GraphEdge { id: string; from: string; to: string; kind: 'traded' | 'became' }

interface TradeGraph { nodes: Array<PlayerNode | PickNode | TradeNode>; edges: GraphEdge[] }

export default function TradeTrackerPage() {
  const searchParams = useSearchParams();
  const rootType = searchParams.get('rootType') || 'player';
  const playerId = searchParams.get('playerId') || '';
  const season = searchParams.get('season') || '';
  const round = searchParams.get('round') || '';
  const slot = searchParams.get('slot') || '';
  const depth = searchParams.get('depth') || '2';

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
          <div>Depth: <code>{depth}</code></div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {graph.nodes.map((n) => (
                <div key={n.id} className="border rounded p-2">
                  <div className="text-xs uppercase text-gray-500">{n.type}</div>
                  <div className="font-medium">{n.label}</div>
                </div>
              ))}
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
