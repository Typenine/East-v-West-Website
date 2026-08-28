'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  Search,
  Tag,
  X,
} from 'lucide-react';

const BOARD_API_URL = '/api/team-prospect-draftboard';
const BOARD_VERSION = '2027-preseason-v1';
const BOARD_LABEL = '2027 Early Prospect Board';

const C = {
  bg: '#0B1020',
  panel: '#111727',
  border: '#1E2637',
  accent: '#bf9944',
  text: '#E9EDF5',
  textMuted: '#9AA5B1',
  textDim: '#7f8995',
  unlikely: '#d4a839',
  unlikelyBg: 'rgba(212, 168, 57, 0.10)',
  noFit: '#e89a98',
  noFitBg: 'rgba(232, 154, 152, 0.10)',
  target: '#7dd4a8',
  targetBg: 'rgba(125, 212, 168, 0.13)',
};

const POS_COLORS: Record<string, string> = {
  QB: '#c25852', RB: '#c4a020', WR: '#3d7eaa', TE: '#4a8e62',
};

type ProspectTrend = 'up' | 'steady' | 'down';

type BoardPlayer = {
  id: string;
  tier: number;
  name: string;
  pos: 'QB' | 'RB' | 'WR' | 'TE';
  college: string;
  draftRange: string;
  trend: ProspectTrend;
  s: string[];
  unlikely?: boolean;
  noFit?: boolean;
  target?: boolean;
  userNote?: string;
};

type SavedBoard = {
  boardVersion?: string;
  orderIds?: string[];
  unlikely?: Record<string, boolean>;
  noFit?: Record<string, boolean>;
  target?: Record<string, boolean>;
  notes?: Record<string, string>;
};

