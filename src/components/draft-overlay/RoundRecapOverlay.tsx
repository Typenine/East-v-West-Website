'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { getTeamLogoPath } from '@/lib/utils/team-utils';
import { getTeamColors } from '@/lib/constants/team-colors';

interface Pick {
  overall: number;
  round: number;
  team: string;
  playerId: string;
  playerName?: string | null;
  playerPos?: string | null;
  playerNfl?: string | null;
  madeAt: string;
}

interface TradeAsset {
  fromTeam: string;
  toTeam: string;
  assetType: string;
  playerName?: string | null;
  playerPos?: string | null;
  pickOverall?: number | null;
  pickYear?: number | null;
  pickRound?: number | null;
}

interface Trade {
  id: string;
  teams: string[];
  notes?: string | null;
  assets: TradeAsset[];
}

interface RoundRecapOverlayProps {
  roundNumber: number;
  nextRound: number;
  picks: Pick[];
  draftId: string;
  isAdmin: boolean;
  eventLogoUrl?: string | null;
  eventColor1?: string;
  onStartNextRound: () => void;
}

const positionColors: Record<string, string> = {
  QB: '#C00000',
  RB: '#FFC000',
  WR: '#0070C0',
  TE: '#00B050',
  K: '#FF8C42',
  FB: '#9B5DE5',
};

