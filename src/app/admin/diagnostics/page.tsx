'use client';

/**
 * Admin Diagnostics
 *
 * Read-only window into the newsletter reliability system:
 *  - Recent generation runs (last 20) with per-section provider/status detail
 *  - Failed sections with one-click retry (re-runs that step via generate-step)
 *  - Coverage/repetition warnings recorded with each run
 *  - MCP tool call log (last 100, filterable to errors)
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

// ── Types (shape of /api/admin/diagnostics responses) ────────────────────────

interface RunRow {
  runId: string;
  season: number;
  week: number;
  episodeType: string;
  runType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  errorSummary: string | null;
  warnings: string[] | null;
  totalSteps: number | null;
  completedSteps: number | null;
  failedSteps: string[] | null;
  factAudit: { highRiskCount?: number; mediumRiskCount?: number } | null;
}

interface SectionRow {
  id: string;
  sectionName: string;
  status: string;
  provider: string | null;
  model: string | null;
  tier: number | null;
  isFallback: boolean;
  durationMs: number | null;
  retries: number;
  warnings: string[] | null;
  error: string | null;
  createdAt: string;
}

interface McpCallRow {
  id: string;
  tool: string;
  args: Record<string, unknown> | null;
  status: string;
  durationMs: number | null;
  responseBytes: number | null;
  error: string | null;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusColor(status: string): string {
  switch (status) {
    case 'completed': case 'ok': return 'bg-emerald-900/40 text-emerald-300 border-emerald-800/40';
    case 'running': case 'retried': return 'bg-blue-900/40 text-blue-300 border-blue-800/40';
    case 'blocked': return 'bg-amber-900/40 text-amber-300 border-amber-800/40';
    case 'failed': case 'error': return 'bg-red-900/40 text-red-300 border-red-800/40';
    default: return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  }
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${statusColor(status)}`}>
      {status}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DiagnosticsPage() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [mcpCalls, setMcpCalls] = useState<McpCallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [onlyMcpErrors, setOnlyMcpErrors] = useState(false);

  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runSections, setRunSections] = useState<Record<string, SectionRow[]>>({});
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [retryResults, setRetryResults] = useState<Record<string, string>>({});

  const load = useCallback(async (errorsOnly: boolean) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/diagnostics${errorsOnly ? '?onlyErrors=true' : ''}`, {
        cache: 'no-store', credentials: 'include',
      });
      const data = await res.json() as { runs?: RunRow[]; mcpCalls?: McpCallRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRuns(data.runs ?? []);
      setMcpCalls(data.mcpCalls ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load diagnostics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(onlyMcpErrors); }, [load, onlyMcpErrors]);

  const toggleRun = async (runId: string) => {
    if (expandedRun === runId) { setExpandedRun(null); return; }
    setExpandedRun(runId);
    if (!runSections[runId]) {
      try {
        const res = await fetch(`/api/admin/diagnostics?runId=${encodeURIComponent(runId)}`, {
          cache: 'no-store', credentials: 'include',
        });
        const data = await res.json() as { sections?: SectionRow[] };
        setRunSections(prev => ({ ...prev, [runId]: data.sections ?? [] }));
      } catch {
        setRunSections(prev => ({ ...prev, [runId]: [] }));
      }
    }
  };

  const retrySection = async (run: RunRow, sectionName: string) => {
    const key = `${run.runId}::${sectionName}`;
    setRetrying(prev => ({ ...prev, [key]: true }));
    setRetryResults(prev => ({ ...prev, [key]: '' }));
    try {
      const res = await fetch('/api/newsletter/generate-step', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season: run.season, week: run.week, step: sectionName }),
      });
      const data = await res.json() as { error?: string; step?: string; done?: boolean; status?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRetryResults(prev => ({ ...prev, [key]: `✓ Re-ran ${data.step ?? sectionName}` }));
    } catch (err) {
      setRetryResults(prev => ({ ...prev, [key]: `✗ ${err instanceof Error ? err.message : 'Retry failed'}` }));
    } finally {
      setRetrying(prev => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">🩺 Newsletter Diagnostics</h1>
          <p className="text-xs text-zinc-400 mt-1">Generation runs, section provenance, and MCP tool call log.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => load(onlyMcpErrors)} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </Button>
      </div>

      {loadError && (
        <div className="text-xs text-red-300 bg-red-900/30 border border-red-800/40 rounded px-3 py-2">{loadError}</div>
      )}

      {/* ── Generation runs ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generation Runs <span className="text-xs font-normal text-zinc-500">(last 20)</span></CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 && !loading && (
            <div className="text-xs text-zinc-500 italic py-2">No runs recorded yet.</div>
          )}
          <div className="space-y-2">
            {runs.map(run => {
              const isOpen = expandedRun === run.runId;
              const sections = runSections[run.runId] ?? [];
              const failedSections = sections.filter(s => s.status === 'failed');
              return (
                <div key={run.runId} className="border border-zinc-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleRun(run.runId)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-zinc-800/60 hover:bg-zinc-800 text-left transition-colors"
                  >
                    <span className="flex items-center gap-2.5 min-w-0 flex-wrap">
                      <StatusPill status={run.status} />
                      <span className="text-sm text-zinc-200 font-medium">S{run.season} W{run.week}</span>
                      <span className="text-xs text-zinc-500">{run.episodeType} · {run.runType}</span>
                      {run.totalSteps != null && (
                        <span className="text-xs text-zinc-500 tabular-nums">{run.completedSteps ?? 0}/{run.totalSteps} steps</span>
                      )}
                      {(run.failedSteps?.length ?? 0) > 0 && (
                        <span className="text-xs text-red-400">{run.failedSteps!.length} failed</span>
                      )}
                      {(run.warnings?.length ?? 0) > 0 && (
                        <span className="text-xs text-amber-400">⚠ {run.warnings!.length} warnings</span>
                      )}
                      {(run.factAudit?.highRiskCount ?? 0) > 0 && (
                        <span className="text-xs text-red-400">⚑ {run.factAudit!.highRiskCount} high-risk claims</span>
                      )}
                    </span>
                    <span className="text-xs text-zinc-500 shrink-0">{fmtTime(run.startedAt)} {isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && (
                    <div className="px-4 py-3 space-y-3 bg-zinc-900/40">
                      <div className="text-[10px] text-zinc-500 font-mono">{run.runId}</div>

                      {run.errorSummary && (
                        <div className="text-xs text-red-300 bg-red-900/20 border border-red-800/30 rounded px-2 py-1.5 whitespace-pre-wrap">
                          {run.errorSummary}
                        </div>
                      )}

                      {(run.warnings?.length ?? 0) > 0 && (
                        <div className="space-y-1">
                          {run.warnings!.map((w, i) => (
                            <div key={i} className="text-xs text-amber-200/90 bg-amber-900/15 border border-amber-800/25 rounded px-2 py-1">⚠ {w}</div>
                          ))}
                        </div>
                      )}

                      {/* Sections table */}
                      {sections.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-zinc-500 border-b border-zinc-700/60">
                                <th className="py-1.5 pr-3 font-medium">Section</th>
                                <th className="py-1.5 pr-3 font-medium">Status</th>
                                <th className="py-1.5 pr-3 font-medium">Provider</th>
                                <th className="py-1.5 pr-3 font-medium">Tier</th>
                                <th className="py-1.5 pr-3 font-medium">Duration</th>
                                <th className="py-1.5 pr-3 font-medium">Detail</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sections.map(s => (
                                <tr key={s.id} className="border-b border-zinc-800/60 text-zinc-300">
                                  <td className="py-1.5 pr-3 font-medium">{s.sectionName}</td>
                                  <td className="py-1.5 pr-3"><StatusPill status={s.status} /></td>
                                  <td className="py-1.5 pr-3">
                                    {s.provider ?? '—'}
                                    {s.isFallback && <span className="ml-1 text-amber-400" title="Fallback provider">⚠</span>}
                                  </td>
                                  <td className="py-1.5 pr-3 tabular-nums">{s.tier ?? '—'}</td>
                                  <td className="py-1.5 pr-3 tabular-nums">{fmtDuration(s.durationMs)}</td>
                                  <td className="py-1.5 pr-3 text-zinc-500 max-w-[280px] truncate" title={s.error ?? s.warnings?.join('; ') ?? ''}>
                                    {s.error ?? s.warnings?.join('; ') ?? ''}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500 italic">No section records for this run.</div>
                      )}

                      {/* Retry failed sections */}
                      {failedSections.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-zinc-800">
                          <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">Retry Failed Sections</div>
                          <div className="flex flex-wrap gap-2">
                            {[...new Set(failedSections.map(s => s.sectionName))].map(name => {
                              const key = `${run.runId}::${name}`;
                              return (
                                <span key={name} className="flex items-center gap-1.5">
                                  <Button size="sm" variant="secondary" onClick={() => retrySection(run, name)} disabled={!!retrying[key]}>
                                    {retrying[key] ? 'Retrying…' : `↻ ${name}`}
                                  </Button>
                                  {retryResults[key] && (
                                    <span className={`text-[10px] ${retryResults[key].startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {retryResults[key]}
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                          <div className="text-[10px] text-zinc-600">Retry re-runs the step against the current staged job for S{run.season} W{run.week}.</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── MCP call log ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">MCP Call Log <span className="text-xs font-normal text-zinc-500">(last 100)</span></CardTitle>
            <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none">
              <input type="checkbox" checked={onlyMcpErrors} onChange={e => setOnlyMcpErrors(e.target.checked)} />
              Errors only
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {mcpCalls.length === 0 && !loading && (
            <div className="text-xs text-zinc-500 italic py-2">No MCP calls logged{onlyMcpErrors ? ' with errors' : ''}.</div>
          )}
          {mcpCalls.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-zinc-700/60">
                    <th className="py-1.5 pr-3 font-medium">Time</th>
                    <th className="py-1.5 pr-3 font-medium">Tool</th>
                    <th className="py-1.5 pr-3 font-medium">Status</th>
                    <th className="py-1.5 pr-3 font-medium">Duration</th>
                    <th className="py-1.5 pr-3 font-medium">Bytes</th>
                    <th className="py-1.5 pr-3 font-medium">Args / Error</th>
                  </tr>
                </thead>
                <tbody>
                  {mcpCalls.map(c => (
                    <tr key={c.id} className="border-b border-zinc-800/60 text-zinc-300">
                      <td className="py-1.5 pr-3 whitespace-nowrap text-zinc-500">{fmtTime(c.createdAt)}</td>
                      <td className="py-1.5 pr-3 font-mono">{c.tool}</td>
                      <td className="py-1.5 pr-3"><StatusPill status={c.status} /></td>
                      <td className="py-1.5 pr-3 tabular-nums">{fmtDuration(c.durationMs)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{c.responseBytes != null ? c.responseBytes.toLocaleString() : '—'}</td>
                      <td className="py-1.5 pr-3 text-zinc-500 max-w-[320px] truncate" title={c.error ?? JSON.stringify(c.args ?? {})}>
                        {c.error ?? (c.args && Object.keys(c.args).length > 0 ? JSON.stringify(c.args) : '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
