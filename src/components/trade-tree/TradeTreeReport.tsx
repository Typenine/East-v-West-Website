"use client";

import type { GraphNode as EVWGraphNode, GraphEdge as EVWGraphEdge, TradeGraph as EVWTradeGraph } from "@/lib/utils/trade-graph";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type Props = {
  graph: EVWTradeGraph;
  rootId?: string;
  onNodeClick?: (node: EVWGraphNode) => void;
};

type TradeSummary = {
  tradeId: string;
  date: string;
  teams: string[];
  assetsByTeamIndex: Record<number, EVWGraphNode[]>;
};

function parseTradeEdgeId(edgeId: string): { tradeId: string; teamIndex: number } | null {
  if (!edgeId.startsWith("traded:")) return null;
  const parts = edgeId.split(":");
  if (parts.length < 3) return null;
  const teamIndex = Number(parts[2]);
  if (!Number.isFinite(teamIndex)) return null;
  return { tradeId: parts[1], teamIndex };
}

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function otherTeamIndex(teams: string[], idx: number): number | null {
  if (teams.length !== 2) return null;
  return idx === 0 ? 1 : idx === 1 ? 0 : null;
}

export default function TradeTreeReport({ graph, rootId, onNodeClick }: Props) {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const becameByPickId = new Map<string, string>();
  for (const e of graph.edges.filter((x): x is EVWGraphEdge => x.kind === "became")) {
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (from?.type === "pick" && to?.type === "player") {
      becameByPickId.set(from.id, to.label || from.becameName || "");
    }
  }
  const displayLabel = (node: EVWGraphNode): string => {
    if (node.type !== "pick") return node.label;
    const became = becameByPickId.get(node.id) || node.becameName;
    return became ? `${node.label} -> ${became}` : node.label;
  };

  const tradeNodes = graph.nodes.filter((n): n is Extract<EVWGraphNode, { type: "trade" }> => n.type === "trade");
  const summaries = new Map<string, TradeSummary>();
  for (const t of tradeNodes) {
    summaries.set(t.tradeId, { tradeId: t.tradeId, date: t.date, teams: t.teams || [], assetsByTeamIndex: {} });
  }

  const assetHistory = new Map<string, Array<{ tradeId: string; date: string; teamIndex: number }>>();
  for (const e of graph.edges.filter((x): x is EVWGraphEdge => x.kind === "traded" && Boolean(x.tradeId))) {
    const parsed = parseTradeEdgeId(e.id);
    if (!parsed) continue;
    const sum = summaries.get(parsed.tradeId);
    const node = nodeById.get(e.to);
    if (!sum || !node) continue;
    if (!sum.assetsByTeamIndex[parsed.teamIndex]) sum.assetsByTeamIndex[parsed.teamIndex] = [];
    sum.assetsByTeamIndex[parsed.teamIndex].push(node);

    const list = assetHistory.get(e.to) || [];
    list.push({ tradeId: parsed.tradeId, date: sum.date, teamIndex: parsed.teamIndex });
    assetHistory.set(e.to, list);
  }
  for (const list of assetHistory.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const orderedTrades = Array.from(summaries.values()).sort((a, b) => a.date.localeCompare(b.date));

  const rootNode = rootId ? nodeById.get(rootId) : undefined;
  const rootReceipts = rootId ? assetHistory.get(rootId) || [] : [];

  const orgHistory = rootReceipts.map((r, idx) => {
    const trade = summaries.get(r.tradeId);
    const toTeam = trade?.teams?.[r.teamIndex] || "Unknown";
    let fromTeam = "Unknown";
    if (idx > 0) {
      const prevTrade = summaries.get(rootReceipts[idx - 1].tradeId);
      fromTeam = prevTrade?.teams?.[rootReceipts[idx - 1].teamIndex] || "Unknown";
    } else if (trade?.teams?.length === 2) {
      const oi = otherTeamIndex(trade.teams, r.teamIndex);
      fromTeam = oi !== null ? trade.teams[oi] : "Unknown";
    }
    return { tradeId: r.tradeId, date: r.date, fromTeam, toTeam, teamIndex: r.teamIndex };
  });

  return (
    <div className="space-y-4">
      {rootNode ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Root Asset</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">{displayLabel(rootNode)}</div>
          </CardContent>
        </Card>
      ) : null}

      {rootNode && orgHistory.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Organization History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {orgHistory.map((h, idx) => (
                <div key={`${h.tradeId}-${idx}`} className="flex items-center gap-2">
                  {idx > 0 ? <span className="text-[var(--muted)]">→</span> : null}
                  <span className="rounded border border-[var(--border)] px-2 py-1 evw-surface">{h.toTeam}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {rootNode && orgHistory.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trade Tree (Lineage)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative pl-7">
              <div className="absolute left-2 top-0 bottom-0 w-px bg-[var(--border)]" />
              {orgHistory.map((h, idx) => {
                const trade = summaries.get(h.tradeId);
                if (!trade) return null;
                const acquiredForAssets = Object.entries(trade.assetsByTeamIndex)
                  .filter(([teamIdx]) => Number(teamIdx) !== h.teamIndex)
                  .flatMap(([, assets]) => assets || []);
                const acquiredWithAssets = trade.assetsByTeamIndex[h.teamIndex] || [];
                return (
                  <div key={`${h.tradeId}-step-${idx}`} className="relative mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_80px_1fr] gap-3 items-start">
                      <div className="rounded-lg border border-[var(--border)] p-3 evw-surface">
                        <div className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Acquired For</div>
                        {acquiredForAssets.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {acquiredForAssets.map((a, i) => (
                              <button
                                key={`${h.tradeId}-for-${a.id}-${i}`}
                                type="button"
                                onClick={() => onNodeClick?.(a)}
                                className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:opacity-90"
                                title={displayLabel(a)}
                              >
                                {displayLabel(a)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-[var(--muted)]">No counterpart assets found in this loaded subgraph.</div>
                        )}
                      </div>

                      <div className="relative h-full min-h-[84px] flex items-center justify-center">
                        <div className="absolute inset-x-1/2 top-0 bottom-0 -translate-x-1/2 w-px bg-[var(--border)]" />
                        <span className="absolute top-1 inline-block h-3 w-3 rounded-full border border-[var(--border)] bg-[var(--accent)]" />
                        <div className="z-10 text-[10px] text-[var(--muted)] text-center mt-5">{fmtDate(h.date)}</div>
                        <div className="absolute left-0 right-0 top-1/2 h-px bg-[var(--border)]" />
                        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[var(--muted)]">→</span>
                        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--muted)]">→</span>
                      </div>

                      <div className="rounded-lg border border-[var(--border)] p-3 evw-surface">
                        <div className="text-xs uppercase tracking-wide text-[var(--muted)] mb-1">Acquired</div>
                        <div className="text-sm font-semibold mb-1">{displayLabel(rootNode)}</div>
                        <div className="text-xs text-[var(--muted)]">{h.fromTeam} → {h.toTeam}</div>
                        {acquiredWithAssets.length > 1 ? (
                          <div className="text-sm mt-2">
                            <span className="text-[var(--muted)]">With:</span>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {acquiredWithAssets
                                .filter((a) => a.id !== rootNode.id)
                                .map((a, i) => (
                                  <button
                                    key={`${h.tradeId}-with-${a.id}-${i}`}
                                    type="button"
                                    onClick={() => onNodeClick?.(a)}
                                    className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:opacity-90"
                                    title={displayLabel(a)}
                                  >
                                    {displayLabel(a)}
                                  </button>
                                ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {idx < orgHistory.length - 1 ? (
                      <div className="mt-2 flex justify-center">
                        <span className="text-[var(--muted)] text-xs">↓ next trade</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {rootNode && orgHistory.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trade Tree (Lineage)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-[var(--muted)]">
              No lineage nodes were resolved for this root in the current graph depth. Increase depth to include the full trade path.
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Full Trade Context</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {orderedTrades.map((t) => (
            <div key={t.tradeId} className="rounded-lg border border-[var(--border)] p-3 evw-surface">
              <div className="text-sm font-semibold">{t.teams.join(" ↔ ") || "Trade"}</div>
              <div className="text-xs text-[var(--muted)] mb-2">{fmtDate(t.date)}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {t.teams.map((teamName, idx) => (
                  <div key={`${t.tradeId}-team-${idx}`} className="rounded border border-[var(--border)] p-2">
                    <div className="text-xs text-[var(--muted)] mb-1">{teamName} acquired</div>
                    {(t.assetsByTeamIndex[idx] || []).length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(t.assetsByTeamIndex[idx] || []).map((a, i) => (
                          <button
                            key={`${t.tradeId}-asset-${a.id}-${i}`}
                            type="button"
                            onClick={() => onNodeClick?.(a)}
                            className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:opacity-90"
                            title={displayLabel(a)}
                          >
                            {displayLabel(a)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--muted)]">—</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

