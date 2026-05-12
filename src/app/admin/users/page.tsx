'use client';

import { useEffect, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Button from '@/components/ui/Button';

type Row = {
  team: string;
  loginCount: number;
  daysActive: number;
  lastSeen: string | null;
  lastIp: string | null;
};

type TimeRow = { team: string; minutesEst: number; lastSeen: string | null };

type PinStatus = {
  team: string;
  hasPin: boolean;
  updatedAt: string | null;
  pinVersion: number | null;
  isDefault: boolean | null;
};

export default function AdminUsersPage() {
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<Array<Row & { minutesEst?: number }>>([]);
  const [since, setSince] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pinStatuses, setPinStatuses] = useState<PinStatus[]>([]);
  const [pinLoading, setPinLoading] = useState(true);
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [pinResults, setPinResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [pinSaving, setPinSaving] = useState<Record<string, boolean>>({});

  async function loadPins() {
    try {
      setPinLoading(true);
      const res = await fetch('/api/admin/pins', { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      setPinStatuses((j.teams as PinStatus[]) || []);
    } catch {
      // silent
    } finally {
      setPinLoading(false);
    }
  }

  async function resetPin(team: string) {
    const newPin = (pinInputs[team] || '').trim();
    if (!/^[0-9]{4,12}$/.test(newPin)) {
      setPinResults((p) => ({ ...p, [team]: { ok: false, msg: 'PIN must be 4–12 digits' } }));
      return;
    }
    setPinSaving((s) => ({ ...s, [team]: true }));
    setPinResults((p) => ({ ...p, [team]: { ok: false, msg: '' } }));
    try {
      const res = await fetch('/api/admin/pins/set', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ team, pin: newPin }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPinResults((p) => ({ ...p, [team]: { ok: false, msg: j?.error || 'Failed' } }));
      } else {
        setPinResults((p) => ({ ...p, [team]: { ok: true, msg: 'PIN updated ✓' } }));
        setPinInputs((inp) => ({ ...inp, [team]: '' }));
        loadPins();
      }
    } catch {
      setPinResults((p) => ({ ...p, [team]: { ok: false, msg: 'Network error' } }));
    } finally {
      setPinSaving((s) => ({ ...s, [team]: false }));
    }
  }

  async function load(d: number) {
    try {
      setLoading(true);
      setError(null);
      const [loginsRes, timeRes] = await Promise.all([
        fetch(`/api/admin/audit/logins?days=${encodeURIComponent(String(d))}`, { cache: 'no-store' }),
        fetch(`/api/admin/activity/time?days=${encodeURIComponent(String(d))}`, { cache: 'no-store' }),
      ]);
      if (!loginsRes.ok) {
        if (loginsRes.status === 403) throw new Error('Admin access required');
        throw new Error('Failed to load audit logs');
      }
      if (!timeRes.ok) {
        if (timeRes.status === 403) throw new Error('Admin access required');
        throw new Error('Failed to load activity');
      }
      const j1 = await loginsRes.json();
      const j2 = await timeRes.json();
      const base: Row[] = (j1?.rows as Row[]) || [];
      const timeRows: TimeRow[] = (j2?.rows as TimeRow[]) || [];
      const byTeam = new Map<string, TimeRow>(timeRows.map((r) => [r.team, r]));
      const merged: Array<Row & { minutesEst: number }> = base.map((r) => {
        const t = byTeam.get(r.team);
        return { ...r, minutesEst: t?.minutesEst || 0 };
      });
      // Also include teams that have activity but no logins in window
      for (const t of timeRows) {
        if (!merged.find((m) => m.team === t.team)) {
          merged.push({ team: t.team, loginCount: 0, daysActive: 0, lastSeen: t.lastSeen, lastIp: null, minutesEst: t.minutesEst });
        }
      }
      setRows(merged);
      setSince(j1?.since || j2?.since || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(days);
    loadPins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Admin • Users Activity" />

      <Card>
        <CardHeader>
          <CardTitle>Login Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 mb-4">
            <div>
              <Label htmlFor="days">Lookback days</Label>
              <input
                id="days"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] w-28"
              />
            </div>
            <Button onClick={() => load(days)} disabled={loading}>Refresh</Button>
            {since && (
              <div className="ml-auto text-sm text-[var(--muted)]">Since {new Date(since).toLocaleString()}</div>
            )}
          </div>

          {loading ? (
            <p className="text-[var(--muted)]">Loading…</p>
          ) : error ? (
            <p className="text-[var(--danger)]">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-[var(--muted)]">No activity.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-[var(--border)]">
                    <th className="py-2 pr-4">Team</th>
                    <th className="py-2 pr-4">Login Count</th>
                    <th className="py-2 pr-4">Days Active</th>
                    <th className="py-2 pr-4">Minutes (est)</th>
                    <th className="py-2 pr-4">Last Seen</th>
                    <th className="py-2 pr-4">Last IP</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.team} className="border-b border-[var(--border)]">
                      <td className="py-2 pr-4">{r.team}</td>
                      <td className="py-2 pr-4">{r.loginCount}</td>
                      <td className="py-2 pr-4">{r.daysActive}</td>
                      <td className="py-2 pr-4">{r.minutesEst ?? 0}</td>
                      <td className="py-2 pr-4">{r.lastSeen ? new Date(r.lastSeen).toLocaleString() : '—'}</td>
                      <td className="py-2 pr-4">{r.lastIp || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      {/* PIN Management */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Team PIN Reset</CardTitle>
            <Button variant="ghost" onClick={loadPins} disabled={pinLoading}>Refresh</Button>
          </div>
        </CardHeader>
        <CardContent>
          {pinLoading ? (
            <p className="text-[var(--muted)]">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-[var(--border)]">
                    <th className="py-2 pr-4">Team</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Last Updated</th>
                    <th className="py-2 pr-4">Version</th>
                    <th className="py-2">Set New PIN</th>
                  </tr>
                </thead>
                <tbody>
                  {pinStatuses.map((ps) => {
                    const result = pinResults[ps.team];
                    const saving = pinSaving[ps.team] || false;
                    return (
                      <tr key={ps.team} className="border-b border-[var(--border)]">
                        <td className="py-2 pr-4 font-medium">{ps.team}</td>
                        <td className="py-2 pr-4">
                          {!ps.hasPin ? (
                            <span className="text-[var(--muted)] text-xs">No PIN set</span>
                          ) : ps.isDefault ? (
                            <span className="text-xs bg-yellow-400/20 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded">Default PIN</span>
                          ) : (
                            <span className="text-xs bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded">Custom PIN</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-[var(--muted)] text-xs">
                          {ps.updatedAt ? new Date(ps.updatedAt).toLocaleString() : '—'}
                        </td>
                        <td className="py-2 pr-4 text-[var(--muted)] text-xs">{ps.pinVersion ?? '—'}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="tel"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={12}
                              placeholder="4–12 digits"
                              value={pinInputs[ps.team] || ''}
                              onChange={(e) => setPinInputs((inp) => ({ ...inp, [ps.team]: e.target.value.replace(/[^0-9]/g, '').slice(0, 12) }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') resetPin(ps.team); }}
                              className="w-32 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                            />
                            <Button
                              onClick={() => resetPin(ps.team)}
                              disabled={saving || !(pinInputs[ps.team] || '').trim()}
                              variant="primary"
                            >
                              {saving ? 'Saving…' : 'Set PIN'}
                            </Button>
                            {result?.msg && (
                              <span className={`text-xs ${result.ok ? 'text-emerald-500' : 'text-[var(--danger)]'}`}>
                                {result.msg}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
