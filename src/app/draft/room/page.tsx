'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, useRef, useCallback } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { getTeamLogoPath } from '@/lib/utils/team-utils';
import { getTeamColors } from '@/lib/constants/team-colors';
import { TEAM_NAMES } from '@/lib/constants/league';
import DraftPickAnimation from '@/components/draft-overlay/DraftPickAnimation';
import NowOnClockAnimation from '@/components/draft-overlay/NowOnClockAnimation';
import DraftTradeCenter from '@/components/draft-overlay/DraftTradeCenter';
import { gsap } from 'gsap';

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K'];

function getYoutubeEmbedUrl(url: string): string | null {
  try {
    let videoId: string | null = null;
    if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1]?.split(/[?&]/)[0] || null;
    else if (url.includes('youtube.com')) { const u = new URL(url); videoId = u.searchParams.get('v') || u.pathname.split('/').pop() || null; }
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`;
  } catch { return null; }
}

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
  eventName?: string | null;
  eventLogoUrl?: string | null;
  eventColor1?: string | null;
  eventColor2?: string | null;
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
type RosterPlayer = { id: string; name: string; pos: string; nfl: string };

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
  const [autoPickEnabled, setAutoPickEnabled] = useState(false);
  const [adminTeamOverride, setAdminTeamOverride] = useState<string>('');
  const [tradeOpen, setTradeOpen] = useState(false);
  const [teamRoster, setTeamRoster] = useState<RosterPlayer[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [confirmPlayer, setConfirmPlayer] = useState<Avail | null>(null);
  const [tradeInboxCount, setTradeInboxCount] = useState(0);
  const [tradeNotif, setTradeNotif] = useState(false);
  const prevTradeInboxCountRef = useRef(0);
  const tradeOpenRef = useRef(false);
  tradeOpenRef.current = tradeOpen;

  // Animation phase state — mirrors DraftOverlayLive (display only, no admin controls)
  const [animPhase, setAnimPhase] = useState<'pick' | 'clock' | 'video' | null>(null);
  const [videoExiting, setVideoExiting] = useState(false);
  const animDataRef = useRef<{
    pick: DraftPick; nextTeamName: string | null; overall: number;
    round: number; pickInRound: number; videoUrl: string | null; imageUrl: string | null;
  } | null>(null);
  const animPlayerVideosRef = useRef<Record<string, { videoUrl: string | null; hasImage: boolean }>>({});
  const animLastPickRef = useRef<number | null>(null);
  const animInitRef = useRef(false);
  const animDismissingRef = useRef(false);
  const animVideoContainerRef = useRef<HTMLDivElement>(null);
  const animStartTimeRef = useRef<number>(0);

  const prevPendingRef = useRef<PendingPick>(null);
  const beepPlayedRef = useRef(false);
  const autoPickFiredRef = useRef(false);
  const queueRef = useRef<QueueItem[]>([]);
  const submitPickRef = useRef<(player: Avail) => Promise<void>>(async () => {});
  const myTeamRef = useRef<string | null>(null);
  const isFirstSearch = useRef(true);
  const prevCurOverallRef = useRef<number | null>(null);
  const searchRef = useRef(search);
  const posFilterRef = useRef(posFilter);
  searchRef.current = search;
  posFilterRef.current = posFilter;

  const isAdmin = !!me?.isAdmin;
  const onClock = draft?.onClockTeam || null;
  const myTeam = me?.claims?.team || (isAdmin ? (adminTeamOverride || onClock || null) : null);
  const isMyTurn = !!myTeam && !!onClock && myTeam === onClock;
  myTeamRef.current = myTeam;

  function dismissVideo() {
    if (animDismissingRef.current) return;
    animDismissingRef.current = true;
    if (animVideoContainerRef.current) gsap.killTweensOf(animVideoContainerRef.current);
    setVideoExiting(true);
    setTimeout(() => { setAnimPhase(null); setVideoExiting(false); animDismissingRef.current = false; }, 350);
  }

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

  const submitPick = useCallback(async (player: Avail) => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'pick', playerId: player.id, playerName: player.name, playerPos: player.pos, playerNfl: player.nfl }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) { alert(j?.error || 'Pick failed'); return; }
      setPickStatus('pending');
      setSubmittedPlayer(player);
      setSearch('');
      setAvail(prev => prev.filter(p => p.id !== player.id));
    } finally {
      setSubmitting(false);
    }
  }, []);
  submitPickRef.current = submitPick;

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
      // If a new pick was approved (curOverall advanced), silently refresh available players
      const newCurOverall = newDraft?.curOverall ?? null;
      if (newCurOverall !== null && prevCurOverallRef.current !== null && newCurOverall !== prevCurOverallRef.current) {
        fetch('/api/draft', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'available', q: searchRef.current, pos: posFilterRef.current, limit: 50 }),
        }).then(r => r.json()).then(j2 => setAvail((j2?.available as Avail[]) || [])).catch(() => {});
      }
      prevCurOverallRef.current = newCurOverall;
      const prevPending = prevPendingRef.current;
      if (prevPending && prevPending.team === myTeamRef.current && !newPending) {
        const picks: DraftPick[] = newDraft?.allPicks || newDraft?.recentPicks || [];
        if (picks.some(p => p.playerId === prevPending.playerId)) {
          setPickStatus(null); setSubmittedPlayer(null);
        } else {
          setPickStatus('rejected');
          // Rejected player was never committed — refresh available list so they reappear
          fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'available', q: searchRef.current, pos: posFilterRef.current, limit: 50 }) })
            .then(r => r.json()).then(j2 => setAvail((j2?.available as Avail[]) || [])).catch(() => {});
        }
      }
      prevPendingRef.current = newPending;
      setPendingPick(newPending);
      // Auto-remove the approved player from queue so it doesn't linger or re-trigger autopick
      if (prevPending && prevPending.team === myTeamRef.current && !newPending) {
        const wasApproved = (newDraft?.allPicks || newDraft?.recentPicks || []).some((p: DraftPick) => p.playerId === prevPending.playerId);
        if (wasApproved && queueRef.current.some(q => q.id === prevPending.playerId)) {
          const cleaned = queueRef.current.filter(q => q.id !== prevPending.playerId);
          setQueue(cleaned);
          queueRef.current = cleaned;
          const qBody: Record<string, unknown> = { action: 'queue_set', players: cleaned };
          if (myTeamRef.current) qBody.team = myTeamRef.current;
          fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(qBody) }).catch(() => {});
        }
      }
      // Auto-remove any players from queue who have already been drafted
      if (queueRef.current.length > 0) {
        const pickedIds = new Set((newDraft?.allPicks || newDraft?.recentPicks || []).map((p: DraftPick) => p.playerId));
        const filtered = queueRef.current.filter(q => !pickedIds.has(q.id));
        if (filtered.length !== queueRef.current.length) {
          setQueue(filtered);
          queueRef.current = filtered;
          const qBody: Record<string, unknown> = { action: 'queue_set', players: filtered };
          if (myTeamRef.current) qBody.team = myTeamRef.current;
          fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(qBody) }).catch(() => {});
        }
      }
      if (newRemaining !== null && newRemaining > 10) beepPlayedRef.current = false;
      if (includeAvail) setAvail((j?.available as Avail[]) || []);
    } finally {
      setLoading(false);
    }
  }

  const syncQueue = async (newQueue: QueueItem[]) => {
    setQueue(newQueue);
    queueRef.current = newQueue;
    const body: Record<string, unknown> = { action: 'queue_set', players: newQueue };
    if (isAdmin && myTeam) body.team = myTeam;
    await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
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

  // Load auto-pick pref from localStorage — scoped per team so each team has its own setting
  useEffect(() => {
    if (!myTeam) { setAutoPickEnabled(false); return; }
    try {
      const stored = localStorage.getItem(`evw_draft_autopick_${myTeam}`);
      setAutoPickEnabled(stored === 'true');
    } catch {}
  }, [myTeam]);

  // Fetch team roster from Sleeper when myTeam is known
  useEffect(() => {
    if (!myTeam) { setTeamRoster([]); return; }
    setRosterLoading(true);
    fetch(`/api/draft/team-roster?team=${encodeURIComponent(myTeam)}`)
      .then(r => r.json())
      .then(j => setTeamRoster((j?.players as RosterPlayer[]) || []))
      .catch(() => setTeamRoster([]))
      .finally(() => setRosterLoading(false));
  }, [myTeam]);

  // Bootstrap
  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then((j: MeResp) => setMe(j)).catch(() => {});
    load(true);
    const t = setInterval(() => load(false), 3000);
    return () => clearInterval(t);
  }, []);

  // Load queue when myTeam or admin status changes — scoped per team (admin passes team explicitly)
  useEffect(() => {
    if (!myTeam) { setQueue([]); queueRef.current = []; return; }
    const body: Record<string, unknown> = { action: 'queue_get' };
    if (isAdmin) body.team = myTeam;
    fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(r => r.json()).then(j => { const q = (j?.queue as QueueItem[]) || []; setQueue(q); queueRef.current = q; })
      .catch(() => {});
  }, [myTeam, isAdmin]);

  // Debounced player search — skip first render (initial avail comes from load(true))
  useEffect(() => {
    if (isFirstSearch.current) { isFirstSearch.current = false; return; }
    const t = setTimeout(async () => {
      const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'available', q: search, pos: posFilter, limit: 50 }) });
      const j = await res.json();
      setAvail((j?.available as Avail[]) || []);
    }, 300);
    return () => clearTimeout(t);
  }, [search, posFilter]);

  // Countdown — only tick when LIVE; freeze display when PAUSED (e.g. pending pick approval)
  useEffect(() => {
    if (remainingSec === null) return;
    if (draft?.status !== 'LIVE') {
      setLocalRemaining(remainingSec);
      return;
    }
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastFetchTime) / 1000);
      const newLocal = Math.max(0, remainingSec - elapsed);
      setLocalRemaining(newLocal);
      if (newLocal <= 10 && newLocal > 0 && !beepPlayedRef.current && isMyTurn) {
        beepPlayedRef.current = true; playBeep();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [remainingSec, lastFetchTime, isMyTurn, playBeep, draft?.status]);

  // Auto-pick when clock expires — silently tries queue players in order, no alert on failure
  useEffect(() => {
    const isMyPickPendingNow = pickStatus === 'pending' || (pendingPick?.team === myTeam);
    if (!isMyTurn || !autoPickEnabled || submitting || isMyPickPendingNow) {
      autoPickFiredRef.current = false;
      return;
    }
    if (localRemaining !== null && localRemaining <= 0 && !autoPickFiredRef.current && queueRef.current.length > 0) {
      autoPickFiredRef.current = true;
      // Try queue players in order until one succeeds (skip already-drafted players silently)
      (async () => {
        for (const qp of queueRef.current) {
          try {
            const res = await fetch('/api/draft', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: 'pick', playerId: qp.id, playerName: qp.name, playerPos: qp.pos, playerNfl: qp.nfl }),
            });
            const j = await res.json();
            if (res.ok && !j?.error) {
              setPickStatus('pending');
              setSubmittedPlayer(qp);
              break;
            }
            if (j?.error === 'player_already_picked') continue;
            break; // other errors — stop trying
          } catch { break; }
        }
      })();
    }
  }, [localRemaining, isMyTurn, autoPickEnabled, submitting, pickStatus, pendingPick, myTeam]);

  // Load player media for animations
  useEffect(() => {
    async function loadVideos() {
      try {
        const res = await fetch('/api/draft/player-videos', { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        const map: Record<string, { videoUrl: string | null; hasImage: boolean }> = {};
        for (const v of (j.videos || [])) { map[v.playerId] = { videoUrl: v.videoUrl || null, hasImage: !!v.imageUrl }; }
        animPlayerVideosRef.current = map;
      } catch {}
    }
    loadVideos();
    const t = setInterval(loadVideos, 60000);
    return () => clearInterval(t);
  }, []);

  // Animation trigger — mirrors DraftOverlayLive
  // recentPicks is ordered ASC (oldest first); .at(-1) gives the newest pick
  useEffect(() => {
    const lastPick = draft?.recentPicks?.length ? draft.recentPicks[draft.recentPicks.length - 1] : null;
    if (!lastPick) {
      if (!animInitRef.current) animInitRef.current = true;
      animLastPickRef.current = null;
      return;
    }
    if (!animInitRef.current) {
      animInitRef.current = true;
      animLastPickRef.current = lastPick.overall;
      return;
    }
    if (lastPick.overall <= (animLastPickRef.current ?? -1)) return;
    animLastPickRef.current = lastPick.overall;
    animDataRef.current = {
      pick: lastPick,
      nextTeamName: draft?.upcoming?.[0]?.team || null,
      overall: lastPick.overall,
      round: lastPick.round,
      pickInRound: ((lastPick.overall - 1) % picksPerRound) + 1,
      videoUrl: animPlayerVideosRef.current[lastPick.playerId]?.videoUrl || null,
      imageUrl: animPlayerVideosRef.current[lastPick.playerId]?.hasImage
        ? `/api/draft/player-image?playerId=${encodeURIComponent(lastPick.playerId)}`
        : null,
    };
    animStartTimeRef.current = Date.now();
    setAnimPhase('pick');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.recentPicks?.[draft?.recentPicks?.length - 1]?.overall]);

  // Tab visibility — skip stale animation phases and repoll when tab becomes visible
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) return;
      // Repoll immediately to get fresh data
      load(false);
      // Skip animation if it has been running longer than ~35s total
      setAnimPhase(prev => {
        if (!prev) return prev;
        const elapsed = Date.now() - animStartTimeRef.current;
        if (elapsed > 35000) return null;
        return prev;
      });
      // GSAP: disable lag-smoothing so resuming the tab doesn't rush animations
      gsap.ticker.lagSmoothing(0);
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Phase safety timeouts
  useEffect(() => {
    if (animPhase === 'pick') {
      const t = setTimeout(() => setAnimPhase('clock'), 20000);
      return () => clearTimeout(t);
    }
    if (animPhase === 'clock') {
      const t = setTimeout(() => { setAnimPhase(!!(animDataRef.current?.videoUrl) ? 'video' : null); }, 15000);
      return () => clearTimeout(t);
    }
  }, [animPhase]);

  // Clock fallback when no nextTeamName
  useEffect(() => {
    if (animPhase === 'clock' && !animDataRef.current?.nextTeamName) {
      setAnimPhase(!!(animDataRef.current?.videoUrl) ? 'video' : null);
    }
  }, [animPhase]);

  // YouTube postMessage handler
  useEffect(() => {
    if (animPhase !== 'video') return;
    const handler = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        const ytState =
          data?.event === 'onStateChange' ? data?.info :
          data?.event === 'infoDelivery' && typeof data?.info?.playerState === 'number' ? data.info.playerState :
          undefined;
        if (ytState === 0) dismissVideo();
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [animPhase]);

  // Poll for incoming trade offers every 15s
  useEffect(() => {
    if (!myTeam || !draft?.id) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/draft/trade?action=get_team&team=${encodeURIComponent(myTeam)}&draftId=${draft.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        const trades = (data.trades || []) as Array<{ status: string; teams: string[]; acceptedBy: string[] }>;
        const count = trades.filter(t => t.status === 'pending' && t.teams.includes(myTeam) && !t.acceptedBy.includes(myTeam)).length;
        setTradeInboxCount(count);
        if (count > prevTradeInboxCountRef.current && !tradeOpenRef.current) {
          setTradeNotif(true);
        }
        prevTradeInboxCountRef.current = count;
      } catch {}
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [myTeam, draft?.id]);

  // GSAP entrance + safety timeout for video
  useEffect(() => {
    if (animPhase !== 'video') return;
    animDismissingRef.current = false;
    if (animVideoContainerRef.current) {
      gsap.fromTo(animVideoContainerRef.current,
        { opacity: 0, scale: 0.96 },
        { opacity: 1, scale: 1, duration: 0.45, ease: 'power2.out' });
    }
    const safetyTimer = setTimeout(dismissVideo, 10 * 60 * 1000);
    return () => clearTimeout(safetyTimer);
  }, [animPhase]);

  // Derived display values
  const onClockColors = onClock ? getTeamColors(onClock) : null;
  const tc = onClockColors ? [onClockColors.primary, onClockColors.secondary] : ['#1a1a2e', '#16213e'];
  const onClockLogo = onClock ? getTeamLogoPath(onClock) : null;
  const allSlots = draft?.allSlots || [];
  const allPicks = draft?.allPicks || draft?.recentPicks || [];
  const pickedByOverall = new Map(allPicks.map(p => [p.overall, p]));
  const rounds = draft?.rounds || 4;
  const picksPerRound = Math.ceil(allSlots.length / Math.max(rounds, 1)) || 12;
  const myTeamColors = myTeam ? getTeamColors(myTeam) : null;
  const isMyPickPending = pickStatus === 'pending' || (pendingPick?.team === myTeam);
  const eventColor1 = draft?.eventColor1 || '#a4c810';
  const eventLogoUrl = draft?.eventLogoUrl || null;

  return (
    <div className="flex flex-col" style={{ background: 'var(--background)' }}>

      {/* ── Header (sticky) ── */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2" style={{ background: 'linear-gradient(90deg,#be161e,#bf9944)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
        <div className="flex items-center gap-3">
          {myTeam && myTeamColors && (
            <div className="w-8 h-8 rounded overflow-hidden bg-black/30">
              <img src={getTeamLogoPath(myTeam)} alt={myTeam} className="w-full h-full object-contain" />
            </div>
          )}
          <span className="font-black text-white text-lg tracking-tight">
            Draft Room{myTeam ? ` — ${myTeam}` : ''}
          </span>
          {isAdmin && <span className="text-xs bg-yellow-400 text-black font-bold px-2 py-0.5 rounded">ADMIN MODE</span>}
        </div>
        <div className="flex items-center gap-3">
          {draft && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${draft.status === 'LIVE' ? 'bg-emerald-500 text-white' : draft.status === 'PAUSED' ? 'bg-yellow-400 text-black' : 'bg-zinc-600 text-white'}`}>
              {draft.status}
            </span>
          )}
          {myTeam && draft && (
            <button
              onClick={() => setTradeOpen(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: eventColor1, color: '#000' }}
            >
              🤝 Trade
            </button>
          )}
          <span className="text-white/70 text-xs">{draft ? `${draft.year} Draft` : 'No active draft'}</span>
        </div>
      </div>

      {/* ── DRAFT BOARD (full height, no internal scroll — whole page scrolls) ── */}
      <div className="relative border-b-2 border-zinc-700" style={{ background: '#0a0a0e' }}>
        <div className="grid shrink-0 border-b border-zinc-800" style={{ gridTemplateColumns: `40px repeat(${rounds}, 1fr)`, background: '#111116' }}>
          <div className="text-center text-[10px] font-bold text-zinc-500 py-1.5" style={{ borderBottom: `2px solid ${eventColor1}` }}>#</div>
          {Array.from({ length: rounds }, (_, i) => (
            <div key={i} className="text-center text-[10px] font-bold text-zinc-400 py-1.5 border-l border-zinc-800" style={{ borderBottom: `2px solid ${eventColor1}` }}>Round {i + 1}</div>
          ))}
        </div>
        <div>
          {Array.from({ length: picksPerRound }, (_, pickIdx) => (
            <div key={pickIdx} className="grid border-b border-zinc-800/50 hover:bg-zinc-900/30" style={{ gridTemplateColumns: `40px repeat(${rounds}, 1fr)`, minHeight: '36px' }}>
              <div className={`flex items-center justify-center text-xs font-bold border-r border-zinc-800 ${draft && (draft.curOverall - 1) % picksPerRound === pickIdx && draft.status === 'LIVE' ? 'text-yellow-400 bg-yellow-400/10 animate-pulse' : 'text-zinc-600'}`}>
                {pickIdx + 1}
              </div>
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
                    className={`flex items-center gap-1 px-1.5 overflow-hidden ${isCurrent ? 'bg-yellow-400/15 ring-1 ring-inset ring-yellow-400' : picked ? 'bg-zinc-800/60' : isMySlot ? 'bg-blue-900/25' : ''}`}
                    style={{ borderLeft: picked && posColor ? `3px solid ${posColor}` : '1px solid rgba(63,63,70,0.4)' }}
                  >
                    {slotLogo && <div className="shrink-0 w-5 h-5"><img src={slotLogo} alt="" className="w-full h-full object-contain" /></div>}
                    {picked ? (
                      <div className="min-w-0 flex-1">
                        <div className="text-white text-[10px] font-semibold leading-tight truncate">{picked.playerName || picked.playerId}</div>
                        <div className="text-zinc-400 text-[9px] leading-tight">{picked.playerPos}</div>
                      </div>
                    ) : isCurrent ? (
                      <div className="text-yellow-400 text-[9px] font-bold uppercase tracking-wide animate-pulse">On Clock</div>
                    ) : isMySlot ? (
                      <div className="text-blue-400 text-[9px]">My pick</div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── Video overlay — absolute inside draftboard only (mirrors admin view) ── */}
        {(animPhase === 'video' || videoExiting) && animDataRef.current?.videoUrl && (() => {
          const videoUrl = animDataRef.current!.videoUrl!;
          const isYt = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
          const embedUrl = isYt ? getYoutubeEmbedUrl(videoUrl) : null;
          return (
            <div
              ref={animVideoContainerRef}
              className="absolute inset-0 z-20 bg-black flex flex-col items-center justify-center overflow-hidden transition-opacity duration-[350ms]"
              style={{ opacity: videoExiting ? 0 : 1 }}
            >
              <div className="w-full h-full flex flex-col items-center justify-center p-4">
                {embedUrl ? (
                  <iframe
                    src={embedUrl}
                    className="w-full flex-1 rounded-lg"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                    style={{ minHeight: 0 }}
                    onLoad={(e) => {
                      try { (e.currentTarget as HTMLIFrameElement).contentWindow?.postMessage(JSON.stringify({ event: 'listening' }), '*'); } catch {}
                    }}
                  />
                ) : (
                  <video src={videoUrl} autoPlay controls className="w-full flex-1 rounded-lg" style={{ minHeight: 0, objectFit: 'contain' }} onEnded={dismissVideo} />
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── TEAM SECTION (below board, normal flow — whole page scrolls) ── */}
      <div>
        {/* On the Clock banner */}
        {draft && draft.status !== 'NOT_STARTED' && (
          pendingPick ? (
            /* ── PICK IS IN: exact mirror of admin ClockBox + InfoBar ── */
            <div className="flex gap-4 items-stretch h-[140px]">
              {/* ClockBox — identical styles to DraftOverlayLive */}
              {(() => {
                const pendingOverall = pendingPick!.overall;
                const roundNum = Math.ceil(pendingOverall / picksPerRound);
                const pickNum = ((pendingOverall - 1) % picksPerRound) + 1;
                const abbrev = (onClock || '---').split(' ').map((w: string) => w[0]).join('').slice(0, 3).toUpperCase();
                const nextUp = (draft?.upcoming || []).filter((u: DraftSlot) => u.overall > pendingOverall).slice(0, 2);
                return (
                  <div className="flex items-stretch shrink-0" style={{ width: '340px', background: 'linear-gradient(to bottom,#202020,#282828)', borderRadius: '4px', border: '1px solid #333' }}>
                    {/* Left: Abbrev + event logo, centered together */}
                    <div className="flex flex-col justify-center items-center gap-3 p-2 w-28">
                      <div className="px-2 py-1 rounded text-center font-black text-xl text-white w-full" style={{ background: `linear-gradient(135deg,${tc[0]}cc 0%,${tc[0]}cc 50%,${tc[1]}cc 50%,${tc[1]}cc 100%)`, border: `2px solid ${eventColor1}`, boxShadow: `0 0 10px ${eventColor1}66` }}>
                        {abbrev}
                      </div>
                      {eventLogoUrl && (
                        <img src={eventLogoUrl} alt="" className="object-contain" style={{ width: '44px', height: '44px', opacity: 0.85 }} />
                      )}
                    </div>
                    {/* Center: Timer + RD/PK as tight centered pair */}
                    <div className="flex-1 flex flex-col items-center justify-center gap-1">
                      <div className="text-4xl font-bold font-mono" style={{ color: localRemaining !== null && localRemaining <= 10 ? '#ef4444' : eventColor1, textShadow: `0 0 10px ${eventColor1}66` }}>
                        {localRemaining !== null ? formatTime(localRemaining) : '--:--'}
                      </div>
                      <div className="text-sm text-center font-bold" style={{ color: eventColor1 }}>
                        RD {roundNum} &nbsp; PK {pickNum}
                      </div>
                    </div>
                    {/* Right: On-clock logo (top) + NEXT small logos (bottom) */}
                    <div className="flex flex-col items-center justify-center gap-2 p-2">
                      <div className="w-16 h-16 bg-zinc-700 rounded overflow-hidden border-2 shrink-0" style={{ borderColor: eventColor1, boxShadow: `0 0 8px ${eventColor1}66` }}>
                        {onClockLogo && <img src={onClockLogo} alt={onClock || ''} className="w-full h-full object-contain" />}
                      </div>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[9px] text-zinc-400 uppercase tracking-wide">Next</span>
                        <div className="flex gap-1">
                          {nextUp.map((t: DraftSlot, i: number) => (
                            <div key={i} className="w-7 h-7 bg-zinc-600 rounded overflow-hidden">
                              <img src={getTeamLogoPath(t.team)} alt={t.team} className="w-full h-full object-contain" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {/* InfoBar — identical styles to DraftOverlayLive */}
              <div className="flex-1 overflow-hidden relative" style={{ background: tc[0], borderRadius: '4px', height: '140px' }}>
                <div className="absolute inset-0 flex items-center justify-center z-20 rounded-sm" style={{ background: 'linear-gradient(135deg,rgba(0,0,0,0.92),rgba(30,10,0,0.96))' }}>
                  <div className="text-4xl font-black text-white tracking-widest uppercase animate-pulse">PICK IS IN</div>
                </div>
              </div>
            </div>
          ) : (
            /* ── Compact on-clock strip ── */
            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{ borderLeft: `4px solid ${tc[0]}`, borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.35)' }}
            >
              {onClockLogo && (
                <div className="w-7 h-7 shrink-0 rounded overflow-hidden bg-black/40">
                  <img src={onClockLogo} alt={onClock || ''} className="w-full h-full object-contain" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: tc[0] }}>On Clock · </span>
                <span className="font-black text-white text-xs">{onClock || '—'}</span>
                <span className="text-zinc-500 text-[10px] ml-1">Pick #{draft.curOverall} Rd {draft.upcoming?.[0]?.round || Math.ceil(draft.curOverall / picksPerRound)}</span>
              </div>
              <div className={`text-sm font-mono font-black tabular-nums shrink-0 ${localRemaining !== null && localRemaining <= 10 ? 'text-red-400 animate-pulse' : 'text-white/70'}`}>
                {localRemaining !== null ? formatTime(localRemaining) : '--:--'}
              </div>
              {isMyTurn && !isMyPickPending && (
                <span className="text-[10px] font-black text-emerald-400 animate-pulse ml-1">🎯 YOUR TURN!</span>
              )}
            </div>
          )
        )}

        {/* Prominent Trade Banner — below the on-clock strip */}
        {myTeam && draft && (
          <button
            onClick={() => { setTradeOpen(true); setTradeNotif(false); }}
            className="w-full flex items-center justify-between px-4 py-3 transition-all hover:brightness-110"
            style={{
              background: myTeamColors
                ? `linear-gradient(90deg, ${myTeamColors.primary}44 0%, #111118 100%)`
                : `linear-gradient(90deg, ${eventColor1}22 0%, #111118 100%)`,
              borderLeft: `4px solid ${myTeamColors?.primary || eventColor1}`,
              borderBottom: `1px solid ${myTeamColors?.secondary || eventColor1}44`,
            }}
          >
            <div className="flex items-center gap-3">
              {myTeam && <div className="w-8 h-8 shrink-0 rounded overflow-hidden bg-black/30"><img src={getTeamLogoPath(myTeam)} alt={myTeam} className="w-full h-full object-contain" /></div>}
              <div className="text-left">
                <div className="font-black text-white text-sm leading-tight">Trade Center</div>
                <div className="text-xs text-white/50">Propose, accept, or view trades</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {tradeInboxCount > 0 && (
                <span className="w-5 h-5 rounded-full text-[10px] font-black text-black flex items-center justify-center animate-pulse" style={{ background: myTeamColors?.primary || eventColor1 }}>{tradeInboxCount}</span>
              )}
              <span className="text-white/40 text-lg">›</span>
            </div>
          </button>
        )}

        <div className="p-3 space-y-3">

          {/* Status notices */}
          {isMyPickPending && (
            <div className="p-3 rounded-lg border-2 border-yellow-400 bg-yellow-400/10">
              <div className="font-bold text-sm text-yellow-600 dark:text-yellow-300">⏳ Pick Submitted — Awaiting Admin Approval</div>
              {submittedPlayer && <div className="text-xs mt-1 text-yellow-700 dark:text-yellow-200/80">{submittedPlayer.name} · {submittedPlayer.pos} · {submittedPlayer.nfl}</div>}
              <div className="text-xs mt-1 text-yellow-600/70 dark:text-yellow-400/60">Your pick will appear on the board once approved.</div>
            </div>
          )}
          {pickStatus === 'rejected' && (
            <div className="p-3 rounded-lg border-2 border-red-500 bg-red-500/10">
              <div className="font-bold text-sm text-red-600 dark:text-red-400">❌ Pick Rejected — Please try again.</div>
              <button type="button" className="mt-1 text-xs underline text-red-500 hover:text-red-400" onClick={() => { setPickStatus(null); setSubmittedPlayer(null); }}>Dismiss</button>
            </div>
          )}
          {!me.authenticated && !isAdmin && !loading && (
            <div className="p-3 rounded-lg border border-[var(--border)] text-[var(--muted)] text-sm">
              Log in with your team credentials to make picks.
            </div>
          )}

          {/* Admin team selector */}
          {isAdmin && !me.authenticated && (
            <div className="p-3 rounded-lg bg-yellow-400/10 border border-yellow-400/30 space-y-2">
              <div className="font-bold text-yellow-700 dark:text-yellow-300 text-xs uppercase tracking-wide">Admin mode — view as team</div>
              <select
                value={adminTeamOverride}
                onChange={e => setAdminTeamOverride(e.target.value)}
                className="w-full px-2 py-1.5 rounded border border-yellow-400/40 text-sm"
                style={{ background: 'var(--background)', color: 'var(--foreground)' }}
              >
                <option value="">{onClock ? `Auto (on clock: ${onClock})` : 'Auto (on clock)'}</option>
                {TEAM_NAMES.map(t => <option key={t} value={t}>{t}{t === onClock ? ' ⏰' : ''}</option>)}
              </select>
              {myTeam && (
                <div className="text-xs text-yellow-700 dark:text-yellow-300/70">
                  {myTeam === onClock ? '✅ On the clock — pick panel is open' : `Viewing as ${myTeam} — picks unlock when it's their turn`}
                </div>
              )}
            </div>
          )}

          {/* ── Player Search & Browse (always visible when logged in) ── */}
          {(me.authenticated || isAdmin) && (
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              {/* Search header */}
              <div className="px-3 pt-3 pb-2 border-b border-[var(--border)]" style={{ background: 'var(--background)' }}>
                <div className="text-xs font-bold text-[var(--muted)] uppercase tracking-wide mb-2">
                  {isMyTurn && !isMyPickPending ? '🎯 Make Your Pick' : 'Browse Players'}
                </div>
                {/* Position filter pills */}
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {(['', ...POSITIONS] as string[]).map(pos => {
                    const active = posFilter === pos;
                    return (
                      <button
                        key={pos || 'all'}
                        type="button"
                        onClick={() => setPosFilter(pos)}
                        className="px-2.5 py-0.5 rounded-full text-xs font-bold border transition-colors"
                        style={active ? { background: pos ? POS_COLORS[pos] : '#555', color: '#fff', borderColor: 'transparent' } : { background: 'transparent', color: 'var(--muted)', borderColor: 'var(--border)' }}
                      >
                        {pos || 'All'}
                      </button>
                    );
                  })}
                </div>
                {/* Search input */}
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search player name…"
                  className="w-full"
                />
              </div>
              {/* Player list */}
              <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border)]">
                {avail.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-[var(--muted)]">{loading ? 'Loading…' : 'No results — try a search or change position filter.'}</div>
                ) : avail.map(p => {
                  const inQueue = queue.some(q => q.id === p.id);
                  const canPick = isMyTurn && !isMyPickPending;
                  return (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800/50">
                      <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded text-white" style={{ background: POS_COLORS[p.pos] || '#555', minWidth: '30px', textAlign: 'center' }}>
                        {p.pos}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[var(--foreground)] truncate">{p.name}</div>
                        <div className="text-xs text-[var(--muted)]">{p.nfl}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {canPick && (
                          <Button size="sm" variant="primary" disabled={submitting} onClick={() => setConfirmPlayer(p)}>Pick</Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => inQueue ? removeFromQueue(p.id) : addToQueue(p)}
                          title={inQueue ? 'Remove from queue' : 'Add to queue'}
                        >
                          {inQueue ? '−Q' : '+Q'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Queue ── */}
          {(me.authenticated || isAdmin) && (
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]" style={{ background: 'var(--background)' }}>
                <div className="text-xs font-bold text-[var(--muted)] uppercase tracking-wide">
                  My Queue {queue.length > 0 && <span className="text-[var(--foreground)]">({queue.length})</span>}
                </div>
                {/* Auto-pick toggle */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <span className="text-xs text-[var(--muted)]">Instant auto-pick</span>
                  <div
                    className={`relative w-9 h-5 rounded-full transition-colors ${autoPickEnabled ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                    onClick={() => {
                      const next = !autoPickEnabled;
                      setAutoPickEnabled(next);
                      try { localStorage.setItem(`evw_draft_autopick_${myTeam || 'default'}`, String(next)); } catch {}
                    }}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoPickEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                </label>
              </div>
              <div className="px-3 py-1.5 text-xs text-[var(--muted)] border-b border-[var(--border)]">
                {autoPickEnabled
                  ? <span className="font-medium text-emerald-700 dark:text-emerald-400">✓ Instant — top queued player submitted to admin the moment time expires</span>
                  : <span>Your top queued player is always sent to admin when time expires (within ~3s)</span>
                }
              </div>
              {queue.length === 0 ? (
                <div className="px-3 py-3 text-xs text-[var(--muted)]">Queue is empty — add players using the +Q button above.</div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {queue.map((q, idx) => (
                    <li key={q.id} className={`flex items-center gap-2 px-3 py-2 ${idx === 0 && autoPickEnabled ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}>
                      <span className="text-xs font-bold text-[var(--muted)] w-4 shrink-0 tabular-nums">{idx + 1}</span>
                      <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded text-white" style={{ background: POS_COLORS[q.pos] || '#555', minWidth: '30px', textAlign: 'center' }}>
                        {q.pos}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-[var(--foreground)] truncate">{q.name}</span>
                      {idx === 0 && autoPickEnabled && <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 shrink-0 uppercase">AUTO</span>}
                      <div className="flex shrink-0">
                        <button type="button" disabled={idx === 0} onClick={() => moveInQueue(q.id, 'up')} className="w-6 h-6 flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-20 text-xs rounded hover:bg-zinc-200 dark:hover:bg-zinc-700">↑</button>
                        <button type="button" disabled={idx === queue.length - 1} onClick={() => moveInQueue(q.id, 'down')} className="w-6 h-6 flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-20 text-xs rounded hover:bg-zinc-200 dark:hover:bg-zinc-700">↓</button>
                        <button type="button" onClick={() => removeFromQueue(q.id)} className="w-6 h-6 flex items-center justify-center text-[var(--muted)] hover:text-red-500 text-xs rounded hover:bg-zinc-200 dark:hover:bg-zinc-700">×</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── My Draft Picks (this draft) ── */}
          {myTeam && draft && (() => {
            const myPicks = allPicks.filter(p => p.team === myTeam);
            return (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <div className="px-3 py-2 text-xs font-bold text-[var(--muted)] uppercase tracking-wide border-b border-[var(--border)]" style={{ background: 'var(--background)' }}>
                  My Draft Picks — {myTeam}
                </div>
                {myPicks.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-[var(--muted)]">No picks yet this draft.</div>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {myPicks.map(p => (
                      <li key={p.overall} className="flex items-center gap-2 px-3 py-2">
                        <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded text-white" style={{ background: POS_COLORS[p.playerPos || ''] || '#555', minWidth: '30px', textAlign: 'center' }}>
                          {p.playerPos || '?'}
                        </span>
                        <span className="flex-1 text-sm font-semibold text-[var(--foreground)] truncate">{p.playerName || p.playerId}</span>
                        <span className="text-xs text-[var(--muted)] shrink-0">R{p.round}.{((p.overall - 1) % picksPerRound) + 1}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })()}

          {/* ── Team Roster (current Sleeper roster) ── */}
          {myTeam && (
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              <div className="px-3 py-2 text-xs font-bold text-[var(--muted)] uppercase tracking-wide border-b border-[var(--border)]" style={{ background: 'var(--background)' }}>
                Current Roster — {myTeam}
              </div>
              {rosterLoading ? (
                <div className="px-3 py-3 text-xs text-[var(--muted)]">Loading roster…</div>
              ) : teamRoster.length === 0 ? (
                <div className="px-3 py-3 text-xs text-[var(--muted)]">No roster data found.</div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {teamRoster.map(p => (
                    <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded text-white" style={{ background: POS_COLORS[p.pos] || '#555', minWidth: '30px', textAlign: 'center' }}>
                        {p.pos || '?'}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-[var(--foreground)] truncate">{p.name}</span>
                      <span className="text-xs text-[var(--muted)] shrink-0">{p.nfl}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── My Upcoming Picks ── */}
          {myTeam && draft && (() => {
            const myUp = allSlots.filter(s => s.team === myTeam && s.overall >= draft.curOverall);
            return (
              <div className="rounded-lg border border-[var(--border)] overflow-hidden">
                <div className="px-3 py-2 text-xs font-bold text-[var(--muted)] uppercase tracking-wide border-b border-[var(--border)]" style={{ background: 'var(--background)' }}>
                  My Upcoming Picks
                </div>
                {myUp.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-[var(--muted)]">No more picks.</div>
                ) : (
                  <div className="flex flex-wrap gap-2 p-3">
                    {myUp.map(u => (
                      <span key={u.overall} className="text-xs px-2.5 py-1 rounded-lg font-semibold border" style={{ color: 'var(--foreground)', borderColor: 'var(--border)', background: 'var(--background)' }}>
                        Pick #{u.overall} · R{u.round}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="h-4" />
        </div>
      </div>

      {/* ── Pick Confirmation Modal ── */}
      {confirmPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setConfirmPlayer(null)}>
          <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl" style={{ background: '#18181b' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4" style={{ background: 'linear-gradient(90deg,#be161e,#bf9944)' }}>
              <div className="text-base font-black text-white uppercase tracking-wide">Confirm Selection</div>
            </div>
            <div className="px-5 py-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm font-black px-2.5 py-1 rounded text-white" style={{ background: POS_COLORS[confirmPlayer.pos] || '#555' }}>
                  {confirmPlayer.pos}
                </span>
                <div>
                  <div className="text-lg font-black text-white">{confirmPlayer.name}</div>
                  <div className="text-sm text-zinc-400">{confirmPlayer.nfl}</div>
                </div>
              </div>
              <p className="text-sm text-zinc-300 mb-5">Are you sure you want to select this player? This will be sent to the admin for approval.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="flex-1 py-2.5 rounded-lg text-sm font-bold border border-zinc-600 text-zinc-300 hover:bg-zinc-700 transition-colors"
                  onClick={() => setConfirmPlayer(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg text-sm font-black text-white transition-colors disabled:opacity-50"
                  style={{ background: 'linear-gradient(90deg,#be161e,#bf9944)' }}
                  onClick={() => { submitPick(confirmPlayer); setConfirmPlayer(null); }}
                >
                  {submitting ? 'Submitting…' : 'Yes, Draft Him'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Animation overlays (pick + clock) — full-screen, mirrors admin/presentation view ── */}
      {animPhase === 'pick' && animDataRef.current && (animDataRef.current.pick.playerName || animDataRef.current.pick.playerId) && (
        <DraftPickAnimation
          key={`room-pick-${animDataRef.current.overall}`}
          player={{
            name: animDataRef.current.pick.playerName || animDataRef.current.pick.playerId || 'Unknown',
            position: animDataRef.current.pick.playerPos || 'N/A',
            team: animDataRef.current.pick.playerNfl || undefined,
            college: undefined,
            imageUrl: animDataRef.current.imageUrl || undefined,
          }}
          fantasyTeam={{
            name: animDataRef.current.pick.team,
            colors: [getTeamColors(animDataRef.current.pick.team).primary, getTeamColors(animDataRef.current.pick.team).secondary, null],
            logoPath: getTeamLogoPath(animDataRef.current.pick.team),
          }}
          pickNumber={animDataRef.current.overall}
          round={animDataRef.current.round}
          pickInRound={animDataRef.current.pickInRound}
          eventLogoUrl={draft?.eventLogoUrl}
          onComplete={() => setAnimPhase('clock')}
        />
      )}
      {animPhase === 'clock' && animDataRef.current?.nextTeamName && (() => {
        const teamName = animDataRef.current!.nextTeamName!;
        const colors = getTeamColors(teamName);
        const curOverall = animDataRef.current!.overall + 1;
        return (
          <NowOnClockAnimation
            key={`room-clock-${animDataRef.current!.overall}`}
            team={{ name: teamName, colors: [colors.primary, colors.secondary, null] }}
            pickNumber={curOverall}
            round={Math.floor((curOverall - 1) / picksPerRound) + 1}
            pickInRound={((curOverall - 1) % picksPerRound) + 1}
            eventLogoUrl={draft?.eventLogoUrl}
            eventColor1={draft?.eventColor1}
            onComplete={() => setAnimPhase(!!(animDataRef.current?.videoUrl) ? 'video' : null)}
          />
        );
      })()}

      {/* Trade offer notification popup */}
      {tradeNotif && !tradeOpen && (
        <div
          className="fixed bottom-6 right-6 z-[9999] w-72 rounded-xl border-2 bg-zinc-900 shadow-2xl p-4 cursor-pointer"
          style={{ borderColor: eventColor1, boxShadow: `0 0 24px ${eventColor1}55` }}
          onClick={() => { setTradeNotif(false); setTradeOpen(true); }}
        >
          <div className="font-black text-sm uppercase tracking-widest mb-1" style={{ color: eventColor1 }}>🤝 Trade Offer!</div>
          <div className="text-white text-sm mb-1">You have {tradeInboxCount} pending trade offer{tradeInboxCount !== 1 ? 's' : ''}.</div>
          <div className="text-xs text-zinc-400">Tap to open Trade Center →</div>
          <button
            onClick={e => { e.stopPropagation(); setTradeNotif(false); }}
            className="absolute top-2 right-2 text-zinc-500 hover:text-white text-lg w-6 h-6 flex items-center justify-center"
          >×</button>
        </div>
      )}

      {/* Trade Center modal */}
      {tradeOpen && myTeam && draft && (
        <DraftTradeCenter
          myTeam={myTeam}
          allTeams={TEAM_NAMES}
          draftId={draft.id}
          eventColor1={eventColor1}
          onClose={() => setTradeOpen(false)}
        />
      )}
    </div>
  );
}
