'use client';

import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useDraftData } from './useDraftData';
import { getTeamLogoPath } from '@/lib/utils/team-utils';
import { getTeamColors } from '@/lib/constants/team-colors';
import DraftPickAnimation from './DraftPickAnimation';

// Position colors for player cards
const positionColors: Record<string, string> = {
  'QB': '#C00000',
  'RB': '#FFC000',
  'WR': '#0070C0',
  'TE': '#00B050',
  'DEF': '#7030A0',
  'K': '#FF8C42',
};

const tickerViews = ['bestAvailable', 'recentPicks', 'upcomingPicks'] as const;

export default function DraftOverlayLive() {
  const {
    draft,
    currentTeam,
    currentPickIndex,
    draftGrid,
    nextTeams,
    lastPick,
    isNewPick,
    available,
    usingCustom,
    localRemainingSec,
  } = useDraftData(1000); // 1s during LIVE, auto-adjusts to 5s/10s for PAUSED/COMPLETED

  const [showPickAnimation, setShowPickAnimation] = useState(false);
  const clockRef = useRef<HTMLDivElement>(null);
  const lastAnimatedPickRef = useRef<number | null>(null);

  // Format time as MM:SS
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Show full pick animation when new pick comes in (only once per pick)
  useEffect(() => {
    // Only trigger if this is genuinely a NEW pick we haven't animated yet
    if (isNewPick && lastPick && lastPick.overall !== lastAnimatedPickRef.current) {
      console.log('[Animation] Triggering animation for pick', lastPick.overall);
      lastAnimatedPickRef.current = lastPick.overall;
      setShowPickAnimation(true);
    } else if (!isNewPick) {
      // If isNewPick is false, make sure animation is off
      setShowPickAnimation(false);
    }
  }, [isNewPick, lastPick]);

  // Pulse clock when low time
  useEffect(() => {
    if (clockRef.current && localRemainingSec <= 10 && localRemainingSec > 0) {
      gsap.to(clockRef.current, {
        scale: 1.05,
        duration: 0.3,
        yoyo: true,
        repeat: 1,
        ease: 'power1.inOut',
      });
    }
  }, [localRemainingSec]);

  const roundNumber = Math.floor(currentPickIndex / 12) + 1;
  const pickInRound = (currentPickIndex % 12) + 1;
  const teamColors = currentTeam?.colors || ['#333', '#555', null];
  const teamLogo = currentTeam ? getTeamLogoPath(currentTeam.name) : null;
  const prevDraftGridRef = useRef(draftGrid);
  
  // Ticker rotation state
  const [currentTickerView, setCurrentTickerView] = useState<typeof tickerViews[number]>(tickerViews[0]);
  const cycleTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Draft order data from website
  const [draftOrderData, setDraftOrderData] = useState<{
    slotOrder: Array<{ slot: number; team: string; record: { wins: number; losses: number; fpts: number } }>;
  } | null>(null);

  // Fetch draft order data from website for ticker context
  useEffect(() => {
    async function fetchDraftOrder() {
      try {
        const res = await fetch('/api/draft/next-order', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setDraftOrderData(data);
        }
      } catch (err) {
        console.error('Failed to fetch draft order data:', err);
      }
    }
    
    fetchDraftOrder();
  }, []);

  // Ticker rotation - cycle every 10 seconds
  useEffect(() => {
    const startCycle = () => {
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
      cycleTimerRef.current = setTimeout(() => {
        setCurrentTickerView(prev => {
          const index = tickerViews.indexOf(prev);
          return tickerViews[(index + 1) % tickerViews.length];
        });
        startCycle();
      }, 10000);
    };
    
    startCycle();
    return () => {
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    };
  }, []);
  
  // Animate new picks appearing in the draft board
  useEffect(() => {
    const prevGrid = prevDraftGridRef.current;
    const newPicks: number[] = [];
    
    // Find newly filled cells
    draftGrid.forEach((pick, idx) => {
      if (pick && !prevGrid[idx]) {
        newPicks.push(idx);
      }
    });

    // Animate each new pick cell
    if (newPicks.length > 0) {
      newPicks.forEach((idx, i) => {
        const cell = document.querySelector(`[data-grid-idx="${idx}"]`);
        if (cell) {
          gsap.fromTo(
            cell,
            { opacity: 0, scale: 0.8, backgroundColor: '#fbbf24' },
            {
              opacity: 1,
              scale: 1,
              backgroundColor: '#27272a',
              duration: 0.6,
              delay: i * 0.1,
              ease: 'back.out(1.7)',
            }
          );
        }
      });
    }

    prevDraftGridRef.current = draftGrid;
  }, [draftGrid]);

  return (
    <div className="w-full h-full bg-gradient-to-b from-zinc-950 to-zinc-900 p-6 flex flex-col">
      {/* Draft Board Grid */}
      <div className="flex-1 mb-4 min-h-0">
        <div className="grid grid-cols-5 gap-[2px] h-full bg-black/80 rounded-lg overflow-hidden">
          {/* Header Row */}
          <div className="text-center text-[11px] font-bold text-zinc-400 py-1 bg-zinc-900">Pick</div>
          {[1, 2, 3, 4].map(r => (
            <div key={r} className="text-center text-[11px] font-bold text-zinc-400 py-1 bg-zinc-900">Round {r}</div>
          ))}
          
          {/* Pick Rows */}
          {Array.from({ length: 12 }, (_, pickIdx) => (
            <React.Fragment key={pickIdx}>
              {/* Pick number */}
              <div 
                className={`text-center text-xs font-bold flex items-center justify-center transition-all duration-300 ${
                  currentPickIndex % 12 === pickIdx 
                    ? 'text-yellow-400 bg-yellow-400/20 animate-pulse' 
                    : 'text-zinc-500 bg-zinc-900/80'
                }`}
              >
                {pickIdx + 1}
              </div>
              {/* Round cells */}
              {[0, 1, 2, 3].map(roundIdx => {
                const gridIdx = roundIdx * 12 + pickIdx;
                const gridItem = draftGrid[gridIdx];
                const isCurrentPick = currentPickIndex === gridIdx;
                const isPicked = gridItem?.player !== null;
                const teamLogo = gridItem?.team ? getTeamLogoPath(gridItem.team) : null;
                
                return (
                  <div
                    key={gridIdx}
                    data-grid-idx={gridIdx}
                    className={`relative text-[10px] px-1 py-[2px] flex flex-col justify-center overflow-hidden ${
                      isCurrentPick
                        ? 'ring-2 ring-yellow-400 bg-yellow-400/20'
                        : isPicked
                        ? 'bg-zinc-800'
                        : 'bg-zinc-900/50'
                    }`}
                    style={{
                      borderLeft: isPicked && gridItem?.position ? `3px solid ${positionColors[gridItem.position] || '#666'}` : undefined,
                    }}
                  >
                    {/* Team logo background - ALWAYS visible */}
                    {teamLogo && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-20">
                        <img src={teamLogo} alt="" className="w-8 h-8 object-contain" />
                      </div>
                    )}
                    
                    {/* Player info overlay - only when picked */}
                    {isPicked && gridItem && (
                      <div className="relative z-10">
                        <div className="font-semibold text-white truncate leading-tight">{gridItem.player}</div>
                        <div className="text-zinc-400 text-[9px] leading-tight">{gridItem.position}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Bottom Bar: ClockBox + InfoBar */}
      <div className="flex gap-4 items-stretch">
        {/* ClockBox */}
        <div
          className="flex items-stretch shrink-0"
          style={{
            width: '340px',
            background: 'linear-gradient(to bottom, #202020, #282828)',
            borderRadius: '4px',
            border: '1px solid #333',
          }}
        >
          {/* Left: Team Abbrev + Round/Pick */}
          <div className="flex flex-col justify-center p-2 w-28">
            <div
              className="px-2 py-1 rounded text-center font-black text-xl text-white"
              style={{
                background: `linear-gradient(135deg, ${teamColors[0]}cc 0%, ${teamColors[0]}cc 50%, ${teamColors[1]}cc 50%, ${teamColors[1]}cc 100%)`,
                border: '2px solid #a4c810',
                boxShadow: '0 0 10px rgba(196, 255, 0, 0.4)',
              }}
            >
              {currentTeam?.abbrev || '---'}
            </div>
            <div className="text-white text-sm mt-1 text-center">
              <span className="font-bold">RD</span> {roundNumber} <span className="font-bold">PK</span> {pickInRound}
            </div>
          </div>

          {/* Center: Timer */}
          <div className="flex-1 flex items-center justify-center">
            <div
              ref={clockRef}
              className={`text-4xl font-bold font-mono ${localRemainingSec <= 10 ? 'text-red-500' : 'text-[#a4c810]'}`}
              style={{ textShadow: '0 0 10px rgba(196, 255, 0, 0.4)' }}
            >
              {formatTime(localRemainingSec)}
            </div>
          </div>

          {/* Right: Next Up + Team Logo */}
          <div className="flex items-center gap-2 p-2">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-zinc-400">NEXT</span>
              <div className="flex gap-1">
                {nextTeams.slice(0, 2).map((t, i) => (
                  <div key={i} className="w-6 h-6 bg-zinc-600 rounded overflow-hidden">
                    {t.logoPath && <img src={t.logoPath} alt={t.name} className="w-full h-full object-contain" />}
                  </div>
                ))}
              </div>
            </div>
            <div
              className="w-16 h-16 bg-zinc-700 rounded overflow-hidden border-2 border-[#a4c810]"
              style={{ boxShadow: '0 0 8px rgba(196, 255, 0, 0.4)' }}
            >
              {teamLogo && <img src={teamLogo} alt={currentTeam?.name || ''} className="w-full h-full object-contain" />}
            </div>
          </div>
        </div>

        {/* InfoBar: Rotating Ticker */}
        <div
          className="flex-1 p-2 overflow-hidden relative"
          style={{
            background: teamColors[0],
            borderRadius: '4px',
          }}
        >
          {/* Best Available View */}
          <div style={{ display: currentTickerView === 'bestAvailable' ? 'block' : 'none' }}>
            <div className="text-white/80 text-xs font-semibold mb-1">
              Best Available{usingCustom ? ' (Custom)' : ''}
            </div>
            <div className="grid grid-cols-5 gap-1">
              {available.slice(0, 10).map((p, i) => (
                <div key={p.id} className="bg-black/30 rounded px-1 py-[2px] text-[10px]">
                  <div className="font-semibold text-white truncate">{i + 1}. {p.name}</div>
                  <div className="text-white/60 truncate">{p.pos} - {p.nfl || '-'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Picks View */}
          <div style={{ display: currentTickerView === 'recentPicks' ? 'block' : 'none' }}>
            <div className="text-white/80 text-xs font-semibold mb-1">Recent Picks</div>
            <div className="grid grid-cols-2 gap-1">
              {draft?.recentPicks.slice(-6).reverse().map((p) => (
                <div key={p.overall} className="bg-black/30 rounded px-1 py-[2px] text-[10px]">
                  <div className="font-semibold text-white truncate">#{p.overall}: {p.playerName || p.playerId}</div>
                  <div className="text-white/60 truncate">{p.team} - R{p.round}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Picks View */}
          <div style={{ display: currentTickerView === 'upcomingPicks' ? 'block' : 'none' }}>
            <div className="text-white/80 text-xs font-semibold mb-1">Next 6 Picks</div>
            <div className="grid grid-cols-3 gap-1">
              {draft?.upcoming.slice(0, 6).map((u) => (
                <div key={u.overall} className="bg-black/30 rounded px-1 py-[2px] text-[10px]">
                  <div className="font-semibold text-white truncate">#{u.overall}</div>
                  <div className="text-white/60 truncate">{u.team}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full Pick Animation */}
      {showPickAnimation && lastPick && (
        <DraftPickAnimation
          player={{
            name: lastPick.playerName || lastPick.playerId,
            position: lastPick.playerPos || 'N/A',
            team: lastPick.playerNfl || undefined,
            college: undefined, // TODO: Add college data to API if available
          }}
          fantasyTeam={{
            name: lastPick.team,
            colors: (() => {
              const colors = getTeamColors(lastPick.team);
              return [colors.primary, colors.secondary, colors.tertiary || null];
            })(),
          }}
          pickNumber={lastPick.overall}
          round={lastPick.round}
          pickInRound={((lastPick.overall - 1) % 12) + 1}
          year={draft?.year || new Date().getFullYear()}
          onComplete={() => setShowPickAnimation(false)}
        />
      )}

      {/* Status Bar */}
      <div className="fixed top-0 left-0 right-0 bg-zinc-900/95 border-b border-zinc-700 px-4 py-2 flex items-center justify-between" style={{ zIndex: 10040 }}>
        <div className="text-lg font-bold text-white">
          East v West Draft {draft?.year ?? new Date().getFullYear()}
        </div>
        <div className="text-sm text-zinc-400">
          Overall #{draft?.curOverall ?? 1} • {draft?.status ?? 'NOT_STARTED'}
        </div>
      </div>
    </div>
  );
}
