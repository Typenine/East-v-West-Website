'use client';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { getTeamLogoPath } from '@/lib/utils/team-utils';
import { getTeamColors } from '@/lib/constants/team-colors';

export type TradeAnimAsset = {
  fromTeam: string;
  toTeam: string;
  assetType: 'player' | 'current_pick' | 'future_pick';
  playerName?: string | null;
  playerPos?: string | null;
  pickOverall?: number | null;
  pickYear?: number | null;
  pickRound?: number | null;
  pickOriginalTeam?: string | null;
};

interface DraftTradeAnimationProps {
  teams: string[];
  assets: TradeAnimAsset[];
  eventLogoUrl?: string | null;
  eventColor1?: string | null;
  onComplete?: () => void;
}

const POS_COLORS: Record<string, string> = { QB:'#ef4444', RB:'#22c55e', WR:'#3b82f6', TE:'#f97316', K:'#a855f7', DEF:'#6b7280' };

function AssetLine({ asset }: { asset: TradeAnimAsset }) {
  if (asset.assetType === 'player') {
    return (
      <div className="flex items-center gap-2 py-1">
        {asset.playerPos && (
          <span className="font-black px-1.5 py-0.5 rounded text-white text-xs" style={{ background: POS_COLORS[asset.playerPos] || '#555' }}>
            {asset.playerPos}
          </span>
        )}
        <span className="text-white font-bold text-sm">{asset.playerName || '—'}</span>
        <span className="text-zinc-400 text-xs ml-auto">→ {asset.toTeam}</span>
      </div>
    );
  }
  if (asset.assetType === 'current_pick') {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-yellow-400 font-black text-base">⦿</span>
        <span className="text-white font-bold text-sm">Pick #{asset.pickOverall} <span className="text-zinc-400 font-normal">Rd {asset.pickRound}</span></span>
        <span className="text-zinc-400 text-xs ml-auto">→ {asset.toTeam}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-sky-400 font-black text-base">◈</span>
      <span className="text-white font-bold text-sm">{asset.pickYear} Round {asset.pickRound}{asset.pickOriginalTeam && asset.pickOriginalTeam !== asset.fromTeam ? <span className="text-zinc-400 font-normal"> via {asset.pickOriginalTeam}</span> : ''}</span>
      <span className="text-zinc-400 text-xs ml-auto">→ {asset.toTeam}</span>
    </div>
  );
}

