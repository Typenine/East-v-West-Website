'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import TradeBlockCard from '@/components/trades/TradeBlockCard';
import TradeBlockEditPanel, { TradeBlockEditPanelPlaceholder } from '@/components/trades/TradeBlockEditPanel';
import { TradeCardSkeleton } from '@/components/trades/TradeCard';
import { ArrowLeft, Pencil } from 'lucide-react';
import { BroadcastPanel, PANEL, teamAccent } from '@/components/ui/BroadcastPanel';

export type { TradeAsset, TradeWants, TeamRow } from '@/types/trade-block';
import type { TradeAsset, TradeWants, TeamRow } from '@/types/trade-block';

export type PlayersLookup = Record<string, { name: string; position?: string; team?: string }>;

export type AssetsResponse = { players: string[]; picks: { year: number; round: number; originalTeam: string }[]; faab: number; year: number; years?: number[] };

export type MeTradeBlock = { tradeBlock: TradeAsset[]; tradeWants?: TradeWants };

export type AuthMe = { authenticated: boolean; claims?: Record<string, unknown> };

const WANT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', '1st', '2nd', '3rd'];

function assetKey(a: TradeAsset): string {
  if (a.type === 'player') return 'player:' + a.playerId;
  if (a.type === 'pick') return ['pick', a.year, a.round, a.originalTeam].join(':');
  return 'faab:' + (a.amount ?? 0);
}

function compareBlocks(a: TradeAsset[], b: TradeAsset[]): boolean {
  return a.map(assetKey).sort().join('|') === b.map(assetKey).sort().join('|');
}

function compareWants(a?: TradeWants, b?: TradeWants): boolean {
  const clean = (w?: TradeWants) => JSON.stringify({
    text: w?.text || '',
    positions: [...(w?.positions || [])].sort(),
    contactMethod: w?.contactMethod || '',
    phone: w?.contactMethod === 'text' ? (w.phone || '').replace(/[^0-9+]/g, '').slice(0, 20) : '',
    snap: w?.contactMethod === 'snap' ? (w.snap || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 30) : '',
  });
  return clean(a) === clean(b);
}