const INITIAL: BoardPlayer[] = [
  { id: 'jeremiah-smith', tier: 1, name: 'Jeremiah Smith', pos: 'WR', college: 'Ohio State', draftRange: 'Top 5', trend: 'steady', s: ['PROFILE — The class-defining prospect and the safest early 2027 fantasy asset.', '2026 WATCH — Sustain elite production while handling defenses built specifically to stop him.', 'EARLY VIEW — Current favorite for the 1.01 even in Superflex.'] },
  { id: 'arch-manning', tier: 1, name: 'Arch Manning', pos: 'QB', college: 'Texas', draftRange: 'Top 5', trend: 'steady', s: ['PROFILE — Premium arm talent, mobility and pedigree with franchise-QB upside.', '2026 WATCH — Turn flashes into a complete high-volume season and answer consistency questions.', 'EARLY VIEW — Legitimate Superflex 1.01 challenger if he cements QB1 draft status.'] },
  { id: 'dante-moore', tier: 1, name: 'Dante Moore', pos: 'QB', college: 'Oregon', draftRange: 'Top 10', trend: 'steady', s: ['PROFILE — Accurate, composed passer whose 2025 breakout pushed him into the top QB tier.', '2026 WATCH — Prove the processing and efficiency hold with more responsibility.', 'EARLY VIEW — Has a real path to QB1 in the 2027 NFL Draft.'] },
  { id: 'cam-coleman', tier: 1, name: 'Cam Coleman', pos: 'WR', college: 'Texas', draftRange: 'Round 1', trend: 'steady', s: ['PROFILE — Big, explosive outside receiver with true NFL WR1 traits.', '2026 WATCH — Refine route detail and consistency after transferring from Auburn to Texas.', 'EARLY VIEW — Clear WR2 in the class entering the season.'] },

  { id: 'julian-sayin', tier: 2, name: 'Julian Sayin', pos: 'QB', college: 'Ohio State', draftRange: 'Round 1', trend: 'steady', s: ['PROFILE — Accurate pocket passer with high-end ball placement and decision-making.', '2026 WATCH — Show he can create when structure breaks and win without leaning entirely on elite surrounding talent.', 'EARLY VIEW — Strong first-round NFL and Superflex trajectory.'] },
  { id: 'bryant-wesco', tier: 2, name: 'Bryant Wesco Jr.', pos: 'WR', college: 'Clemson', draftRange: 'Round 1', trend: 'steady', s: ['PROFILE — Length, explosion and early-career efficiency give him a high-end ceiling.', '2025 — 31 catches, 537 yards and 6 TD before a back injury shortened the season.', '2026 WATCH — Health first, then re-establish himself as Clemson’s top vertical weapon.'] },
  { id: 'kewan-lacy', tier: 2, name: 'Kewan Lacy', pos: 'RB', college: 'Ole Miss', draftRange: 'Rounds 1-2', trend: 'steady', s: ['PROFILE — Explosive three-down back with contact balance and receiving upside.', '2025 — More than 1,500 rushing yards and an Ole Miss single-season record 24 rushing TDs.', '2026 WATCH — Confirm the workload, receiving role and efficiency under a changed staff.'] },
  { id: 'jadan-baugh', tier: 2, name: 'Jadan Baugh', pos: 'RB', college: 'Florida', draftRange: 'Rounds 1-2', trend: 'up', s: ['PROFILE — Powerful, athletic runner with sharp footwork and feature-back traits.', '2026 WATCH — Own the Florida backfield and expand his passing-game résumé.', 'EARLY VIEW — One of the strongest candidates to become the 2027 RB1.'] },
  { id: 'charlie-becker', tier: 2, name: 'Charlie Becker', pos: 'WR', college: 'Indiana', draftRange: 'Rounds 1-2', trend: 'up', s: ['PROFILE — Size, ball skills and contested-catch ability drove a major 2025 breakout.', '2026 WATCH — Handle a true WR1 role after Indiana’s championship roster turnover.', 'EARLY VIEW — One of the biggest 2025-to-2026 risers in the class.'] },
  { id: 'nick-marsh', tier: 2, name: 'Nick Marsh', pos: 'WR', college: 'Indiana', draftRange: 'Rounds 1-2', trend: 'steady', s: ['PROFILE — Big-bodied receiver with early production and NFL boundary traits.', '2026 WATCH — Establish chemistry and target dominance after moving from Michigan State to Indiana.', 'EARLY VIEW — Strong Day 1/Day 2 upside if the transfer unlocks another jump.'] },

  { id: 'ahmad-hardy', tier: 3, name: 'Ahmad Hardy', pos: 'RB', college: 'Missouri', draftRange: 'Day 2', trend: 'steady', s: ['PROFILE — Physical between-the-tackles runner with real workload appeal.', '2026 WATCH — Receiving usage is the swing skill for his dynasty ceiling.', 'EARLY VIEW — High-end RB prospect whose fantasy value could outpace his NFL slot.'] },
  { id: 'lanorris-sellers', tier: 3, name: 'LaNorris Sellers', pos: 'QB', college: 'South Carolina', draftRange: 'Round 1', trend: 'up', s: ['PROFILE — Rare size and athletic tools create major fantasy upside.', '2026 WATCH — Passing consistency, anticipation and sack avoidance.', 'EARLY VIEW — The rushing ceiling keeps him firmly in the Superflex first-round conversation.'] },
  { id: 'darian-mensah', tier: 3, name: 'Darian Mensah', pos: 'QB', college: 'Miami', draftRange: 'Rounds 1-2', trend: 'steady', s: ['PROFILE — Efficient passer with enough arm talent to climb quickly in a strong QB class.', '2026 WATCH — Translate his game to Miami and prove he can command a playoff-level offense.', 'EARLY VIEW — One of the class’s most important QB stock-watch players.'] },
  { id: 'cj-carr', tier: 3, name: 'CJ Carr', pos: 'QB', college: 'Notre Dame', draftRange: 'Round 1', trend: 'up', s: ['PROFILE — Polished passer with accuracy, timing and increasingly strong national buzz.', '2026 WATCH — Build on the breakout and show first-round-caliber creation against top defenses.', 'EARLY VIEW — Has already pushed into the first-round NFL discussion.'] },
  { id: 'treydez-green', tier: 3, name: "Trey'Dez Green", pos: 'TE', college: 'LSU', draftRange: 'Rounds 1-2', trend: 'steady', s: ['PROFILE — Massive receiving mismatch with unusual movement skills for his size.', '2026 WATCH — Become a featured target rather than merely an athletic projection.', 'EARLY VIEW — Early TE1 with legitimate first-round NFL upside.'] },
  { id: 'ryan-coleman-williams', tier: 3, name: 'Ryan Coleman-Williams', pos: 'WR', college: 'Alabama', draftRange: 'Rounds 1-2', trend: 'down', s: ['PROFILE — Former freshman phenom with separation and slot-playmaking traits.', '2024 — Led Alabama with 865 receiving yards and 8 TDs.', '2026 WATCH — Rebound from a drop-plagued 2025 season and restore early-round momentum.'] },
  { id: 'tj-moore', tier: 3, name: 'TJ Moore', pos: 'WR', college: 'Clemson', draftRange: 'Day 2', trend: 'steady', s: ['PROFILE — Talented Clemson receiver with size and vertical-play ability.', '2026 WATCH — Separate from a crowded receiver room and prove he belongs alongside Wesco in the top tier.', 'EARLY VIEW — Day 2 profile with room to climb.'] },
  { id: 'isaac-brown', tier: 3, name: 'Isaac Brown', pos: 'RB', college: 'Louisville', draftRange: 'Day 2', trend: 'up', s: ['PROFILE — Explosive runner with open-field juice and receiving appeal.', '2026 WATCH — Show feature-back volume and durability.', 'EARLY VIEW — One of the class’s better bets to become a fantasy-friendly Day 2 back.'] },
  { id: 'mark-fletcher', tier: 3, name: 'Mark Fletcher Jr.', pos: 'RB', college: 'Miami', draftRange: 'Day 2', trend: 'steady', s: ['PROFILE — NFL-sized runner with a proven power element and improving all-around game.', '2026 WATCH — Efficiency and receiving work in Miami’s new-look offense.', 'EARLY VIEW — Solid Day 2 trajectory entering the season.'] },
  { id: 'kj-duff', tier: 3, name: 'KJ Duff', pos: 'WR', college: 'Rutgers', draftRange: 'Day 2', trend: 'steady', s: ['PROFILE — Length and ball skills make him an intriguing developmental outside receiver.', '2026 WATCH — Turn traits into sustained high-end production at Rutgers.', 'EARLY VIEW — A classic fall riser candidate.'] },

  { id: 'drew-mestemaker', tier: 4, name: 'Drew Mestemaker', pos: 'QB', college: 'Oklahoma State', draftRange: 'Rounds 1-3', trend: 'up', s: ['PROFILE — Rapidly rising quarterback whose arm talent has drawn real NFL attention.', '2026 WATCH — Prove the breakout is sustainable against a full high-level schedule.', 'EARLY VIEW — A strong season could push him into the first-round QB cluster.'] },
  { id: 'brendan-sorsby', tier: 4, name: 'Brendan Sorsby', pos: 'QB', college: 'Texas Tech', draftRange: 'Rounds 2-3', trend: 'steady', s: ['PROFILE — Experienced, mobile passer with enough tools to force his way into the QB conversation.', '2026 WATCH — Efficiency and downfield passing in a favorable Texas Tech environment.', 'EARLY VIEW — Superflex watchlist QB with meaningful riser potential.'] },
  { id: 'mario-craver', tier: 4, name: 'Mario Craver', pos: 'WR', college: 'Texas A&M', draftRange: 'Day 2', trend: 'steady', s: ['PROFILE — Dynamic receiver with speed and playmaking ability after the catch.', '2026 WATCH — Become a complete every-down target rather than a splash-play specialist.', 'EARLY VIEW — Already showing up firmly on Day 2 NFL boards.'] },
  { id: 'jamari-johnson', tier: 4, name: 'Jamari Johnson', pos: 'TE', college: 'Oregon', draftRange: 'Rounds 1-3', trend: 'steady', s: ['PROFILE — Athletic receiving tight end with one of the best physical ceilings at the position.', '2026 WATCH — Production and route volume after Oregon’s offensive turnover.', 'EARLY VIEW — TE2 with a plausible first-round NFL outcome.'] },
  { id: 'isaiah-sategna', tier: 4, name: 'Isaiah Sategna III', pos: 'WR', college: 'Oklahoma', draftRange: 'Day 2', trend: 'steady', s: ['PROFILE — Speed-first receiver with return value and explosive-play traits.', '2026 WATCH — Command enough targets to prove he is more than a complementary weapon.', 'EARLY VIEW — Draft capital will be decisive for his dynasty profile.'] },
  { id: 'hollywood-smothers', tier: 4, name: 'Hollywood Smothers', pos: 'RB', college: 'Texas', draftRange: 'Day 2-3', trend: 'steady', s: ['PROFILE — Explosive back with home-run ability in a loaded Texas offense.', '2026 WATCH — Earn enough touches and passing-down work to separate from the RB pack.', 'EARLY VIEW — High-upside fantasy profile if the workload arrives.'] },
  { id: 'ryan-wingo', tier: 4, name: 'Ryan Wingo', pos: 'WR', college: 'Texas', draftRange: 'Day 2', trend: 'steady', s: ['PROFILE — Former elite recruit with size-speed traits and vertical ability.', '2026 WATCH — Carve out a major role alongside Cam Coleman.', 'EARLY VIEW — Talent is ahead of production; this season determines whether he jumps tiers.'] },
  { id: 'eugene-wilson', tier: 4, name: 'Eugene Wilson III', pos: 'WR', college: 'LSU', draftRange: 'Day 2-3', trend: 'steady', s: ['PROFILE — Quick, versatile receiver with proven playmaking flashes.', '2026 WATCH — Stay healthy and turn the LSU transfer into a volume breakout.', 'EARLY VIEW — Strong rebound candidate after an uneven path at Florida.'] },
  { id: 'justice-haynes', tier: 4, name: 'Justice Haynes', pos: 'RB', college: 'Georgia Tech', draftRange: 'Day 2-3', trend: 'steady', s: ['PROFILE — Former blue-chip back with an NFL frame and all-around traits.', '2026 WATCH — Finally pair the recruiting pedigree with a complete high-volume season.', 'EARLY VIEW — One of the widest ranges of outcomes among the class’s notable backs.'] },
  { id: 'duce-robinson', tier: 4, name: 'Duce Robinson', pos: 'WR', college: 'Florida State', draftRange: 'Day 2-3', trend: 'steady', s: ['PROFILE — Huge target with rare physical tools and contested-catch upside.', '2026 WATCH — Route development, separation and consistent target earning.', 'EARLY VIEW — Traits keep him relevant even while the production résumé develops.'] },

  { id: 'omarion-miller', tier: 5, name: 'Omarion Miller', pos: 'WR', college: 'Arizona State', draftRange: 'Day 2-3', trend: 'steady', s: ['PROFILE — Explosive outside receiver who can win vertically.', '2026 WATCH — Establish consistent volume and improve the all-around route tree.', 'EARLY VIEW — Strong deep-watch name with NFL draft-board momentum.'] },
  { id: 'jayce-brown', tier: 5, name: 'Jayce Brown', pos: 'WR', college: 'LSU', draftRange: 'Day 2-3', trend: 'steady', s: ['PROFILE — Athletic receiver entering a crowded but high-upside LSU environment.', '2026 WATCH — Win a clear role and turn flashes into weekly production.', 'EARLY VIEW — Worth tracking closely because a breakout could happen quickly.'] },
  { id: 'terrance-carter', tier: 5, name: 'Terrance Carter', pos: 'TE', college: 'Texas Tech', draftRange: 'Day 2-3', trend: 'steady', s: ['PROFILE — Receiving-oriented tight end with enough athleticism to matter in fantasy.', '2026 WATCH — Target share and red-zone role in the Texas Tech offense.', 'EARLY VIEW — One of the better TE breakout bets behind Green and Johnson.'] },
  { id: 'lj-martin', tier: 5, name: 'LJ Martin', pos: 'RB', college: 'BYU', draftRange: 'Day 3', trend: 'steady', s: ['PROFILE — Productive, physical runner with a chance to play into Day 2 consideration.', '2026 WATCH — Receiving role and explosive-play rate.', 'EARLY VIEW — Useful depth target in what could become a strong RB class.'] },
  { id: 'cooper-barkate', tier: 5, name: 'Cooper Barkate', pos: 'WR', college: 'Miami', draftRange: 'Day 3', trend: 'steady', s: ['PROFILE — Productive receiver with a chance to benefit from Miami’s passing environment.', '2026 WATCH — Translate production against top competition and improve draft-board standing.', 'EARLY VIEW — Deep watchlist name with room to jump several rounds.'] },
  { id: 'benjamin-brahmer', tier: 5, name: 'Benjamin Brahmer', pos: 'TE', college: 'Penn State', draftRange: 'Day 3', trend: 'steady', s: ['PROFILE — Experienced receiving tight end with size and developmental NFL appeal.', '2026 WATCH — Re-establish production and show enough athletic upside to rise in a deep class.', 'EARLY VIEW — Late-board TE worth monitoring rather than forcing into an early tier.'] },
];

