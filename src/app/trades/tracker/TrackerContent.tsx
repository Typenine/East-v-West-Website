'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { GraphNode as EVWGraphNode, TradeGraph as EVWTradeGraph } from '@/lib/utils/trade-graph';
import type { TradeTreeModel } from '@/lib/trades/trade-tree-model';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import Label from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import TradeTreeGraphic from '@/components/trade-tree/TradeTreeGraphic';

export const dynamic = 'force-dynamic';

type PlayerHit = { id: string; name: string; position?: string; team?: string };

function PlayerSearch({ onPick }: { onPick: (p: PlayerHit) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) {
      setHits([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/players?q=${encodeURIComponent(query)}`);
        const j = (await res.json()) as { players?: PlayerHit[] };
        setHits(Array.isArray(j?.players) ? j.players : []);
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <div className="relative">
      <Label htmlFor="tree-player-search">Start a tree from a player</Label>
      <input
        id="tree-player-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search players…"
        autoComplete="off"
        className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--focus)]"
        aria-label="Search players to root the trade tree"
      />
      {open && hits.length > 0 ? (
        <ul
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] shadow-lg"
          role="listbox"
        >
          {hits.map((p) => (
            <li key={p.id} role="option" aria-selected="false">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  setQ('');
                  onPick(p);
                }}
              >
                <span className="font-medium text-[var(--text)]">{p.name}</span>
                <span className="text-xs text-[var(--muted)]">
                  {[p.position, p.team].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TradeTrackerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rootType = searchParams.get('rootType') || 'player';
  const playerId = searchParams.get('playerId') || '';
  const season = searchParams.get('season') || '';
  const round = searchParams.get('round') || '';
  const slot = searchParams.get('slot') || '';
  const depth = searchParams.get('depth') || '4';

  // Depth slider local state (commits on release)
  const [depthLocal, setDepthLocal] = useState<number>(() => {
    const n = Number(depth);
    return Number.isFinite(n) ? Math.max(1, Math.min(6, n)) : 4;
  });
  useEffect(() => {
    const n = Number(depth);
    setDepthLocal(Number.isFinite(n) ? Math.max(1, Math.min(6, n)) : 4);
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

  const hasRoot = (rootType === 'player' && Boolean(playerId)) || (rootType === 'pick' && Boolean(season && round && slot));

  const query = useMemo(() => {
    if (!hasRoot) return '';
    const sp = new URLSearchParams();
    sp.set('rootType', rootType);
    sp.set('depth', depth);
    if (rootType === 'player') {
      sp.set('playerId', playerId);
    } else {
      sp.set('season', season);
      sp.set('round', round);
      sp.set('slot', slot);
    }
    return sp.toString();
  }, [hasRoot, rootType, playerId, season, round, slot, depth]);

  const [graph, setGraph] = useState<EVWTradeGraph | null>(null);
  const [tree, setTree] = useState<TradeTreeModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'tree' | 'list'>('tree');

  const fetchGraph = useCallback(async () => {
    setError(null);
    if (!query) {
      setGraph(null);
      setTree(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/trade-tree?${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch trade tree');
      setGraph((data.graph as EVWTradeGraph) ?? null);
      setTree((data.tree as TradeTreeModel) ?? null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch trade tree';
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
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
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
    return Array.from(summaries.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [graph]);

  const rootSummary = tree?.root
    ? `${tree.root.badge} ${tree.root.label}${tree.root.sub ? ` (${tree.root.sub})` : ''}`
    : rootType === 'player'
      ? playerId || '—'
      : `${season || '—'} R${round || '—'} S${slot || '—'}`;

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Trade Tracker" />

      <Card className="mb-6">
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <PlayerSearch
              onPick={(p) => router.push(`/trades/tracker?rootType=player&playerId=${encodeURIComponent(p.id)}&depth=${depthLocal}`)}
            />
            <div>
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
                className="w-full mt-2"
                aria-label="Depth slider"
                id="depth-slider"
              />
              {hasRoot ? (
                <div className="mt-1 text-xs text-[var(--muted)]">
                  Rooted on <span className="font-semibold text-[var(--text)]">{rootSummary}</span>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {!hasRoot ? (
        <Card>
          <CardContent>
            <div className="py-8 text-center text-sm text-[var(--muted)]">
              Search a player above, or use a <span className="font-semibold">Track</span> button on any trade in the{' '}
              <button type="button" className="underline" onClick={() => router.push('/trades')}>trade feed</button>{' '}
              to open its tree.
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-end gap-2">
            <Button size="sm" variant={view === 'tree' ? 'primary' : 'secondary'} onClick={() => setView('tree')}>Tree</Button>
            <Button size="sm" variant={view === 'list' ? 'primary' : 'secondary'} onClick={() => setView('list')}>List</Button>
          </div>

          {loading && <LoadingState message="Building trade tree..." />}
          {error && <ErrorState message={error} retry={fetchGraph} />}

          {!loading && !error && view === 'tree' && tree && (
            <TradeTreeGraphic tree={tree} />
          )}

          {!loading && !error && view === 'list' && (
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
              {listView && listView.length === 0 && (
                <Card>
                  <CardContent>
                    <div className="py-6 text-center text-sm text-[var(--muted)]">No trades found for this asset.</div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default TradeTrackerContent;
