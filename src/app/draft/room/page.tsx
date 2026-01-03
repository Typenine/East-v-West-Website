'use client';

import { useEffect, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';

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

type MeResp = { authenticated: boolean; claims?: { team?: string } };

type Avail = { id: string; name: string; pos: string; nfl: string };

export default function DraftRoomPage() {
  const [me, setMe] = useState<MeResp>({ authenticated: false });
  const [draft, setDraft] = useState<DraftOverview | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState('');
  const [avail, setAvail] = useState<Avail[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const myTeam = me?.claims?.team || null;
  const onClock = draft?.onClockTeam || null;
  const isMyTurn = !!myTeam && !!onClock && myTeam === onClock;

  async function load(includeAvail = false) {
    try {
      setLoading(true);
      const url = includeAvail ? '/api/draft?include=available' : '/api/draft';
      const res = await fetch(url, { cache: 'no-store' });
      const j = await res.json();
      setDraft(j?.draft || null);
      setRemainingSec(j?.remainingSec ?? null);
      if (includeAvail) setAvail((j?.available as Avail[]) || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then((j: MeResp) => setMe(j)).catch(() => setMe({ authenticated: false }));
    load(true);
    const t = setInterval(() => load(false), 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!me?.authenticated) return;
    fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'queue_get' }) })
      .then(r => r.json()).then((j) => setQueue((j?.queue as string[]) || []))
      .catch(() => setQueue([]));
  }, [me?.authenticated]);

  const pick = async (player: Avail) => {
    const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'pick', playerId: player.id, playerName: player.name }) });
    const j = await res.json();
    if (!res.ok || j?.error) {
      alert(j?.error || 'Pick failed');
    }
    await load(true);
  };

  const addToQueue = async (playerId: string) => {
    const list = queue.includes(playerId) ? queue : [...queue, playerId];
    setQueue(list);
    await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'queue_set', playerIds: list }) });
  };

  const removeFromQueue = async (playerId: string) => {
    const list = queue.filter((id) => id !== playerId);
    setQueue(list);
    await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'queue_set', playerIds: list }) });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Draft Room" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle>Live</CardTitle></CardHeader>
            <CardContent>
              {loading ? <p className="text-[var(--muted)]">Loading…</p> : !draft ? (
                <p className="text-[var(--muted)]">No active draft.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm">Status: {draft.status}</span>
                    <span className="text-sm">Overall #{draft.curOverall}</span>
                    <span className="text-sm">On the clock: <strong>{onClock || '—'}</strong></span>
                    {remainingSec !== null && <span className="text-sm">Time left: {remainingSec}s</span>}
                  </div>
                  {isMyTurn ? (
                    <div className="p-3 border rounded">
                      <div className="font-medium mb-2">Your team is on the clock</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                        <div className="md:col-span-2 flex items-center gap-2">
                          <Button onClick={async () => {
                            const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'available', q: search, pos, limit: 50 }) });
                            const j = await res.json();
                            setAvail((j?.available as Avail[]) || []);
                          }}>Search</Button>
                          <Button variant="ghost" onClick={() => setAvail([])}>Clear</Button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="border rounded p-2 max-h-80 overflow-auto">
                          <div className="font-medium mb-1">Available</div>
                          <ul className="space-y-1">
                            {avail.map((p) => (
                              <li key={p.id} className="flex items-center justify-between text-sm">
                                <span>{p.name} <span className="text-[var(--muted)]">({p.pos} {p.nfl})</span></span>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" onClick={() => pick(p)}>Pick</Button>
                                  <Button size="sm" variant="ghost" onClick={() => addToQueue(p.id)}>Queue</Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="border rounded p-2 max-h-80 overflow-auto">
                          <div className="font-medium mb-1">My Queue</div>
                          {queue.length === 0 ? <p className="text-[var(--muted)] text-sm">Empty</p> : (
                            <ul className="space-y-1">
                              {queue.map((id) => (
                                <li key={id} className="flex items-center justify-between text-sm">
                                  <span>{id}</span>
                                  <Button size="sm" variant="ghost" onClick={() => removeFromQueue(id)}>Remove</Button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 border rounded">
                      <div className="font-medium">Waiting for {onClock || '—'}…</div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent Picks</CardTitle></CardHeader>
            <CardContent>
              {!draft || draft.recentPicks.length === 0 ? <p className="text-[var(--muted)]">—</p> : (
                <ul className="space-y-1">
                  {draft.recentPicks.slice().reverse().map((p, idx) => (
                    <li key={`${p.overall}-${idx}`} className="text-sm">#{p.overall} (R{p.round}) {p.team} — {p.playerName || p.playerId}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card>
            <CardHeader><CardTitle>Upcoming</CardTitle></CardHeader>
            <CardContent>
              {!draft || draft.upcoming.length === 0 ? <p className="text-[var(--muted)]">—</p> : (
                <ul className="space-y-1">
                  {draft.upcoming.map((u) => (
                    <li key={u.overall} className="text-sm">#{u.overall} (R{u.round}) — {u.team}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