const TIER_LABELS: Record<number, string> = {
  1: 'Blue-chip',
  2: 'Early 1st-round core',
  3: '1st-round depth',
  4: 'Day 2 watch',
  5: 'Developmental watchlist',
};

function cloneInitial() {
  return INITIAL.map((player) => ({ ...player, s: [...player.s] }));
}

function applySavedBoard(saved: SavedBoard | null): BoardPlayer[] {
  let players = cloneInitial();
  if (!saved || saved.boardVersion !== BOARD_VERSION) return players;
  if (Array.isArray(saved.orderIds)) {
    const byId = new Map(players.map((player) => [player.id, player]));
    const ordered = saved.orderIds.map((id) => byId.get(String(id))).filter(Boolean) as BoardPlayer[];
    const seen = new Set(ordered.map((player) => player.id));
    players = [...ordered, ...players.filter((player) => !seen.has(player.id))];
  }
  return players.map((player) => ({ ...player, target: !!saved.target?.[player.id], unlikely: !!saved.unlikely?.[player.id], noFit: !!saved.noFit?.[player.id], userNote: saved.notes?.[player.id] || '' }));
}

function serialize(players: BoardPlayer[]) {
  const target: Record<string, boolean> = {};
  const unlikely: Record<string, boolean> = {};
  const noFit: Record<string, boolean> = {};
  const notes: Record<string, string> = {};
  players.forEach((player) => {
    if (player.target) target[player.id] = true;
    if (player.unlikely) unlikely[player.id] = true;
    if (player.noFit) noFit[player.id] = true;
    if (player.userNote?.trim()) notes[player.id] = player.userNote.trim();
  });
  return { boardVersion: BOARD_VERSION, orderIds: players.map((player) => player.id), target, unlikely, noFit, notes };
}

