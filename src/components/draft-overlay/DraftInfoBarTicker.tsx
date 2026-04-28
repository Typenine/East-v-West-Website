'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getLeagueDrafts, getDraftPicks, getTeamsData, getAllPlayersCached } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';

const BASE_VIEWS = ['bestAvailable', 'recentPicksAll', 'teamRecord', 'draftCapital', 'topScorers', 'seasonHistory', 'draft2025', 'draft2024'] as const;
type TickerView = typeof BASE_VIEWS[number] | 'teamRecentPicks' | 'tradeInfo';

export interface TickerPlayer { id: string; name: string; pos: string; nfl?: string | null; }
export interface TickerPick { overall: number; team: string; playerName?: string | null; playerId: string; round?: number; }

interface TopScorer { id: string; name: string; pos: string; pts: number; }
interface SeasonResult {
  season: string; wins: number; losses: number; fpts: number;
  playoffResult: string; playoffOpponent?: string;
  winScore?: number; oppScore?: number; madePlayoffs: boolean;
}

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

  // Draft order / record data (fetched once)
  const [draftOrderData, setDraftOrderData] = useState<{
    roundsData: Array<{ round: number; picks: Array<{ ownerTeam: string }> }>;
    transfers: Array<{ round: number; fromTeam: string; toTeam: string; summary?: string }>;
    slotOrder?: Array<{ team: string; record: { wins: number; losses: number; fpts: number; fptsAgainst?: number } }>;
  } | null>(null);

  // Historical Sleeper draft data (fetched once)
  const [historicalDrafts, setHistoricalDrafts] = useState<{
    2024: Array<{ team: string; player: string; round: number; pick: number }> | null;
    2025: Array<{ team: string; player: string; round: number; pick: number }> | null;
  }>({ 2024: null, 2025: null });

  // Per-team data (refetched when onClockTeam changes)
  const [topScorers, setTopScorers] = useState<TopScorer[] | null>(null);
  const [seasonHistory, setSeasonHistory] = useState<SeasonResult[] | null>(null);
  const lastFetchedTeamRef = useRef<string | null>(null);

  // Build dynamic rotation: insert teamRecentPicks only if team has ≥1 pick AND not pick #1
  const teamPicksThisDraft = (recentPicks || []).filter(p => p.team === onClockTeam);
  const showTeamPicks = teamPicksThisDraft.length > 0 && (curOverall ?? 1) > 1;

  const currentPickTradeInfo = (() => {
    if (!onClockTeam || !draftOrderData?.transfers || !curOverall) return null;
    const currentRound = Math.floor((curOverall - 1) / 12) + 1;
    return draftOrderData.transfers.find(t => t.round === currentRound && t.toTeam === onClockTeam) || null;
  })();

  const tickerViews: TickerView[] = [
    ...BASE_VIEWS,
    ...(showTeamPicks ? ['teamRecentPicks' as TickerView] : []),
    ...(currentPickTradeInfo ? ['tradeInfo' as TickerView] : []),
  ];
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

  // Fetch draft order / record (once)
  useEffect(() => {
    fetch('/api/draft/next-order', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setDraftOrderData(data); })
      .catch(() => {});
  }, []);

  // Fetch historical Sleeper draft picks (once)
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

  // Fetch top scorers + season history when on-clock team changes
  useEffect(() => {
    if (!onClockTeam || onClockTeam === lastFetchedTeamRef.current) return;
    lastFetchedTeamRef.current = onClockTeam;
    setTopScorers(null);
    setSeasonHistory(null);
    const enc = encodeURIComponent(onClockTeam);
    fetch(`/api/draft/team-season-stats?team=${enc}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.players) setTopScorers(data.players); })
      .catch(() => {});
    fetch(`/api/draft/team-history?team=${enc}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.seasons) setSeasonHistory(data.seasons); })
      .catch(() => {});
  }, [onClockTeam]);

  const teamRecord = draftOrderData?.slotOrder?.find(s => s.team === onClockTeam);
  const allRecentPicks = (recentPicks || []).slice().reverse().slice(0, 6);

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

      {/* All-team Recent Picks */}
      <div style={{ display: currentTickerView === 'recentPicksAll' ? 'block' : 'none' }}>
        <div className="text-white/80 text-xs font-semibold mb-1">Recent Picks</div>
        {allRecentPicks.length > 0 ? (
          <div className="space-y-[2px]">
            {allRecentPicks.map(p => (
              <div key={p.overall} className="flex items-center gap-1.5 text-[10px]">
                <span className="text-white/50 w-5 text-right shrink-0">#{p.overall}</span>
                <span className="font-semibold text-white truncate flex-1">{p.playerName || p.playerId}</span>
                <span className="text-white/60 shrink-0">{p.team}</span>
              </div>
            ))}
          </div>
        ) : <div className="text-white/60 text-sm">No picks yet</div>}
      </div>

      {/* Team Picks This Draft (conditional — only shown when team has ≥1 pick) */}
      {showTeamPicks && (
        <div style={{ display: currentTickerView === 'teamRecentPicks' ? 'block' : 'none' }}>
          <div className="text-white/80 text-xs font-semibold mb-1">{onClockTeam} Picks This Draft</div>
          <div className="grid grid-cols-2 gap-1">
            {teamPicksThisDraft.slice().reverse().slice(0, 6).map(p => (
              <div key={p.overall} className="bg-black/30 rounded px-1 py-[2px] text-[10px]">
                <div className="font-semibold text-white truncate">#{p.overall}: {p.playerName || p.playerId}</div>
                <div className="text-white/60 truncate">R{p.round} Pk{((p.overall - 1) % 12) + 1}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Record (last season) */}
      <div style={{ display: currentTickerView === 'teamRecord' ? 'block' : 'none' }}>
        <div className="text-white/80 text-xs font-semibold mb-1">2025 Season Record</div>
        {teamRecord ? (
          <div className="text-white text-lg font-bold">
            {teamRecord.record.wins}-{teamRecord.record.losses} &bull; {Math.round(teamRecord.record.fpts)} PF &bull; {Math.round(teamRecord.record.fptsAgainst || 0)} PA
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

      {/* Top 5 Scorers — 2025 season */}
      <div style={{ display: currentTickerView === 'topScorers' ? 'block' : 'none' }}>
        <div className="text-white/80 text-xs font-semibold mb-1">Top Scorers — 2025 Season</div>
        {topScorers ? (
          topScorers.length > 0 ? (
            <div className="space-y-[2px]">
              {topScorers.map((p, i) => (
                <div key={p.id} className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-white/50 w-4 shrink-0">{i + 1}.</span>
                  <span className="font-semibold text-white truncate flex-1">{p.name}</span>
                  <span className="text-white/60 shrink-0">{p.pos}</span>
                  <span className="font-bold text-white shrink-0">{p.pts} pts</span>
                </div>
              ))}
            </div>
          ) : <div className="text-white/60 text-sm">No data available</div>
        ) : <div className="text-white/60 text-sm">Loading...</div>}
      </div>

      {/* Season History — last 3 seasons */}
      <div style={{ display: currentTickerView === 'seasonHistory' ? 'block' : 'none' }}>
        <div className="text-white/80 text-xs font-semibold mb-1">Season History</div>
        {seasonHistory ? (
          seasonHistory.length > 0 ? (
            <div className="space-y-[3px]">
              {seasonHistory.map(s => (
                <div key={s.season} className="text-[10px]">
                  <span className="text-white/50 font-semibold mr-1.5">{s.season}</span>
                  <span className="font-bold text-white mr-1.5">{s.wins}-{s.losses}</span>
                  <span className="text-white/70">{s.playoffResult}</span>
                  {s.playoffOpponent && (
                    <span className="text-white/50">
                      {' '}vs {s.playoffOpponent}
                      {s.winScore != null && s.oppScore != null && ` (${s.winScore}–${s.oppScore})`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : <div className="text-white/60 text-sm">No history available</div>
        ) : <div className="text-white/60 text-sm">Loading...</div>}
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
