'use client';

import { useEffect, useMemo, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { getTeamsData } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';

export const dynamic = 'force-dynamic';

// Minimal types for taxi analysis payload
type TaxiPlayer = {
  playerId: string;
  name?: string | null;
  position?: string | null;
  onTaxiSince?: { year: string; week: number } | null;
  activatedSinceJoin?: boolean;
  activatedAt?: { year: string; week: number } | null;
  ineligibleReason?: string | null;
  potentialActivatedSinceJoin?: boolean;
  potentialAt?: { year: string; week: number } | null;
};

type TaxiAnalysis = {
  team: { teamName: string; rosterId: number };
  limits: { maxSlots: number; maxQB: number };
  current: { counts: { total: number; qbs: number }; taxi: TaxiPlayer[] };
  violations: { overQB: boolean; overSlots: boolean; ineligibleOnTaxi: string[] };
};

type Flag = { team: string; type: 'over_qb' | 'over_slots' | 'player_ineligible' | 'player_potential'; message: string };

type FlagsResp = { generatedAt: string; actual: Flag[]; potential: Flag[] };

function StatusPill({ kind, text }: { kind: 'ok' | 'warn' | 'danger'; text: string }) {
  const cls = kind === 'danger'
    ? 'text-[var(--danger)] border-[var(--danger)]'
    : kind === 'warn'
      ? 'text-[var(--warning,#bf9944)] border-[var(--warning,#bf9944)]'
      : 'text-green-700 border-green-400';
  return <span className={`inline-block text-xs px-2 py-0.5 rounded border ${cls}`}>{text}</span>;
}

export default function AdminTaxiPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [passkey, setPasskey] = useState('');
  const [season, setSeason] = useState('2025');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<Array<{ teamName: string; rosterId: number }>>([]);
  const [analyses, setAnalyses] = useState<Record<number, TaxiAnalysis | null>>({});
  const [flags, setFlags] = useState<FlagsResp | null>(null);
  const [report, setReport] = useState<({ generatedAt: string; runType?: string; season?: number; week?: number; actual: Flag[]; potential: Flag[] } | null)>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'flagged'>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/admin-login').then(r => r.json()).then(j => setIsAdmin(Boolean(j?.isAdmin))).catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const leagueId = season === '2025' ? LEAGUE_IDS.CURRENT : (LEAGUE_IDS.PREVIOUS as Record<string, string | undefined>)[season] || '';
        const t = leagueId ? await getTeamsData(leagueId) : [];
        setTeams(t);
        // fetch flags (current season only)
        if (season === '2025') {
          const fr = await fetch('/api/taxi/flags', { cache: 'no-store' });
          if (fr.ok) setFlags(await fr.json()); else setFlags(null);
        } else {
          setFlags(null);
        }
        // fetch analyses with small concurrency to avoid overload
        const out: Record<number, TaxiAnalysis | null> = {};
        const concurrency = 4;
        const chunks: Array<Array<{ teamName: string; rosterId: number }>> = [];
        for (let i = 0; i < t.length; i += concurrency) chunks.push(t.slice(i, i + concurrency));
        for (const chunk of chunks) {
          const res = await Promise.all(chunk.map(async (tm) => {
            try {
              const r = await fetch(`/api/taxi/analysis?season=${encodeURIComponent(season)}&rosterId=${tm.rosterId}`, { cache: 'no-store' });
              if (!r.ok) return [tm.rosterId, null] as const;
              const j = await r.json();
              return [tm.rosterId, j as TaxiAnalysis] as const;
            } catch {
              return [tm.rosterId, null] as const;
            }
          }));
          for (const [rid, a] of res) out[rid] = a;
        }
        setAnalyses(out);
      } catch {
        setError('Failed to load taxi data');
      } finally {
        setLoading(false);
      }
    })();
  }, [season]);

  const flaggedTeams = useMemo(() => {
    const fset = new Set<string>();
    if (flags) {
      for (const f of flags.actual) fset.add(f.team);
      for (const f of flags.potential) fset.add(f.team);
    }
    return fset;
  }, [flags]);

  const visibleTeams = useMemo(() => {
    return teams.filter(t => {
      if (filter === 'flagged' && !flaggedTeams.has(t.teamName)) return false;
      if (query && !t.teamName.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [teams, filter, flaggedTeams, query]);

  if (isAdmin === false) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Admin: Taxi Squads" subtitle="Sign in with admin passkey" />
        <Card className="max-w-md mx-auto">
          <CardContent>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setLoading(true);
              try {
                const r = await fetch('/api/admin-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: passkey }) });
                if (!r.ok) throw new Error('Invalid key');
                setIsAdmin(true);
                setPasskey('');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Login failed');
              } finally {
                setLoading(false);
              }
            }} className="space-y-3">
              <div>
                <Label htmlFor="passkey">Passkey</Label>
                <input id="passkey" type="password" className="w-full evw-surface border border-[var(--border)] rounded px-3 py-2" value={passkey} onChange={(e) => setPasskey(e.target.value)} />
              </div>
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <Button type="submit" disabled={loading || !passkey}>Login</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isAdmin === null) return <div className="container mx-auto px-4 py-8">Loading…</div>;

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Admin: Taxi Squads" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-end justify-between gap-3">
              <CardTitle>League Taxi Overview</CardTitle>
              <div className="flex items-end gap-3">
                <div>
                  <Label htmlFor="season">Season</Label>
                  <Select id="season" value={season} onChange={(e) => setSeason(e.target.value)}>
                    <option value="2025">2025</option>
                    <option value="2024">2024</option>
                    <option value="2023">2023</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filter">Filter</Label>
                  <Select id="filter" value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'flagged')}>
                    <option value="all">All teams</option>
                    <option value="flagged">Flags only</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="q">Search</Label>
                  <input id="q" className="evw-surface border rounded px-3 py-2" placeholder="Team name" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="self-end">
                  <Button onClick={() => setSeason((s) => s)}>Refresh</Button>
                </div>
                <div className="self-end">
                  <Button
                    variant="ghost"
                    disabled={reportLoading}
                    onClick={async () => {
                      setReportError(null);
                      setReportLoading(true);
                      try {
                        const r = await fetch('/api/taxi/report', { cache: 'no-store' });
                        if (!r.ok) throw new Error('Failed to run report');
                        const j = await r.json();
                        setReport(j);
                      } catch (e) {
                        setReport(null);
                        setReportError(e instanceof Error ? e.message : 'Failed to run report');
                      } finally {
                        setReportLoading(false);
                      }
                    }}
                  >
                    {reportLoading ? 'Running…' : 'Run report'}
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div>Loading…</div>
            ) : error ? (
              <div className="text-red-500 text-sm">{error}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Actual Violations</h4>
                  <ul className="space-y-1 text-sm">
                    {(flags?.actual || []).length === 0 && <li className="text-[var(--muted)]">None</li>}
                    {(flags?.actual || []).map((f, i) => (<li key={`a-${i}`}>{f.message}</li>))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Potential (this week only)</h4>
                  <ul className="space-y-1 text-sm">
                    {(flags?.potential || []).length === 0 && <li className="text-[var(--muted)]">None</li>}
                    {(flags?.potential || []).map((f, i) => (<li key={`p-${i}`}>{f.message}</li>))}
                  </ul>
                </div>
                {report && (
                  <div className="md:col-span-2 border-t border-[var(--border)] pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">Admin report (on-demand)</h4>
                      <div className="text-xs text-[var(--muted)]">{new Date(report.generatedAt).toLocaleString()} {report.runType ? `(run: ${report.runType})` : ''}</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h5 className="font-medium mb-1">Actual</h5>
                        <ul className="space-y-1 text-sm">
                          {report.actual.length === 0 && <li className="text-[var(--muted)]">None</li>}
                          {report.actual.map((f, i) => (<li key={`ra-${i}`}>{f.message}</li>))}
                        </ul>
                      </div>
                      <div>
                        <h5 className="font-medium mb-1">Potential</h5>
                        <ul className="space-y-1 text-sm">
                          {report.potential.length === 0 && <li className="text-[var(--muted)]">None</li>}
                          {report.potential.map((f, i) => (<li key={`rp-${i}`}>{f.message}</li>))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                {reportError && (
                  <div className="md:col-span-2 text-sm text-red-500">{reportError}</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Teams Taxi Squads</CardTitle>
        </CardHeader>
        <CardContent>
          {visibleTeams.length === 0 ? (
            <div className="text-[var(--muted)]">No teams</div>
          ) : (
            <div className="space-y-4">
              {visibleTeams.map((t) => {
                const a = analyses[t.rosterId] || null;
                const over = a ? (a.violations.overQB || a.violations.overSlots || (a.violations.ineligibleOnTaxi?.length || 0) > 0) : false;
                return (
                  <div key={t.rosterId} className="border border-[var(--border)] rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{t.teamName}</div>
                      <div className="flex items-center gap-2 text-xs">
                        {a && <span className="px-2 py-0.5 rounded border">Slots {a.current.counts.total}/{a.limits.maxSlots}</span>}
                        {a && <span className="px-2 py-0.5 rounded border">QBs {a.current.counts.qbs}/{a.limits.maxQB}</span>}
                        {a && (over ? <StatusPill kind="danger" text="Non-compliant" /> : <StatusPill kind="ok" text="Compliant" />)}
                      </div>
                    </div>
                    {!a ? (
                      <div className="text-[var(--muted)] text-sm">No data</div>
                    ) : a.current.taxi.length === 0 ? (
                      <div className="text-[var(--muted)] text-sm">No players on taxi.</div>
                    ) : (
                      <ul className="text-sm grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                        {a.current.taxi.map((p) => {
                          let statusEl = <StatusPill kind="ok" text="Eligible" />;
                          if (p.activatedSinceJoin) {
                            statusEl = <StatusPill kind="danger" text={`Ineligible${p.ineligibleReason ? ` • ${p.ineligibleReason}` : ''}${p.activatedAt ? ` • W${p.activatedAt.week} ${p.activatedAt.year}` : ''}`} />;
                          } else if (p.potentialActivatedSinceJoin) {
                            statusEl = <StatusPill kind="warn" text={`Potential${p.potentialAt ? ` • W${p.potentialAt.week} ${p.potentialAt.year}` : ''}`} />;
                          }
                          return (
                            <li key={p.playerId} className="flex items-center justify-between">
                              <span>
                                {p.name || p.playerId} {p.position ? <span className="text-[var(--muted)]">({p.position})</span> : null}
                                {p.onTaxiSince ? <span className="text-[var(--muted)] ml-2">W{p.onTaxiSince.week} {p.onTaxiSince.year}</span> : null}
                              </span>
                              {statusEl}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
