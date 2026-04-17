'use client';

/* eslint-disable @next/next/no-img-element */

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

function AssetLine({ asset, ec1 }: { asset: TradeAnimAsset; ec1: string }) {
  if (asset.assetType === 'player') {
    return (
      <div className="flex items-center gap-3 py-2.5">
        {asset.playerPos && (
          <span className="font-black px-2 py-1 rounded text-white min-w-[40px] text-center" style={{ background: POS_COLORS[asset.playerPos] || '#555', fontSize: '0.85rem' }}>
            {asset.playerPos}
          </span>
        )}
        <span className="text-white font-bold flex-1" style={{ fontSize: '1.1rem' }}>{asset.playerName || '—'}</span>
        <span className="text-white/50 text-sm font-semibold">→ {asset.toTeam}</span>
      </div>
    );
  }
  if (asset.assetType === 'current_pick') {
    return (
      <div className="flex items-center gap-3 py-2.5">
        <span className="font-black text-2xl" style={{ color: ec1 }}>⦿</span>
        <span className="text-white font-bold flex-1" style={{ fontSize: '1.1rem' }}>
          Pick #{asset.pickOverall} <span className="text-white/50 font-normal text-base">· Round {asset.pickRound}</span>
        </span>
        <span className="text-white/50 text-sm font-semibold">→ {asset.toTeam}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="font-black text-2xl text-sky-400">◈</span>
      <span className="text-white font-bold flex-1" style={{ fontSize: '1.1rem' }}>
        {asset.pickYear} Round {asset.pickRound}
        {asset.pickOriginalTeam && asset.pickOriginalTeam !== asset.fromTeam && (
          <span className="text-white/50 font-normal text-base"> via {asset.pickOriginalTeam}</span>
        )}
      </span>
      <span className="text-white/50 text-sm font-semibold">→ {asset.toTeam}</span>
    </div>
  );
}

export default function DraftTradeAnimation({ teams, assets, eventLogoUrl, eventColor1, onComplete }: DraftTradeAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const ec1 = eventColor1 || '#a4c810';

  useEffect(() => {
    if (timelineRef.current) return;
    const container = containerRef.current;
    if (!container) return;

    const logoPhase   = container.querySelector<HTMLElement>('.gtrade-logo');
    const alertPhase  = container.querySelector<HTMLElement>('.gtrade-alert');
    const alertText   = container.querySelector<HTMLElement>('.gtrade-alert-text');
    const alertLine   = container.querySelector<HTMLElement>('.gtrade-alert-line');
    const teamsPhase  = container.querySelector<HTMLElement>('.gtrade-teams');
    const team1Panel  = container.querySelector<HTMLElement>('.gtrade-team1');
    const team2Panel  = container.querySelector<HTMLElement>('.gtrade-team2');
    const tradeIcon   = container.querySelector<HTMLElement>('.gtrade-icon');
    const detailsPhase = container.querySelector<HTMLElement>('.gtrade-details');
    const detailsCard  = container.querySelector<HTMLElement>('.gtrade-card');

    if (!logoPhase || !alertPhase || !teamsPhase || !detailsPhase) return;

    // ── Initial states ──────────────────────────────────────────────────────
    gsap.set([logoPhase, alertPhase, teamsPhase, detailsPhase], { opacity: 0, force3D: true });
    if (alertText)  gsap.set(alertText,  { opacity: 0, y: 60, scale: 0.8, force3D: true });
    if (alertLine)  gsap.set(alertLine,  { scaleX: 0, transformOrigin: 'center', force3D: true });
    if (team1Panel) gsap.set(team1Panel, { x: '-100%', force3D: true });
    if (team2Panel) gsap.set(team2Panel, { x: '100%',  force3D: true });
    if (tradeIcon)  gsap.set(tradeIcon,  { opacity: 0, scale: 0, force3D: true });
    if (detailsCard) gsap.set(detailsCard, { opacity: 0, y: 60, force3D: true });

    const tl = gsap.timeline({ onComplete: () => onCompleteRef.current?.() });
    timelineRef.current = tl;

    // ── Phase 0: Event Logo (0 – 2.5s) ──────────────────────────────────────
    tl.to(logoPhase, { opacity: 1, duration: 0.6, ease: 'power2.out', force3D: true });
    tl.to({}, { duration: 1.3 });
    tl.to(logoPhase, { opacity: 0, duration: 0.4, ease: 'power2.in', force3D: true });

    // ── Phase 1: TRADE ALERT (2.5 – 5.5s) ──────────────────────────────────
    tl.to(alertPhase, { opacity: 1, duration: 0.4, ease: 'power2.out', force3D: true });
    if (alertText) tl.to(alertText, { opacity: 1, y: 0, scale: 1, duration: 0.65, ease: 'back.out(1.7)', force3D: true }, '-=0.2');
    if (alertLine) tl.to(alertLine, { scaleX: 1, duration: 0.55, ease: 'power2.inOut', force3D: true }, '-=0.3');
    tl.to({}, { duration: 1.5 });
    tl.to(alertPhase, { opacity: 0, duration: 0.4, ease: 'power2.in', force3D: true });

    // ── Phase 2: Teams Split Screen (5.5 – 9s) ──────────────────────────────
    tl.to(teamsPhase, { opacity: 1, duration: 0.3, ease: 'power2.out', force3D: true });
    if (team1Panel) tl.to(team1Panel, { x: '0%', duration: 0.6, ease: 'power3.out', force3D: true }, '-=0.15');
    if (team2Panel) tl.to(team2Panel, { x: '0%', duration: 0.6, ease: 'power3.out', force3D: true }, '-=0.55');
    if (tradeIcon)  tl.to(tradeIcon,  { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.5)', force3D: true }, '-=0.3');
    tl.to({}, { duration: 2.0 });
    tl.to(teamsPhase, { opacity: 0, duration: 0.45, ease: 'power2.in', force3D: true });

    // ── Phase 3: Trade Details Card (9 – 16s) ───────────────────────────────
    tl.to(detailsPhase, { opacity: 1, duration: 0.45, ease: 'power2.out', force3D: true });
    if (detailsCard) tl.to(detailsCard, { opacity: 1, y: 0, duration: 0.65, ease: 'power3.out', force3D: true }, '-=0.25');
    tl.to({}, { duration: 6.0 });

    // ── Exit ─────────────────────────────────────────────────────────────────
    tl.to(container, { opacity: 0, duration: 0.8, ease: 'power2.inOut', force3D: true });

    return () => { timelineRef.current?.kill(); timelineRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group assets by fromTeam
  const byFromTeam: Record<string, TradeAnimAsset[]> = {};
  for (const a of assets) {
    if (!byFromTeam[a.fromTeam]) byFromTeam[a.fromTeam] = [];
    byFromTeam[a.fromTeam].push(a);
  }

  const team1 = teams[0] || '';
  const team2 = teams[1] || teams[0] || '';
  const c1 = getTeamColors(team1);
  const c2 = getTeamColors(team2);
  const logo1 = getTeamLogoPath(team1);
  const logo2 = getTeamLogoPath(team2);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 9999, backgroundColor: '#080810', willChange: 'opacity' }}
    >

      {/* ── PHASE 0: Event Logo ─────────────────────────────────────────── */}
      <div className="gtrade-logo absolute inset-0 flex items-center justify-center">
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 50%, ${ec1}22 0%, #080810 70%)` }} />
        {eventLogoUrl ? (
          <img src={eventLogoUrl} alt="" className="relative z-10 object-contain"
            style={{ width: 'clamp(120px, 20vw, 200px)', height: 'clamp(120px, 20vw, 200px)' }} />
        ) : (
          <div className="relative z-10 font-black uppercase" style={{ fontSize: 'clamp(5rem, 12vw, 10rem)', color: ec1, letterSpacing: '0.1em' }}>
            TRADE
          </div>
        )}
      </div>

      {/* ── PHASE 1: TRADE ALERT ────────────────────────────────────────── */}
      <div className="gtrade-alert absolute inset-0 flex flex-col items-center justify-center gap-6">
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 45%, ${ec1}30 0%, #080810 60%)` }} />
        <div className="relative z-10 flex flex-col items-center gap-6">
          {eventLogoUrl && (
            <img src={eventLogoUrl} alt="" className="object-contain opacity-90"
              style={{ width: 'clamp(50px, 7vw, 70px)', height: 'clamp(50px, 7vw, 70px)' }} />
          )}
          <div
            className="gtrade-alert-text font-black text-center uppercase leading-none"
            style={{
              fontSize: 'clamp(5rem, 13vw, 11rem)',
              color: ec1,
              textShadow: `0 0 80px ${ec1}77, 0 4px 20px rgba(0,0,0,0.9)`,
              WebkitTextStroke: `2px ${ec1}99`,
              letterSpacing: '0.08em',
            }}
          >
            TRADE<br />ALERT
          </div>
          <div
            className="gtrade-alert-line rounded-full"
            style={{ width: 'clamp(200px, 30vw, 360px)', height: '3px', background: `linear-gradient(90deg, transparent, ${ec1}, transparent)`, transformOrigin: 'center' }}
          />
        </div>
      </div>

      {/* ── PHASE 2: Teams Split Screen ─────────────────────────────────── */}
      <div className="gtrade-teams absolute inset-0 overflow-hidden">
        {/* Left team */}
        <div
          className="gtrade-team1 absolute inset-y-0 left-0 flex flex-col items-center justify-center gap-6 overflow-hidden"
          style={{ width: '50%', background: `linear-gradient(160deg, ${c1.primary}ff 0%, ${c1.secondary}dd 100%)` }}
        >
          <div className="absolute inset-0 opacity-10 flex items-center justify-center">
            <img src={logo1} alt="" className="object-contain" style={{ width: '90%', height: '90%' }} />
          </div>
          <img src={logo1} alt={team1} className="relative z-10 object-contain drop-shadow-2xl"
            style={{ width: 'clamp(100px, 16vw, 220px)', height: 'clamp(100px, 16vw, 220px)' }} />
          <div className="relative z-10 font-black text-white text-center uppercase leading-tight px-6"
            style={{ fontSize: 'clamp(1.6rem, 4vw, 3.5rem)', textShadow: '0 3px 20px rgba(0,0,0,0.9)', letterSpacing: '0.04em' }}>
            {team1}
          </div>
        </div>
        {/* Right team */}
        <div
          className="gtrade-team2 absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-6 overflow-hidden"
          style={{ width: '50%', background: `linear-gradient(200deg, ${c2.primary}ff 0%, ${c2.secondary}dd 100%)` }}
        >
          <div className="absolute inset-0 opacity-10 flex items-center justify-center">
            <img src={logo2} alt="" className="object-contain" style={{ width: '90%', height: '90%' }} />
          </div>
          <img src={logo2} alt={team2} className="relative z-10 object-contain drop-shadow-2xl"
            style={{ width: 'clamp(100px, 16vw, 220px)', height: 'clamp(100px, 16vw, 220px)' }} />
          <div className="relative z-10 font-black text-white text-center uppercase leading-tight px-6"
            style={{ fontSize: 'clamp(1.6rem, 4vw, 3.5rem)', textShadow: '0 3px 20px rgba(0,0,0,0.9)', letterSpacing: '0.04em' }}>
            {team2}
          </div>
        </div>
        {/* Center trade icon */}
        <div className="gtrade-icon absolute inset-0 flex items-center justify-center" style={{ zIndex: 10 }}>
          <div className="flex items-center justify-center rounded-full font-black"
            style={{
              width: 'clamp(60px, 8vw, 90px)', height: 'clamp(60px, 8vw, 90px)',
              background: '#080810', border: `4px solid ${ec1}`,
              color: ec1, fontSize: 'clamp(1.4rem, 3vw, 2.2rem)',
              boxShadow: `0 0 40px ${ec1}88`,
            }}>
            ⟷
          </div>
        </div>
      </div>

      {/* ── PHASE 3: Trade Details Card ─────────────────────────────────── */}
      <div className="gtrade-details absolute inset-0 flex items-center justify-center px-8">
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 45%, ${ec1}18 0%, #080810 65%)` }} />
        <div
          className="gtrade-card relative z-10 rounded-2xl overflow-hidden"
          style={{
            width: 'min(960px, 92vw)',
            background: 'linear-gradient(135deg, #14141e 0%, #1a1a2c 100%)',
            border: `2px solid ${ec1}55`,
            boxShadow: `0 24px 80px rgba(0,0,0,0.85), 0 0 70px ${ec1}33`,
          }}
        >
          {/* Card header */}
          <div className="flex items-center gap-5 px-8 py-5 border-b-2" style={{ background: `linear-gradient(90deg, ${ec1}28 0%, transparent 100%)`, borderColor: `${ec1}44` }}>
            {eventLogoUrl && <img src={eventLogoUrl} alt="" className="object-contain flex-shrink-0" style={{ width: '48px', height: '48px', opacity: 0.95 }} />}
            <div>
              <div className="font-black uppercase tracking-widest" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)', color: ec1, letterSpacing: '0.15em' }}>
                TRADE ALERT
              </div>
              <div className="text-white/45 font-bold tracking-wider text-sm mt-0.5">{teams.join(' ↔ ')}</div>
            </div>
            {/* Team logo chips */}
            <div className="ml-auto flex items-center gap-3">
              {teams.map(t => {
                const tc = getTeamColors(t);
                return (
                  <div key={t} className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: `linear-gradient(135deg, ${tc.primary}cc, ${tc.secondary}aa)` }}>
                    <img src={getTeamLogoPath(t)} alt={t} className="object-contain" style={{ width: '24px', height: '24px' }} />
                    <span className="text-white font-black text-sm hidden sm:block">{t}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Asset sections */}
          <div>
            {Object.entries(byFromTeam).map(([from, fromAssets], idx) => {
              const tc = getTeamColors(from);
              const logo = getTeamLogoPath(from);
              return (
                <div key={from} className="px-8 py-5" style={idx > 0 ? { borderTop: `1px solid ${ec1}22` } : {}}>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border-2" style={{ borderColor: tc.primary + 'aa', background: tc.primary + '22' }}>
                      <img src={logo} alt={from} className="w-full h-full object-contain" />
                    </div>
                    <div>
                      <div className="font-black text-white uppercase tracking-wider" style={{ fontSize: '1.15rem' }}>{from}</div>
                      <div className="text-xs font-black uppercase tracking-widest mt-0.5" style={{ color: tc.primary }}>SENDS</div>
                    </div>
                    <div className="ml-4 flex-1 h-px" style={{ background: `linear-gradient(90deg, ${tc.primary}66, transparent)`, maxWidth: '160px' }} />
                  </div>
                  <div className="pl-16 divide-y" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    {fromAssets.map((a, i) => <AssetLine key={i} asset={a} ec1={ec1} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