export default function DraftTradeAnimation({ teams, assets, eventLogoUrl, eventColor1, onComplete }: DraftTradeAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const logoPhaseRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const teamsRowRef = useRef<HTMLDivElement>(null);
  const assetsCardRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const ec1 = eventColor1 || '#a4c810';

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tl = gsap.timeline({ onComplete: () => onCompleteRef.current?.() });

    // ── Phase 1: Event logo featured moment (1.5s) ──
    tl.fromTo(logoPhaseRef.current,
      { opacity: 0, scale: 0.6 },
      { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.4)' }
    )
    .to(logoPhaseRef.current, { duration: 1.0 }) // hold
    .to(logoPhaseRef.current, { opacity: 0, scale: 0.8, duration: 0.4, ease: 'power2.in' });

    // ── Phase 2: TRADE ALERT banner ──
    tl.fromTo(alertRef.current,
      { opacity: 0, y: -40, scale: 0.9 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.6)' }
    );

    // ── Phase 3: Teams row slides in ──
    tl.fromTo(teamsRowRef.current,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' },
      '-=0.2'
    );

    // ── Phase 4: Assets card slides in ──
    tl.fromTo(assetsCardRef.current,
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' },
      '-=0.2'
    );

    // ── Hold on full summary (~6s) ──
    tl.to({}, { duration: 6.5 });

    // ── Fade out ──
    tl.to(container, { opacity: 0, duration: 0.6, ease: 'power2.inOut' });

    return () => { tl.kill(); };
  }, []);

  // Group assets by fromTeam
  const byFromTeam: Record<string, TradeAnimAsset[]> = {};
  for (const a of assets) {
    if (!byFromTeam[a.fromTeam]) byFromTeam[a.fromTeam] = [];
    byFromTeam[a.fromTeam].push(a);
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 flex items-center justify-center pointer-events-none"
      style={{ zIndex: 2000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      {/* Compact centered card — max-h so it never overflows the viewport */}
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
        style={{ background: 'rgba(10,10,18,0.97)', boxShadow: `0 0 40px ${ec1}55`, maxHeight: '80vh', overflowY: 'auto' }}
      >
        {/* Phase 1: Event Logo — centred inside the card */}
        <div
          ref={logoPhaseRef}
          className="absolute inset-0 flex items-center justify-center rounded-2xl"
          style={{ opacity: 0, background: 'rgba(10,10,18,0.97)', zIndex: 2 }}
        >
          {eventLogoUrl ? (
            <img src={eventLogoUrl} alt="" className="object-contain" style={{ width: '80px', height: '80px' }} />
          ) : (
            <div className="text-4xl font-black" style={{ color: ec1 }}>TRADE</div>
          )}
        </div>

        {/* Phase 2+: Main content */}
        <div className="relative z-10 flex flex-col items-center gap-3 px-5 py-4">
          {/* TRADE ALERT banner */}
          <div ref={alertRef} className="flex flex-col items-center gap-1 w-full" style={{ opacity: 0 }}>
            <div className="flex items-center gap-2">
              {eventLogoUrl && (
                <img src={eventLogoUrl} alt="" className="object-contain" style={{ width: '24px', height: '24px', opacity: 0.9 }} />
              )}
              <div
                className="text-2xl font-black tracking-widest uppercase"
                style={{ color: ec1, textShadow: `0 0 20px ${ec1}88` }}
              >
                TRADE ALERT
              </div>
            </div>
            <div className="w-40 h-0.5 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${ec1}, transparent)` }} />
          </div>

          {/* Teams row */}
          <div ref={teamsRowRef} className="flex items-center justify-center gap-2 flex-wrap w-full" style={{ opacity: 0 }}>
            {teams.map((team, i) => {
              const colors = getTeamColors(team);
              const logo = getTeamLogoPath(team);
              return (
                <div key={team} className="flex items-center gap-2">
                  {i > 0 && <span className="text-zinc-400 text-xs font-bold">⟷</span>}
                  <div
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border border-white/10"
                    style={{ background: `linear-gradient(135deg, ${colors.primary}cc, ${colors.secondary}aa)` }}
                  >
                    <div className="w-6 h-6 bg-black/30 rounded overflow-hidden flex items-center justify-center">
                      <img src={logo} alt={team} className="w-full h-full object-contain" />
                    </div>
                    <span className="text-white font-black text-xs">{team}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Assets breakdown card */}
          <div
            ref={assetsCardRef}
            className="w-full rounded-xl border border-zinc-700/60 overflow-hidden"
            style={{ background: 'rgba(20,20,28,0.9)', opacity: 0 }}
          >
            <div className="px-3 py-1.5 border-b border-zinc-700/60" style={{ background: `linear-gradient(90deg, ${ec1}18, transparent)` }}>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Trade Details</span>
            </div>
            <div className="divide-y divide-zinc-800/60">
              {Object.entries(byFromTeam).map(([from, fromAssets]) => {
                const colors = getTeamColors(from);
                const logo = getTeamLogoPath(from);
                return (
                  <div key={from} className="px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-4 h-4 rounded overflow-hidden flex-shrink-0">
                        <img src={logo} alt={from} className="w-full h-full object-contain" style={{ background: colors.primary + '44' }} />
                      </div>
                      <span className="text-xs font-bold" style={{ color: colors.primary }}>{from} sends:</span>
                    </div>
                    <div className="pl-5 divide-y divide-zinc-800/40">
                      {fromAssets.map((a, i) => <AssetLine key={i} asset={a} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
