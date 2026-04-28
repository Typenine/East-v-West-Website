'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getLeagueDrafts, getDraftPicks, getTeamsData, getAllPlayersCached } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';

const baseTickerViews = ['bestAvailable', 'teamRecentPicks', 'teamRecord', 'draftCapital', 'draft2025', 'draft2024'] as const;
type TickerView = typeof baseTickerViews[number] | 'tradeInfo';

export interface TickerPlayer { id: string; name: string; pos: string; nfl?: string | null; }
export interface TickerPick { overall: number; team: string; playerName?: string | null; playerId: string; round?: number; }

interface Props {
  onClockTeam: string | null;
  available: TickerPlayer[];
  recentPicks?: TickerPick[];
  curOverall?: number;
  usingCustom?: boolean;
  pendingPick: boolean;
}

export default function DraftInfoBarTicker({ onClockTeam, available, recentPicks, curOverall, usingCustom, pendingPick }: Props) {
  const [currentTickerView, setCurrentTickerView] = useState<TickerView>('bestAvailable');
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draftOrderData, setDraftOrderData] = useState<{
    roundsData: Array<{ round: number; picks: Array<{ ownerTeam: string }> }>;
    transfers: Array<{ round: number; fromTeam: string; toTeam: string; summary?: string }>;
    slotOrder?: Array<{ team: string; record: { wins: number; losses: number; fpts: number; fptsAgainst?: number } }>;
  } | null>(null);
  const [historicalDrafts, setHistoricalDrafts] = useState<{
    2024: Array<{ team: string; player: string; round: number; pick: number }> | null;
    2025: Array<{ team: string; player: string; round: number; pick: number }> | null;
  }>({ 2024: null, 2025: null });

  const currentPickTradeInfo = (() => {
    if (!onClockTeam || !draftOrderData?.transfers || !curOverall) return null;
    const currentRound = Math.floor((curOverall - 1) / 12) + 1;
    return draftOrderData.transfers.find(t => t.round === currentRound && t.toTeam === onClockTeam) || null;
  })();

  const tickerViews: TickerView[] = currentPickTradeInfo ? [...baseTickerViews, 'tradeInfo'] : [...baseTickerViews];
  const tickerViewsRef = useRef(tickerViews);
  tickerViewsRef.current = tickerViews;

  // Cycle every 10 seconds
  useEffect(() => {
    const startCycle = () => {
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
      cycleTimerRef.current = setTimeout(() => {
        setCurrentTickerView(prev => {
          const views = tickerViewsRef.current;
          const index = views.indexOf(prev);
          if (index === -1) return views[0];
          return views[(index + 1) % views.length];
        });
        startCycle();
      }, 10000);
    };
    startCycle();
    return () => { if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current); };
  }, []);

  // Fetch draft order / record data
  useEffect(() => {
    fetch('/api/draft/next-order', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setDraftOrderData(data); })
      .catch(() => {});
  }, []);

  // Fetch historical Sleeper draft data
  useEffect(() => {
    async function run() {
      try {
        const players = await getAllPlayersCached();
        const fetchYear = async (leagueId: string) => {
          const [drafts, teams] = await Promise.all([getLeagueDrafts(leagueId), getTeamsData(leagueId)]);
          if (!drafts.length) return [];
          const rIdToTeam = new Map(teams.map(t => [t.rosterId, t.teamName]));
          const picks = await getDraftPicks(drafts[0].draft_id);
          return picks.map(p => {
            const pl = players[p.player_id];
            return {
              team: rIdToTeam.get(p.roster_id) || `Roster ${p.roster_id}`,
              player: (pl?.first_name && pl?.last_name) ? `${pl.first_name} ${pl.last_name}` : p.player_id,
              round: p.round, pick: p.pick_no,
            };
          });
        };
        const l24 = (LEAGUE_IDS.PREVIOUS as Record<string, string> | undefined)?.['2024'];
        if (l24) { try { const p = await fetchYear(l24); setHistoricalDrafts(prev => ({ ...prev, 2024: p })); } catch {} }
        const l25 = LEAGUE_IDS.CURRENT;
        if (l25) { try { const p = await fetchYear(l25); setHistoricalDrafts(prev => ({ ...prev, 2025: p })); } catch {} }
      } catch {}
    }
    run();
  }, []);

  const teamRecentPicks = (recentPicks || []).filter(p => p.team === onClockTeam).slice(-6).reverse();
  const teamRecord = draftOrderData?.slotOrder?.find(s => s.team === onClockTeam);

  if (pendingPick) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20" style={{ background: 'linear-gradient(135deg,rgba(0,0,0,0.92),rgba(30,10,0,0.96))' }}>
        <div className="text-4xl font-black text-white tracking-widest uppercase animate-pulse">PICK IS IN</div>
      </div>
    );
  }

  return (
    <>
      {/* Best Available */}
      <div style={{ display: currentTickerView === 'bestAvailable' ? 'block' : 'none' }}>
        <div className="text-white/80 text-xs font-semibold mb-1">Best Available{usingCustom ? ' (Custom)' : ''}</div>
        <div className="grid grid-cols-5 gap-1">
          {available.slice(0, 10).map((p, i) => (
            <div key={p.id} className="bg-black/30 rounded px-1 py-[2px] text-[10px]">
              <div className="font-semibold text-white truncate">{i + 1}. {p.name}</div>
              <div className="text-white/60 truncate">{p.pos} - {p.nfl || '-'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Team Recent Picks */}
      <div style={{ display: currentTickerView === 'teamRecentPicks' ? 'block' : 'none' }}>
        <div className="text-white/80 text-xs font-semibold mb-1">{onClockTeam || 'Team'} Picks This Draft</div>
        {teamRecentPicks.length > 0 ? (
          <div className="grid grid-cols-2 gap-1">
            {teamRecentPicks.map(p => (
              <div key={p.overall} className="bg-black/30 rounded px-1 py-[2px] text-[10px]">
                <div className="font-semibold text-white truncate">#{p.overall}: {p.playerName || p.playerId}</div>
                <div className="text-white/60 truncate">R{p.round} Pk{((p.overall - 1) % 12) + 1}</div>
              </div>
            ))}
          </div>
        ) : <div className="text-white/60 text-sm">No picks yet this draft</div>}
      </div>

      {/* Team Record */}
      <div style={{ display: currentTickerView === 'teamRecord' ? 'block' : 'none' }}>
        <div className="text-white/80 text-xs font-semibold mb-1">2024 Season</div>
        {teamRecord ? (
          <div className="text-white text-lg font-bold">
            {teamRecord.record.wins}-{teamRecord.record.losses} • {Math.round(teamRecord.record.fpts)} PF • {Math.round(teamRecord.record.fptsAgainst || 0)} PA
          </div>
        ) : <div className="text-white/60 text-sm">{draftOrderData ? 'Record not available' : 'Loading...'}</div>}
      </div>

      {/* Draft Capital */}
      <div style={{ display: currentTickerView === 'draftCapital' ? 'block' : 'none' }}>
        <div className="text-white/80 text-xs font-semibold mb-1">Draft Capital</div>
        {draftOrderData?.roundsData ? (() => {
          const teamPicks: string[] = [];
          draftOrderData.roundsData.forEach(rd => {
            rd.picks.forEach((p, idx) => {
              if (p.ownerTeam === onClockTeam) teamPicks.push(`${rd.round}.${String(idx + 1).padStart(2, '0')}`);
            });
          });
          return teamPicks.length > 0 ? (
            <div className="text-white text-sm">
              <div className="font-bold mb-1">{teamPicks.length} total pick{teamPicks.length !== 1 ? 's' : ''}</div>
              <div className="text-white/80">{teamPicks.join(', ')}</div>
            </div>
          ) : <div className="text-white text-sm font-bold">This is their only pick</div>;
        })() : <div className="text-white/60 text-sm">Loading...</div>}
      </div>

      {/* 2025 Draft */}
      <div style={{ display: currentTickerView === 'draft2025' ? 'block' : 'none' }}>
        <div className="text-white/80 text-xs font-semibold mb-1">2025 Draft</div>
        {historicalDrafts[2025] ? (() => {
          const picks = historicalDrafts[2025]!.filter(p => p.team === onClockTeam).slice(0, 4);
          return picks.length > 0 ? (
            <div className="text-white text-sm">
              {picks.map((p, i) => <div key={i} className="truncate">{p.player} ({p.round}.{String(p.pick % 12 || 12).padStart(2, '0')})</div>)}
            </div>
          ) : <div className="text-white/60 text-sm">No picks in 2025</div>;
        })() : <div className="text-white/60 text-sm">Loading...</div>}
      </div>

      {/* 2024 Draft */}
      <div style={{ display: currentTickerView === 'draft2024' ? 'block' : 'none' }}>
        <div className="text-white/80 text-xs font-semibold mb-1">2024 Draft</div>
        {historicalDrafts[2024] ? (() => {
          const picks = historicalDrafts[2024]!.filter(p => p.team === onClockTeam).slice(0, 3);
          return picks.length > 0 ? (
            <div className="text-white text-sm">
              {picks.map((p, i) => <div key={i} className="truncate">{p.player} ({p.round}.{String(p.pick % 12 || 12).padStart(2, '0')})</div>)}
            </div>
          ) : <div className="text-white/60 text-sm">No picks in 2024</div>;
        })() : <div className="text-white/60 text-sm">Loading...</div>}
      </div>

      {/* Trade Info (only when pick was acquired via trade) */}
      {currentPickTradeInfo && (
        <div style={{ display: currentTickerView === 'tradeInfo' ? 'block' : 'none' }}>
          <div className="text-white/80 text-xs font-semibold mb-1">Pick Acquired Via Trade</div>
          <div className="text-white text-sm">
            <div className="font-bold mb-1">From {currentPickTradeInfo.fromTeam}</div>
            {currentPickTradeInfo.summary && <div className="text-white/70 text-xs truncate">{currentPickTradeInfo.summary}</div>}
          </div>
        </div>
      )}
    </>
  );
}
