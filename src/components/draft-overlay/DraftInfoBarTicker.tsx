'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getLeagueDrafts, getDraftPicks, getTeamsData, getAllPlayersCached } from '@/lib/utils/sleeper-api';
import { CURRENT_SEASON, getLeagueIdForSeason } from '@/lib/constants/league';

const BASE_VIEWS = ['bestAvailable', 'recentPicksAll', 'teamRecord', 'draftCapital', 'topScorers', 'seasonHistory', 'draft2025', 'draft2024'] as const;
type TickerView = typeof BASE_VIEWS[number] | 'teamRecentPicks' | 'tradeInfo';

export interface TickerPlayer { id: string; name: string; pos: string; nfl?: string | null; }
export interface TickerPick { overall: number; team: string; playerName?: string | null; playerPos?: string | null; playerId: string; round?: number; }

interface TopScorer { id: string; name: string; pos: string; pts: number; }
interface SeasonResult {
  season: string; wins: number; losses: number; ties: number; fpts: number; fptsAgainst: number;
  recordRank: number; fptsRank: number; fptsAgainstRank: number;
}

const CANONICAL_SEASON_RESULTS: Record<string, Partial<Record<'2023' | '2024' | '2025', string>>> = {
  'Belltown Raptors': {
    '2023': 'Did not make playoffs',
    '2024': 'Champion (Double Trouble 138.76 - 127.24)',
    '2025': 'Fourth Place (Mt. Lebanon Cake Eaters 101.58 - 125.88)',
  },
  'Belleview Badgers': {
    '2023': 'Lost 1st Round (Detroit Dawgs 120.02 - 141.98)',
    '2024': 'Third Place (Detroit Dawgs 163.92 - 129.86)',
    '2025': 'Lost 1st Round (Belltown Raptors 133.52 - 145.10)',
  },
  'Red Pandas': {
    '2023': 'Did not make playoffs',
    '2024': 'Did not make playoffs',
    '2025': 'Did not make playoffs',
  },
  'Double Trouble': {
    '2023': 'Champion (Elemental Heroes 185.88 - 85.78)',
    '2024': 'Runner-up (Belltown Raptors 127.24 - 138.76)',
    '2025': 'Runner-up (BeerNeverBrokeMyHeart 85.78 - 109.28)',
  },
  'Mt. Lebanon Cake Eaters': {
    '2023': 'Lost 1st Round (BeerNeverBrokeMyHeart 92.88 - 118.76)',
    '2024': 'Lost 1st Round (Belltown Raptors 109.40 - 149.10)',
    '2025': 'Third Place (Belltown Raptors 125.88 - 101.88)',
  },
  'Elemental Heroes': {
    '2023': 'Runner-up (Double Trouble 85.78 - 185.88)',
    '2024': 'Lost 1st Round (Detroit Dawgs 126.42 - 200.78)',
    '2025': 'Lost 1st Round (BeerNeverBrokeMyHeart 142.68 - 209.10)',
  },
  'bop pop': {
    '2023': 'Lost 1st Round (Double Trouble 119.18 - 144.76)',
    '2024': 'Lost 1st Round (Double Trouble 109.64 - 234.06)',
    '2025': 'Lost 1st Round (Mt. Lebanon Cake Eaters 107.24 - 110.06)',
  },
  'Bimg Bamg Boomg': {
    '2023': 'Did not make playoffs',
    '2024': 'Did not make playoffs',
    '2025': 'Lost 1st Round (Double Trouble 123.50 - 188.82)',
  },
  'Detroit Dawgs': {
    '2023': 'Third Place (BeerNeverBrokeMyHeart 160.36 - 99.32)',
    '2024': 'Fourth Place (Belleview Badgers 129.86 - 163.92)',
    '2025': 'Did not make playoffs',
  },
  'The Lone Ginger': {
    '2023': 'Did not make playoffs',
    '2024': 'Did not make playoffs',
    '2025': 'Did not make playoffs',
  },
  'Minshew\'s Maniacs': {
    '2023': 'Lost 1st Round',
    '2024': 'Did not make playoffs',
    '2025': 'Did not make playoffs',
  },
  'BeerNeverBrokeMyHeart': {
    '2023': 'Fourth Place (Detroit Dawgs 99.32 - 160.36)',
    '2024': 'Lost 1st Round (Belleview Badgers 112.38 - 129.92)',
    '2025': 'Champion (Double Trouble 109.28 - 85.78)',
  },
};

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

