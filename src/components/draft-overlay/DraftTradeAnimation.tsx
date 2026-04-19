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

function AcquiredAsset({ asset, ec1 }: { asset: TradeAnimAsset; ec1: string }) {
  const fromColors = getTeamColors(asset.fromTeam);
  const fromLogo = getTeamLogoPath(asset.fromTeam);

  const name =
    asset.assetType === 'player' ? (asset.playerName || '—') :
    asset.assetType === 'current_pick' ? `Pick #${asset.pickOverall}` :
    `${asset.pickYear} Rd ${asset.pickRound}`;

  const sub =
    asset.assetType === 'future_pick' && asset.pickOriginalTeam && asset.pickOriginalTeam !== asset.fromTeam
      ? `via ${asset.pickOriginalTeam}` : null;

  return (
    <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{
      background: 'rgba(0,0,0,0.35)',
      border: '1px solid rgba(255,255,255,0.1)',
    }}>
      {asset.assetType === 'player' && asset.playerPos && (
        <span className="font-black px-2.5 py-1 rounded flex-shrink-0 text-white"
          style={{ background: POS_COLORS[asset.playerPos] || '#555', fontSize: 'clamp(0.8rem,1.4vw,1rem)', minWidth:'42px', textAlign:'center', lineHeight:'1.4' }}>
          {asset.playerPos}
        </span>
      )}
      {asset.assetType === 'current_pick' && (
        <span className="font-black flex-shrink-0" style={{ color: ec1, fontSize: 'clamp(1.5rem,2.2vw,1.8rem)', lineHeight: 1 }}>⦿</span>
      )}
      {asset.assetType === 'future_pick' && (
        <span className="font-black flex-shrink-0 text-sky-400" style={{ fontSize: 'clamp(1.5rem,2.2vw,1.8rem)', lineHeight: 1 }}>◈</span>
      )}
      <div className="flex-1">
        <div className="font-black text-white" style={{ fontSize: 'clamp(1rem,2vw,1.4rem)', lineHeight: 1.25, overflowWrap: 'break-word', wordBreak: 'break-word' }}>{name}</div>
        {sub && <div className="text-white/50 font-semibold mt-0.5" style={{ fontSize: 'clamp(0.7rem,1.1vw,0.85rem)' }}>{sub}</div>}
        {/* From team note */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <img src={fromLogo} alt={asset.fromTeam} className="object-contain flex-shrink-0" style={{ width: '14px', height: '14px', opacity: 0.7 }} />
          <span className="font-semibold" style={{ color: fromColors.primary, fontSize: 'clamp(0.65rem,1vw,0.78rem)', opacity: 0.85 }}>from {asset.fromTeam}</span>
        </div>
      </div>
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

    const logoPhase    = container.querySelector<HTMLElement>('.gtrade-logo');
    const alertPhase   = container.querySelector<HTMLElement>('.gtrade-alert');
    const alertText    = container.querySelector<HTMLElement>('.gtrade-alert-text');
    const alertLine    = container.querySelector<HTMLElement>('.gtrade-alert-line');
    const teamsPhase   = container.querySelector<HTMLElement>('.gtrade-teams');
    const team1Panel   = container.querySelector<HTMLElement>('.gtrade-team1');
    const team2Panel   = container.querySelector<HTMLElement>('.gtrade-team2');
    const tradeIcon    = container.querySelector<HTMLElement>('.gtrade-icon');
    const detailsPhase = container.querySelector<HTMLElement>('.gtrade-details');
    const detailsCard  = container.querySelector<HTMLElement>('.gtrade-card');

    if (!logoPhase || !alertPhase || !teamsPhase || !detailsPhase) return;

    // ── Initial states (autoAlpha manages visibility to avoid paint cost) ───
    gsap.set([logoPhase, alertPhase, teamsPhase, detailsPhase], { autoAlpha: 0 });
    gsap.set(alertText,   { autoAlpha: 0, yPercent: 15, scale: 0.85 });
    gsap.set(alertLine,   { scaleX: 0, transformOrigin: 'center center' });
    gsap.set(team1Panel,  { xPercent: -100 });
    gsap.set(team2Panel,  { xPercent: 100 });
    gsap.set(tradeIcon,   { autoAlpha: 0, scale: 0 });
    gsap.set(detailsCard, { autoAlpha: 0, yPercent: 4 });

    const tl = gsap.timeline({ onComplete: () => onCompleteRef.current?.(), defaults: { ease: 'power2.out' } });
    timelineRef.current = tl;

    // ── Phase 0: Event Logo — 2.3s total ────────────────────────────────────
    tl.to(logoPhase, { autoAlpha: 1, duration: 0.55 })
      .to(logoPhase, { autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, '+=1.35');

    // ── Phase 1: TRADE ALERT — 6.0s total ───────────────────────────────────
    tl.to(alertPhase, { autoAlpha: 1, duration: 0.4 })
      .to(alertText,  { autoAlpha: 1, yPercent: 0, scale: 1, duration: 0.6, ease: 'back.out(1.6)' }, '<0.1')
      .to(alertLine,  { scaleX: 1, duration: 0.5, ease: 'power2.inOut' }, '<0.2')
      .to(alertPhase, { autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, '+=4.8');

    // ── Phase 2: Teams Split Screen — 5.0s total ────────────────────────────
    tl.to(teamsPhase,  { autoAlpha: 1, duration: 0.3 })
      .to(team1Panel,  { xPercent: 0, duration: 0.55, ease: 'power3.out' }, '<0.05')
      .to(team2Panel,  { xPercent: 0, duration: 0.55, ease: 'power3.out' }, '<')
      .to(tradeIcon,   { autoAlpha: 1, scale: 1, duration: 0.4, ease: 'back.out(1.5)' }, '<0.2')
      .to(teamsPhase,  { autoAlpha: 0, duration: 0.45, ease: 'power2.in' }, '+=3.9');

    // ── Phase 3: Trade Details — 20.4s hold ─────────────────────────────────
    tl.to(detailsPhase, { autoAlpha: 1, duration: 0.5 })
      .to(detailsCard,  { autoAlpha: 1, yPercent: 0, duration: 0.6, ease: 'power3.out' }, '<0.1')
      .to(container,    { autoAlpha: 0, duration: 0.8, ease: 'power2.inOut' }, '+=20.4');

    return () => { timelineRef.current?.kill(); timelineRef.current = null; };
  }, []);

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
      style={{ zIndex: 9999, backgroundColor: '#080810' }}
    >

      {/* ── PHASE 0: Event Logo ─────────────────────────────────────────── */}
      <div className="gtrade-logo absolute inset-0 flex items-center justify-center" style={{ willChange: 'opacity, visibility' }}>
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
      <div className="gtrade-alert absolute inset-0 flex flex-col items-center justify-center gap-6" style={{ willChange: 'opacity, visibility' }}>
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
              willChange: 'transform, opacity',
            }}
          >
            TRADE<br />ALERT
          </div>
          <div
            className="gtrade-alert-line rounded-full"
            style={{ width: 'clamp(200px, 30vw, 360px)', height: '3px', background: `linear-gradient(90deg, transparent, ${ec1}, transparent)`, willChange: 'transform' }}
          />
        </div>
      </div>

      {/* ── PHASE 2: Teams Split Screen ─────────────────────────────────── */}
      <div className="gtrade-teams absolute inset-0 overflow-hidden" style={{ willChange: 'opacity, visibility' }}>
        <div
          className="gtrade-team1 absolute inset-y-0 left-0 flex flex-col items-center justify-center gap-6 overflow-hidden"
          style={{ width: '50%', background: `linear-gradient(160deg, ${c1.primary}ff 0%, ${c1.secondary}dd 100%)`, willChange: 'transform' }}
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
        <div
          className="gtrade-team2 absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-6 overflow-hidden"
          style={{ width: '50%', background: `linear-gradient(200deg, ${c2.primary}ff 0%, ${c2.secondary}dd 100%)`, willChange: 'transform' }}
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
        <div className="gtrade-icon absolute inset-0 flex items-center justify-center" style={{ zIndex: 10, willChange: 'transform, opacity' }}>
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

      {/* ── PHASE 3: Trade Details ─ Split-panel ACQUIRES view ─────────────── */}
      <div className="gtrade-details absolute inset-0 overflow-hidden" style={{ willChange: 'opacity, visibility' }}>
        <div className="gtrade-card absolute inset-0 flex flex-col" style={{ willChange: 'transform, opacity' }}>

          {/* Top bar */}
          <div className="flex items-center justify-center gap-4 flex-shrink-0 px-6 py-4"
            style={{ background: `linear-gradient(90deg, ${c1.primary}cc 0%, ${ec1}99 50%, ${c2.primary}cc 100%)`, borderBottom: `3px solid ${ec1}` }}>
            {eventLogoUrl && (
              <img src={eventLogoUrl} alt="" className="object-contain flex-shrink-0"
                style={{ width: 'clamp(28px,4vw,44px)', height: 'clamp(28px,4vw,44px)' }} />
            )}
            <span className="font-black uppercase text-white tracking-widest"
              style={{ fontSize: 'clamp(1rem,2.5vw,1.6rem)', textShadow: '0 2px 12px rgba(0,0,0,0.7)' }}>TRADE COMPLETE</span>
          </div>

          {/* Split panels */}
          <div className="flex flex-1 overflow-hidden">
            {[team1, team2].map((t, idx) => {
              const tc = getTeamColors(t);
              const tLogo = getTeamLogoPath(t);
              const acquired = assets.filter(a => a.toTeam === t);
              return (
                <div key={t} className="flex-1 flex flex-col overflow-hidden" style={{
                  background: `linear-gradient(170deg, ${tc.primary}88 0%, ${tc.primary}33 35%, rgba(8,8,16,0.95) 70%)`,
                  borderRight: idx === 0 ? `2px solid ${ec1}44` : 'none',
                  position: 'relative',
                }}>
                  {/* Watermark logo */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ opacity: 0.06 }}>
                    <img src={tLogo} alt="" className="object-contain" style={{ width: '85%', height: '85%' }} />
                  </div>
                  {/* Team header */}
                  <div className="relative z-10 flex flex-col items-center gap-3 px-6 pt-6 pb-4">
                    <div className="rounded-2xl overflow-hidden flex-shrink-0 border-4"
                      style={{ width: 'clamp(70px,10vw,120px)', height: 'clamp(70px,10vw,120px)', borderColor: tc.primary, background: tc.primary + '33' }}>
                      <img src={tLogo} alt={t} className="w-full h-full object-contain" />
                    </div>
                    <div className="text-center">
                      <div className="font-black text-white uppercase leading-none"
                        style={{ fontSize: 'clamp(1.1rem,2.8vw,2rem)', letterSpacing: '0.06em', textShadow: '0 2px 16px rgba(0,0,0,0.9)' }}>{t}</div>
                      <div className="font-black uppercase tracking-widest mt-1"
                        style={{ color: tc.primary, fontSize: 'clamp(0.65rem,1.1vw,0.85rem)' }}>ACQUIRES</div>
                    </div>
                  </div>
                  {/* Divider */}
                  <div className="mx-6 flex-shrink-0" style={{ height: '2px', background: `linear-gradient(90deg, transparent, ${tc.primary}88, transparent)` }} />
                  {/* Asset list */}
                  <div className="relative z-10 flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ scrollbarWidth: 'none' }}>
                    {acquired.length === 0 ? (
                      <div className="text-white/25 text-sm text-center font-semibold pt-4">— nothing —</div>
                    ) : (
                      acquired.map((a, i) => <AcquiredAsset key={i} asset={a} ec1={ec1} />)
                    )}
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
