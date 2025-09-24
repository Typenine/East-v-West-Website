
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { getTeamsData } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { fetchTradeById } from '@/lib/utils/trades';

type ManualTradeAsset =
  | { type: 'player'; name: string; position?: string; team?: string; playerId?: string }
  | { type: 'pick'; name: string; year?: string; round?: number; draftSlot?: number; originalOwner?: string; pickInRound?: number; became?: string; becamePosition?: string; becameTeam?: string; becamePlayerId?: string }
  | { type: 'cash'; name: string; amount?: number };

interface ManualTradeTeam { name: string; assets: ManualTradeAsset[]; }
interface ManualTrade { id: string; date: string; status: 'completed'|'pending'|'vetoed'; teams: ManualTradeTeam[]; notes?: string; overrideOf?: string | null; active?: boolean; }

function AdminTradesContent() {
  const searchParams = useSearchParams();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [passkey, setPasskey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trades, setTrades] = useState<ManualTrade[]>([]);
  const [editing, setEditing] = useState<ManualTrade | null>(null);
  const [form, setForm] = useState<ManualTrade>(() => ({ id: '', date: '', status: 'completed', teams: [{ name: '', assets: [] }, { name: '', assets: [] }], notes: '', overrideOf: null, active: true }));
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [savedFlag, setSavedFlag] = useState(false);
  type PlayerSuggest = { id: string; name: string; position?: string; team?: string };
  const [playerSuggests, setPlayerSuggests] = useState<Record<string, PlayerSuggest[]>>({}); // key: `${idx}-${ai}`
  const [openSuggestKey, setOpenSuggestKey] = useState<string | null>(null);

  const ordinal = (n: number) => {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return `${n}${(s[(v - 20) % 10] || s[v] || s[0])}`;
  };

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
    const ed = searchParams.get('edit');
    if ( ed ) {
      setPendingEditId(ed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load team options (current league) for dropdowns
  useEffect(() => {
    (async () => {
      try {
        const teams = await getTeamsData(LEAGUE_IDS.CURRENT);
        const names = teams.map(t => t.teamName).sort((a,b)=>a.localeCompare(b));
        setTeamOptions(names);
      } catch {
        setTeamOptions([]);
      }
    })();
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/manual-trades?all=1', { cache: 'no-store' });
      const j = await r.json();
      setTrades(Array.isArray(j?.trades) ? j.trades : []);
    } catch {
      setError('Failed to load manual trades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) void refresh(); }, [isAdmin]);

  // Once trades are loaded and we have a pending edit id, open that trade in the editor
  useEffect(() => {
    if (!isAdmin || !pendingEditId) return;
    const t = trades.find(x => x.id === pendingEditId);
    if (t) {
      setEditing(t);
      setForm(t);
      setPendingEditId(null);
      return;
    }
    // If not found in manual trades, fetch current Sleeper trade and map into form to edit as an override
    (async () => {
      try {
        const base = await fetchTradeById(pendingEditId);
        if (base) {
          const mapped: ManualTrade = {
            id: '',
            date: base.date,
            status: base.status,
            teams: base.teams.map(tm => ({ name: tm.name, assets: tm.assets.map(a => ({ ...a, type: a.type })) })) as ManualTradeTeam[],
            notes: base.notes || '',
            overrideOf: base.id,
            active: true,
          };
          setEditing(mapped);
          setForm(mapped);
        }
      } catch {}
      setPendingEditId(null);
    })();
  }, [isAdmin, pendingEditId, trades]);

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
    setEditorError(null);
    setSavedFlag(false);
    try {
      const method = form.id ? 'PUT' : 'POST';
      const payload = { ...form };
      if (!payload.id) delete (payload as Partial<ManualTrade>).id; // POST: id server-generated or overrideOf
      const r = await fetch('/api/manual-trades', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) {
        let msg = 'Save failed';
        try {
          const j = await r.json();
          if (j && typeof j.error === 'string') msg = j.error;
        } catch {}
        throw new Error(msg);
      }
      setEditing(null);
      await refresh();
      setSavedFlag(true);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Save failed');
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
            {editorError && (
              <div className="md:col-span-2 text-red-500 text-sm">{editorError}</div>
            )}
            {savedFlag && !editorError && (
              <div className="md:col-span-2 text-green-600 text-sm">Saved.</div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            {form.teams.map((t, idx) => (
              <div key={idx} className="border border-[var(--border)] rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label>Team {idx + 1}</Label>
                </div>
                <Select
                  value={t.name}
                  onChange={(e) => {
                    const teams = [...form.teams];
                    teams[idx] = { ...teams[idx], name: e.target.value };
                    setForm({ ...form, teams });
                  }}
                  className="w-full mb-2"
                >
                  <option value="">Select team</option>
                  {/* Ensure current value stays selectable even if not in current options */}
                  {t.name && !teamOptions.includes(t.name) ? (
                    <option value={t.name}>{t.name}</option>
                  ) : null}
                  {teamOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </Select>
                <div className="space-y-2">
                  {t.assets.map((a, ai) => (
                    <div key={ai} className="space-y-2">
                      <div className="grid grid-cols-5 gap-2">
                        <Select value={a.type} onChange={(e) => {
                          const teams = [...form.teams];
                          const assets = teams[idx].assets.slice();
                          const type = e.target.value as ManualTradeAsset['type'];
                          assets[ai] = { type, name: '' } as ManualTradeAsset;
                          teams[idx].assets = assets;
                          setForm({ ...form, teams });
                          // clear suggestions when switching type
                          setOpenSuggestKey(null);
                        }}>
                          <option value="player">player</option>
                          <option value="pick">pick</option>
                          <option value="cash">cash</option>
                        </Select>

                        {a.type === 'player' ? (
                          <div className="col-span-3 relative">
                            <input
                              className="w-full evw-surface border rounded px-2 py-1"
                              placeholder="Search player (e.g., Kirk)"
                              value={a.name}
                              onChange={async (e) => {
                                const q = e.target.value;
                                const teamsArr = [...form.teams];
                                const assets = teamsArr[idx].assets.slice();
                                assets[ai] = { ...(assets[ai] as ManualTradeAsset), name: q } as ManualTradeAsset;
                                teamsArr[idx].assets = assets;
                                setForm({ ...form, teams: teamsArr });
                                const key = `${idx}-${ai}`;
                                setOpenSuggestKey(key);
                                if (q && q.length >= 2) {
                                  try {
                                    const r = await fetch(`/api/search/players?q=${encodeURIComponent(q)}`);
                                    const j = await r.json();
                                    setPlayerSuggests((prev) => ({ ...prev, [key]: Array.isArray(j.players) ? j.players : [] }));
                                  } catch {
                                    setPlayerSuggests((prev) => ({ ...prev, [key]: [] }));
                                  }
                                } else {
                                  setPlayerSuggests((prev) => ({ ...prev, [key]: [] }));
                                }
                              }}
                              onFocus={() => setOpenSuggestKey(`${idx}-${ai}`)}
                              onBlur={() => setTimeout(() => setOpenSuggestKey((k) => (k === `${idx}-${ai}` ? null : k)), 150)}
                            />
                            {openSuggestKey === `${idx}-${ai}` && (playerSuggests[`${idx}-${ai}`]?.length || 0) > 0 && (
                              <div className="absolute z-10 mt-1 w-full evw-surface border rounded shadow-sm max-h-56 overflow-auto">
                                {(playerSuggests[`${idx}-${ai}`] || []).map((p) => (
                                  <button
                                    type="button"
                                    key={p.id}
                                    className="w-full text-left px-2 py-1 hover-subtle"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      const teamsArr = [...form.teams];
                                      const assets = teamsArr[idx].assets.slice();
                                      assets[ai] = { type: 'player', name: p.name, position: p.position, team: p.team, playerId: p.id } as ManualTradeAsset;
                                      teamsArr[idx].assets = assets;
                                      setForm({ ...form, teams: teamsArr });
                                      setOpenSuggestKey(null);
                                    }}
                                  >
                                    {p.name}{p.position ? ` · ${p.position}` : ''}{p.team ? ` · ${p.team}` : ''}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : a.type === 'pick' ? (
                          <div className="col-span-3 grid grid-cols-3 gap-2">
                            <input
                              className="evw-surface border rounded px-2 py-1"
                              placeholder="Year"
                              inputMode="numeric"
                              value={a.year || ''}
                              onChange={(e) => {
                                const year = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
                                const teamsArr = [...form.teams];
                                const assets = teamsArr[idx].assets.slice();
                                if (assets[ai].type !== 'pick') return;
                                const prev = assets[ai];
                                const next = { ...prev, year };
                                const round = next.round;
                                next.name = year && round ? `${year} ${ordinal(round)} Round Pick` : (next.name || '');
                                assets[ai] = next;
                                teamsArr[idx].assets = assets;
                                setForm({ ...form, teams: teamsArr });
                              }}
                            />
                            <Select
                              value={a.round ? String(a.round) : ''}
                              onChange={(e) => {
                                const round = Number(e.target.value);
                                const teamsArr = [...form.teams];
                                const assets = teamsArr[idx].assets.slice();
                                if (assets[ai].type !== 'pick') return;
                                const prev = assets[ai];
                                const next = { ...prev, round };
                                const year = next.year;
                                next.name = year && round ? `${year} ${ordinal(round)} Round Pick` : (next.name || '');
                                assets[ai] = next;
                                teamsArr[idx].assets = assets;
                                setForm({ ...form, teams: teamsArr });
                              }}
                            >
                              <option value="">Round</option>
                              <option value="1">1</option>
                              <option value="2">2</option>
                              <option value="3">3</option>
                              <option value="4">4</option>
                            </Select>
                            <Select
                              value={a.originalOwner || ''}
                              onChange={(e) => {
                                const originalOwner = e.target.value;
                                const teamsArr = [...form.teams];
                                const assets = teamsArr[idx].assets.slice();
                                if (assets[ai].type !== 'pick') return;
                                const prev = assets[ai];
                                const next = { ...prev, originalOwner };
                                assets[ai] = next;
                                teamsArr[idx].assets = assets;
                                setForm({ ...form, teams: teamsArr });
                              }}
                            >
                              <option value="">Original owner</option>
                              {teamOptions.map((name) => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </Select>
                          </div>
                        ) : (
                          <input className="col-span-3 evw-surface border rounded px-2 py-1" placeholder="Label (e.g., $25 FAAB)" value={a.name} onChange={(e) => {
                            const teamsArr = [...form.teams];
                            const assets = teamsArr[idx].assets.slice();
                            assets[ai] = { ...assets[ai], name: e.target.value } as ManualTradeAsset;
                            teamsArr[idx].assets = assets;
                            setForm({ ...form, teams: teamsArr });
                          }} />
                        )}
                        <Button variant="secondary" onClick={() => {
                          const teamsArr = [...form.teams];
                          const assets = teamsArr[idx].assets.slice();
                          assets.splice(ai, 1);
                          teamsArr[idx].assets = assets;
                          setForm({ ...form, teams: teamsArr });
                        }}>Remove</Button>
                      </div>

                      {a.type === 'pick' && (
                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              try {
                                const year = a.year;
                                const round = a.round;
                                const owner = a.originalOwner || '';
                                if (!year || !round) return;
                                const qs = new URLSearchParams({ season: String(year), round: String(round) });
                                if (owner) qs.set('originalOwner', owner);
                                const r = await fetch(`/api/search/pick-became?${qs.toString()}`);
                                const j = await r.json();
                                const teamsArr = [...form.teams];
                                const assets = teamsArr[idx].assets.slice();
                                if (assets[ai].type !== 'pick') return;
                                const prev = assets[ai];
                                const next = { ...prev };
                                if (j && j.became) {
                                  next.became = j.became.name || next.became;
                                  next.becamePosition = j.became.position || next.becamePosition;
                                  next.becameTeam = j.became.team || next.becameTeam;
                                  next.becamePlayerId = j.became.id || next.becamePlayerId;
                                }
                                if (Number.isFinite(j.pickInRound)) next.pickInRound = j.pickInRound as number;
                                if (Number.isFinite(j.draftSlot)) next.draftSlot = j.draftSlot as number;
                                if (next.year && next.round) next.name = `${next.year} ${ordinal(next.round)} Round Pick`;
                                assets[ai] = next;
                                teamsArr[idx].assets = assets;
                                setForm({ ...form, teams: teamsArr });
                              } catch {}
                            }}
                          >
                            Fill details
                          </Button>
                        </div>
                      )}
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

export const dynamic = 'force-dynamic';

export default function AdminTradesPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8">Loading…</div>}>
      <AdminTradesContent />
    </Suspense>
  );
}
