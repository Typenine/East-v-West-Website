'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getLeagueDrafts, getDraftPicks, getTeamsData, getAllPlayersCached } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';

const BASE_VIEWS = ['bestAvailable', 'recentPicksAll', 'teamRecord', 'draftCapital', 'topScorers', 'seasonHistory', 'draft2025', 'draft2024'] as const;
type TickerView = typeof BASE_VIEWS[number] | 'teamRecentPicks' | 'tradeInfo';

export interface TickerPlayer { id: string; name: string; pos: string; nfl?: string | null; }
export interface TickerPick { overall: number; team: string; playerName?: string | null; playerPos?: string | null; playerId: string; round?: number; }

interface TopScorer { id: string; name: string; pos: string; pts: number; }
interface SeasonResult {
  season: string; wins: number; losses: number; fpts: number;
  playoffResult: string; playoffOpponent?: string;
  winScore?: number; oppScore?: number; madePlayoffs: boolean;
}

interface Props {
  /** When set, in-draft trades resolve for this draft (required for correct trade ticker). */
  draftId?: string | null;
  /** League size; defaults to 12 if omitted. */
  picksPerRound?: number;
  onClockTeam: string | null;
  available: TickerPlayer[];
  recentPicks?: TickerPick[];
  curOverall?: number;
  usingCustom?: boolean;
  pendingPick: boolean;
}

/** Smaller type for long names — full string always shown (no abbreviation). */
function tickerNameFontSize(name: string | null | undefined): string {
  const n = name?.length ?? 0;
  if (n > 32) return '10px';
  if (n > 24) return '11px';
  if (n > 18) return '12px';
  return '13px';
}

