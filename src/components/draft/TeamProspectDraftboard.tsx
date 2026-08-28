'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Save, Search } from 'lucide-react';
import {
  BOARD_API_URL,
  BOARD_LABEL,
  BOARD_VERSION,
  DEFAULT_PLAYERS,
  type BoardPlayer,
  type ProspectTrend,
} from './prospect-board-data';

const TIER_LABELS: Record<number, string> = {
  1: 'Blue-chip',
  2: 'Early 1st-round core',
  3: '1st-round depth',
  4: 'Day 2 watch',
  5: 'Developmental watchlist',
};

const POS_COLORS: Record<string, string> = {
  QB: '#c25852',
  RB: '#c4a020',
  WR: '#3d7eaa',
  TE: '#4a8e62',
};

type SavedBoard = {
  boardVersion?: string;
  orderIds?: string[];
  unlikely?: Record<string, boolean>;
  noFit?: Record<string, boolean>;
  target?: Record<string, boolean>;
  notes?: Record<string, string>;
};

function applySavedBoard(saved: SavedBoard | null): BoardPlayer[] {
  let players = DEFAULT_PLAYERS.map((player) => ({ ...player }));
  if (!saved || saved.boardVersion !== BOARD_VERSION) return players;

  if (Array.isArray(saved.orderIds)) {
    const byId = new Map(players.map((player) => [player.id, player]));
    const ordered = saved.orderIds.map((id) => byId.get(String(id))).filter(Boolean) as BoardPlayer[];
    const seen = new Set(ordered.map((player) => player.id));
    players = [...ordered, ...players.filter((player) => !seen.has(player.id))];
  }

  return players.map((player) => ({
    ...player,
    target: !!saved.target?.[player.id],
    unlikely: !!saved.unlikely?.[player.id],
    noFit: !!saved.noFit?.[player.id],
    userNote: saved.notes?.[player.id] || '',
  }));
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

  return {
    boardVersion: BOARD_VERSION,
    orderIds: players.map((player) => player.id),
    target,
    unlikely,
    noFit,
    notes,
  };
}

function Trend({ trend = 'steady' }: { trend?: ProspectTrend }) {
  if (trend === 'up') return <span className="font-bold text-emerald-400">↑ Rising</span>;
  if (trend === 'down') return <span className="font-bold text-red-300">↓ Falling</span>;
  return <span className="text-[var(--muted)]">→ Baseline</span>;
}

