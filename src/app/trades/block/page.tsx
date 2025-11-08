'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';

type TradeAsset =
  | { type: 'player'; playerId: string }
  | { type: 'pick'; year: number; round: number; originalTeam: string }
  | { type: 'faab'; amount?: number };

type TradeWants = {
  text?: string;
  positions?: string[];
  contactMethod?: 'text' | 'discord' | 'snap' | 'sleeper';
  phone?: string;
  snap?: string;
};

type TeamRow = { team: string; tradeBlock: TradeAsset[]; tradeWants: TradeWants | null; updatedAt: string | null };

type PlayersLookup = Record<string, { name: string; position?: string; team?: string }>;

type AssetsResponse = { players: string[]; picks: { year: number; round: number; originalTeam: string }[]; faab: number; year: number };

type MeTradeBlock = { tradeBlock: TradeAsset[]; tradeWants?: TradeWants };

type AuthMe = { authenticated: boolean; claims?: Record<string, unknown> };

const WANT_POSITIONS = ['QB','RB','WR','TE','K','DEF','1st','2nd','3rd'];

export default function TradeBlockPage() {
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
  const [contactMethod, setContactMethod] = useState<TradeWants['contactMethod']>(undefined);
  const [phone, setPhone] = useState('');
  const [snap, setSnap] = useState('');
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
      setContactMethod(mySaved.tradeWants.contactMethod);
      setPhone(mySaved.tradeWants.phone || '');
      setSnap(mySaved.tradeWants.snap || '');
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
      const tradeWants: TradeWants = {
        text: wantsText.slice(0, 300),
        positions: WANT_POSITIONS.filter((k) => wantsPos[k]),
        contactMethod: contactMethod,
        phone: contactMethod === 'text' ? phone : undefined,
        snap: contactMethod === 'snap' ? snap : undefined,
      };
      const res = await fetch('/api/me/trade-block', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tradeBlock, tradeWants })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(j?.error || 'Failed to save');
      }
      // Optimistic update for my team row
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
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Trade Block" />

      {/* Public list */}
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
                  {rows.map((row) => {
                    const s1 = getTeamColorStyle(row.team);
                    const primaryBg = s1.backgroundColor as string;
                    const primaryFg = s1.color as string;
                    const secondaryBg = getTeamColorStyle(row.team, 'secondary').backgroundColor as string;
                    return (
                      <li key={row.team} className="border border-[var(--border)] rounded-[var(--radius-card)] p-4" style={{ borderLeftColor: secondaryBg, borderLeftWidth: 4, borderLeftStyle: 'solid' }}>
                        <div className="rounded-t-[var(--radius-card)] -mx-4 -mt-4 px-4 py-2 mb-3" style={{ backgroundColor: primaryBg, color: primaryFg, borderTopColor: secondaryBg, borderTopWidth: 4, borderTopStyle: 'solid' }}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden" style={{ ...s1, borderColor: secondaryBg, borderWidth: 2, borderStyle: 'solid' }}>
                              <Image src={getTeamLogoPath(row.team)} alt="" width={24} height={24} />
                            </div>
                            <div className="font-bold" style={{ color: primaryFg }}>{row.team}</div>
                            <div className="ml-auto text-xs" style={{ color: primaryFg, opacity: 0.8 }} title={row.updatedAt || undefined}>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}</div>
                          </div>
                        </div>

                        {row.tradeWants && (row.tradeWants.text || (row.tradeWants.positions && row.tradeWants.positions.length > 0) || row.tradeWants.contactMethod) ? (
                          <div className="mb-3 rounded-md p-3" style={{ backgroundColor: primaryBg, color: primaryFg }}>
                            <div className="text-xs uppercase tracking-wide mb-1" style={{ opacity: 0.9 }}>Wants</div>
                            {row.tradeWants.text && <div className="text-sm mb-1">{row.tradeWants.text}</div>}
                            {row.tradeWants.positions && row.tradeWants.positions.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {row.tradeWants.positions.map((p) => (
                                  <span key={p} className="text-xs px-2 py-0.5 rounded-full border" style={{ borderColor: primaryFg, color: primaryFg }}>
                                    {p}
                                  </span>
                                ))}
                              </div>
                            )}
                            {row.tradeWants.contactMethod && (
                              <div className="mt-2 text-xs">
                                <span className="uppercase tracking-wide" style={{ opacity: 0.9 }}>Contact: </span>
                                {row.tradeWants.contactMethod === 'text' && (
                                  <span>Text{row.tradeWants.phone ? ` (${row.tradeWants.phone})` : ''}</span>
                                )}
                                {row.tradeWants.contactMethod === 'discord' && (
                                  <span>Discord</span>
                                )}
                                {row.tradeWants.contactMethod === 'snap' && (
                                  <span>Snap{row.tradeWants.snap ? ` (${row.tradeWants.snap})` : ''}</span>
                                )}
                                {row.tradeWants.contactMethod === 'sleeper' && (
                                  <span>Sleeper</span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : null}

                        <div className="border-t border-[var(--border)] my-2" />
                        {row.tradeBlock.length === 0 ? (
                          <div className="text-[var(--muted)] text-sm">No assets listed.</div>
                        ) : (
                          <>
                            <div className="mt-2 mb-1 text-xs uppercase tracking-wide" style={{ color: primaryBg }}>
                              On the Block
                            </div>
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
                                      <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border mr-1" style={{ borderColor: primaryBg, color: primaryBg }}>
                                        {a.year}
                                      </span>
                                      <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border mr-1" style={{ borderColor: primaryBg, color: primaryBg }}>
                                        R{a.round}
                                      </span>
                                      {a.originalTeam && a.originalTeam !== row.team ? (
                                        <span className="text-xs text-[var(--muted)]"> (originally {a.originalTeam})</span>
                                      ) : null}
                                    </span>
                                  ) : (
                                    <span>
                                      <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border mr-1" style={{ borderColor: primaryBg, color: primaryBg }}>
                                        FAAB
                                      </span>
                                      {typeof a.amount === 'number' ? `$${a.amount}` : ''}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </li>
                    );
                  })}
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
                                {p.originalTeam ? (
                                  <span className="text-xs text-[var(--muted)]">{myTeam && p.originalTeam === myTeam ? '' : ` (originally ${p.originalTeam})`}</span>
                                ) : null}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

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

                  {/* Contact Preferences */}
                  <div>
                    <Label className="mb-1 block">Preferred Contact</Label>
                    <div className="flex items-center gap-2">
                      <select
                        className="border border-[var(--border)] rounded px-2 py-1 text-sm"
                        value={contactMethod || ''}
                        onChange={(e) => setContactMethod((e.target.value || undefined) as TradeWants['contactMethod'])}
                      >
                        <option value="">No preference</option>
                        <option value="text">Text</option>
                        <option value="discord">Discord</option>
                        <option value="snap">Snap</option>
                        <option value="sleeper">Sleeper</option>
                      </select>
                      {contactMethod === 'text' && (
                        <input
                          type="tel"
                          placeholder="Phone number"
                          className="border border-[var(--border)] rounded px-2 py-1 text-sm"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      )}
                      {contactMethod === 'snap' && (
                        <input
                          type="text"
                          placeholder="Snap username"
                          className="border border-[var(--border)] rounded px-2 py-1 text-sm"
                          value={snap}
                          onChange={(e) => setSnap(e.target.value)}
                        />
                      )}
                    </div>
                  </div>

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
    </div>
  );
}
