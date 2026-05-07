'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { GraphNode as EVWGraphNode, TradeGraph as EVWTradeGraph } from '@/lib/utils/trade-graph';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import Label from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import TradeTreeReport from '@/components/trade-tree/TradeTreeReport';

export const dynamic = 'force-dynamic';

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
  const [view, setView] = useState<'graph' | 'list'>(() => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'list' : 'graph'));
  const rootNodeLabel = useMemo(() => {
    if (!graph) return null;
    const rootId = rootType === 'player' ? `player:${playerId}` : `pick:${season}-${round}-${slot}`;
    return graph.nodes.find((n) => n.id === rootId)?.label ?? null;
  }, [graph, rootType, playerId, season, round, slot]);

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

  // Helper: parse edge id traded:<tradeId>:<teamIndex>:<assetIndex>
  const parseTradeEdgeId = (edgeId: string) => {
    if (!edgeId.startsWith('traded:')) return null as null | { tradeId: string; teamIndex: number };
    const parts = edgeId.split(':');
    if (parts.length < 3) return null;
    const tradeId = parts[1];
    const teamIndex = Number(parts[2]);
    if (!Number.isFinite(teamIndex)) return null;
    return { tradeId, teamIndex };
  };

  const listView = useMemo(() => {
    if (!graph) return null;
    // Map node id -> node for labels
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
    // Gather trade nodes
    type TradeSummary = { id: string; date: string; teams: string[]; assetsByTeam: Record<number, string[]> };
    const tradeNodes = graph.nodes.filter((n): n is Extract<EVWGraphNode, { type: 'trade' }> => n.type === 'trade');
    const summaries = new Map<string, TradeSummary>();
    tradeNodes.forEach((t) => {
      summaries.set(t.tradeId, { id: t.tradeId, date: t.date, teams: t.teams || [], assetsByTeam: {} });
    });
    graph.edges.filter((e) => e.kind === 'traded' && e.tradeId).forEach((e) => {
      const meta = parseTradeEdgeId(e.id);
      if (!meta) return;
      const sum = summaries.get(meta.tradeId);
      if (!sum) return;
      const node = nodeById.get(e.to);
      const label = node ? node.label : e.to;
      if (!sum.assetsByTeam[meta.teamIndex]) sum.assetsByTeam[meta.teamIndex] = [];
      sum.assetsByTeam[meta.teamIndex].push(label);
    });
    const ordered = Array.from(summaries.values()).sort((a, b) => a.date.localeCompare(b.date));
    return ordered;
  }, [graph]);

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
              <div>Player: <code>{rootNodeLabel || playerId || '—'}</code></div>
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
          <div className="flex items-center justify-between">
            <CardTitle>Trade Tree</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant={view === 'list' ? 'primary' : 'secondary'} onClick={() => setView('list')}>List</Button>
              <Button size="sm" variant={view === 'graph' ? 'primary' : 'secondary'} onClick={() => setView('graph')}>Tree</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <LoadingState message="Loading graph..." />}
          {error && <ErrorState message={error} retry={fetchGraph} />}
          {!loading && !error && graph && view === 'graph' && (
            <div>
              <TradeTreeReport
                graph={graph}
                rootId={rootType === 'player' ? `player:${playerId}` : `pick:${season}-${round}-${slot}`}
                onNodeClick={(n: EVWGraphNode) => {
                  if (n.type === 'player') {
                    const id = n.playerId;
                    router.push(`/trades/tracker?rootType=player&playerId=${encodeURIComponent(id)}`);
                  } else if (n.type === 'pick') {
                    router.push(`/trades/tracker?rootType=pick&season=${encodeURIComponent(n.season)}&round=${n.round}&slot=${n.slot}`);
                  }
                }}
              />
            </div>
          )}
          {!loading && !error && graph && view === 'list' && (
            <div className="space-y-4">
              {listView && listView.map((t) => (
                <Card key={t.id} className="evw-surface border">
                  <CardHeader>
                    <CardTitle className="text-base">{t.teams.join(' ↔ ')} <span className="text-[var(--muted)] font-normal">({t.date})</span></CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {t.teams.map((teamName, idx) => (
                        <div key={idx}>
                          <div className="font-semibold mb-2">{teamName} received:</div>
                          <ul className="list-disc pl-5 text-sm space-y-1">
                            {(t.assetsByTeam[idx] || []).map((label, i) => (
                              <li key={i}>{label}</li>
                            ))}
                            {!(t.assetsByTeam[idx] || []).length && (
                              <li className="text-[var(--muted)]">—</li>
                            )}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
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

export default TradeTrackerContent;