export default function DraftInfoBarTicker({ draftId, picksPerRound = 12, onClockTeam, available, recentPicks, curOverall, usingCustom, pendingPick }: Props) {
  const teamsPerRound = Math.max(1, picksPerRound | 0);
  const [currentTickerView, setCurrentTickerView] = useState<TickerView>('bestAvailable');
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Draft order / record data (fetched once)
  const [draftOrderData, setDraftOrderData] = useState<{
    roundsData: Array<{ round: number; picks: Array<{ ownerTeam: string }> }>;
    transfers: Array<{ round: number; slot: number | null; fromTeam: string; toTeam: string; originalTeam: string; ownerTeam: string; summary?: string }>;
    slotOrder?: Array<{ team: string; record: { wins: number; losses: number; fpts: number; fptsAgainst?: number } }>;
  } | null>(null);

  // Historical Sleeper draft data (fetched once)
  const [historicalDrafts, setHistoricalDrafts] = useState<{
    2024: Array<{ team: string; player: string; pos: string; round: number; pick: number }> | null;
    2025: Array<{ team: string; player: string; pos: string; round: number; pick: number }> | null;
  }>({ 2024: null, 2025: null });

  // In-draft approved current_pick trades (refetched when onClockTeam changes)
  const [approvedPickTrades, setApprovedPickTrades] = useState<Array<{ fromTeam: string; toTeam: string; pickOverall: number }>>([]);

  // Per-team data (refetched when onClockTeam changes)
  const [topScorers, setTopScorers] = useState<TopScorer[] | null>(null);
  const [seasonHistory, setSeasonHistory] = useState<SeasonResult[] | null>(null);
  const lastFetchedTeamRef = useRef<string | null>(null);

  // Build dynamic rotation: insert teamRecentPicks only if team has ≥1 pick AND not pick #1
  const teamPicksThisDraft = (recentPicks || []).filter(p => p.team === onClockTeam);
  const showTeamPicks = teamPicksThisDraft.length > 0 && (curOverall ?? 1) > 1;

  const currentPickTradeInfo = (() => {
    if (!onClockTeam || curOverall == null) return null;
    // Check in-draft trades first (trades made during the draft via DraftTradeCenter)
    const inDraftTrade = approvedPickTrades.find(a => a.pickOverall === curOverall && a.toTeam === onClockTeam);
    if (inDraftTrade) return { round: Math.floor((curOverall - 1) / teamsPerRound) + 1, fromTeam: inDraftTrade.fromTeam, toTeam: inDraftTrade.toTeam };
    // Fall back to pre-draft pick ownership transfers (Sleeper trade history)
    if (!draftOrderData?.transfers) return null;
    const currentRound = Math.floor((curOverall - 1) / teamsPerRound) + 1;
    // Use ownerTeam (final current owner) for matching — more reliable than toTeam which
    // only matches the last direct recipient and can miss multi-hop trades
    const byOwner = draftOrderData.transfers.filter(t => t.round === currentRound && t.ownerTeam === onClockTeam);
    if (byOwner.length > 0) return byOwner[0]; // already sorted newest-first
    // Fallback: direct toTeam match
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
              pos: pl?.position || '',
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

  // Fetch in-draft approved current_pick trades (re-runs on every clock team change)
  useEffect(() => {
    if (!onClockTeam) return;
    fetch(`/api/draft/trade?action=get_team&team=${encodeURIComponent(onClockTeam)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.trades) return;
        const picks: Array<{ fromTeam: string; toTeam: string; pickOverall: number }> = [];
        for (const t of data.trades as Array<{ status: string; assets: Array<{ assetType: string; fromTeam: string; toTeam: string; pickOverall?: number | null }> }>) {
          if (t.status !== 'approved') continue;
          for (const a of t.assets) {
            if (a.assetType === 'current_pick' && a.pickOverall != null) {
              picks.push({ fromTeam: a.fromTeam, toTeam: a.toTeam, pickOverall: a.pickOverall });
            }
          }
        }
        setApprovedPickTrades(picks);
      })
      .catch(() => {});
  }, [onClockTeam]);

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
    fetch(`/api/draft/team-history?team=${enc}&_=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.seasons) setSeasonHistory(data.seasons); })
      .catch(() => {});
  }, [onClockTeam]);

  const teamRecord = draftOrderData?.slotOrder?.find(s => s.team === onClockTeam);
  const allRecentPicks = (recentPicks || []).slice(-6);

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
        <div className="text-[11px] font-black text-white/90 uppercase tracking-wider mb-2 text-center">Best Available{usingCustom ? ' · Custom' : ''}</div>
        <div className="grid grid-cols-5 gap-1">
          {available.slice(0, 10).map((p, i) => (
            <div key={p.id} className="bg-black/30 rounded px-1.5 py-1.5">
              <div className="font-semibold text-white leading-tight break-words" style={{ fontSize: tickerNameFontSize(p.name) }}>{i + 1}. {p.name}</div>
              <div className="text-[11px] text-white/55 leading-tight">{p.pos}{p.nfl ? ` · ${p.nfl}` : ''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* All-team Recent Picks */}
      <div style={{ display: currentTickerView === 'recentPicksAll' ? 'block' : 'none' }}>
        <div className="text-[11px] font-black text-white/90 uppercase tracking-wider mb-2 text-center">Recent Picks</div>
        {allRecentPicks.length > 0 ? (
          <div className="grid grid-cols-3 gap-1">
            {allRecentPicks.map(p => (
              <div key={p.overall} className="bg-black/30 rounded px-1.5 py-1.5">
                <div className="text-[13px] font-semibold text-white leading-tight">
                  <span className="text-white/45 mr-1">#{p.overall}</span><span className="break-words" style={{ fontSize: tickerNameFontSize(p.playerName || p.playerId) }}>{p.playerName || p.playerId}</span>
                </div>
                <div className="text-[11px] text-white/55 leading-tight">{p.playerPos ? `${p.playerPos} · ` : ''}{p.team}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">No picks yet</div>
        )}
      </div>

      {/* Team Picks This Draft (conditional) */}
      {showTeamPicks && (
        <div style={{ display: currentTickerView === 'teamRecentPicks' ? 'block' : 'none' }}>
          <div className="text-[11px] font-black text-white/90 uppercase tracking-wider mb-2 text-center">{onClockTeam} · Picks This Draft</div>
          <div className="grid grid-cols-3 gap-1">
            {teamPicksThisDraft.slice().reverse().slice(0, 6).map(p => (
              <div key={p.overall} className="bg-black/30 rounded px-1.5 py-1.5">
                <div className="font-semibold text-white leading-tight break-words" style={{ fontSize: tickerNameFontSize(p.playerName || p.playerId) }}>{p.playerName || p.playerId}</div>
                <div className="text-[11px] text-white/55 leading-tight">{p.playerPos ? `${p.playerPos} · ` : ''}#{p.overall} · R{p.round ?? Math.floor((p.overall - 1) / teamsPerRound) + 1} Pk{((p.overall - 1) % teamsPerRound) + 1}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Record */}
      <div style={{ display: currentTickerView === 'teamRecord' ? 'block' : 'none' }}>
        <div className="text-[11px] font-black text-white/90 uppercase tracking-wider mb-2 text-center">2025 Season Record</div>
        {teamRecord ? (
          <div className="grid grid-cols-4 gap-1">
            {[
              { val: teamRecord.record.wins,                          lbl: 'Wins' },
              { val: teamRecord.record.losses,                        lbl: 'Losses' },
              { val: Math.round(teamRecord.record.fpts),              lbl: 'Pts For' },
              { val: Math.round(teamRecord.record.fptsAgainst || 0),  lbl: 'Pts Agn' },
            ].map(({ val, lbl }) => (
              <div key={lbl} className="bg-black/30 rounded px-1.5 py-1.5 text-center">
                <div className="text-[18px] font-black text-white leading-tight">{val}</div>
                <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wide leading-tight">{lbl}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">
            {draftOrderData ? 'Record not available' : 'Loading...'}
          </div>
        )}
      </div>

      {/* Draft Capital */}
      <div style={{ display: currentTickerView === 'draftCapital' ? 'block' : 'none' }}>
        <div className="text-[11px] font-black text-white/90 uppercase tracking-wider mb-2 text-center">Draft Capital</div>
        {draftOrderData?.roundsData ? (() => {
          const teamPicks: string[] = [];
          draftOrderData.roundsData.forEach(rd => {
            rd.picks.forEach((p, idx) => {
              if (p.ownerTeam === onClockTeam) teamPicks.push(`${rd.round}.${String(idx + 1).padStart(2, '0')}`);
            });
          });
          return (
            <div className="flex flex-wrap gap-1 items-start">
              <div className="bg-black/30 rounded px-1.5 py-1.5">
                <div className="text-[18px] font-black text-white leading-tight">{teamPicks.length || 1}</div>
                <div className="text-[10px] font-semibold text-white/50 uppercase tracking-wide leading-tight">Picks</div>
              </div>
              {teamPicks.map(slot => (
                <div key={slot} className="bg-black/30 rounded px-1.5 py-1.5 text-center">
                  <div className="text-[13px] font-bold text-white leading-tight">{slot}</div>
                </div>
              ))}
            </div>
          );
        })() : (
          <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">Loading...</div>
        )}
      </div>

      {/* Top 5 Scorers — 2025 season */}
      <div style={{ display: currentTickerView === 'topScorers' ? 'block' : 'none' }}>
        <div className="text-[11px] font-black text-white/90 uppercase tracking-wider mb-2 text-center">Top Scorers · 2025 Season</div>
        {topScorers ? (
          topScorers.length > 0 ? (
            <div className="grid grid-cols-5 gap-1">
              {topScorers.map((p, i) => (
                <div key={p.id} className="bg-black/30 rounded px-1.5 py-1.5">
                  <div className="font-semibold text-white leading-tight break-words" style={{ fontSize: tickerNameFontSize(p.name) }}>{i + 1}. {p.name}</div>
                  <div className="text-[11px] text-white/55 leading-tight">{p.pos} · {p.pts}pts</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">No data available</div>
          )
        ) : (
          <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">Loading...</div>
        )}
      </div>

      {/* Season History — last 3 seasons */}
      <div style={{ display: currentTickerView === 'seasonHistory' ? 'block' : 'none' }}>
        <div className="text-[11px] font-black text-white/90 uppercase tracking-wider mb-2 text-center">Season History</div>
        {seasonHistory ? (
          seasonHistory.length > 0 ? (
            <div className="grid grid-cols-3 gap-1">
              {seasonHistory.map(s => (
                <div key={s.season} className="bg-black/30 rounded px-1.5 py-1.5">
                  <div className="text-[10px] font-bold text-white/50 uppercase tracking-wide leading-tight mb-0.5">{s.season}</div>
                  <div className="text-[16px] font-black text-white leading-tight">{s.wins}–{s.losses}</div>
                  <div className="text-[11px] font-semibold text-white/80 truncate leading-tight">{s.playoffResult}</div>
                  {s.playoffOpponent && (
                    <div className="text-[11px] text-white/50 truncate leading-tight">
                      vs {s.playoffOpponent}{s.winScore != null && s.oppScore != null ? ` ${s.winScore}–${s.oppScore}` : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">No history available</div>
          )
        ) : (
          <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">Loading...</div>
        )}
      </div>

      {/* 2025 Draft */}
      <div style={{ display: currentTickerView === 'draft2025' ? 'block' : 'none' }}>
        <div className="text-[11px] font-black text-white/90 uppercase tracking-wider mb-2 text-center">2025 Draft Picks</div>
        {historicalDrafts[2025] ? (() => {
          const picks = historicalDrafts[2025]!.filter(p => p.team === onClockTeam).slice(0, 5);
          return picks.length > 0 ? (
            <div className="grid grid-cols-5 gap-1">
              {picks.map((p, i) => (
                <div key={i} className="bg-black/30 rounded px-1.5 py-1.5">
                  <div className="font-semibold text-white leading-tight break-words" style={{ fontSize: tickerNameFontSize(p.player) }}>{p.player}</div>
                  <div className="text-[11px] text-white/55 leading-tight">{p.pos ? `${p.pos} · ` : ''}{p.round}.{String(p.pick % teamsPerRound || teamsPerRound).padStart(2, '0')}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">No picks in 2025</div>
          );
        })() : (
          <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">Loading...</div>
        )}
      </div>

      {/* 2024 Draft */}
      <div style={{ display: currentTickerView === 'draft2024' ? 'block' : 'none' }}>
        <div className="text-[11px] font-black text-white/90 uppercase tracking-wider mb-2 text-center">2024 Draft Picks</div>
        {historicalDrafts[2024] ? (() => {
          const picks = historicalDrafts[2024]!.filter(p => p.team === onClockTeam).slice(0, 5);
          return picks.length > 0 ? (
            <div className="grid grid-cols-5 gap-1">
              {picks.map((p, i) => (
                <div key={i} className="bg-black/30 rounded px-1.5 py-1.5">
                  <div className="font-semibold text-white leading-tight break-words" style={{ fontSize: tickerNameFontSize(p.player) }}>{p.player}</div>
                  <div className="text-[11px] text-white/55 leading-tight">{p.pos ? `${p.pos} · ` : ''}{p.round}.{String(p.pick % teamsPerRound || teamsPerRound).padStart(2, '0')}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">No picks in 2024</div>
          );
        })() : (
          <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">Loading...</div>
        )}
      </div>

      {/* Trade Info */}
      {currentPickTradeInfo && (
        <div style={{ display: currentTickerView === 'tradeInfo' ? 'block' : 'none' }}>
          <div className="text-[11px] font-black text-white/90 uppercase tracking-wider mb-2 text-center">Pick Acquired via Trade</div>
          <div className="grid grid-cols-2 gap-1">
            <div className="bg-black/30 rounded px-1.5 py-1.5">
              <div className="text-[10px] text-white/50 leading-tight uppercase tracking-wide">Traded From</div>
              <div className="text-[13px] font-bold text-white truncate leading-tight">{currentPickTradeInfo.fromTeam}</div>
            </div>
            {(() => {
              const full = currentPickTradeInfo as { originalTeam?: string; summary?: string };
              if (full.originalTeam && full.originalTeam !== currentPickTradeInfo.fromTeam) {
                return (
                  <div className="bg-black/30 rounded px-1.5 py-1.5">
                    <div className="text-[10px] text-white/50 leading-tight uppercase tracking-wide">Original Slot</div>
                    <div className="text-[11px] font-semibold text-white/80 truncate leading-tight">{full.originalTeam}</div>
                  </div>
                );
              }
              if (full.summary) {
                return (
                  <div className="bg-black/30 rounded px-1.5 py-1.5">
                    <div className="text-[10px] text-white/50 leading-tight uppercase tracking-wide">Details</div>
                    <div className="text-[11px] text-white/80 truncate leading-tight">{full.summary}</div>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>
      )}
    </>
  );
}