export default function TeamProspectDraftboard() {
  const [players, setPlayers] = useState<BoardPlayer[]>(DEFAULT_PLAYERS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [position, setPosition] = useState('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(BOARD_API_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (!cancelled) setPlayers(applySavedBoard((body?.data || null) as SavedBoard | null));
      } catch {
        if (!cancelled) setPlayers(DEFAULT_PLAYERS.map((player) => ({ ...player })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((player) => {
      if (position !== 'ALL' && player.pos !== position) return false;
      if (!q) return true;
      return `${player.name} ${player.college} ${player.pos}`.toLowerCase().includes(q);
    });
  }, [players, position, search]);

  const save = async () => {
    try {
      setSaving(true);
      setSaveStatus('');
      const response = await fetch(BOARD_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: serialize(players) }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSaveStatus('Saved');
    } catch {
      setSaveStatus('Save failed');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus(''), 1800);
    }
  };

  const patchPlayer = (id: string, patch: Partial<BoardPlayer>) => {
    setPlayers((current) => current.map((player) => player.id === id ? { ...player, ...patch } : player));
  };

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

  const reset = () => {
    setPlayers(DEFAULT_PLAYERS.map((player) => ({ ...player })));
    setExpandedId(null);
  };

  if (loading) {
    return <div className="rounded-xl border border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">Loading 2027 prospect board...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">East v. West · Superflex</div>
            <h2 className="mt-1 text-2xl font-black">{BOARD_LABEL}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
              Preseason baseline for the 2027 rookie class. Rankings blend fantasy positional value with current NFL Draft projection. They are expected to move substantially once the 2026 college season produces real results.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold hover:bg-white/5">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-black text-white disabled:opacity-60">
              <Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save board'}
            </button>
            {saveStatus && <span className="self-center text-xs text-[var(--muted)]">{saveStatus}</span>}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--muted)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search player or college"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--accent)]"
            />
          </label>
          <div className="flex gap-1 overflow-x-auto">
            {['ALL', 'QB', 'RB', 'WR', 'TE'].map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setPosition(pos)}
                className="rounded-lg border px-3 py-2 text-xs font-bold"
                style={position === pos ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : { borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="hidden grid-cols-[56px_minmax(220px,1.5fr)_90px_170px_130px_110px_92px] gap-2 border-b border-[var(--border)] bg-black/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)] md:grid">
          <div>Rank</div><div>Prospect</div><div>Pos</div><div>College</div><div>Proj. NFL</div><div>Trend</div><div></div>
        </div>

        {filtered.map((player) => {
          const actualRank = players.findIndex((entry) => entry.id === player.id) + 1;
          const expanded = expandedId === player.id;
          const posColor = POS_COLORS[player.pos] || '#64748b';
          return (
            <div key={player.id} className="border-b border-[var(--border)] last:border-b-0">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : player.id)}
                className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 px-3 py-3 text-left transition hover:bg-white/[0.025] md:grid-cols-[56px_minmax(220px,1.5fr)_90px_170px_130px_110px_92px] md:gap-2"
              >
                <div className="text-lg font-black tabular-nums">{actualRank}</div>
                <div className="min-w-0">
                  <div className="truncate font-bold">{player.name}</div>
                  <div className="mt-0.5 text-[11px] text-[var(--muted)] md:hidden">{player.college} · {player.draftRange || 'TBD'}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {player.target && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black text-emerald-300">TARGET</span>}
                    {player.unlikely && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black text-amber-300">UNLIKELY</span>}
                    {player.noFit && <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-black text-red-300">NO FIT</span>}
                  </div>
                </div>
                <div className="md:hidden">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</div>
                <div className="hidden md:block"><span className="rounded-md px-2 py-1 text-xs font-black text-white" style={{ background: posColor }}>{player.pos}</span></div>
                <div className="hidden text-sm font-semibold md:block">{player.college}</div>
                <div className="hidden text-xs font-semibold md:block">{player.draftRange || 'TBD'}</div>
                <div className="hidden text-xs md:block"><Trend trend={player.trend} /></div>
                <div className="hidden items-center justify-end gap-1 md:flex">
                  <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[9px] font-black text-[var(--muted)]">T{player.tier}</span>
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {expanded && (
                <div className="border-t border-[var(--border)] bg-black/10 px-4 py-4">
                  <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
                    <div>
                      <div className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">{TIER_LABELS[player.tier] || `Tier ${player.tier}`}</div>
                      <div className="space-y-2">
                        {player.s.map((line, index) => <p key={index} className="text-sm leading-relaxed text-[var(--muted)]">{line}</p>)}
                      </div>
                      {player.eligibility && <div className="mt-3 text-xs font-semibold text-[var(--muted)]">Eligibility: {player.eligibility}</div>}
                    </div>
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <button type="button" onClick={() => patchPlayer(player.id, { target: !player.target, unlikely: false, noFit: false })} className={`rounded-lg border px-2 py-2 text-[10px] font-black ${player.target ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-[var(--border)] text-[var(--muted)]'}`}>TARGET</button>
                        <button type="button" onClick={() => patchPlayer(player.id, { unlikely: !player.unlikely, target: false, noFit: false })} className={`rounded-lg border px-2 py-2 text-[10px] font-black ${player.unlikely ? 'border-amber-500/50 bg-amber-500/15 text-amber-300' : 'border-[var(--border)] text-[var(--muted)]'}`}>UNLIKELY</button>
                        <button type="button" onClick={() => patchPlayer(player.id, { noFit: !player.noFit, target: false, unlikely: false })} className={`rounded-lg border px-2 py-2 text-[10px] font-black ${player.noFit ? 'border-red-500/50 bg-red-500/15 text-red-300' : 'border-[var(--border)] text-[var(--muted)]'}`}>NO FIT</button>
                      </div>
                      <textarea
                        value={player.userNote || ''}
                        onChange={(event) => patchPlayer(player.id, { userNote: event.target.value })}
                        placeholder="Your scouting note..."
                        rows={3}
                        className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-2 text-sm outline-none focus:border-[var(--accent)]"
                      />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => move(player.id, -1)} className="flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold hover:bg-white/5">Move up</button>
                        <button type="button" onClick={() => move(player.id, 1)} className="flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold hover:bg-white/5">Move down</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-[var(--muted)]">
        Baseline compiled from current August 2026 NFL Draft and devy evaluations, then adjusted for East v. West Superflex value. “Proj. NFL” is an early range, not a prediction of a specific pick. The board should be re-ranked as the 2026 college season develops.
      </p>
    </div>
  );
}
