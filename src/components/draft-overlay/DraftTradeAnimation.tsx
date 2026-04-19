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
  const toColors = getTeamColors(asset.toTeam);
  const fromColors = getTeamColors(asset.fromTeam);
  const toLogo = getTeamLogoPath(asset.toTeam);
  const fromLogo = getTeamLogoPath(asset.fromTeam);

  const mainLabel =
    asset.assetType === 'player' ? (asset.playerName || '—') :
    asset.assetType === 'current_pick' ? `Pick #${asset.pickOverall}` :
    `${asset.pickYear} Round ${asset.pickRound}`;

  const subLabel =
    asset.assetType === 'current_pick' ? `Round ${asset.pickRound}` :
    asset.assetType === 'future_pick' && asset.pickOriginalTeam && asset.pickOriginalTeam !== asset.fromTeam
      ? `via ${asset.pickOriginalTeam}` : null;

  return (
    <div className="rounded-xl overflow-hidden" style={{
      border: `2px solid ${toColors.primary}77`,
      background: 'rgba(255,255,255,0.03)',
    }}>
      {/* Asset identity */}
      <div className="flex items-center gap-3 px-5 py-4">
        {asset.assetType === 'player' && asset.playerPos && (
          <span className="font-black px-3 py-1.5 rounded-lg text-white flex-shrink-0"
            style={{ background: POS_COLORS[asset.playerPos] || '#555', fontSize: 'clamp(0.85rem,1.4vw,1.05rem)', minWidth:'46px', textAlign:'center' }}>
            {asset.playerPos}
          </span>
        )}
        {asset.assetType === 'current_pick' && (
          <span className="font-black flex-shrink-0" style={{ color: ec1, fontSize: 'clamp(1.4rem,2.5vw,1.8rem)' }}>⦿</span>
        )}
        {asset.assetType === 'future_pick' && (
          <span className="font-black flex-shrink-0 text-sky-400" style={{ fontSize: 'clamp(1.4rem,2.5vw,1.8rem)' }}>◈</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-black text-white truncate" style={{ fontSize: 'clamp(1.1rem,2.2vw,1.55rem)', letterSpacing:'0.01em' }}>{mainLabel}</div>
          {subLabel && <div className="text-white/45 font-semibold mt-0.5" style={{ fontSize:'clamp(0.75rem,1.2vw,0.9rem)' }}>{subLabel}</div>}
        </div>
        {/* From team chip */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-shrink-0" style={{ background: fromColors.primary + '33', border: `1px solid ${fromColors.primary}55` }}>
          <img src={fromLogo} alt={asset.fromTeam} className="object-contain" style={{ width:'16px', height:'16px' }} />
          <span className="text-white/70 font-bold" style={{ fontSize:'clamp(0.65rem,1vw,0.78rem)' }}>{asset.fromTeam}</span>
        </div>
      </div>
      {/* Receiving team — bold colored band */}
      <div className="flex items-center gap-3 px-5 py-3" style={{
        background: `linear-gradient(90deg, ${toColors.primary}bb 0%, ${toColors.primary}55 50%, ${toColors.primary}22 100%)`,
        borderTop: `2px solid ${toColors.primary}`,
      }}>
        <span className="text-white/70 text-xs font-black uppercase tracking-widest flex-shrink-0">GOES TO</span>
        <img src={toLogo} alt={asset.toTeam} className="object-contain flex-shrink-0" style={{ width:'30px', height:'30px' }} />
        <span className="font-black text-white" style={{ fontSize:'clamp(0.95rem,1.9vw,1.3rem)', letterSpacing:'0.04em' }}>{asset.toTeam}</span>
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

      {/* ── PHASE 3: Trade Details Card ─────────────────────────────────── */}
      <div className="gtrade-details absolute inset-0 flex items-center justify-center px-6" style={{ willChange: 'opacity, visibility' }}>
        {/* Diagonal team-color bg */}
        <div className="absolute inset-0" style={{
          background: `linear-gradient(135deg, ${c1.primary}44 0%, #080810 40%, #080810 60%, ${c2.primary}44 100%)`,
        }} />
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 50%, ${ec1}12 0%, transparent 70%)` }} />

        <div
          className="gtrade-card relative z-10 rounded-2xl overflow-hidden w-full"
          style={{
            maxWidth: 'min(1000px, 94vw)',
            background: `linear-gradient(160deg, ${c1.primary}22 0%, #0e0e1a 30%, #0e0e1a 70%, ${c2.primary}22 100%)`,
            border: `2px solid ${ec1}66`,
            boxShadow: `0 30px 90px rgba(0,0,0,0.9), 0 0 80px ${ec1}22, inset 0 1px 0 rgba(255,255,255,0.06)`,
            willChange: 'transform, opacity',
          }}
        >
          {/* Card header — full-width gradient bar */}
          <div className="flex items-center gap-5 px-8 py-6" style={{
            background: `linear-gradient(90deg, ${c1.primary}cc 0%, ${ec1}aa 50%, ${c2.primary}cc 100%)`,
            borderBottom: `3px solid ${ec1}`,
          }}>
            {eventLogoUrl && (
              <img src={eventLogoUrl} alt="" className="object-contain flex-shrink-0 drop-shadow-lg"
                style={{ width: '52px', height: '52px' }} />
            )}
            <div className="flex-1">
              <div className="font-black uppercase" style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', color: '#fff', letterSpacing: '0.12em', textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>
                TRADE ALERT
              </div>
              <div className="text-white/70 font-bold tracking-wider mt-0.5" style={{ fontSize: 'clamp(0.8rem, 1.5vw, 1rem)' }}>{teams.join(' ↔ ')}</div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {teams.map(t => {
                const tc = getTeamColors(t);
                return (
                  <div key={t} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(0,0,0,0.4)', border: `2px solid ${tc.primary}88` }}>
                    <img src={getTeamLogoPath(t)} alt={t} className="object-contain" style={{ width: '28px', height: '28px' }} />
                    <span className="text-white font-black" style={{ fontSize: 'clamp(0.75rem, 1.2vw, 0.9rem)' }}>{t}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Asset cards — flat, each card shows from→to explicitly */}
          <div className="px-6 pb-6 pt-4" style={{
            display: 'grid',
            gridTemplateColumns: assets.length > 3 ? 'repeat(2, 1fr)' : '1fr',
            gap: 'clamp(8px, 1.2vw, 14px)',
          }}>
            {assets.map((a, i) => <AssetLine key={i} asset={a} ec1={ec1} />)}
          </div>
        </div>
      </div>

    </div>
  );
}
