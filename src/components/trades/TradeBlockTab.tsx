'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';

export type TradeAsset =
  | { type: 'player'; playerId: string }
  | { type: 'pick'; year: number; round: number; originalTeam: string }
  | { type: 'faab'; amount?: number };

export type TradeWants = { text?: string; positions?: string[] };

export type TeamRow = { team: string; tradeBlock: TradeAsset[]; tradeWants: TradeWants | null; updatedAt: string | null };

export type PlayersLookup = Record<string, { name: string; position?: string; team?: string }>;

export type AssetsResponse = { players: string[]; picks: { year: number; round: number; originalTeam: string }[]; faab: number; year: number };

export type MeTradeBlock = { tradeBlock: TradeAsset[]; tradeWants?: TradeWants };

export type AuthMe = { authenticated: boolean; claims?: Record<string, unknown> };

const WANT_POSITIONS = ['QB','RB','WR','TE','K','DEF','1st','2nd','3rd'];

export default function TradeBlockTab() {
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [auth, setAuth] = useState(false);
  const [myTeam, setMyTeam] = useState<string | null>(null);
  const [myAssets, setMyAssets] = useState<AssetsResponse | null>(null);
  const [mySaved, setMySaved] = useState<MeTradeBlock | null>(null);

  const [playerNames, setPlayerNames] = useState<PlayersLookup>({});

  // Edit state
  const [selPlayers, setSelPlayers] = useState<Record<string, boolean>>({});
  const [selPicks, setSelPicks] = useState<Record<string, boolean>>({}); // key: `${year}-${round}-${originalTeam}`
  const [faabOn, setFaabOn] = useState(false);
  const [faabAmt, setFaabAmt] = useState<number>(0);
  const [wantsText, setWantsText] = useState('');
  const [wantsPos, setWantsPos] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [aggRes, authRes] = await Promise.all([
          fetch('/api/teams/trade-blocks', { cache: 'no-store' }),
          fetch('/api/auth/me', { cache: 'no-store' })
        ]);
        if (!aggRes.ok) throw new Error('Failed to load trade blocks');
        const aggJson = await aggRes.json();
        setRows((aggJson?.teams as TeamRow[]) || []);
        const me: AuthMe = await authRes.json().catch(() => ({ authenticated: false }));
        setAuth(Boolean(me?.authenticated));
        setMyTeam((me?.claims?.team as string) || null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Preload names for all players shown in public list for nicer display
  const allPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) for (const a of r.tradeBlock) if (a.type === 'player') ids.add(a.playerId);
    return Array.from(ids);
  }, [rows]);

  useEffect(() => {
    if (allPlayerIds.length === 0) return;
    const qs = encodeURIComponent(allPlayerIds.join(','));
    fetch(`/api/players/names?ids=${qs}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => setPlayerNames((j?.players as PlayersLookup) || {}))
      .catch(() => setPlayerNames({}));
  }, [allPlayerIds]);

  // If authenticated, load my assets and saved block
  useEffect(() => {
    if (!auth) return;
    (async () => {
      try {
        const [assetsRes, mineRes] = await Promise.all([
          fetch('/api/me/assets', { cache: 'no-store' }),
          fetch('/api/me/trade-block', { cache: 'no-store' })
        ]);
        if (assetsRes.ok) setMyAssets(await assetsRes.json());
        if (mineRes.ok) setMySaved(await mineRes.json());
      } catch {}
    })();
  }, [auth]);

  // Load names for myAssets players (so editor shows names not IDs)
  useEffect(() => {
    if (!myAssets || !Array.isArray(myAssets.players) || myAssets.players.length === 0) return;
    const missing = myAssets.players.filter((id) => !playerNames[id]);
    if (missing.length === 0) return;
    const qs = encodeURIComponent(missing.join(','));
    fetch(`/api/players/names?ids=${qs}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setPlayerNames((prev) => ({ ...prev, ...((j?.players as PlayersLookup) || {}) })))
      .catch(() => {});
  }, [myAssets, playerNames]);

  // Hydrate edit state from saved
  useEffect(() => {
    if (!myAssets) return;
    const selP: Record<string, boolean> = {};
    const selPk: Record<string, boolean> = {};
    let faOn = false; let faVal = 0;
    const wp: Record<string, boolean> = {};
    let wt = '';

    if (mySaved?.tradeBlock) {
      for (const a of mySaved.tradeBlock) {
        if (a.type === 'player') selP[a.playerId] = true;
        else if (a.type === 'pick') selPk[`${a.year}-${a.round}-${a.originalTeam}`] = true;
        else if (a.type === 'faab') { faOn = true; faVal = a.amount ?? myAssets.faab; }
      }
    }
    if (mySaved?.tradeWants) {
      wt = mySaved.tradeWants.text || '';
      for (const p of (mySaved.tradeWants.positions || [])) wp[p] = true;
    }

    setSelPlayers(selP);
    setSelPicks(selPk);
    setFaabOn(faOn);
    setFaabAmt(faVal);
    setWantsText(wt);
    setWantsPos(wp);
  }, [myAssets, mySaved]);

  async function saveMine() {
    if (!auth || !myAssets) return;
    try {
      setSaving(true);
      const tradeBlock: TradeAsset[] = [];
      for (const pid of myAssets.players) if (selPlayers[pid]) tradeBlock.push({ type: 'player', playerId: pid });
      for (const p of myAssets.picks) if (selPicks[`${p.year}-${p.round}-${p.originalTeam}`]) tradeBlock.push({ type: 'pick', year: p.year, round: p.round, originalTeam: p.originalTeam });
      if (faabOn) tradeBlock.push({ type: 'faab', amount: Math.max(0, Math.min(myAssets.faab, faabAmt || 0)) });
      const tradeWants: TradeWants = { text: wantsText.slice(0, 300), positions: WANT_POSITIONS.filter((k) => wantsPos[k]) };
      const res = await fetch('/api/me/trade-block', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tradeBlock, tradeWants })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(j?.error || 'Failed to save');
      }
      // Optimistic update
      if (myTeam) {
        const updated: TeamRow = { team: myTeam, tradeBlock, tradeWants, updatedAt: new Date().toISOString() };
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.team === myTeam);
          if (idx >= 0) { const copy = [...prev]; copy[idx] = updated; return copy; }
          return [...prev, updated];
        });
      }
      // Refresh public list
      const agg = await fetch('/api/teams/trade-blocks', { cache: 'no-store' });
      const j = await agg.json();
      setRows((j?.teams as TeamRow[]) || []);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>League Trade Block</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-[var(--muted)]">Loading…</p>
            ) : error ? (
              <p className="text-[var(--danger)]">{error}</p>
            ) : rows.length === 0 ? (
              <p className="text-[var(--muted)]">No teams have posted trade blocks yet.</p>
            ) : (
              <ul className="space-y-6">
                {rows.map((row) => (
                  <li key={row.team} className="border border-[var(--border)] rounded-[var(--radius-card)] p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden" style={getTeamColorStyle(row.team)}>
                        <Image src={getTeamLogoPath(row.team)} alt="" width={24} height={24} />
                      </div>
                      <div className="font-bold" style={{ color: getTeamColorStyle(row.team).backgroundColor }}>{row.team}</div>
                      <div className="ml-auto text-xs text-[var(--muted)]">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}</div>
                    </div>
                    {row.tradeWants && (row.tradeWants.text || (row.tradeWants.positions && row.tradeWants.positions.length > 0)) ? (
                      <div className="mb-2 text-sm">
                        {row.tradeWants.text && <div className="mb-1">Wants: {row.tradeWants.text}</div>}
                        {row.tradeWants.positions && row.tradeWants.positions.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {row.tradeWants.positions.map((p) => (
                              <span key={p} className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] evw-surface text-[var(--text)]">{p}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                    {row.tradeBlock.length === 0 ? (
                      <div className="text-[var(--muted)] text-sm">No assets listed.</div>
                    ) : (
                      <ul className="space-y-1">
                        {row.tradeBlock.map((a, idx) => (
                          <li key={idx} className="flex items-center justify-between">
                            {a.type === 'player' ? (
                              <span>
                                {playerNames[a.playerId]?.position ? `${playerNames[a.playerId].position} - ` : ''}
                                {playerNames[a.playerId]?.name || a.playerId}
                                {playerNames[a.playerId]?.team ? ` (${playerNames[a.playerId].team})` : ''}
                              </span>
                            ) : a.type === 'pick' ? (
                              <span>
                                {a.year} Round {a.round}
                                {a.originalTeam && a.originalTeam !== row.team ? (
                                  <span className="text-xs text-[var(--muted)]"> (originally {a.originalTeam})</span>
                                ) : null}
                              </span>
                            ) : (
                              <span>FAAB{typeof a.amount === 'number' ? `: $${a.amount}` : ''}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit panel */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle>Edit My Trade Block</CardTitle>
          </CardHeader>
          <CardContent>
            {!auth ? (
              <p className="text-[var(--muted)] text-sm">Sign in to manage your trade block.</p>
            ) : !myAssets ? (
              <p className="text-[var(--muted)]">Loading your assets…</p>
            ) : (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveMine(); }}>
                {/* Players */}
                <div>
                  <Label className="mb-1 block">Players</Label>
                  <div className="max-h-64 overflow-auto space-y-1 border border-[var(--border)] rounded-[var(--radius-card)] p-2">
                    {myAssets.players.length === 0 ? (
                      <div className="text-sm text-[var(--muted)]">No players found.</div>
                    ) : (
                      myAssets.players.map((pid) => (
                        <label key={pid} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={!!selPlayers[pid]} onChange={(e) => setSelPlayers((s) => ({ ...s, [pid]: e.target.checked }))} />
                          <span>
                            {playerNames[pid]?.position ? `${playerNames[pid].position} - ` : ''}
                            {playerNames[pid]?.name || pid}
                            {playerNames[pid]?.team ? ` (${playerNames[pid].team})` : ''}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Picks */}
                <div>
                  <Label className="mb-1 block">Picks ({myAssets.year})</Label>
                  <div className="space-y-1 border border-[var(--border)] rounded-[var(--radius-card)] p-2">
                    {myAssets.picks.length === 0 ? (
                      <div className="text-sm text-[var(--muted)]">No picks owned.</div>
                    ) : (
                      myAssets.picks.map((p) => {
                        const key = `${p.year}-${p.round}-${p.originalTeam}`;
                        return (
                          <label key={key} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={!!selPicks[key]} onChange={(e) => setSelPicks((s) => ({ ...s, [key]: e.target.checked }))} />
                            <span>
                              {p.year} Round {p.round}
                              {p.originalTeam && myTeam && p.originalTeam !== myTeam ? (
                                <span className="text-xs text-[var(--muted)]"> (originally {p.originalTeam})</span>
                              ) : null}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* FAAB */}
                <div>
                  <Label className="mb-1 block">FAAB</Label>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={faabOn} onChange={(e) => setFaabOn(e.target.checked)} />
                    <input
                      type="number"
                      min={0}
                      max={myAssets.faab}
                      value={faabAmt}
                      onChange={(e) => setFaabAmt(Number(e.target.value))}
                      disabled={!faabOn}
                      className="border border-[var(--border)] rounded px-2 py-1 text-sm w-24"
                      aria-label="FAAB amount"
                    />
                    <span className="text-xs text-[var(--muted)]">Available: ${myAssets.faab}</span>
                  </div>
                </div>

                {/* Wants */}
                <div>
                  <Label className="mb-1 block">What are you looking for?</Label>
                  <Textarea rows={3} value={wantsText} onChange={(e) => setWantsText(e.target.value)} placeholder="e.g., WR depth, 2026 picks" />
                  <div className="mt-2 flex flex-wrap gap-3">
                    {WANT_POSITIONS.map((p) => (
                      <label key={p} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!wantsPos[p]} onChange={(e) => setWantsPos((s) => ({ ...s, [p]: e.target.checked }))} />
                        <span>{p}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Trade Block'}</Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
