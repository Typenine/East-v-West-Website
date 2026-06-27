'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

type OverrideRow = {
  id: number;
  season: number | null;
  week: number | null;
  playerId: string | null;
  playerName: string | null;
  nflTeam: string | null;
  roleLabel: string | null;
  activeProbability: number | null;
  startProbability: number | null;
  targetShare: number | null;
  carryShare: number | null;
  teamPassAttempts: number | null;
  teamRushAttempts: number | null;
  projectionPoints: number | null;
  note: string | null;
  expiresAt: string | null;
  active: boolean;
};

type Dashboard = {
  sampleSize: number;
  meanAbsoluteError: number | null;
  bias: number | null;
  rmse: number | null;
  rangeCoverage: number | null;
  byPosition: Array<Record<string, unknown>>;
  recentWeeks: Array<Record<string, unknown>>;
};

const emptyForm = {
  playerId: '',
  nflTeam: '',
  season: '',
  week: '',
  roleLabel: '',
  activeProbability: '',
  startProbability: '',
  targetShare: '',
  carryShare: '',
  passAttemptShare: '',
  teamPassAttempts: '',
  teamRushAttempts: '',
  projectionPoints: '',
  note: '',
  expiresAt: '',
};

export default function AdminProjectionsPage() {
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [backtestSeason, setBacktestSeason] = useState(String(new Date().getFullYear() - 1));
  const [backtestStart, setBacktestStart] = useState('2');
  const [backtestEnd, setBacktestEnd] = useState('18');
  const [backtesting, setBacktesting] = useState(false);
  const [backtestResult, setBacktestResult] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overridesResponse, dashboardResponse] = await Promise.all([
        fetch('/api/admin/projections/overrides', { cache: 'no-store' }),
        fetch('/api/admin/projections/backtest', { cache: 'no-store' }),
      ]);
      if (!overridesResponse.ok || !dashboardResponse.ok) throw new Error('Unable to load projection controls');
      const overrideData = await overridesResponse.json();
      setOverrides(overrideData.overrides || []);
      setDashboard(await dashboardResponse.json());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveOverride(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/projections/overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to save override');
      setForm(emptyForm);
      setMessage('Projection override saved.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save override');
    } finally {
      setSaving(false);
    }
  }

  async function toggleOverride(row: OverrideRow) {
    const response = await fetch('/api/admin/projections/overrides', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: row.id, active: !row.active }),
    });
    if (response.ok) await load();
  }

  async function removeOverride(id: number) {
    const response = await fetch(`/api/admin/projections/overrides?id=${id}`, { method: 'DELETE' });
    if (response.ok) await load();
  }

  async function runBacktest() {
    setBacktesting(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/projections/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season: Number(backtestSeason),
          startWeek: Number(backtestStart),
          endWeek: Number(backtestEnd),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Backtest failed');
      setBacktestResult(data);
      setMessage(`Backtest completed with ${data.sampleSize || 0} player results.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Backtest failed');
    } finally {
      setBacktesting(false);
    }
  }

  const field = (key: keyof typeof emptyForm, label: string, type = 'text', step?: string) => (
    <label className="text-sm">
      <span className="block mb-1 text-[var(--muted)]">{label}</span>
      <input
        type={type}
        step={step}
        value={form[key]}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }))}
        className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-2"
      />
    </label>
  );

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <SectionHeader title="Admin • Projection System" />
      {message && <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">{message}</div>}

      <Card>
        <CardHeader><CardTitle>Model validation</CardTitle></CardHeader>
        <CardContent>
          {loading || !dashboard ? <p>Loading…</p> : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Metric label="Samples" value={String(dashboard.sampleSize)} />
              <Metric label="MAE" value={dashboard.meanAbsoluteError?.toFixed(2) ?? '—'} />
              <Metric label="Bias" value={dashboard.bias?.toFixed(2) ?? '—'} />
              <Metric label="RMSE" value={dashboard.rmse?.toFixed(2) ?? '—'} />
              <Metric label="Range coverage" value={dashboard.rangeCoverage == null ? '—' : `${(dashboard.rangeCoverage * 100).toFixed(1)}%`} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <label className="text-sm">Season<input className="ml-2 w-24 rounded border p-2" value={backtestSeason} onChange={(e: ChangeEvent<HTMLInputElement>) => setBacktestSeason(e.target.value)} /></label>
            <label className="text-sm">Start week<input className="ml-2 w-16 rounded border p-2" value={backtestStart} onChange={(e: ChangeEvent<HTMLInputElement>) => setBacktestStart(e.target.value)} /></label>
            <label className="text-sm">End week<input className="ml-2 w-16 rounded border p-2" value={backtestEnd} onChange={(e: ChangeEvent<HTMLInputElement>) => setBacktestEnd(e.target.value)} /></label>
            <button onClick={runBacktest} disabled={backtesting} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
              {backtesting ? 'Running…' : 'Run walk-forward backtest'}
            </button>
          </div>
          {backtestResult && (
            <pre className="mt-4 max-h-72 overflow-auto rounded bg-black/10 p-3 text-xs">{JSON.stringify(backtestResult, null, 2)}</pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Add temporary override</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-[var(--muted)]">Use a player ID for a player-specific role or workload correction. Use only an NFL team code for a team-volume override. Blank values are ignored.</p>
          <form onSubmit={saveOverride} className="grid gap-3 md:grid-cols-3">
            {field('playerId', 'Sleeper player ID')}
            {field('nflTeam', 'NFL team code')}
            {field('roleLabel', 'Displayed role')}
            {field('season', 'Season', 'number')}
            {field('week', 'Week', 'number')}
            {field('expiresAt', 'Expires at', 'datetime-local')}
            {field('activeProbability', 'Active probability', 'number', '0.01')}
            {field('startProbability', 'Start probability', 'number', '0.01')}
            {field('targetShare', 'Target share', 'number', '0.001')}
            {field('carryShare', 'Carry share', 'number', '0.001')}
            {field('passAttemptShare', 'QB pass-attempt share', 'number', '0.001')}
            {field('projectionPoints', 'Direct point override', 'number', '0.1')}
            {field('teamPassAttempts', 'Team pass attempts', 'number', '0.1')}
            {field('teamRushAttempts', 'Team rush attempts', 'number', '0.1')}
            <label className="text-sm md:col-span-3">
              <span className="block mb-1 text-[var(--muted)]">Reason / note</span>
              <textarea value={form.note} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm((current) => ({ ...current, note: e.target.value }))} className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-2" />
            </label>
            <button type="submit" disabled={saving} className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50 md:col-span-3">
              {saving ? 'Saving…' : 'Save override'}
            </button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Current overrides</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p>Loading…</p> : overrides.length === 0 ? <p className="text-sm text-[var(--muted)]">No overrides are configured.</p> : (
            <div className="space-y-3">
              {overrides.map((row) => (
                <div key={row.id} className={`rounded border border-[var(--border)] p-3 ${row.active ? '' : 'opacity-55'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.playerName || row.nflTeam || `Override ${row.id}`}</div>
                      <div className="text-xs text-[var(--muted)]">
                        {row.nflTeam || 'No team'} · {row.season || 'Any season'} · {row.week ? `Week ${row.week}` : 'Any week'}
                      </div>
                      <div className="mt-1 text-sm">{describeOverride(row)}</div>
                      {row.note && <div className="mt-1 text-xs text-[var(--muted)]">{row.note}</div>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleOverride(row)} className="rounded border border-[var(--border)] px-3 py-1 text-sm">{row.active ? 'Disable' : 'Enable'}</button>
                      <button onClick={() => removeOverride(row.id)} className="rounded border border-red-500 px-3 py-1 text-sm text-red-600">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-[var(--border)] p-3"><div className="text-xs text-[var(--muted)]">{label}</div><div className="text-xl font-bold">{value}</div></div>;
}

function describeOverride(row: OverrideRow): string {
  const values = [
    row.roleLabel,
    row.activeProbability == null ? null : `Active ${(row.activeProbability * 100).toFixed(0)}%`,
    row.startProbability == null ? null : `Start ${(row.startProbability * 100).toFixed(0)}%`,
    row.targetShare == null ? null : `Targets ${(row.targetShare * 100).toFixed(1)}%`,
    row.carryShare == null ? null : `Carries ${(row.carryShare * 100).toFixed(1)}%`,
    row.teamPassAttempts == null ? null : `${row.teamPassAttempts} team passes`,
    row.teamRushAttempts == null ? null : `${row.teamRushAttempts} team rushes`,
    row.projectionPoints == null ? null : `${row.projectionPoints} points`,
  ].filter(Boolean);
  return values.join(' · ') || 'Metadata-only override';
}