function Trend({ trend }: { trend: ProspectTrend }) {
  if (trend === 'up') return <span className="font-bold text-emerald-400">↑ Rising</span>;
  if (trend === 'down') return <span className="font-bold text-red-300">↓ Falling</span>;
  return <span className="text-[var(--muted)]">→ Baseline</span>;
}

function flagStyle(player: BoardPlayer) {
  if (player.target) return { bg: C.targetBg, border: `${C.target}55` };
  if (player.unlikely) return { bg: C.unlikelyBg, border: `${C.unlikely}55` };
  if (player.noFit) return { bg: C.noFitBg, border: `${C.noFit}55` };
  return { bg: C.panel, border: C.border };
}

export default function TeamProspectDraftboard() {
  const [players, setPlayers] = useState<BoardPlayer[]>(cloneInitial);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState('ALL');
  const [hideNoFit, setHideNoFit] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(BOARD_API_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (!cancelled) setPlayers(applySavedBoard((body?.data || null) as SavedBoard | null));
      } catch {
        if (!cancelled) setPlayers(cloneInitial());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(BOARD_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: serialize(players) }) });
        setSaveStatus(response.ok ? 'Saved' : 'Local view only');
      } catch {
        setSaveStatus('Local view only');
      }
      setTimeout(() => setSaveStatus(''), 1600);
    }, 700);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [players, loading]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((player) => {
      if (hideNoFit && player.noFit) return false;
      if (position !== 'ALL' && player.pos !== position) return false;
      if (!q) return true;
      return `${player.name} ${player.college} ${player.pos}`.toLowerCase().includes(q);
    });
  }, [players, position, search, hideNoFit]);

  const rankById = useMemo(() => new Map(players.map((player, index) => [player.id, index + 1])), [players]);

  const move = (id: string, direction: -1 | 1) => {
    setPlayers((current) => {
      const index = current.findIndex((player) => player.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const setFlag = (id: string, flag: 'target' | 'unlikely' | 'noFit') => {
    setPlayers((current) => current.map((player) => {
      if (player.id !== id) return player;
      const nextValue = !player[flag];
      return { ...player, target: flag === 'target' ? nextValue : false, unlikely: flag === 'unlikely' ? nextValue : false, noFit: flag === 'noFit' ? nextValue : false };
    }));
  };

  const reset = () => {
    if (!window.confirm('Reset your 2027 prospect board to the preseason baseline?')) return;
    setPlayers(cloneInitial());
    setExpandedId(null);
  };

  if (loading) return <div className="rounded-xl border border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">Loading 2027 prospect board...</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">East v. West · Superflex</div>
            <h2 className="mt-1 text-2xl font-black">{BOARD_LABEL}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">Preseason baseline for the 2027 rookie class. Rankings blend fantasy positional value with current NFL Draft projection and are expected to move substantially once the 2026 college season produces real results.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {saveStatus ? <span className="text-xs text-[var(--muted)]"><Save className="mr-1 inline h-3.5 w-3.5" />{saveStatus}</span> : null}
            <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold hover:bg-white/5"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search player or college" className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]" /></label>
          <div className="flex gap-1 overflow-x-auto">{['ALL', 'QB', 'RB', 'WR', 'TE'].map((pos) => <button key={pos} type="button" onClick={() => setPosition(pos)} className="rounded-lg border px-3 py-2 text-xs font-bold" style={position === pos ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : { borderColor: 'var(--border)', color: 'var(--muted)' }}>{pos}</button>)}<button type="button" onClick={() => setHideNoFit((value) => !value)} className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--muted)]">{hideNoFit ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{hideNoFit ? 'Show no-fit' : 'Hide no-fit'}</button></div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="hidden grid-cols-[56px_minmax(220px,1.5fr)_90px_170px_130px_110px_92px] gap-2 border-b border-[var(--border)] bg-black/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)] md:grid"><div>Rank</div><div>Prospect</div><div>Pos</div><div>College</div><div>Proj. NFL</div><div>Trend</div><div></div></div>
        {filtered.map((player, visibleIndex) => {
          const previous = filtered[visibleIndex - 1];
          const showTier = !previous || previous.tier !== player.tier;
          const actualRank = rankById.get(player.id) || 0;
          const expanded = expandedId === player.id;
          const flag = flagStyle(player);
          return <React.Fragment key={player.id}>
            {showTier ? <div className="border-y border-[var(--border)] bg-black/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--accent)]">Tier {player.tier}: {TIER_LABELS[player.tier] || 'Watchlist'}</div> : null}
            <div style={{ background: flag.bg, borderColor: flag.border }} className="border-b border-[var(--border)] last:border-b-0">
              <div className="grid gap-2 px-3 py-3 md:grid-cols-[56px_minmax(220px,1.5fr)_90px_170px_130px_110px_92px] md:items-center">
                <div className="flex items-center gap-1 md:block"><span className="text-sm font-black tabular-nums">#{actualRank}</span><div className="inline-flex md:mt-1 md:flex"><button type="button" onClick={() => move(player.id, -1)} disabled={actualRank <= 1} className="p-0.5 disabled:opacity-20"><ChevronUp className="h-3.5 w-3.5" /></button><button type="button" onClick={() => move(player.id, 1)} disabled={actualRank >= players.length} className="p-0.5 disabled:opacity-20"><ChevronDown className="h-3.5 w-3.5" /></button></div></div>
                <button type="button" onClick={() => setExpandedId(expanded ? null : player.id)} className="min-w-0 text-left"><div className="flex flex-wrap items-center gap-2"><span className="font-black">{player.name}</span>{player.target ? <span className="text-[10px] font-black uppercase text-emerald-400">Target</span> : null}{player.unlikely ? <span className="text-[10px] font-black uppercase text-amber-300">Unlikely</span> : null}{player.noFit ? <span className="text-[10px] font-black uppercase text-red-300">No Fit</span> : null}</div><div className="mt-0.5 text-xs text-[var(--muted)] md:hidden">{player.college} · {player.draftRange}</div></button>
                <div><span className="rounded px-2 py-1 text-[10px] font-black" style={{ background: `${POS_COLORS[player.pos]}22`, color: POS_COLORS[player.pos], border: `1px solid ${POS_COLORS[player.pos]}55` }}>{player.pos}</span></div>
                <div className="hidden text-xs text-[var(--muted)] md:block">{player.college}</div><div className="hidden text-xs font-semibold md:block">{player.draftRange}</div><div className="hidden text-xs md:block"><Trend trend={player.trend} /></div>
                <button type="button" onClick={() => setExpandedId(expanded ? null : player.id)} className="justify-self-start rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-bold md:justify-self-end">{expanded ? 'Close' : 'Scout'}</button>
              </div>
              {expanded ? <div className="border-t border-[var(--border)] bg-black/10 px-4 py-4"><div className="space-y-1.5 text-xs leading-relaxed text-[var(--muted)]">{player.s.map((line) => <div key={line}>{line}</div>)}</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setFlag(player.id, 'target')} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold" style={{ borderColor: `${C.target}66`, color: C.target, background: player.target ? C.targetBg : 'transparent' }}><Check className="h-3.5 w-3.5" /> Target</button><button type="button" onClick={() => setFlag(player.id, 'unlikely')} className="rounded-lg border px-2.5 py-1.5 text-xs font-bold" style={{ borderColor: `${C.unlikely}66`, color: C.unlikely, background: player.unlikely ? C.unlikelyBg : 'transparent' }}>Unlikely</button><button type="button" onClick={() => setFlag(player.id, 'noFit')} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold" style={{ borderColor: `${C.noFit}66`, color: C.noFit, background: player.noFit ? C.noFitBg : 'transparent' }}><X className="h-3.5 w-3.5" /> No Fit</button></div><div className="mt-4"><label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-[var(--muted)]"><Tag className="h-3.5 w-3.5" /> Your note</label><textarea value={player.userNote || ''} onChange={(event) => setPlayers((current) => current.map((entry) => entry.id === player.id ? { ...entry, userNote: event.target.value } : entry))} rows={2} placeholder="Add your scouting note, concern or target range…" className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]" /></div></div> : null}
            </div>
          </React.Fragment>;
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--muted)]">Baseline updated August 28, 2026. This is an early Superflex watchlist, not a settled 2027 rookie ranking. The live draft room uses its separate 2026 player board and is unchanged.</p>
    </div>
  );
}
