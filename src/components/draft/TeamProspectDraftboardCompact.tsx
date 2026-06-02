'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, X, Check } from 'lucide-react';
import { BoardPlayer, DEFAULT_PLAYERS, BOARD_API_URL, sortByPick } from './prospect-board-data';

const C = {
  bg: '#0B1020',
  panel: '#111727',
  border: '#1E2637',
  primary: '#be161e',
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
  QB: '#c25852', RB: '#c4a020', WR: '#3d7eaa', TE: '#4a8e62', K: '#7b5ea7', FB: '#4a8e62',
};

type AvailPlayer = { id: string; name: string; pos: string; nfl: string; college?: string | null };

type Props = {
  availablePlayers: AvailPlayer[];
  draftedPlayerIds: Set<string>;
  onAddToQueue?: (player: AvailPlayer) => void;
  queuedIds?: Set<string>;
  teamColors?: { primary: string; secondary: string } | null;
  teamRoster?: Array<{ pos: string }>;
};

function applySavedBoardData(saved: Record<string, unknown>) {
  let next = DEFAULT_PLAYERS.map((p) => ({ ...p }));
  const data: Record<string, unknown> = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};

  if (Array.isArray(data.orderIds)) {
    const orderIds = data.orderIds as Array<string | number>;
    const byId = Object.fromEntries(next.map((p) => [p.id, p]));
    const known = orderIds.map((id) => byId[String(id)]).filter(Boolean);
    const knownSet = new Set(known.map((p: { id: string }) => p.id));
    const missing = next.filter((p) => !knownSet.has(p.id));
    next = [...known, ...sortByPick(missing)];
  }

  if (data.unlikely && typeof data.unlikely === 'object') {
    const unlikelyMap = data.unlikely as Record<string, unknown>;
    next = next.map((p) => ({ ...p, unlikely: !!unlikelyMap[p.id] }));
  }
  if (data.noFit && typeof data.noFit === 'object') {
    const noFitMap = data.noFit as Record<string, unknown>;
    next = next.map((p) => ({ ...p, noFit: !!noFitMap[p.id] }));
  }
  if (data.target && typeof data.target === 'object') {
    const targetMap = data.target as Record<string, unknown>;
    next = next.map((p) => ({ ...p, target: !!targetMap[p.id] }));
  }
  if (data.notes && typeof data.notes === 'object') {
    const notesMap = data.notes as Record<string, unknown>;
    next = next.map((p) => ({ ...p, userNote: String(notesMap[p.id] || '') }));
  }

  const customTiers = Array.isArray(data.customTiers)
    ? data.customTiers.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const tierBreaks: Record<string, number> =
    data.tierBreaks && typeof data.tierBreaks === 'object' && !Array.isArray(data.tierBreaks)
      ? Object.fromEntries(Object.entries(data.tierBreaks as Record<string, unknown>).map(([k, v]) => [k, Number(v)]))
      : {};

  return { players: next, customTiers, tierBreaks };
}

function buildBoardData(players: BoardPlayer[], customTiers: string[], tierBreaks: Record<string, number>) {
  const orderIds = players.map((p) => String(p.id));
  const unlikely: Record<string, boolean> = {};
  const noFit: Record<string, boolean> = {};
  const target: Record<string, boolean> = {};
  const notes: Record<string, string> = {};
  players.forEach((p) => {
    const id = String(p.id);
    if (p.unlikely) unlikely[id] = true;
    if (p.noFit) noFit[id] = true;
    if (p.target) target[id] = true;
    if (typeof p.userNote === 'string' && p.userNote.trim()) notes[id] = p.userNote;
  });
  return { orderIds, unlikely, noFit, target, notes, customTiers, tierBreaks };
}

function getFlagColors(p: Record<string, unknown>) {
  if (p.target) return { color: C.target, bg: C.targetBg, border: `${C.target}55` };
  if (p.unlikely) return { color: C.unlikely, bg: C.unlikelyBg, border: `${C.unlikely}55` };
  if (p.noFit) return { color: C.noFit, bg: C.noFitBg, border: `${C.noFit}55` };
  return { color: C.text, bg: C.panel, border: C.border };
}

