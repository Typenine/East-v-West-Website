'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import TradeBlockCard from '@/components/trades/TradeBlockCard';
import TradeBlockEditPanel, { TradeBlockEditPanelPlaceholder } from '@/components/trades/TradeBlockEditPanel';
import { TradeCardSkeleton } from '@/components/trades/TradeCard';

export type TradeAsset =
  | { type: 'player'; playerId: string }
  | { type: 'pick'; year: number; round: number; originalTeam: string }
  | { type: 'faab'; amount?: number };

export type TradeWants = {
  text?: string;
  positions?: string[];
  contactMethod?: 'text' | 'discord' | 'snap' | 'sleeper';
  phone?: string;
  snap?: string;
};

export type TeamRow = { team: string; tradeBlock: TradeAsset[]; tradeWants: TradeWants | null; updatedAt: string | null };

export type PlayersLookup = Record<string, { name: string; position?: string; team?: string }>;

export type AssetsResponse = { players: string[]; picks: { year: number; round: number; originalTeam: string }[]; faab: number; year: number; years?: number[] };

export type MeTradeBlock = { tradeBlock: TradeAsset[]; tradeWants?: TradeWants };

export type AuthMe = { authenticated: boolean; claims?: Record<string, unknown> };

const WANT_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', '1st', '2nd', '3rd'];

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

      {/* Edit panel */}
      <div className="lg:col-span-1">
        {!auth ? (
          <TradeBlockEditPanelPlaceholder message="Sign in to manage your trade block." />
        ) : !myAssets ? (
          <TradeBlockEditPanelPlaceholder message="Loading your assets…" accentTeam={myTeam} />
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
            pickLabel={(a) => pickLabel(a, myTeam || '')}
            pickSlot={pickSlot}
            onSave={saveMine}
          />
        )}
      </div>
    </div>
  );
}
