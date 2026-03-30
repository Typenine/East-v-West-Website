'use client';

/* eslint-disable @next/next/no-img-element -- Using <img> for GSAP animations and dynamic team logos that need direct DOM access */

import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useDraftData } from './useDraftData';
import { getTeamLogoPath } from '@/lib/utils/team-utils';
import { getTeamColors } from '@/lib/constants/team-colors';
import DraftPickAnimation from './DraftPickAnimation';
import { getLeagueDrafts, getDraftPicks, getTeamsData, getAllPlayersCached } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';

// Position colors for player cards
const positionColors: Record<string, string> = {
  'QB': '#C00000',
  'RB': '#FFC000',
  'WR': '#0070C0',
  'TE': '#00B050',
  'DEF': '#7030A0',
  'K': '#FF8C42',
};

// Ticker views - tradeInfo only shown if there's a trade, so we filter dynamically
const baseTickerViews = ['bestAvailable', 'teamRecentPicks', 'teamRecord', 'draftCapital', 'draft2025', 'draft2024', 'draft2023'] as const;
type TickerView = typeof baseTickerViews[number] | 'tradeInfo';

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
  // Animation dismissal is handled by onComplete callback, NOT by isNewPick becoming false
  useEffect(() => {
    if (isNewPick && lastPick && lastPick.overall !== lastAnimatedPickRef.current) {
      lastAnimatedPickRef.current = lastPick.overall;
      setShowPickAnimation(true);
    }
    // DO NOT set showPickAnimation to false here - let the animation complete naturally
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
  const [currentTickerView, setCurrentTickerView] = useState<TickerView>(baseTickerViews[0]);
  const cycleTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Draft order data from website
  const [draftOrderData, setDraftOrderData] = useState<{
    slotOrder: Array<{ slot: number; team: string; record: { wins: number; losses: number; fpts: number; fptsAgainst?: number } }>;
    roundsData: Array<{ round: number; picks: Array<{ ownerTeam: string }> }>;
    transfers: Array<{ round: number; fromTeam: string; toTeam: string; summary?: string }>;
  } | null>(null);

  // Historical draft data (keyed by canonical team name)
  const [historicalDrafts, setHistoricalDrafts] = useState<{
    2023: Array<{ team: string; player: string; round: number; pick: number }> | null;
    2024: Array<{ team: string; player: string; round: number; pick: number }> | null;
    2025: Array<{ team: string; player: string; round: number; pick: number }> | null;
  }>({ 2023: null, 2024: null, 2025: null });
  
  // Determine if current pick was acquired via trade (for conditional ticker display)
  const currentPickTradeInfo = (() => {
    if (!currentTeam || !draftOrderData?.transfers || !draft?.curOverall) return null;
    const currentRound = Math.floor((draft.curOverall - 1) / 12) + 1;
    return draftOrderData.transfers.find(t => 
      t.round === currentRound && t.toTeam === currentTeam.name
    ) || null;
  })();
  
  // Build dynamic ticker views - only include tradeInfo if there's a trade
  const tickerViews: TickerView[] = currentPickTradeInfo 
    ? [...baseTickerViews, 'tradeInfo']
    : [...baseTickerViews];

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

  // Fetch historical draft data (2023, 2024, 2025) from Sleeper using getTeamsData for proper team name mapping
  useEffect(() => {
    async function fetchHistoricalDrafts() {
      try {
        const players = await getAllPlayersCached();
        
        // Helper to fetch draft for a given year/league
        const fetchYearDraft = async (leagueId: string): Promise<Array<{ team: string; player: string; round: number; pick: number }>> => {
          const [drafts, teams] = await Promise.all([
            getLeagueDrafts(leagueId),
            getTeamsData(leagueId)
          ]);
          
          if (drafts.length === 0) return [];
          
          // Build roster ID → canonical team name map
          const rosterIdToTeam = new Map(teams.map(t => [t.rosterId, t.teamName]));
          
          const draftPicks = await getDraftPicks(drafts[0].draft_id);
          return draftPicks.map(p => {
            const player = players[p.player_id];
            return {
              team: rosterIdToTeam.get(p.roster_id) || `Roster ${p.roster_id}`,
              player: (player?.first_name && player?.last_name) ? `${player.first_name} ${player.last_name}` : p.player_id,
              round: p.round,
              pick: p.pick_no
            };
          });
        };
        
        // Fetch 2023 draft
        const league2023 = LEAGUE_IDS.PREVIOUS['2023'];
        if (league2023) {
          try {
            const picks2023 = await fetchYearDraft(league2023);
            setHistoricalDrafts(prev => ({ ...prev, 2023: picks2023 }));
          } catch (e) {
            console.error('Failed to fetch 2023 draft:', e);
          }
        }

        // Fetch 2024 draft
        const league2024 = LEAGUE_IDS.PREVIOUS['2024'];
        if (league2024) {
          try {
            const picks2024 = await fetchYearDraft(league2024);
            setHistoricalDrafts(prev => ({ ...prev, 2024: picks2024 }));
          } catch (e) {
            console.error('Failed to fetch 2024 draft:', e);
          }
        }
        
        // Fetch 2025 draft (current year)
        const league2025 = LEAGUE_IDS.CURRENT;
        if (league2025) {
          try {
            const picks2025 = await fetchYearDraft(league2025);
            setHistoricalDrafts(prev => ({ ...prev, 2025: picks2025 }));
          } catch (e) {
            console.error('Failed to fetch 2025 draft:', e);
          }
        }
      } catch (err) {
        console.error('Failed to fetch historical drafts:', err);
      }
    }
    
    fetchHistoricalDrafts();
  }, []);

  // Keep tickerViews in a ref to avoid stale closures in the interval
  const tickerViewsRef = useRef(tickerViews);
  tickerViewsRef.current = tickerViews;

  // Ticker rotation - cycle every 10 seconds
  useEffect(() => {
    const startCycle = () => {
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
      cycleTimerRef.current = setTimeout(() => {
        setCurrentTickerView(prev => {
          const views = tickerViewsRef.current;
          const index = views.indexOf(prev);
          // If current view not in list (e.g., tradeInfo removed), reset to first
          if (index === -1) return views[0];
          return views[(index + 1) % views.length];
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
                    className={`relative text-[10px] px-1 py-[2px] flex flex-row items-center overflow-hidden ${
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
                    {/* Team logo on LEFT side - ALWAYS visible */}
                    <div className="flex-shrink-0 w-6 h-6 mr-1 flex items-center justify-center">
                      {teamLogo ? (
                        <img src={teamLogo} alt="" className="w-full h-full object-contain opacity-40" />
                      ) : gridItem?.team ? (
                        <div className="text-[8px] font-bold text-zinc-500">
                          {gridItem.team.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()}
                        </div>
                      ) : null}
                    </div>
                    
                    {/* Player info - only when picked */}
                    {isPicked && gridItem && (
                      <div className="flex-1 min-w-0">
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

          {/* Team Recent Picks View - only shows picks made by current team */}
          <div style={{ display: currentTickerView === 'teamRecentPicks' ? 'block' : 'none' }}>
            <div className="text-white/80 text-xs font-semibold mb-1">{currentTeam?.name || 'Team'} Picks This Draft</div>
            {currentTeam && draft?.recentPicks ? (() => {
              const teamPicks = draft.recentPicks.filter(p => p.team === currentTeam.name).slice(-6).reverse();
              return teamPicks.length > 0 ? (
                <div className="grid grid-cols-2 gap-1">
                  {teamPicks.map((p) => (
                    <div key={p.overall} className="bg-black/30 rounded px-1 py-[2px] text-[10px]">
                      <div className="font-semibold text-white truncate">#{p.overall}: {p.playerName || p.playerId}</div>
                      <div className="text-white/60 truncate">R{p.round} Pk{((p.overall - 1) % 12) + 1}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-white/60 text-sm">No picks yet this draft</div>;
            })() : <div className="text-white/60 text-sm">Loading...</div>}
          </div>

          {/* Team Record View */}
          <div style={{ display: currentTickerView === 'teamRecord' ? 'block' : 'none' }}>
            <div className="text-white/80 text-xs font-semibold mb-1">2024 Season</div>
            {currentTeam && draftOrderData?.slotOrder ? (() => {
              const teamData = draftOrderData.slotOrder.find(s => s.team === currentTeam.name);
              return teamData ? (
                <div className="text-white text-lg font-bold">
                  {teamData.record.wins}-{teamData.record.losses} • {Math.round(teamData.record.fpts)} PF • {Math.round(teamData.record.fptsAgainst || 0)} PA
                </div>
              ) : <div className="text-white/60 text-sm">Record not available</div>;
            })() : <div className="text-white/60 text-sm">Loading...</div>}
          </div>

          {/* Draft Capital View */}
          <div style={{ display: currentTickerView === 'draftCapital' ? 'block' : 'none' }}>
            <div className="text-white/80 text-xs font-semibold mb-1">Draft Capital</div>
            {currentTeam && draftOrderData?.roundsData ? (() => {
              const teamPicks: string[] = [];
              draftOrderData.roundsData.forEach(rd => {
                rd.picks.forEach((p, idx) => {
                  if (p.ownerTeam === currentTeam.name) {
                    teamPicks.push(`${rd.round}.${String(idx + 1).padStart(2, '0')}`);
                  }
                });
              });
              return teamPicks.length > 0 ? (
                <div className="text-white text-sm">
                  <div className="font-bold mb-1">{teamPicks.length} total pick{teamPicks.length > 1 ? 's' : ''}</div>
                  <div className="text-white/80">{teamPicks.join(', ')}</div>
                </div>
              ) : <div className="text-white text-sm font-bold">This is their only pick</div>;
            })() : <div className="text-white/60 text-sm">Loading...</div>}
          </div>

          {/* 2025 Draft View (Current Year) */}
          <div style={{ display: currentTickerView === 'draft2025' ? 'block' : 'none' }}>
            <div className="text-white/80 text-xs font-semibold mb-1">2025 Draft</div>
            {currentTeam && historicalDrafts[2025] ? (() => {
              const teamPicks = historicalDrafts[2025].filter(p => p.team === currentTeam.name).slice(0, 4);
              return teamPicks.length > 0 ? (
                <div className="text-white text-sm">
                  {teamPicks.map((p, i) => (
                    <div key={i} className="truncate">
                      {p.player} ({p.round}.{String(p.pick % 12 || 12).padStart(2, '0')})
                    </div>
                  ))}
                </div>
              ) : <div className="text-white/60 text-sm">No picks yet in 2025</div>;
            })() : <div className="text-white/60 text-sm">Loading...</div>}
          </div>

          {/* 2024 Draft View */}
          <div style={{ display: currentTickerView === 'draft2024' ? 'block' : 'none' }}>
            <div className="text-white/80 text-xs font-semibold mb-1">2024 Draft</div>
            {currentTeam && historicalDrafts[2024] ? (() => {
              const teamPicks = historicalDrafts[2024].filter(p => p.team === currentTeam.name).slice(0, 3);
              return teamPicks.length > 0 ? (
                <div className="text-white text-sm">
                  {teamPicks.map((p, i) => (
                    <div key={i} className="truncate">
                      {p.player} ({p.round}.{String(p.pick % 12 || 12).padStart(2, '0')})
                    </div>
                  ))}
                </div>
              ) : <div className="text-white/60 text-sm">No picks in 2024</div>;
            })() : <div className="text-white/60 text-sm">Loading...</div>}
          </div>

          {/* 2023 Draft View */}
          <div style={{ display: currentTickerView === 'draft2023' ? 'block' : 'none' }}>
            <div className="text-white/80 text-xs font-semibold mb-1">2023 Draft</div>
            {currentTeam && historicalDrafts[2023] ? (() => {
              const teamPicks = historicalDrafts[2023].filter(p => p.team === currentTeam.name).slice(0, 3);
              return teamPicks.length > 0 ? (
                <div className="text-white text-sm">
                  {teamPicks.map((p, i) => (
                    <div key={i} className="truncate">
                      {p.player} ({p.round}.{String(p.pick % 12 || 12).padStart(2, '0')})
                    </div>
                  ))}
                </div>
              ) : <div className="text-white/60 text-sm">No picks in 2023</div>;
            })() : <div className="text-white/60 text-sm">Loading...</div>}
          </div>

          {/* Trade Info View - only rendered when there's a trade (controlled by tickerViews array) */}
          {currentPickTradeInfo && (
            <div style={{ display: currentTickerView === 'tradeInfo' ? 'block' : 'none' }}>
              <div className="text-white/80 text-xs font-semibold mb-1">Pick Acquired Via Trade</div>
              <div className="text-white text-sm">
                <div className="font-bold mb-1">From {currentPickTradeInfo.fromTeam}</div>
                {currentPickTradeInfo.summary && <div className="text-white/70 text-xs truncate">{currentPickTradeInfo.summary}</div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full Pick Animation */}
      {showPickAnimation && lastPick && lastPick.playerName && (
        <DraftPickAnimation
          key={`pick-animation-${lastPick.overall}`}
          player={{
            name: lastPick.playerName,
            position: lastPick.playerPos || 'N/A',
            team: lastPick.playerNfl || undefined,
            college: undefined,
          }}
          fantasyTeam={{
            name: lastPick.team,
            colors: [getTeamColors(lastPick.team).primary, getTeamColors(lastPick.team).secondary, null],
            logoPath: getTeamLogoPath(lastPick.team),
          }}
          pickNumber={lastPick.overall}
          round={lastPick.round}
          pickInRound={((lastPick.overall - 1) % 12) + 1}
          onComplete={() => {
            console.log('[DraftOverlayLive] Animation complete callback - hiding animation');
            setShowPickAnimation(false);
          }}
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
