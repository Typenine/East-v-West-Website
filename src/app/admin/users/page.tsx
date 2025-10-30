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

export default function AdminUsersPage() {
  const [days, setDays] = useState<number>(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [since, setSince] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(d: number) {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch(`/api/admin/audit/logins?days=${encodeURIComponent(String(d))}`, { cache: 'no-store' });
      if (!r.ok) {
        if (r.status === 403) throw new Error('Admin access required');
        throw new Error('Failed to load audit logs');
      }
      const j = await r.json();
      setRows((j?.rows as Row[]) || []);
      setSince(j?.since || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(days);
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
    </div>
  );
}