// Position needs calculation
function calculatePositionNeeds(roster: Array<{ pos: string }>, draftPicks: Array<{ pos: string }>) {
  const IDEAL_COUNTS: Record<string, number> = { QB: 3, RB: 6, WR: 8, TE: 3, K: 1 };
  const current: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0 };
  
  roster.forEach(p => {
    if (current[p.pos] !== undefined) current[p.pos]++;
  });
  draftPicks.forEach(p => {
    if (current[p.pos] !== undefined) current[p.pos]++;
  });

  const needs: Array<{ pos: string; current: number; ideal: number; need: number; priority: 'high' | 'medium' | 'low' }> = [];
  for (const pos of Object.keys(IDEAL_COUNTS)) {
    const ideal = IDEAL_COUNTS[pos];
    const cur = current[pos];
    const need = Math.max(0, ideal - cur);
    let priority: 'high' | 'medium' | 'low' = 'low';
    if (need >= 2) priority = 'high';
    else if (need === 1) priority = 'medium';
    needs.push({ pos, current: cur, ideal, need, priority });
  }
  return needs.sort((a, b) => b.need - a.need);
}

export default function TeamProspectDraftboardCompact({
  availablePlayers,
  draftedPlayerIds,
  onAddToQueue,
  queuedIds = new Set(),
  teamColors,
  teamRoster = [],
}: Props) {
  const [players, setPlayers] = useState<BoardPlayer[]>(DEFAULT_PLAYERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showDrafted, setShowDrafted] = useState(true);
  const [customTiers, setCustomTiers] = useState<string[]>([]);
  const [tierBreaks, setTierBreaks] = useState<Record<string, number>>({});
  const [rankEditId, setRankEditId] = useState<string | null>(null);
  const [rankEditVal, setRankEditVal] = useState('');
  const [collapsedTiers, setCollapsedTiers] = useState<Record<string, boolean>>({});
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Build a map of available player IDs for quick lookup (memoized)
  const availableIdSet = useMemo(() => new Set(availablePlayers.map(p => p.id)), [availablePlayers]);
  // Also match by name (lowercase) for cross-reference
  const availableNameSet = useMemo(() => new Set(availablePlayers.map(p => p.name.toLowerCase())), [availablePlayers]);

  // Load board data on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(BOARD_API_URL, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        const applied = applySavedBoardData((body?.data || {}) as Record<string, unknown>);
        setPlayers(applied.players);
        setCustomTiers(applied.customTiers);
        setTierBreaks(applied.tierBreaks);
      } catch {
        setPlayers(DEFAULT_PLAYERS.map((p) => ({ ...p })));
      }
      setLoading(false);
    })();
  }, []);

  // Auto-save on changes
  useEffect(() => {
    if (loading) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const boardData = buildBoardData(players, customTiers, tierBreaks);
      try {
        const res = await fetch(BOARD_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: boardData }) });
        if (res.ok) {
          setSaveStatus('Synced');
          setTimeout(() => setSaveStatus(''), 1500);
        }
      } catch {
        setSaveStatus('Save failed');
        setTimeout(() => setSaveStatus(''), 2000);
      }
    }, 800);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [players, customTiers, tierBreaks, loading]);

  const toggleExpand = (id: string) => setExpandedId((prev) => prev === id ? null : id);

  const toggleFlag = (id: string, flag: string) => {
    setPlayers((prev) => prev.map((p) => p.id === id ? { ...p, [flag]: !p[flag as keyof typeof p] } : p));
  };

  const moveByOne = (idx: number, direction: number) => {
    setPlayers((prev) => {
      const arr = [...prev];
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= arr.length) return prev;
      const player = arr[idx];
      const neighbor = arr[targetIdx];
      const newPlayer = { ...player };
      if (neighbor.tier !== player.tier) newPlayer.tier = neighbor.tier;
      arr[idx] = arr[targetIdx];
      arr[targetIdx] = newPlayer;
      return arr;
    });
  };

  const moveToRank = (fromIdx: number, targetRank: number) => {
    setPlayers((prev) => {
      const toIdx = targetRank - 1;
      if (toIdx < 0 || toIdx >= prev.length || toIdx === fromIdx) return prev;
      const arr = [...prev];
      const [item] = arr.splice(fromIdx, 1);
      const destTier = arr[Math.min(toIdx, arr.length - 1)]?.tier ?? item.tier;
      arr.splice(toIdx, 0, { ...item, tier: destTier });
      return arr;
    });
  };

  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }
    setPlayers((prev) => {
      const fromIdx = prev.findIndex((p) => p.id === draggedId);
      const toIdx = prev.findIndex((p) => p.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const arr = [...prev];
      const [item] = arr.splice(fromIdx, 1);
      const destTier = arr[Math.min(toIdx, arr.length - 1)]?.tier ?? item.tier;
      arr.splice(toIdx, 0, { ...item, tier: destTier });
      return arr;
    });
    setDraggedId(null);
    setDragOverId(null);
  };

  // Check if a board player is available (by ID or name match)
  const isPlayerAvailable = useCallback((p: BoardPlayer) => {
    if (availableIdSet.has(p.id)) return true;
    if (availableNameSet.has(p.name.toLowerCase())) return true;
    return false;
  }, [availableIdSet, availableNameSet]);

  // Check if a board player has been drafted
  const isPlayerDrafted = useCallback((p: BoardPlayer) => {
    if (draftedPlayerIds.has(p.id)) return true;
    // If not in available and not explicitly drafted, assume drafted
    if (!isPlayerAvailable(p)) return true;
    return false;
  }, [draftedPlayerIds, isPlayerAvailable]);

  // Find matching available player for queue action
  const findAvailablePlayer = useCallback((p: BoardPlayer): AvailPlayer | null => {
    const byId = availablePlayers.find(ap => ap.id === p.id);
    if (byId) return byId;
    const byName = availablePlayers.find(ap => ap.name.toLowerCase() === p.name.toLowerCase());
    return byName || null;
  }, [availablePlayers]);

  // Filter players
  const filteredPlayers = players.filter(p => {
    if (!showDrafted && isPlayerDrafted(p)) return false;
    if (posFilter !== 'ALL' && p.pos !== posFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Position needs (using roster only, draft picks are already in roster context)
  const positionNeeds = calculatePositionNeeds(teamRoster, []);

  const posRankMap: Record<string, number> = (() => {
    const byPos: Record<string, string[]> = {};
    [...players].sort((a, b) => (Number(a.pick) || 9999) - (Number(b.pick) || 9999))
      .forEach(p => { if (!byPos[p.pos]) byPos[p.pos] = []; byPos[p.pos].push(p.id); });
    const result: Record<string, number> = {};
    for (const ids of Object.values(byPos)) ids.forEach((id, i) => { result[id] = i + 1; });
    return result;
  })();

  const tierPlayerCounts: Record<string, number> = (() => {
    const counts: Record<string, number> = {};
    players.forEach((p, idx) => {
      let best = ''; let bestBreak = -1;
      for (const t of customTiers) { const b = tierBreaks[t] ?? -1; if (b >= 0 && b <= idx && b > bestBreak) { bestBreak = b; best = t; } }
      if (best) counts[best] = (counts[best] || 0) + 1;
    });
    return counts;
  })();

  const bestAvailId = (() => {
    for (const p of players) {
      if (p.target && isPlayerAvailable(p) && !isPlayerDrafted(p)) return p.id;
    }
    return null;
  })();

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: C.textMuted, fontSize: '13px' }}>
        Loading your draft board...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Position Needs Indicator */}
      <div style={{ padding: '10px 12px', background: `${C.primary}14`, border: `1px solid ${C.border}`, borderRadius: '6px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '2px', color: C.accent, fontWeight: 700, marginBottom: '8px' }}>POSITION NEEDS</div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {positionNeeds.map(n => (
            <div
              key={n.pos}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '4px',
                background: n.priority === 'high' ? `${C.primary}33` : n.priority === 'medium' ? `${C.unlikely}22` : `${C.border}`,
                border: `1px solid ${n.priority === 'high' ? C.primary : n.priority === 'medium' ? C.unlikely : C.border}`,
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, color: POS_COLORS[n.pos] || C.text }}>{n.pos}</span>
              <span style={{ fontSize: '10px', color: C.textMuted }}>{n.current}/{n.ideal}</span>
              {n.need > 0 && (
                <span style={{ fontSize: '9px', fontWeight: 700, color: n.priority === 'high' ? C.primary : C.unlikely }}>
                  +{n.need}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          style={{
            flex: '1 1 120px',
            minWidth: '100px',
            padding: '6px 10px',
            background: C.bg,
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: '4px',
            fontSize: '12px',
          }}
        />
        <div style={{ display: 'flex', gap: '4px' }}>
          {['ALL', 'QB', 'RB', 'WR', 'TE', 'K'].map(pos => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: posFilter === pos ? (pos === 'ALL' ? C.accent : POS_COLORS[pos]) : C.border,
                color: posFilter === pos ? '#fff' : C.textMuted,
              }}
            >
              {pos}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: C.textMuted, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showDrafted}
            onChange={(e) => setShowDrafted(e.target.checked)}
            style={{ accentColor: C.accent }}
          />
          Show drafted
        </label>
        {saveStatus && (
          <span style={{ fontSize: '10px', color: C.target, marginLeft: 'auto' }}>{saveStatus}</span>
        )}
      </div>

      {/* Player List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: 'min(400px, 50dvh)', overflowY: 'auto' }}>
        {filteredPlayers.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: C.textDim, fontSize: '12px' }}>
            No players match your filters.
          </div>
        ) : (
          filteredPlayers.map((p) => {
            const isDrafted = isPlayerDrafted(p);
            const isAvail = isPlayerAvailable(p);
            const availPlayer = findAvailablePlayer(p);
            const isQueued = availPlayer ? queuedIds.has(availPlayer.id) : false;
            const flagColors = getFlagColors(p);
            const isExpanded = expandedId === p.id;
            const rankIdx = players.findIndex(pl => pl.id === p.id);
            const rank = rankIdx + 1;

            const assignedTier = (() => {
              let best = ''; let bestBreak = -1;
              for (const t of customTiers) { const b = tierBreaks[t] ?? -1; if (b >= 0 && b <= rankIdx && b > bestBreak) { bestBreak = b; best = t; } }
              return best;
            })();

            return (
              <React.Fragment key={p.id}>
                {customTiers.map(tierName =>
                  (tierBreaks[tierName] ?? -1) === rankIdx ? (
                    <div
                      key={`tier-${tierName}`}
                      onClick={() => setCollapsedTiers(prev => ({ ...prev, [tierName]: !prev[tierName] }))}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', margin: '4px 0 1px 0', background: `${C.primary}22`, border: `2px solid ${C.primary}44`, borderRadius: '3px', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: C.textDim }}>⠿</span>
                        <span style={{ fontSize: '9px', letterSpacing: '2px', color: C.accent, fontWeight: 700 }}>{tierName}</span>
                        {(tierPlayerCounts[tierName] ?? 0) > 0 && <span style={{ fontSize: '9px', color: C.textDim }}>({tierPlayerCounts[tierName]})</span>}
                      </div>
                      <span style={{ fontSize: '10px', color: C.accent }}>{collapsedTiers[tierName] ? '▶ SHOW' : '▼ HIDE'}</span>
                    </div>
                  ) : null
                )}
              {!(assignedTier && collapsedTiers[assignedTier]) && <div
                draggable={!isDrafted}
                onDragStart={() => setDraggedId(p.id)}
                onDragOver={(e) => { e.preventDefault(); if (dragOverId !== p.id) setDragOverId(p.id); }}
                onDrop={(e) => onDrop(e, p.id)}
                onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                style={{
                  background: isDrafted ? `${C.bg}88` : flagColors.bg,
                  border: `1px solid ${isDrafted ? C.border : flagColors.border}`,
                  borderRadius: '4px',
                  opacity: isDrafted ? 0.5 : (draggedId === p.id ? 0.4 : 1),
                  position: 'relative',
                }}
              >
                {isDrafted && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    fontSize: '9px',
                    letterSpacing: '2px',
                    color: C.textDim,
                    fontWeight: 700,
                    background: `${C.bg}cc`,
                    padding: '2px 8px',
                    borderRadius: '3px',
                    zIndex: 2,
                    pointerEvents: 'none',
                  }}>
                    DRAFTED
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px' }}>
                  {/* Drag handle */}
                  {!isDrafted && <span style={{ fontSize: '13px', color: C.textDim, cursor: 'grab', lineHeight: 1, flexShrink: 0, alignSelf: 'center' }}>⠿</span>}
                  {/* Rank & reorder */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '28px' }}>
                    <button
                      disabled={isDrafted}
                      onClick={() => moveByOne(rankIdx, -1)}
                      style={{ background: 'transparent', border: 'none', color: C.accent, cursor: isDrafted ? 'default' : 'pointer', padding: '8px 6px', opacity: isDrafted ? 0.3 : 1 }}
                    >
                      <ChevronUp size={14} />
                    </button>
                    {rankEditId === p.id ? (
                      <input
                        type="number"
                        min={1}
                        max={players.length}
                        value={rankEditVal}
                        autoFocus
                        onChange={(e) => setRankEditVal(e.target.value)}
                        onBlur={() => { const n = parseInt(rankEditVal, 10); if (!isNaN(n) && n >= 1 && n <= players.length) moveToRank(rankIdx, n); setRankEditId(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { const n = parseInt(rankEditVal, 10); if (!isNaN(n) && n >= 1 && n <= players.length) moveToRank(rankIdx, n); setRankEditId(null); } else if (e.key === 'Escape') setRankEditId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '36px', fontSize: '16px', fontWeight: 700, color: C.accent, background: C.bg, border: `1px solid ${C.accent}`, borderRadius: '3px', textAlign: 'center', padding: '1px 0', touchAction: 'manipulation' }}
                      />
                    ) : (
                      <span
                        onClick={(e) => { if (!isDrafted) { e.stopPropagation(); setRankEditId(p.id); setRankEditVal(String(rank)); } }}
                        title={isDrafted ? undefined : 'Click to jump to rank'}
                        style={{ fontSize: '13px', fontWeight: 700, color: flagColors.color !== C.text ? flagColors.color : C.accent, cursor: isDrafted ? 'default' : 'text', touchAction: 'manipulation' }}
                      >
                        {rank}
                      </span>
                    )}
                    <button
                      disabled={isDrafted}
                      onClick={() => moveByOne(rankIdx, 1)}
                      style={{ background: 'transparent', border: 'none', color: C.accent, cursor: isDrafted ? 'default' : 'pointer', padding: '8px 6px', opacity: isDrafted ? 0.3 : 1 }}
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  {/* Player info */}
                  <div onClick={() => toggleExpand(p.id)} style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: 'white',
                        background: POS_COLORS[p.pos] || '#666',
                        opacity: isDrafted ? 0.6 : 1,
                      }}>
                        {p.pos}
                      </span>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: flagColors.color,
                        textDecoration: isDrafted ? 'line-through' : 'none',
                      }}>
                        {p.name}
                      </span>
                      {p.id === bestAvailId && <span style={{ fontSize: '9px', fontWeight: 700, color: C.accent, background: `${C.accent}1a`, padding: '1px 5px', borderRadius: '3px', border: `1px solid ${C.accent}44`, letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>★ TOP</span>}
                      <span style={{ fontSize: '11px', color: C.textMuted }}>{p.team}</span>
                      {posRankMap[p.id] && <span style={{ fontSize: '10px', color: C.textDim }}>· {p.pos}{posRankMap[p.id]}</span>}
                    </div>
                  </div>

                  {/* Flags */}
                  <button onClick={() => toggleFlag(p.id, 'target')} title="Target" style={{ background: 'transparent', border: 'none', color: p.target ? C.target : C.textDim, cursor: 'pointer', padding: '8px 4px' }}>
                    <Check size={14} />
                  </button>
                  <button onClick={() => toggleFlag(p.id, 'unlikely')} title="Monitor" style={{ background: 'transparent', border: 'none', color: p.unlikely ? C.unlikely : C.textDim, cursor: 'pointer', padding: '8px 4px' }}>
                    {p.unlikely ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => toggleFlag(p.id, 'noFit')} title="Avoid" style={{ background: 'transparent', border: 'none', color: p.noFit ? C.noFit : C.textDim, cursor: 'pointer', padding: '8px 4px' }}>
                    <X size={14} />
                  </button>

                  {/* Queue action */}
                  {isAvail && availPlayer && onAddToQueue && (
                    <button
                      onClick={() => onAddToQueue(availPlayer)}
                      title={isQueued ? 'In queue' : 'Add to queue'}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '8px 10px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        border: `1px solid ${isQueued ? C.target : (teamColors?.secondary || C.accent)}`,
                        background: isQueued ? `${C.target}22` : 'transparent',
                        color: isQueued ? C.target : (teamColors?.primary || C.accent),
                        cursor: 'pointer',
                      }}
                    >
                      {isQueued ? '✓' : '+Q'}
                    </button>
                  )}

                  {/* Expand toggle */}
                  <button onClick={() => toggleExpand(p.id)} style={{ background: 'transparent', border: 'none', color: C.accent, cursor: 'pointer', padding: '8px 4px' }}>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ padding: '8px 12px 12px', borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: '11px', color: C.textMuted, marginBottom: '8px' }}>
                      {p.college} · NFL Pick #{p.pick}
                    </div>

                    {/* College Production / Scouting Stats */}
                    {p.s && p.s.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '9px', letterSpacing: '1.5px', color: C.accent, fontWeight: 700, marginBottom: '4px' }}>
                          COLLEGE PRODUCTION
                        </div>
                        <div style={{ 
                          fontSize: '11px', 
                          color: C.text, 
                          lineHeight: '1.5',
                          padding: '6px 8px',
                          background: `${C.bg}66`,
                          borderRadius: '4px',
                          border: `1px solid ${C.border}`,
                          fontFamily: 'monospace',
                        }}>
                          {p.s.map((line, i) => (
                            <div key={i} style={{ marginBottom: i < p.s.length - 1 ? '3px' : 0 }}>
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* User Notes */}
                    {p.userNote && (
                      <div>
                        <div style={{ fontSize: '9px', letterSpacing: '1.5px', color: C.accent, fontWeight: 700, marginBottom: '4px' }}>
                          MY NOTES
                        </div>
                        <div style={{ fontSize: '12px', color: C.text, fontStyle: 'italic', lineHeight: '1.4', padding: '6px 8px', background: `${C.bg}88`, borderRadius: '3px' }}>
                          {p.userNote}
                        </div>
                      </div>
                    )}
                    {!p.userNote && (!p.s || p.s.length === 0) && (
                      <div style={{ fontSize: '11px', color: C.textDim, fontStyle: 'italic' }}>
                        No scouting data or notes available.
                      </div>
                    )}
                  </div>
                )}
              </div>}
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Link to full board */}
      <a
        href="/draft?view=team-prospect-draftboard"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '8px',
          fontSize: '11px',
          color: C.accent,
          textDecoration: 'none',
          border: `1px solid ${C.border}`,
          borderRadius: '4px',
          background: `${C.primary}11`,
        }}
      >
        Open Full Draft Board →
      </a>
    </div>
  );
}
