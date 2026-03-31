'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useRef, useCallback } from 'react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { getTeamLogoPath } from '@/lib/utils/team-utils';
import { getTeamColors } from '@/lib/constants/team-colors';
import { TEAM_NAMES } from '@/lib/constants/league';

const POS_COLORS: Record<string, string> = {
  QB: '#C00000', RB: '#FFC000', WR: '#0070C0', TE: '#00B050', K: '#FF8C42',
};

type DraftPick = { overall: number; round: number; team: string; playerId: string; playerName?: string | null; playerPos?: string | null; playerNfl?: string | null; madeAt: string };
type DraftSlot = { overall: number; round: number; team: string };

type DraftOverview = {
  id: string;
  year: number;
  rounds: number;
  clockSeconds: number;
  status: 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED';
  curOverall: number;
  onClockTeam?: string | null;
  deadlineTs?: string | null;
  recentPicks: DraftPick[];
  allPicks?: DraftPick[];
  upcoming: DraftSlot[];
  allSlots?: DraftSlot[];
};

type PendingPick = {
  id: string; overall: number; team: string; playerId: string;
  playerName: string | null; playerPos: string | null; playerNfl: string | null;
} | null;

type MeResp = { authenticated: boolean; isAdmin?: boolean; claims?: { team?: string } };
type Avail = { id: string; name: string; pos: string; nfl: string };
type QueueItem = { id: string; name: string; pos: string; nfl: string };

