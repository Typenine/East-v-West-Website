'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

type ManualTradeAsset =
  | { type: 'player'; name: string; position?: string; team?: string; playerId?: string }
  | { type: 'pick'; name: string; year?: string; round?: number; draftSlot?: number; originalOwner?: string; pickInRound?: number; became?: string; becamePosition?: string; becameTeam?: string; becamePlayerId?: string }
  | { type: 'cash'; name: string; amount?: number };

interface ManualTradeTeam { name: string; assets: ManualTradeAsset[]; }
interface ManualTrade { id: string; date: string; status: 'completed'|'pending'|'vetoed'; teams: ManualTradeTeam[]; notes?: string; overrideOf?: string | null; active?: boolean; }

export default function AdminTradesPage() {
  const searchParams = useSearchParams();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [passkey, setPasskey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trades, setTrades] = useState<ManualTrade[]>([]);
  const [editing, setEditing] = useState<ManualTrade | null>(null);
  const [form, setForm] = useState<ManualTrade>(() => ({ id: '', date: '', status: 'completed', teams: [{ name: '', assets: [] }, { name: '', assets: [] }], notes: '', overrideOf: null, active: true }));

  useEffect(() => {
    fetch('/api/admin-login').then(r => r.json()).then(j => setIsAdmin(Boolean(j?.isAdmin))).catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    // Prefill override from query string when arriving via "Override this trade" button
    const ov = searchParams.get('override');
    if (ov) {
      setEditing(null);
      setForm({ id: '', date: '', status: 'completed', teams: [{ name: '', assets: [] }, { name: '', assets: [] }], notes: '', overrideOf: ov, active: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/manual-trades?all=1', { cache: 'no-store' });
      const j = await r.json();
      setTrades(Array.isArray(j?.trades) ? j.trades : []);
    } catch (e) {
      setError('Failed to load manual trades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) void refresh(); }, [isAdmin]);

  const doLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch('/api/admin-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: passkey }) });
      if (!r.ok) throw new Error('Invalid key');
      setIsAdmin(true);
      setPasskey('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const startNew = () => {
    setEditing(null);
    setForm({ id: '', date: '', status: 'completed', teams: [{ name: '', assets: [] }, { name: '', assets: [] }], notes: '', overrideOf: null, active: true });
  };

  const save = async () => {
    setLoading(true);
    setError(null);
    try {
      const method = form.id ? 'PUT' : 'POST';
      const payload = { ...form };
      if (!payload.id) delete (payload as Partial<ManualTrade>).id; // POST: id server-generated or overrideOf
      const r = await fetch('/api/manual-trades', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error('Save failed');
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const softDelete = async (id: string) => {
    if (!confirm('Deactivate this manual trade?')) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/manual-trades?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Delete failed');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  if (isAdmin === false) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Admin: Trades" subtitle="Sign in with admin passkey" />
        <Card className="max-w-md mx-auto">
          <CardContent>
            <form onSubmit={doLogin} className="space-y-3">
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

  if (isAdmin === null) {
    return <div className="container mx-auto px-4 py-8">Loading…</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Admin: Manual Trades" />

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{editing ? 'Edit Manual Trade' : 'New Manual Trade'}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={startNew}>New</Button>
              <Button onClick={save} disabled={loading}>Save</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <input id="date" type="date" className="w-full evw-surface border rounded px-3 py-2" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select id="status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ManualTrade['status'] })}>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="vetoed">Vetoed</option>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="override">Override Sleeper Trade (transaction_id)</Label>
              <input id="override" placeholder="optional" className="w-full evw-surface border rounded px-3 py-2" value={form.overrideOf || ''} onChange={(e) => setForm({ ...form, overrideOf: e.target.value || null })} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="notes">Notes / Conditions</Label>
              <textarea id="notes" className="w-full evw-surface border rounded px-3 py-2" rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            {form.teams.map((t, idx) => (
              <div key={idx} className="border border-[var(--border)] rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label>Team {idx + 1}</Label>
                </div>
                <input placeholder="Team name" className="w-full evw-surface border rounded px-3 py-2 mb-2" value={t.name} onChange={(e) => {
                  const teams = [...form.teams];
                  teams[idx] = { ...teams[idx], name: e.target.value };
                  setForm({ ...form, teams });
                }} />
                <div className="space-y-2">
                  {t.assets.map((a, ai) => (
                    <div key={ai} className="grid grid-cols-5 gap-2">
                      <Select value={a.type} onChange={(e) => {
                        const teams = [...form.teams];
                        const assets = teams[idx].assets.slice();
                        const type = e.target.value as ManualTradeAsset['type'];
                        assets[ai] = { type, name: a.name } as ManualTradeAsset;
                        teams[idx].assets = assets;
                        setForm({ ...form, teams });
                      }}>
                        <option value="player">player</option>
                        <option value="pick">pick</option>
                        <option value="cash">cash</option>
                      </Select>
                      <input className="col-span-3 evw-surface border rounded px-2 py-1" placeholder={a.type === 'player' ? 'Player name' : a.type === 'pick' ? 'Pick label (e.g., 2026 2nd)' : 'Label (e.g., $25 FAAB)'} value={a.name} onChange={(e) => {
                        const teams = [...form.teams];
                        const assets = teams[idx].assets.slice();
                        assets[ai] = { ...assets[ai], name: e.target.value } as ManualTradeAsset;
                        teams[idx].assets = assets;
                        setForm({ ...form, teams });
                      }} />
                      <Button variant="secondary" onClick={() => {
                        const teams = [...form.teams];
                        const assets = teams[idx].assets.slice();
                        assets.splice(ai, 1);
                        teams[idx].assets = assets;
                        setForm({ ...form, teams });
                      }}>Remove</Button>
                    </div>
                  ))}
                  <Button variant="secondary" onClick={() => {
                    const teams = [...form.teams];
                    teams[idx].assets = [...teams[idx].assets, { type: 'player', name: '' } as ManualTradeAsset];
                    setForm({ ...form, teams });
                  }}>Add Asset</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Manual Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div>Loading…</div>
          ) : trades.length === 0 ? (
            <div className="text-[var(--muted)]">No manual trades yet.</div>
          ) : (
            <div className="space-y-3">
              {trades.map((t) => (
                <div key={t.id} className="evw-surface border rounded p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{t.id}</div>
                      <div className="text-xs text-[var(--muted)]">{t.date} • {t.status} {t.overrideOf ? '• overrides '+t.overrideOf : ''} {t.active === false ? '• inactive' : ''}</div>
                      {t.notes && <div className="text-sm mt-1">{t.notes}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" onClick={() => { setEditing(t); setForm(t); }}>Edit</Button>
                      <Button variant="danger" onClick={() => softDelete(t.id)}>Deactivate</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button variant="secondary" onClick={refresh}>Refresh</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