export default function RoundRecapOverlay({
  roundNumber,
  nextRound,
  picks,
  draftId,
  isAdmin,
  eventLogoUrl,
  eventColor1 = '#a4c810',
  onStartNextRound,
}: RoundRecapOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    if (!draftId) return;
    fetch(`/api/draft/trade?action=list_approved&draftId=${encodeURIComponent(draftId)}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.trades) setTrades(data.trades); })
      .catch(() => {});
  }, [draftId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    gsap.fromTo(container, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power2.out' });
  }, []);

  const hasTrades = trades.length > 0;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ background: 'linear-gradient(160deg, #08090c 0%, #0e1117 60%, #0a0c10 100%)', willChange: 'opacity' }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-10 py-5 flex-shrink-0"
        style={{ borderBottom: `3px solid ${eventColor1}` }}
      >
        <div className="flex items-center gap-5">
          {eventLogoUrl && (
            <img src={eventLogoUrl} alt="" className="w-12 h-12 object-contain" style={{ opacity: 0.9 }} />
          )}
          <div>
            <div
              className="font-black uppercase tracking-widest"
              style={{ fontSize: '2.2rem', color: eventColor1, lineHeight: 1, textShadow: `0 0 20px ${eventColor1}66` }}
            >
              Round {roundNumber} Complete
            </div>
            <div className="text-zinc-400 text-sm font-bold tracking-wider mt-0.5">
              {picks.length} picks made
            </div>
          </div>
        </div>
        <div className="text-right">
          {isAdmin ? (
            <button
              onClick={onStartNextRound}
              className="px-8 py-3 rounded-xl font-black text-xl uppercase tracking-wider transition-all hover:scale-105 active:scale-95"
              style={{
                background: `linear-gradient(135deg, ${eventColor1} 0%, ${eventColor1}aa 100%)`,
                color: '#000',
                boxShadow: `0 4px 24px ${eventColor1}66`,
              }}
            >
              ▶ Start Round {nextRound}
            </button>
          ) : (
            <div className="text-zinc-400 text-sm font-bold animate-pulse">
              Waiting for Commissioner to start Round {nextRound}…
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-6 p-6 min-h-0 overflow-hidden">
        {/* Picks grid */}
        <div className={`flex flex-col min-w-0 ${hasTrades ? 'flex-[2]' : 'flex-1'}`}>
          <div className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">
            Round {roundNumber} Picks
          </div>
          <div className="grid gap-2 flex-1 content-start overflow-y-auto" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            {picks.map((pick, i) => {
              const colors = getTeamColors(pick.team);
              const logo = getTeamLogoPath(pick.team);
              const posColor = positionColors[pick.playerPos || ''] || '#666';
              return (
                <div
                  key={pick.overall}
                  className="rounded-lg overflow-hidden flex items-center gap-2 py-2 px-3"
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary}22 0%, #1a1a1a 100%)`,
                    border: `1px solid ${colors.primary}44`,
                    animationDelay: `${i * 0.05}s`,
                  }}
                >
                  {/* Pick # */}
                  <div
                    className="text-xs font-black flex-shrink-0 w-6 text-center"
                    style={{ color: eventColor1 }}
                  >
                    {pick.overall}
                  </div>
                  {/* Team logo */}
                  {logo && (
                    <img src={logo} alt={pick.team} className="w-7 h-7 object-contain flex-shrink-0" />
                  )}
                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-bold text-xs leading-tight truncate">
                      {pick.playerName || pick.playerId}
                    </div>
                    {pick.playerPos && (
                      <div
                        className="text-[10px] font-black inline-block px-1 rounded mt-0.5"
                        style={{ background: posColor, color: '#fff' }}
                      >
                        {pick.playerPos}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trades section */}
        {hasTrades && (
          <div className="flex flex-col flex-1 min-w-0">
            <div className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">
              Trades This Draft
            </div>
            <div className="flex flex-col gap-3 overflow-y-auto">
              {trades.map((trade) => (
                <div
                  key={trade.id}
                  className="rounded-lg p-3"
                  style={{ background: '#1a1a22', border: '1px solid #333' }}
                >
                  {/* Team logos */}
                  <div className="flex items-center gap-2 mb-2">
                    {trade.teams.map((team) => {
                      const logo = getTeamLogoPath(team);
                      const colors = getTeamColors(team);
                      return (
                        <div
                          key={team}
                          className="flex items-center gap-1.5 px-2 py-1 rounded"
                          style={{ background: `${colors.primary}22`, border: `1px solid ${colors.primary}44` }}
                        >
                          {logo && <img src={logo} alt={team} className="w-5 h-5 object-contain" />}
                          <span className="text-[11px] font-bold text-white">{team}</span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Assets */}
                  <div className="space-y-1">
                    {trade.assets.map((asset, ai) => {
                      const arrow = '→';
                      const desc = asset.assetType === 'pick'
                        ? `Pick${asset.pickRound ? ` Rd ${asset.pickRound}` : ''}${asset.pickYear ? ` ${asset.pickYear}` : ''}`
                        : (asset.playerName || 'Player');
                      return (
                        <div key={ai} className="text-[11px] text-zinc-300 flex items-center gap-1">
                          <span className="font-bold text-white/70">{asset.fromTeam.split(' ').pop()}</span>
                          <span className="text-zinc-500">{arrow}</span>
                          <span className="font-bold text-white/70">{asset.toTeam.split(' ').pop()}</span>
                          <span className="text-zinc-400 ml-1">{desc}</span>
                          {asset.playerPos && (
                            <span
                              className="text-[9px] font-black px-1 rounded"
                              style={{ background: positionColors[asset.playerPos] || '#666', color: '#fff' }}
                            >
                              {asset.playerPos}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {trade.notes && (
                    <div className="mt-1 text-[10px] text-zinc-500 italic">{trade.notes}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* If no trades — footnote */}
        {!hasTrades && (
          <div className="flex-shrink-0 self-end text-zinc-600 text-xs italic">
            No trades this draft
          </div>
        )}
      </div>

      {/* Bottom waiting bar */}
      <div
        className="flex-shrink-0 py-3 text-center font-bold uppercase tracking-widest text-sm"
        style={{ borderTop: `1px solid #333`, color: eventColor1 + '88' }}
      >
        {isAdmin ? 'Click ▶ Start Round to continue the draft' : `Waiting for Commissioner · Round ${nextRound} starts soon`}
      </div>
    </div>
  );
}