export default function DraftRoomPage() {
  const [me, setMe] = useState<MeResp>({ authenticated: false });
  const [draft, setDraft] = useState<DraftOverview | null>(null);
  const [pendingPick, setPendingPick] = useState<PendingPick>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('');
  const [avail, setAvail] = useState<Avail[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [localRemaining, setLocalRemaining] = useState<number | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number>(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [pickStatus, setPickStatus] = useState<null | 'pending' | 'rejected'>(null);
  const [submittedPlayer, setSubmittedPlayer] = useState<Avail | null>(null);
  const prevPendingRef = useRef<PendingPick>(null);
  const beepPlayedRef = useRef(false);

  const [adminTeamOverride, setAdminTeamOverride] = useState<string>('');
  const isAdmin = !!me?.isAdmin;
  const onClock = draft?.onClockTeam || null;
  const myTeam = me?.claims?.team || (isAdmin ? (adminTeamOverride || onClock || null) : null);
  const isMyTurn = !!myTeam && !!onClock && myTeam === onClock;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const playBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } catch { /* not supported */ }
  }, []);

  async function load(includeAvail = false) {
    try {
      setLoading(true);
      const url = includeAvail ? '/api/draft?include=available' : '/api/draft';
      const res = await fetch(url, { cache: 'no-store' });
      const j = await res.json();
      const newDraft = j?.draft || null;
      const newPending: PendingPick = j?.pendingPick ?? null;
      const newRemaining = j?.remainingSec ?? null;

      setDraft(newDraft);
      setRemainingSec(newRemaining);
      setLocalRemaining(newRemaining);
      setLastFetchTime(Date.now());

      // Detect pick resolution (approved or rejected)
      const prevPending = prevPendingRef.current;
      if (prevPending && prevPending.team === myTeam && !newPending) {
        const allPicks: DraftPick[] = newDraft?.allPicks || newDraft?.recentPicks || [];
        const wasApproved = allPicks.some(p => p.playerId === prevPending.playerId);
        if (!wasApproved) {
          setPickStatus('rejected');
        } else {
          setPickStatus(null);
          setSubmittedPlayer(null);
        }
      }
      prevPendingRef.current = newPending;
      setPendingPick(newPending);

      if (newRemaining !== null && newRemaining > 10) beepPlayedRef.current = false;
      if (includeAvail) setAvail((j?.available as Avail[]) || []);
    } finally {
      setLoading(false);
    }
  }

  // Countdown
  useEffect(() => {
    if (remainingSec === null) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastFetchTime) / 1000);
      const newLocal = Math.max(0, remainingSec - elapsed);
      setLocalRemaining(newLocal);
      if (newLocal <= 10 && newLocal > 0 && !beepPlayedRef.current && isMyTurn) {
        beepPlayedRef.current = true;
        playBeep();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingSec, lastFetchTime, isMyTurn, playBeep]);

  // Bootstrap
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then((j: MeResp) => setMe(j)).catch(() => {});
    load(true);
    const t = setInterval(() => load(false), 3000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load queue when authenticated
  useEffect(() => {
    if (!me?.authenticated) return;
    fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'queue_get' }) })
      .then(r => r.json()).then(j => setQueue((j?.queue as QueueItem[]) || []))
      .catch(() => {});
  }, [me?.authenticated]);

  const submitPick = async (player: Avail) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'pick', playerId: player.id, playerName: player.name, playerPos: player.pos, playerNfl: player.nfl }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) {
        alert(j?.error || 'Pick failed');
        return;
      }
      setPickStatus('pending');
      setSubmittedPlayer(player);
      setAvail([]);
      setSearch('');
    } finally {
      setSubmitting(false);
    }
  };

  const syncQueue = async (newQueue: QueueItem[]) => {
    setQueue(newQueue);
    await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'queue_set', players: newQueue }) });
  };

  const addToQueue = async (player: Avail) => {
    if (queue.some(q => q.id === player.id)) return;
    await syncQueue([...queue, player]);
  };

  const removeFromQueue = async (id: string) => syncQueue(queue.filter(q => q.id !== id));

  const moveInQueue = async (id: string, dir: 'up' | 'down') => {
    const idx = queue.findIndex(q => q.id === id);
    if (idx < 0) return;
    const nIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (nIdx < 0 || nIdx >= queue.length) return;
    const nq = [...queue];
    [nq[idx], nq[nIdx]] = [nq[nIdx], nq[idx]];
    await syncQueue(nq);
  };

  const searchAvail = async () => {
    const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'available', q: search, pos: posFilter, limit: 50 }) });
    const j = await res.json();
    setAvail((j?.available as Avail[]) || []);
  };

  // Derived
  const onClockColors = onClock ? getTeamColors(onClock) : null;
  const tc = onClockColors ? [onClockColors.primary, onClockColors.secondary] : ['#333', '#555'];
  const onClockLogo = onClock ? getTeamLogoPath(onClock) : null;
  const allSlots = draft?.allSlots || [];
  const allPicks = draft?.allPicks || draft?.recentPicks || [];
  const pickedByOverall = new Map(allPicks.map(p => [p.overall, p]));
  const rounds = draft?.rounds || 4;
  const picksPerRound = Math.ceil(allSlots.length / Math.max(rounds, 1)) || 12;
  const myTeamColors = myTeam ? getTeamColors(myTeam) : null;
  const isMyPickPending = pickStatus === 'pending' || (pendingPick?.team === myTeam);

  return (
    <div className="h-screen flex flex-col bg-[var(--background)] overflow-hidden">
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ background: 'linear-gradient(90deg,#be161e,#bf9944)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
      >
        <div className="flex items-center gap-3">
          {myTeam && myTeamColors && (
            <div className="w-8 h-8 rounded overflow-hidden bg-black/30">
              <img src={getTeamLogoPath(myTeam)} alt={myTeam} className="w-full h-full object-contain" />
            </div>
          )}
          <span className="font-black text-white text-lg tracking-tight">
            Draft Room{myTeam ? ` — ${myTeam}` : ''}
          </span>
          {isAdmin && (
            <span className="text-xs bg-yellow-400 text-black font-bold px-2 py-0.5 rounded">ADMIN MODE</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {draft && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${draft.status === 'LIVE' ? 'bg-emerald-500 text-white' : draft.status === 'PAUSED' ? 'bg-yellow-400 text-black' : 'bg-zinc-600 text-white'}`}>
              {draft.status}
            </span>
          )}
          <span className="text-white/70 text-xs">{draft ? `${draft.year} Draft` : 'No active draft'}</span>
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Draft Board ── */}
        <div className="flex flex-col border-r border-[var(--border)] bg-zinc-950 overflow-hidden" style={{ width: '60%' }}>
          {/* Board header */}
          <div className="grid shrink-0 bg-zinc-900 border-b border-zinc-800" style={{ gridTemplateColumns: `40px repeat(${rounds}, 1fr)` }}>
            <div className="text-center text-[10px] font-bold text-zinc-500 py-1.5">#</div>
            {Array.from({ length: rounds }, (_, i) => (
              <div key={i} className="text-center text-[10px] font-bold text-zinc-400 py-1.5 border-l border-zinc-800">
                Round {i + 1}
              </div>
            ))}
          </div>
          {/* Board rows — scrollable */}
          <div className="flex-1 overflow-y-auto">
            {Array.from({ length: picksPerRound }, (_, pickIdx) => (
              <div key={pickIdx} className="grid border-b border-zinc-800/50 hover:bg-zinc-900/30" style={{ gridTemplateColumns: `40px repeat(${rounds}, 1fr)`, minHeight: '42px' }}>
                {/* Row label */}
                <div className={`flex items-center justify-center text-xs font-bold border-r border-zinc-800 ${
                  draft && (draft.curOverall - 1) % picksPerRound === pickIdx && draft.status === 'LIVE'
                    ? 'text-yellow-400 bg-yellow-400/10 animate-pulse'
                    : 'text-zinc-600'
                }`}>
                  {pickIdx + 1}
                </div>
                {/* Round cells */}
                {Array.from({ length: rounds }, (_, roundIdx) => {
                  const overall = roundIdx * picksPerRound + pickIdx + 1;
                  const slot = allSlots.find(s => s.overall === overall);
                  const picked = pickedByOverall.get(overall);
                  const isCurrent = draft?.curOverall === overall;
                  const isMySlot = slot?.team === myTeam;
                  const slotLogo = slot ? getTeamLogoPath(slot.team) : null;
                  const posColor = picked?.playerPos ? (POS_COLORS[picked.playerPos] || '#888') : null;

                  return (
                    <div
                      key={roundIdx}
                      className={`flex items-center gap-1 px-1.5 border-l border-zinc-800/50 overflow-hidden ${
                        isCurrent ? 'bg-yellow-400/15 ring-1 ring-inset ring-yellow-400' :
                        picked ? 'bg-zinc-800/60' :
                        isMySlot ? 'bg-blue-900/20' : 'bg-transparent'
                      }`}
                      style={{ borderLeft: picked && posColor ? `3px solid ${posColor}` : undefined }}
                    >
                      {slotLogo && (
                        <div className="shrink-0 w-5 h-5">
                          <img src={slotLogo} alt="" className="w-full h-full object-contain" />
                        </div>
                      )}
                      {picked ? (
                        <div className="min-w-0 flex-1">
                          <div className="text-white text-[10px] font-semibold leading-tight truncate">{picked.playerName || picked.playerId}</div>
                          <div className="text-zinc-400 text-[9px] leading-tight">{picked.playerPos}</div>
                        </div>
                      ) : isCurrent ? (
                        <div className="text-yellow-400 text-[9px] font-bold uppercase tracking-wide animate-pulse">On Clock</div>
                      ) : isMySlot && !picked ? (
                        <div className="text-blue-400 text-[9px]">My pick</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Controls ── */}
        <div className="flex flex-col overflow-y-auto bg-[var(--background)]" style={{ width: '40%' }}>

          {/* On the Clock Banner */}
          {draft && draft.status !== 'NOT_STARTED' && (
            <div
              className="p-3 shrink-0"
              style={{ background: `linear-gradient(135deg, ${tc[0]}33, ${tc[1]}22)`, borderBottom: `2px solid ${tc[0]}60` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-black/30 flex items-center justify-center border border-white/20">
                  {onClockLogo
                    ? <img src={onClockLogo} alt={onClock || ''} className="w-full h-full object-contain" />
                    : <span className="text-white/40 text-xl">?</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white/60 uppercase tracking-widest">On The Clock</div>
                  <div className="font-black text-white text-lg leading-tight truncate">{onClock || '—'}</div>
                  <div className="text-xs text-white/50">
                    Pick #{draft.curOverall} · Rd {draft.upcoming?.[0]?.round || Math.ceil(draft.curOverall / picksPerRound)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-3xl font-mono font-bold tabular-nums ${localRemaining !== null && localRemaining <= 10 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                    {localRemaining !== null ? formatTime(localRemaining) : '--:--'}
                  </div>
                </div>
              </div>
              {isMyTurn && !isMyPickPending && (
                <div className="mt-2 rounded-lg bg-emerald-600 text-white text-center font-black text-sm py-1.5 animate-pulse">
                  🎯 YOUR TURN TO PICK!
                </div>
              )}
            </div>
          )}

          {/* Pending pick notice */}
          {isMyPickPending && (
            <div className="m-3 p-3 rounded-lg border-2 border-yellow-400 bg-yellow-400/10 text-yellow-300 shrink-0">
              <div className="font-bold text-sm">⏳ Pick Submitted — Awaiting Admin Approval</div>
              {submittedPlayer && (
                <div className="text-xs mt-1 text-yellow-200/80">
                  {submittedPlayer.name} · {submittedPlayer.pos} · {submittedPlayer.nfl}
                </div>
              )}
              <div className="text-xs mt-1 text-yellow-400/60">Your pick will appear on the board once approved.</div>
            </div>
          )}

          {/* Rejected notice */}
          {pickStatus === 'rejected' && (
            <div className="m-3 p-3 rounded-lg border-2 border-red-500 bg-red-500/10 text-red-300 shrink-0">
              <div className="font-bold text-sm">❌ Pick Rejected</div>
              <div className="text-xs mt-1 text-red-300/70">Please try again with a different selection.</div>
              <button
                type="button"
                className="mt-1.5 text-xs underline text-red-400 hover:text-red-300"
                onClick={() => { setPickStatus(null); setSubmittedPlayer(null); }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Not logged in / waiting */}
          {!me.authenticated && !isAdmin && !loading && (
            <div className="m-3 p-3 rounded-lg bg-zinc-800 text-[var(--muted)] text-sm shrink-0">
              Log in with your team credentials to make picks.
            </div>
          )}
          {isAdmin && !me.authenticated && (
            <div className="m-3 p-2 rounded-lg bg-yellow-400/10 border border-yellow-400/30 text-yellow-300 text-xs shrink-0 space-y-1.5">
              <div className="font-bold">Admin mode — view as team:</div>
              <select
                value={adminTeamOverride}
                onChange={e => setAdminTeamOverride(e.target.value)}
                className="w-full px-2 py-1 rounded bg-zinc-900 border border-yellow-400/40 text-yellow-200 text-xs"
              >
                <option value="">{onClock ? `Auto (on clock: ${onClock})` : 'Auto (on clock)'}</option>
                {TEAM_NAMES.map(t => (
                  <option key={t} value={t}>{t}{t === onClock ? ' ⏰ ON CLOCK' : ''}</option>
                ))}
              </select>
              {myTeam && (
                <div className="text-yellow-300/70">
                  {myTeam === onClock ? '✅ This team is on the clock — you can make a pick' : `Viewing as ${myTeam} — pick panel unlocks when it’s their turn`}
                </div>
              )}
            </div>
          )}

          {/* Pick Panel — only when it's your turn and not pending */}
          {isMyTurn && !isMyPickPending && (me.authenticated || isAdmin) && (
            <div className="p-3 border-b border-[var(--border)] shrink-0">
              <div className="text-xs font-bold text-[var(--muted)] uppercase tracking-wide mb-2">Make Your Pick</div>
              <div className="flex gap-2 mb-2">
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search player…"
                  className="flex-1"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchAvail(); } }}
                />
                <Select value={posFilter} onChange={e => setPosFilter(e.target.value)} className="w-20">
                  <option value="">All</option>
                  {['QB','RB','WR','TE','K'].map(p => <option key={p} value={p}>{p}</option>)}
                </Select>
                <Button size="sm" onClick={searchAvail}>Go</Button>
              </div>
              {avail.length > 0 && (
                <div className="border border-[var(--border)] rounded overflow-hidden max-h-64 overflow-y-auto">
                  {avail.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-2 py-1.5 hover:bg-zinc-800/80 border-b border-[var(--border)] last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{p.name}</div>
                        <div className="text-xs text-[var(--muted)]">{p.pos} · {p.nfl}</div>
                      </div>
                      <div className="flex gap-1.5 ml-2 shrink-0">
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={submitting}
                          onClick={() => submitPick(p)}
                        >
                          Pick
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => addToQueue(p)}>+Q</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Queue */}
          {(me.authenticated || isAdmin) && (
            <div className="p-3 border-b border-[var(--border)] shrink-0">
              <div className="text-xs font-bold text-[var(--muted)] uppercase tracking-wide mb-2">My Queue</div>
              {queue.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">Empty — queue players to auto-pick when your turn comes.</p>
              ) : (
                <ul className="space-y-1">
                  {queue.map((q, idx) => (
                    <li key={q.id} className="flex items-center gap-1.5 text-sm">
                      <span className="text-zinc-600 w-4 shrink-0">{idx + 1}.</span>
                      <span className="flex-1 truncate font-medium">{q.name}</span>
                      <span className="text-xs text-[var(--muted)] shrink-0">{q.pos}</span>
                      <div className="flex gap-0.5">
                        <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => moveInQueue(q.id, 'up')}>↑</Button>
                        <Button size="sm" variant="ghost" disabled={idx === queue.length - 1} onClick={() => moveInQueue(q.id, 'down')}>↓</Button>
                        <Button size="sm" variant="ghost" onClick={() => removeFromQueue(q.id)}>×</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* My Roster */}
          {myTeam && draft && (
            <div className="p-3 border-b border-[var(--border)] shrink-0">
              <div className="text-xs font-bold text-[var(--muted)] uppercase tracking-wide mb-2">My Roster — {myTeam}</div>
              {(() => {
                const myPicks = allPicks.filter(p => p.team === myTeam);
                return myPicks.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">No picks yet.</p>
                ) : (
                  <div className="space-y-1">
                    {myPicks.map(p => (
                      <div key={p.overall} className="flex items-center gap-2 text-sm p-1 rounded bg-zinc-800/50">
                        <span
                          className="text-[10px] font-bold px-1 rounded"
                          style={{ background: POS_COLORS[p.playerPos || ''] || '#555', color: '#fff' }}
                        >
                          {p.playerPos || '?'}
                        </span>
                        <span className="font-semibold truncate">{p.playerName || p.playerId}</span>
                        <span className="text-[var(--muted)] text-xs ml-auto shrink-0">R{p.round}.{((p.overall - 1) % picksPerRound) + 1}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* My Upcoming Picks */}
          {myTeam && draft && (
            <div className="p-3 shrink-0">
              <div className="text-xs font-bold text-[var(--muted)] uppercase tracking-wide mb-2">My Upcoming Picks</div>
              {(() => {
                const myUp = allSlots.filter(s => s.team === myTeam && s.overall >= draft.curOverall);
                return myUp.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">No more picks.</p>
                ) : (
                  <div className="space-y-1">
                    {myUp.map(u => (
                      <div key={u.overall} className="text-xs px-2 py-1 rounded bg-blue-900/20 border border-blue-600/30 text-blue-300">
                        Pick #{u.overall} · Round {u.round}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