function savedEditorState(saved: MeTradeBlock, assets: AssetsResponse) {
  const players: Record<string, boolean> = {};
  const picks: Record<string, boolean> = {};
  let faabOn = false;
  let faabAmt = 0;
  for (const asset of (saved.tradeBlock || [])) {
    if (asset.type === 'player') players[asset.playerId] = true;
    if (asset.type === 'pick') picks[[asset.year, asset.round, asset.originalTeam].join('-')] = true;
    if (asset.type === 'faab') {
      faabOn = true;
      faabAmt = asset.amount ?? assets.faab;
    }
  }
  const wantsPos: Record<string, boolean> = {};
  for (const pos of saved.tradeWants?.positions || []) wantsPos[pos] = true;
  return {
    players, picks, faabOn, faabAmt, wantsPos,
    wantsText: saved.tradeWants?.text || '',
    contactMethod: saved.tradeWants?.contactMethod,
    phone: saved.tradeWants?.phone || '',
    snap: saved.tradeWants?.snap || '',
  };
}

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
  const [contactMethod, setContactMethod] = useState<TradeWants['contactMethod']>(undefined);
  const [phone, setPhone] = useState('');
  const [snap, setSnap] = useState('');
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editorLoadError, setEditorLoadError] = useState<string | null>(null);

  const [slotByOriginalTeam, setSlotByOriginalTeam] = useState<Record<string, number>>({});
  const [draftOrderSeason, setDraftOrderSeason] = useState<number>(0);

  const searchParams = useSearchParams();
  const highlightTeam = searchParams.get('team');

  useEffect(() => {
    if (!highlightTeam || loading || rows.length === 0) return;
    const normalized = decodeURIComponent(highlightTeam).trim().toLowerCase();
    const match = rows.find((r) => r.team.trim().toLowerCase() === normalized);
    if (!match) return;
    const id = `trade-block-team-${encodeURIComponent(match.team)}`;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [highlightTeam, loading, rows]);

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
    for (const a of (mySaved?.tradeBlock || [])) if (a.type === 'player') ids.add(a.playerId);
    return Array.from(ids);
  }, [rows, mySaved]);

  useEffect(() => {
    if (allPlayerIds.length === 0) return;
    const qs = encodeURIComponent(allPlayerIds.join(','));
    fetch(`/api/players/names?ids=${qs}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => setPlayerNames((prev) => ({ ...prev, ...((j?.players as PlayersLookup) || {}) })))
      .catch(() => {});
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
        if (!assetsRes.ok || !mineRes.ok) throw new Error('Unable to load your trade block editor.');
        const [assets, saved] = await Promise.all([assetsRes.json(), mineRes.json()]);
        setMyAssets(assets as AssetsResponse);
        setMySaved(saved as MeTradeBlock);
        setEditorLoadError(null);
      } catch {
        setEditorLoadError('Unable to load your roster or saved block. Refresh the page to try again.');
      }
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

  // Fetch draft slot order so picks can show "Round 1 Pick 8 (bop pop)"
  useEffect(() => {
    fetch('/api/draft/next-order', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.slotOrder && data?.season) {
          const map: Record<string, number> = {};
          for (const entry of data.slotOrder as Array<{ slot: number; team: string }>) {
            map[entry.team] = entry.slot;
          }
          setSlotByOriginalTeam(map);
          setDraftOrderSeason(Number(data.season));
        }
      })
      .catch(() => {});
  }, []);

  // Keep the draft synchronized with server-confirmed saves and the initial load.
  useEffect(() => {
    if (!myAssets || !mySaved) return;
    const next = savedEditorState(mySaved, myAssets);
    setSelPlayers(next.players);
    setSelPicks(next.picks);
    setFaabOn(next.faabOn);
    setFaabAmt(next.faabAmt);
    setWantsText(next.wantsText);
    setWantsPos(next.wantsPos);
    setContactMethod(next.contactMethod);
    setPhone(next.phone);
    setSnap(next.snap);
  }, [myAssets, mySaved]);

  const pickSlot = (a: { year: number; originalTeam: string }): number =>
    a.year === draftOrderSeason ? (slotByOriginalTeam[a.originalTeam] ?? 999) : 999;

  const pickLabel = (a: { year: number; round: number; originalTeam: string }, owningTeam: string): string => {
    const slot = pickSlot(a);
    const roundOrd = a.round === 1 ? '1st' : a.round === 2 ? '2nd' : a.round === 3 ? '3rd' : `${a.round}th`;
    const pickPart = slot !== 999 ? `${roundOrd} Round Pick ${slot}` : `${roundOrd} Round`;
    return pickPart + (a.originalTeam && a.originalTeam !== owningTeam ? ` (${a.originalTeam})` : '');
  };

  const sortedBlock = (assets: TradeAsset[]): TradeAsset[] => {
    const picks = assets.filter(a => a.type === 'pick') as Array<{ type: 'pick'; year: number; round: number; originalTeam: string }>;
    const players = assets.filter(a => a.type === 'player');
    const faab = assets.filter(a => a.type === 'faab');
    const sorted = [...picks].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      if (a.round !== b.round) return a.round - b.round;
      return pickSlot(a) - pickSlot(b);
    });
    return [...sorted, ...players, ...faab];
  };

  const draftBlock = useMemo<TradeAsset[]>(() => {
    if (!myAssets) return [];
    const items: TradeAsset[] = [];
    for (const pid of myAssets.players) {
      if (selPlayers[pid]) items.push({ type: 'player', playerId: pid });
    }
    for (const pick of myAssets.picks) {
      if (selPicks[[pick.year, pick.round, pick.originalTeam].join('-')]) {
        items.push({ type: 'pick', year: pick.year, round: pick.round, originalTeam: pick.originalTeam });
      }
    }
    if (faabOn) {
      items.push({ type: 'faab', amount: Math.max(0, Math.min(myAssets.faab, faabAmt || 0)) });
    }
    return items;
  }, [myAssets, selPlayers, selPicks, faabOn, faabAmt]);

  const draftWants = useMemo<TradeWants>(() => ({
    text: wantsText.slice(0, 300),
    positions: WANT_POSITIONS.filter((pos) => wantsPos[pos]),
    contactMethod,
    phone: contactMethod === 'text' ? phone.replace(/[^0-9+]/g, '').slice(0, 20) : undefined,
    snap: contactMethod === 'snap' ? snap.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 30) : undefined,
  }), [wantsText, wantsPos, contactMethod, phone, snap]);

  const dirty = !!mySaved &&
    (!compareBlocks(draftBlock, mySaved.tradeBlock || []) ||
      !compareWants(draftWants, mySaved.tradeWants));

  function discardMine() {
    if (!myAssets || !mySaved) return;
    const next = savedEditorState(mySaved, myAssets);
    setSelPlayers(next.players);
    setSelPicks(next.picks);
    setFaabOn(next.faabOn);
    setFaabAmt(next.faabAmt);
    setWantsText(next.wantsText);
    setWantsPos(next.wantsPos);
    setContactMethod(next.contactMethod);
    setPhone(next.phone);
    setSnap(next.snap);
    setSaveError(null);
    setSaveStatus(null);
  }

  function backToBlock() {
    if (dirty && !window.confirm('Discard your unsaved trade block changes?')) return;
    if (dirty) discardMine();
    setIsEditing(false);
  }

  async function saveMine() {
    if (!auth || !myAssets || !mySaved || saving || !dirty) return;
    try {
      setSaving(true);
      setSaveError(null);
      setSaveStatus(null);
      const res = await fetch('/api/me/trade-block', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeBlock: draftBlock, tradeWants: draftWants }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(json?.error || 'Could not save your trade block.');
      }
      const response = await res.json() as MeTradeBlock;
      const savedBlock = response.tradeBlock || draftBlock;
      const savedWants = response.tradeWants || draftWants;
      setMySaved({ tradeBlock: savedBlock, tradeWants: savedWants });
      setSaveStatus('Changes saved successfully.');
      if (myTeam) {
        const updated: TeamRow = {
          team: myTeam, tradeBlock: savedBlock, tradeWants: savedWants,
          updatedAt: new Date().toISOString(),
        };
        setRows((prev) => {
          const idx = prev.findIndex((row) => row.team === myTeam);
          if (idx < 0) return [...prev, updated];
          const next = [...prev];
          next[idx] = updated;
          return next;
        });
      }
      // A failed refresh does not undo a successful save.
      try {
        const agg = await fetch('/api/teams/trade-blocks', { cache: 'no-store' });
        if (agg.ok) {
          const json = await agg.json();
          if (Array.isArray(json?.teams)) setRows(json.teams as TeamRow[]);
        }
      } catch {}
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save your trade block.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {isEditing ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={backToBlock}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors hover:bg-[var(--panel-tint-medium)]"
              style={{ borderColor: PANEL.hairline, color: PANEL.text }}>
              <ArrowLeft size={16} aria-hidden="true" /> Back to trade block
            </button>
            <div className="text-right">
              <h2 className="text-xl font-bold" style={{ color: PANEL.text }}>Manage my trade block</h2>
              <p className="text-xs" style={{ color: PANEL.muted }}>Choose exactly which assets other teams can see.</p>
            </div>
          </div>
          {!myAssets || !mySaved ? (
            <TradeBlockEditPanelPlaceholder
              message={editorLoadError || 'Loading your roster and saved trade block...'}
              accentTeam={myTeam}
            />
          ) : (
            <TradeBlockEditPanel
              myTeam={myTeam}
              myAssets={myAssets}
              playerNames={playerNames}
              selPlayers={selPlayers}
              setSelPlayers={setSelPlayers}
              selPicks={selPicks}
              setSelPicks={setSelPicks}
              faabOn={faabOn}
              setFaabOn={setFaabOn}
              faabAmt={faabAmt}
              setFaabAmt={setFaabAmt}
              wantsText={wantsText}
              setWantsText={setWantsText}
              wantsPos={wantsPos}
              setWantsPos={setWantsPos}
              contactMethod={contactMethod}
              setContactMethod={setContactMethod}
              phone={phone}
              setPhone={setPhone}
              snap={snap}
              setSnap={setSnap}
              saving={saving}
              dirty={dirty}
              saveStatus={saveStatus}
              saveError={saveError}
              pickLabel={(a) => pickLabel(a, myTeam || '')}
              pickSlot={pickSlot}
              onSave={saveMine}
              onDiscard={discardMine}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          <div className="lg:col-span-2 lg:order-first order-last">
            {loading ? (
              <div className="space-y-5" role="status" aria-live="polite" aria-busy="true">
                <TradeCardSkeleton />
                <TradeCardSkeleton />
              </div>
            ) : error ? (
              <p className="text-[var(--danger)]">{error}</p>
            ) : rows.length === 0 ? (
              <p className="text-[var(--muted)]">No teams have posted trade blocks yet.</p>
            ) : (
              <ul className="space-y-5">
                {rows.map((row) => {
                  const isHighlighted = highlightTeam
                    ? row.team.trim().toLowerCase() === decodeURIComponent(highlightTeam).trim().toLowerCase()
                    : false;
                  return (
                    <TradeBlockCard
                      key={row.team}
                      team={row.team}
                      tradeBlock={sortedBlock(row.tradeBlock)}
                      tradeWants={row.tradeWants}
                      updatedAt={row.updatedAt}
                      playerNames={playerNames}
                      pickLabel={(a) => pickLabel(a, row.team)}
                      isHighlighted={isHighlighted}
                    />
                  );
                })}
              </ul>
            )}
          </div>
          <div className="order-first lg:order-last">
            {!auth ? (
              <TradeBlockEditPanelPlaceholder message="Sign in to manage your trade block." />
            ) : !myAssets || !mySaved ? (
              <TradeBlockEditPanelPlaceholder
                message={editorLoadError || 'Loading your trade block...'}
                accentTeam={myTeam}
              />
            ) : (
              <BroadcastPanel accent={teamAccent(myTeam)} title="My Trade Block" meta={myTeam || undefined}>
                <div className="space-y-4">
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h2 className="text-sm font-bold" style={{ color: PANEL.text }}>
                        Currently on the block
                      </h2>
                      <span className="rounded-full px-2 py-1 text-xs font-semibold tabular-nums"
                        style={{ background: PANEL.tintStronger, color: PANEL.muted }}>
                        {(mySaved.tradeBlock || []).length} listed
                      </span>
                    </div>
                    {(mySaved.tradeBlock || []).length === 0 ? (
                      <p className="rounded-lg border border-dashed px-3 py-4 text-sm"
                        style={{ color: PANEL.muted, borderColor: PANEL.hairline }}>
                        No players or picks listed yet.
                      </p>
                    ) : (
                      <ul className="space-y-2" aria-label="My listed trade assets">
                        {[...(mySaved.tradeBlock || [])].sort((a, b) => {
                          const order = { player: 0, pick: 1, faab: 2 };
                          return order[a.type] - order[b.type];
                        }).map((asset) => {
                          const key = assetKey(asset);
                          const isPlayer = asset.type === 'player';
                          const name = isPlayer ? playerNames[asset.playerId] : null;
                          const label = isPlayer
                            ? (name?.name || 'Player #' + asset.playerId)
                            : asset.type === 'pick'
                              ? asset.year + ' ' + pickLabel(asset, myTeam || '')
                              : '$' + (asset.amount ?? 0) + ' FAAB';
                          const tag = isPlayer ? (name?.position || 'PLR')
                            : asset.type === 'pick' ? 'R' + asset.round : 'FAAB';
                          return (
                            <li key={key} className="flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5"
                              style={{ background: PANEL.tintSoft, borderColor: PANEL.hairline }}>
                              <span className="inline-flex min-w-10 shrink-0 justify-center rounded px-1.5 py-1 text-[11px] font-bold"
                                style={{ background: teamAccent(myTeam) + '1c', color: teamAccent(myTeam) }}>
                                {tag}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="break-words text-sm font-semibold" style={{ color: PANEL.text }}>
                                  {label}
                                </div>
                                {isPlayer && name?.team ? (
                                  <div className="text-xs" style={{ color: PANEL.muted }}>{name.team}</div>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <button type="button"
                    onClick={() => { setSaveStatus(null); setSaveError(null); setIsEditing(true); }}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2"
                    style={{
                      color: PANEL.text,
                      background: teamAccent(myTeam) + '30',
                      boxShadow: 'inset 0 0 0 1px ' + teamAccent(myTeam) + '77',
                    }}>
                    <Pencil size={16} aria-hidden="true" />
                    Edit my trade block
                  </button>
                  <p className="text-xs leading-5" style={{ color: PANEL.muted }}>
                    Search your roster, add picks, and remove players in one place.
                  </p>
                </div>
              </BroadcastPanel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