/** Scales down only for very long names — keeps everything legible at TV distance. */
function tickerNameFontSize(name: string | null | undefined): string {
  const n = name?.length ?? 0;
  if (n > 30) return '14px';
  if (n > 22) return '16px';
  if (n > 16) return '18px';
  return '20px';
}

export default function DraftInfoBarTicker({ picksPerRound = 12, onClockTeam, available, recentPicks, curOverall, pendingPick }: Props) {
  const teamsPerRound = Math.max(1, picksPerRound | 0);
  const [currentTickerView, setCurrentTickerView] = useState<TickerView>('bestAvailable');
  const cycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Draft order / record data (fetched once)
  const [draftOrderData, setDraftOrderData] = useState<{
    roundsData: Array<{ round: number; picks: Array<{ ownerTeam: string }> }>;
    transfers: Array<{ round: number; slot: number | null; fromTeam: string; toTeam: string; originalTeam: string; ownerTeam: string; summary?: string }>;
    slotOrder?: Array<{ team: string; record: { wins: number; losses: number; fpts: number; fptsAgainst?: number } }>;
  } | null>(null);

  const completedSeason = Number(CURRENT_SEASON) - 1;
  const priorSeason = completedSeason - 1;

  // Historical Sleeper draft data (fetched once)
  const [historicalDrafts, setHistoricalDrafts] = useState<
    Record<number, Array<{ team: string; player: string; pos: string; round: number; pick: number }> | null>
  >({
    [completedSeason]: null,
    [priorSeason]: null,
  });

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
    const currentSlot = ((curOverall - 1) % teamsPerRound) + 1;
    // Use ownerTeam (final current owner) for matching — more reliable than toTeam which
    // only matches the last direct recipient and can miss multi-hop trades
    const byOwner = draftOrderData.transfers.filter(
      t => t.round === currentRound && t.slot === currentSlot && t.ownerTeam === onClockTeam
    );
    if (byOwner.length > 0) return byOwner[0]; // already sorted newest-first
    // Fallback: direct toTeam match
    return (
      draftOrderData.transfers.find(
        t => t.round === currentRound && t.slot === currentSlot && t.toTeam === onClockTeam
      ) || null
    );
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
        const leagueCompleted = getLeagueIdForSeason(String(completedSeason));
        if (leagueCompleted) {
          try {
            const p = await fetchYear(leagueCompleted);
            setHistoricalDrafts(prev => ({ ...prev, [completedSeason]: p }));
          } catch {}
        }
        const leaguePrior = getLeagueIdForSeason(String(priorSeason));
        if (leaguePrior) {
          try {
            const p = await fetchYear(leaguePrior);
            setHistoricalDrafts(prev => ({ ...prev, [priorSeason]: p }));
          } catch {}
        }
      } catch {}
    }
    run();
  }, [completedSeason, priorSeason]);

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
        <div className="text-sm font-black text-white/90 uppercase tracking-wider mb-2 text-center">Best Available</div>
        <div className="grid grid-cols-5 gap-1">
          {available.slice(0, 10).map((p, i) => (
            <div key={p.id} className="bg-black/30 rounded px-1.5 py-1.5">
              <div className="font-semibold text-white leading-tight break-words" style={{ fontSize: tickerNameFontSize(p.name) }}>{i + 1}. {p.name}</div>
              <div className="text-sm text-white/55 leading-tight">{p.pos}{p.nfl ? ` · ${p.nfl}` : ''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* All-team Recent Picks */}
      <div style={{ display: currentTickerView === 'recentPicksAll' ? 'block' : 'none' }}>
        <div className="text-sm font-black text-white/90 uppercase tracking-wider mb-2 text-center">Recent Picks</div>
        {allRecentPicks.length > 0 ? (
          <div className="grid grid-cols-3 gap-1">
            {allRecentPicks.map(p => (
              <div key={p.overall} className="bg-black/30 rounded px-1.5 py-1.5">
                <div className="font-semibold text-white leading-tight break-words" style={{ fontSize: tickerNameFontSize(p.playerName || p.playerId) }}>
                  <span className="text-white/45 mr-1">#{p.overall}</span>{p.playerName || p.playerId}
                </div>
                <div className="text-sm text-white/55 leading-tight">{p.playerPos ? `${p.playerPos} · ` : ''}{p.team}</div>
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
          <div className="text-sm font-black text-white/90 uppercase tracking-wider mb-2 text-center">{onClockTeam} · Picks This Draft</div>
          <div className="grid grid-cols-3 gap-1">
            {teamPicksThisDraft.slice().reverse().slice(0, 6).map(p => (
              <div key={p.overall} className="bg-black/30 rounded px-1.5 py-1.5">
                <div className="font-semibold text-white leading-tight break-words" style={{ fontSize: tickerNameFontSize(p.playerName || p.playerId) }}>{p.playerName || p.playerId}</div>
                <div className="text-sm text-white/55 leading-tight">{p.playerPos ? `${p.playerPos} · ` : ''}#{p.overall} · R{p.round ?? Math.floor((p.overall - 1) / teamsPerRound) + 1} Pk{((p.overall - 1) % teamsPerRound) + 1}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Record */}
      <div style={{ display: currentTickerView === 'teamRecord' ? 'block' : 'none' }}>
        <div className="text-sm font-black text-white/90 uppercase tracking-wider mb-2 text-center">{completedSeason} Season Record</div>
        {teamRecord ? (
          <div className="grid grid-cols-4 gap-1">
            {[
              { val: teamRecord.record.wins,                          lbl: 'Wins' },
              { val: teamRecord.record.losses,                        lbl: 'Losses' },
              { val: Math.round(teamRecord.record.fpts),              lbl: 'Pts For' },
              { val: Math.round(teamRecord.record.fptsAgainst || 0),  lbl: 'Pts Agn' },
            ].map(({ val, lbl }) => (
              <div key={lbl} className="bg-black/30 rounded px-1.5 py-1.5 text-center">
                <div className="text-3xl font-black text-white leading-tight">{val}</div>
                <div className="text-xs font-semibold text-white/50 uppercase tracking-wide leading-tight">{lbl}</div>
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
        <div className="text-sm font-black text-white/90 uppercase tracking-wider mb-2 text-center">Draft Capital</div>
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
                <div className="text-3xl font-black text-white leading-tight">{teamPicks.length || 1}</div>
                <div className="text-xs font-semibold text-white/50 uppercase tracking-wide leading-tight">Picks</div>
              </div>
              {teamPicks.map(slot => (
                <div key={slot} className="bg-black/30 rounded px-1.5 py-1.5 text-center">
                  <div className="text-base font-bold text-white leading-tight">{slot}</div>
                </div>
              ))}
            </div>
          );
        })() : (
          <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">Loading...</div>
        )}
      </div>

      {/* Top 5 Scorers — most recent completed season */}
      <div style={{ display: currentTickerView === 'topScorers' ? 'block' : 'none' }}>
        <div className="text-sm font-black text-white/90 uppercase tracking-wider mb-2 text-center">Top Scorers · {completedSeason} Season</div>
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
        <div className="text-sm font-black text-white/90 uppercase tracking-wider mb-2 text-center">Season History</div>
        {seasonHistory ? (
          seasonHistory.length > 0 ? (
            <div className="grid grid-cols-3 gap-1">
              {seasonHistory.map(s => (
                <div key={s.season} className="bg-black/30 rounded px-1.5 py-1.5">
                  <div className="text-xs font-bold text-white/50 uppercase tracking-wide leading-tight mb-0.5">{s.season}</div>
                  <div className="text-2xl font-black text-white leading-tight">{s.wins}–{s.losses}</div>
                  <div className="text-xs text-white/70 leading-tight">Rank: #{s.recordRank}</div>
                  <div className="text-xs text-white/60 leading-tight">PF: {s.fpts} (#{s.fptsRank})</div>
                  <div className="text-xs text-white/60 leading-tight">PA: {s.fptsAgainst} (#{s.fptsAgainstRank})</div>
                  {onClockTeam && (
                    <div className="text-xs text-white/80 leading-tight mt-0.5 break-words">
                      {CANONICAL_SEASON_RESULTS[onClockTeam]?.[s.season as '2023' | '2024' | '2025'] || ''}
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

      {/* Most recent completed-season draft */}
      <div style={{ display: currentTickerView === 'draft2025' ? 'block' : 'none' }}>
        <div className="text-sm font-black text-white/90 uppercase tracking-wider mb-2 text-center">{completedSeason} Draft Picks</div>
        {historicalDrafts[completedSeason] ? (() => {
          const picks = historicalDrafts[completedSeason]!.filter(p => p.team === onClockTeam).slice(0, 5);
          return picks.length > 0 ? (
            <div className="grid grid-cols-5 gap-1">
              {picks.map((p, i) => (
                <div key={i} className="bg-black/30 rounded px-1.5 py-1.5">
                  <div className="font-semibold text-white leading-tight break-words" style={{ fontSize: tickerNameFontSize(p.player) }}>{p.player}</div>
                  <div className="text-sm text-white/55 leading-tight">{p.pos ? `${p.pos} · ` : ''}{p.round}.{String(p.pick % teamsPerRound || teamsPerRound).padStart(2, '0')}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">No picks in {completedSeason}</div>
          );
        })() : (
          <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">Loading...</div>
        )}
      </div>

      {/* Prior-season draft */}
      <div style={{ display: currentTickerView === 'draft2024' ? 'block' : 'none' }}>
        <div className="text-sm font-black text-white/90 uppercase tracking-wider mb-2 text-center">{priorSeason} Draft Picks</div>
        {historicalDrafts[priorSeason] ? (() => {
          const picks = historicalDrafts[priorSeason]!.filter(p => p.team === onClockTeam).slice(0, 5);
          return picks.length > 0 ? (
            <div className="grid grid-cols-5 gap-1">
              {picks.map((p, i) => (
                <div key={i} className="bg-black/30 rounded px-1.5 py-1.5">
                  <div className="font-semibold text-white leading-tight break-words" style={{ fontSize: tickerNameFontSize(p.player) }}>{p.player}</div>
                  <div className="text-sm text-white/55 leading-tight">{p.pos ? `${p.pos} · ` : ''}{p.round}.{String(p.pick % teamsPerRound || teamsPerRound).padStart(2, '0')}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">No picks in {priorSeason}</div>
          );
        })() : (
          <div className="bg-black/30 rounded px-1.5 py-1.5 text-[11px] text-white/50">Loading...</div>
        )}
      </div>

      {/* Trade Info */}
      {currentPickTradeInfo && (() => {
        const full = currentPickTradeInfo as { fromTeam: string; toTeam?: string; originalTeam?: string; summary?: string };
        return (
          <div style={{ display: currentTickerView === 'tradeInfo' ? 'block' : 'none' }}>
            <div className="text-sm font-black text-white/80 uppercase tracking-widest mb-2 text-center">Pick Acquired via Trade</div>
            <div className="flex items-center gap-3">
              <div className="bg-black/30 rounded-lg px-3 py-1.5 flex-1 min-w-0">
                <div className="text-xs text-white/50 uppercase tracking-wide mb-0.5">From</div>
                <div className="text-xl font-black text-white break-words leading-tight">{full.fromTeam}</div>
              </div>
              <div className="text-2xl font-black text-white/40 flex-shrink-0">→</div>
              <div className="bg-black/30 rounded-lg px-3 py-1.5 flex-1 min-w-0">
                <div className="text-xs text-white/50 uppercase tracking-wide mb-0.5">To</div>
                <div className="text-xl font-black text-white break-words leading-tight">{full.toTeam || onClockTeam}</div>
              </div>
            </div>
            {full.originalTeam && full.originalTeam !== full.fromTeam && (
              <div className="mt-1.5 text-sm text-white/55 text-center break-words">Originally from: {full.originalTeam}</div>
            )}
            {full.summary && (
              <div className="mt-1 text-sm text-white/55 text-center break-words">{full.summary}</div>
            )}
          </div>
        );
      })()}
    </>
  );
}
