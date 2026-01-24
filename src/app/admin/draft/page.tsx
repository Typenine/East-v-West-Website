'use client';

import { useEffect, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { TEAM_NAMES } from '@/lib/constants/league';

type DraftOverview = {
  id: string;
  year: number;
  rounds: number;
  clockSeconds: number;
  status: 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED';
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  curOverall: number;
  onClockTeam?: string | null;
  clockStartedAt?: string | null;
  deadlineTs?: string | null;
  recentPicks: Array<{ overall: number; round: number; team: string; playerId: string; playerName?: string | null; madeAt: string }>;
  upcoming: Array<{ overall: number; round: number; team: string }>;
};

export default function AdminDraftPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftOverview | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [form, setForm] = useState({ year: new Date().getFullYear().toString(), rounds: '4', clock: '60', snake: 'true' });
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState('');
  const [avail, setAvail] = useState<Array<{ id: string; name: string; pos: string; nfl: string }>>([]);
  const [forcePlayer, setForcePlayer] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [teamOrder, setTeamOrder] = useState<string[]>(TEAM_NAMES);
  const [playersInfo, setPlayersInfo] = useState<{ useCustom: boolean; count: number }>({ useCustom: false, count: 0 });

  useEffect(() => {
    fetch('/api/admin-login').then(r => r.json()).then(j => setIsAdmin(Boolean(j?.isAdmin))).catch(() => setIsAdmin(false));
  }, []);

  async function load(includeAvail = false, showSpinner = false) {
    try {
      if (showSpinner) setLoading(true);
      const url = includeAvail ? '/api/draft?include=available' : '/api/draft';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const j = await res.json();
      setDraft(j?.draft || null);
      setRemainingSec(j?.remainingSec ?? null);
      if (includeAvail) setAvail(j?.available || []);
    } catch {
      setError('Failed to load draft');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    load(true, true);
    const t = setInterval(() => load(false), 3000);
    return () => clearInterval(t);
  }, []);

  async function refreshPlayersInfo() {
    try {
      const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'players_info' }) });
      const j = await res.json();
      setPlayersInfo({ useCustom: Boolean(j?.useCustom), count: Number(j?.count || 0) });
    } catch {}
  }
  useEffect(() => { refreshPlayersInfo(); }, []);

  const onAdmin = async (action: string, payload?: Record<string, unknown>) => {
    setBusy(action);
    try {
      const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...(payload || {}) }) });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || 'failed');
      await load(true);
    } catch (e) {
      alert((e as Error).message || 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const recent = draft?.recentPicks || [];
  const upcoming = draft?.upcoming || [];

  const moveTeam = (idx: number, dir: -1 | 1) => {
    setTeamOrder((list) => {
      const i = idx;
      const j = i + dir;
      if (i < 0 || j < 0 || i >= list.length || j >= list.length) return list;
      const copy = list.slice();
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
      return copy;
    });
  };

  const parsePlayersText = (text: string): Array<{ id: string; name: string; pos: string; nfl?: string | null; rank?: number }> => {
    // Try JSON first
    try {
      const j = JSON.parse(text);
      if (Array.isArray(j)) {
        return j
          .map((o: unknown) => {
            const obj = (o as Record<string, unknown>) || {};
            const getStr = (k: string) => {
              const v = obj[k];
              return typeof v === 'string' ? v : '';
            };
            const getNum = (k: string) => {
              const v = obj[k];
              if (typeof v === 'number') return v;
              if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
              return undefined;
            };
            const id = (getStr('id') || getStr('player_id')).trim();
            const name = (getStr('name') || `${getStr('first_name')} ${getStr('last_name')}`).trim();
            const pos = (getStr('pos') || getStr('position')).trim().toUpperCase();
            const nfl = (getStr('nfl') || getStr('team'));
            const rank = getNum('rank');
            return rank != null ? { id, name, pos, nfl, rank } : { id, name, pos, nfl };
          })
          .filter((p) => p.id && p.name && p.pos);
      }
    } catch {}
    // Fallback CSV (id,name,pos,nfl or first_name,last_name)
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) return [];
    const headers = (lines.shift() || '')
      .split(',')
      .map((h) => h.trim().toLowerCase());
    const idx = (k: string) => headers.indexOf(k);
    const idIdx = idx('id') >= 0 ? idx('id') : idx('player_id');
    const nameIdx = idx('name');
    const firstIdx = idx('first_name');
    const lastIdx = idx('last_name');
    const posIdx = idx('pos') >= 0 ? idx('pos') : idx('position');
    const nflIdx = idx('nfl') >= 0 ? idx('nfl') : idx('team');
    const rankIdx = idx('rank') >= 0 ? idx('rank') : -1;
    const out: Array<{ id: string; name: string; pos: string; nfl?: string | null; rank?: number }> = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split(',').map((c) => c.trim());
      const id = (cols[idIdx] || '').trim();
      const name = nameIdx >= 0 ? (cols[nameIdx] || '').trim() : `${cols[firstIdx] || ''} ${cols[lastIdx] || ''}`.trim();
      const pos = ((cols[posIdx] || '').trim().toUpperCase());
      const nfl = (nflIdx >= 0 ? cols[nflIdx] : '') || '';
      const rankRaw = rankIdx >= 0 ? cols[rankIdx] : '';
      const rank = rankRaw && !Number.isNaN(Number(rankRaw)) ? Number(rankRaw) : undefined;
      if (id && name && pos) out.push(rank != null ? { id, name, pos, nfl, rank } : { id, name, pos, nfl });
    }
    return out;
  };

  const onUploadPlayers = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const text = await file.text();
    const players = parsePlayersText(text);
    if (!players || players.length === 0) { alert('No players parsed'); return; }
    setBusy('upload_players');
    try {
      const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'upload_players', players }) });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || 'failed');
      await refreshPlayersInfo();
      alert(`Uploaded ${j?.count ?? players.length} players`);
    } catch (e) {
      alert((e as Error).message || 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const onClearPlayers = async () => {
    setBusy('clear_players');
    try {
      const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'clear_players' }) });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || 'failed');
      await refreshPlayersInfo();
    } catch (e) {
      alert((e as Error).message || 'Clear failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Admin: Draft Control" />
      {error && (
        <div className="mb-4 text-[var(--danger)] text-sm">{error}</div>
      )}
      {!isAdmin ? (
        <Card><CardContent><p className="text-[var(--muted)]">Admin mode required. Use the Admin login on /login.</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Draft Status</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-[var(--muted)]">Loading…</p>
                ) : !draft ? (
                  <div className="space-y-4">
                    <p>No draft exists.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="mb-1 block">Year</Label>
                        <Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
                      </div>
                      <div>
                        <Label className="mb-1 block">Rounds</Label>
                        <Input type="number" min={1} value={form.rounds} onChange={(e) => setForm({ ...form, rounds: e.target.value })} />
                      </div>
                      <div>
                        <Label className="mb-1 block">Clock (seconds)</Label>
                        <Input type="number" min={10} value={form.clock} onChange={(e) => setForm({ ...form, clock: e.target.value })} />
                      </div>
                      <div>
                        <Label className="mb-1 block">Snake Order</Label>
                        <Select value={form.snake} onChange={(e) => setForm({ ...form, snake: e.target.value })}>
                          <option value="true">Snake (on)</option>
                          <option value="false">Linear (off)</option>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="mb-2 block">Team Order (Round 1)</Label>
                      <div className="max-h-64 overflow-auto border rounded">
                        <ul className="divide-y">
                          {teamOrder.map((t, i) => (
                            <li key={t} className="flex items-center justify-between px-2 py-1 text-sm">
                              <span className="flex-1">{i + 1}. {t}</span>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => moveTeam(i, -1)}>↑</Button>
                                <Button size="sm" variant="ghost" onClick={() => moveTeam(i, 1)}>↓</Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button variant="ghost" onClick={() => setTeamOrder(TEAM_NAMES)}>Reset</Button>
                      </div>
                    </div>
                    <Button disabled={busy==='create'} onClick={() => onAdmin('create', { year: Number(form.year), rounds: Number(form.rounds), clockSeconds: Number(form.clock), snake: form.snake === 'true', teams: teamOrder })}>Create Draft</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-[var(--muted)]">Year {draft.year}</span>
                      <span className="text-sm">Round {draft.upcoming?.[0]?.round || Math.ceil(draft.curOverall / TEAM_NAMES.length)}</span>
                      <span className="text-sm">Overall #{draft.curOverall}</span>
                      <span className="text-sm">Status: {draft.status}</span>
                      {draft.onClockTeam && <span className="text-sm">On the clock: <strong>{draft.onClockTeam}</strong></span>}
                      {remainingSec !== null && <span className="text-sm">Time left: {remainingSec}s</span>}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Button disabled={busy==='start'} onClick={() => onAdmin('start')}>Start</Button>
                      <Button disabled={busy==='pause'} onClick={() => onAdmin('pause')}>Pause</Button>
                      <Button disabled={busy==='resume'} onClick={() => onAdmin('resume')}>Resume</Button>
                      <Button disabled={busy==='undo'} onClick={() => onAdmin('undo')}>Undo Last Pick</Button>
                      <Button disabled={busy==='auto_pick'} variant="ghost" onClick={() => onAdmin('auto_pick')} title="Force auto-pick using queue or highest-ranked player">Auto-Pick</Button>
                    </div>
                    <div className="flex items-end gap-2 mt-3">
                      <div>
                        <Label className="mb-1 block">Set Clock (sec)</Label>
                        <Input type="number" min={10} value={form.clock} onChange={(e) => setForm({ ...form, clock: e.target.value })} />
                      </div>
                      <Button disabled={busy==='set_clock'} onClick={() => onAdmin('set_clock', { seconds: Number(form.clock) })}>Apply</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Recent Picks</CardTitle></CardHeader>
              <CardContent>
                {recent.length === 0 ? <p className="text-[var(--muted)]">No picks yet.</p> : (
                  <ul className="space-y-1">
                    {recent.slice().reverse().map((p, idx) => (
                      <li key={`${p.overall}-${idx}`} className="text-sm">
                        #{p.overall} (R{p.round}) {p.team} — {p.playerName || p.playerId}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Upcoming</CardTitle></CardHeader>
              <CardContent>
                {upcoming.length === 0 ? <p className="text-[var(--muted)]">—</p> : (
                  <ul className="flex flex-wrap gap-2">
                    {upcoming.map((u) => (
                      <li key={u.overall} className="text-xs px-2 py-0.5 rounded border border-[var(--border)]">#{u.overall} R{u.round} — {u.team}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader><CardTitle>Force Pick</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <Label className="mb-1 block">Search</Label>
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name search" />
                  </div>
                  <div>
                    <Label className="mb-1 block">Position</Label>
                    <Select value={pos} onChange={(e) => setPos(e.target.value)}>
                      <option value="">All</option>
                      {['QB','RB','WR','TE','K'].map((p) => <option key={p} value={p}>{p}</option>)}
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={async () => {
                      const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'available', q: search, pos, limit: 50 }) });
                      const j = await res.json();
                      setAvail(j?.available || []);
                    }}>Search</Button>
                    <Button variant="ghost" onClick={() => setAvail([])}>Clear</Button>
                  </div>
                  <div className="max-h-64 overflow-auto border rounded p-2">
                    <ul className="space-y-1">
                      {avail.map((p) => (
                        <li key={p.id} className="flex items-center justify-between text-sm">
                          <span>{p.name} <span className="text-[var(--muted)]">({p.pos} {p.nfl})</span></span>
                          <Button size="sm" onClick={() => setForcePlayer(p.id)}>Select</Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button disabled={!forcePlayer || busy==='force_pick'} onClick={() => onAdmin('force_pick', { playerId: forcePlayer })}>Force Pick</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Custom Player Pool</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm">{playersInfo.useCustom ? `Using custom list (${playersInfo.count} players)` : 'Using Sleeper player pool'}</p>
                  <div className="text-xs text-[var(--muted)]">
                    <p className="mb-2">Accepted formats:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>CSV with header: <strong>id,name,pos,nfl,rank</strong> (nfl and rank optional). Synonyms allowed: <em>player_id</em> for id, <em>first_name,last_name</em> for name, <em>position</em> for pos, <em>team</em> for nfl.</li>
                      <li>JSON array of objects with keys: <strong>id</strong>, <strong>name</strong> (or <em>first_name</em> + <em>last_name</em>), <strong>pos</strong>, optional <strong>nfl</strong>, optional <strong>rank</strong>.</li>
                    </ul>
                  </div>
                  <div>
                    <Label className="mb-1 block">Upload CSV or JSON</Label>
                    <Input type="file" accept=".csv,.json" onChange={(e) => onUploadPlayers(e.target.files)} />
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={busy==='upload_players'} onClick={() => { /* file input triggers upload */ }}>Upload</Button>
                    <Button variant="ghost" disabled={!playersInfo.useCustom || busy==='clear_players'} onClick={onClearPlayers}>Clear Custom Players</Button>
                    <Button variant="ghost" onClick={() => {
                      const header = 'id,name,pos,nfl,rank\n';
                      const sample = [
                        'p001,John Doe,RB,SEA,1',
                        'p002,Jane Smith,WR,DAL,2',
                        'p003,Bob Qb,QB,KC,3',
                      ].join('\n');
                      const blob = new Blob([header + sample + '\n'], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = 'evw-draft-template.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                    }}>Download CSV Template</Button>
                    <Button variant="ghost" onClick={() => {
                      const data = [
                        { id: 'p001', name: 'John Doe', pos: 'RB', nfl: 'SEA', rank: 1 },
                        { id: 'p002', name: 'Jane Smith', pos: 'WR', nfl: 'DAL', rank: 2 },
                        { id: 'p003', name: 'Bob Qb', pos: 'QB', nfl: 'KC', rank: 3 },
                      ];
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = 'evw-draft-template.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                    }}>Download JSON Template</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
