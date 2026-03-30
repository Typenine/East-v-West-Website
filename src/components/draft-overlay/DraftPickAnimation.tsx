'use client';

/* eslint-disable @next/next/no-img-element -- Using <img> for GSAP animations that need direct DOM access */

import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { getTeamLogoPath } from '@/lib/utils/team-utils';

interface DraftPickAnimationProps {
  player: {
    name: string;
    position: string;
    team?: string;
    college?: string;
  };
  fantasyTeam: {
    name: string;
    colors: [string, string, string | null];
    logoPath: string | null;
  };
  pickNumber: number;
  round: number;
  pickInRound: number;
  year: number;
  onComplete?: () => void;
}

export default function DraftPickAnimation({
  player,
  fantasyTeam,
  pickNumber,
  round,
  pickInRound,
  year,
  onComplete,
}: DraftPickAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const container = containerRef.current;
    if (!container) return;

    // Scoped DOM queries — guaranteed to find elements within this instance only
    const teamIntro    = container.querySelector<HTMLElement>('.gsap-team-intro');
    const teamNameBg   = container.querySelector<HTMLElement>('.gsap-team-name-bg');
    const teamLogo     = container.querySelector<HTMLElement>('.gsap-team-logo');
    const teamNameText = container.querySelector<HTMLElement>('.gsap-team-name-text');
    const wipe         = container.querySelector<HTMLElement>('.gsap-transition-wipe');
    const draftCard    = container.querySelector<HTMLElement>('.gsap-draft-card');
    const draftYear    = container.querySelector<HTMLElement>('.gsap-draft-year');
    const draftWord    = container.querySelector<HTMLElement>('.gsap-draft-word');
    const playerCard   = container.querySelector<HTMLElement>('.gsap-player-card');
    const playerDets   = container.querySelector<HTMLElement>('.gsap-player-details');
    const playerName   = container.querySelector<HTMLElement>('.gsap-player-name');
    const pickInfo     = container.querySelector<HTMLElement>('.gsap-pick-info');

    if (!teamIntro || !wipe || !draftCard || !playerCard) {
      console.error('[DraftPickAnimation] Missing critical DOM elements — aborting');
      return;
    }

    console.log('[DraftPickAnimation] Starting for:', player.name);

    if (timelineRef.current) timelineRef.current.kill();

    // ── INITIAL STATES ───────────────────────────────────────────────────────
    // Full-screen layers: opacity only (no scale — scaling viewport = slow repaint)
    // Small elements: scale + opacity allowed (compositor handles them cheaply)
    gsap.set(teamIntro,    { opacity: 0, force3D: true });
    gsap.set(teamNameBg,   { opacity: 0, force3D: true });
    gsap.set(teamNameText, { opacity: 0, y: 40, force3D: true });
    if (teamLogo) gsap.set(teamLogo, { opacity: 0, scale: 0.8, force3D: true });
    gsap.set(wipe,         { scaleX: 0, transformOrigin: 'left center', force3D: true });
    gsap.set(draftCard,    { opacity: 0, force3D: true });
    if (draftYear) gsap.set(draftYear, { opacity: 0, y: -28, force3D: true });
    if (draftWord) gsap.set(draftWord, { opacity: 0, y: 28, force3D: true });
    gsap.set(playerCard,   { opacity: 0, y: 32, force3D: true });
    if (playerDets) gsap.set(playerDets, { opacity: 0, y: 20, force3D: true });
    if (playerName) gsap.set(playerName, { opacity: 0, y: 20, force3D: true });
    if (pickInfo)   gsap.set(pickInfo,   { opacity: 0, y: 20, force3D: true });

    // ── TIMELINE (~10s total) ─────────────────────────────────────────────────
    const tl = gsap.timeline({
      onComplete: () => {
        console.log('[DraftPickAnimation] Complete');
        onComplete?.();
      },
    });
    timelineRef.current = tl;

    // PHASE 1: Team intro (0–2.5s)
    tl.to(teamIntro,   { opacity: 1, duration: 0.5, ease: 'power2.out', force3D: true });
    tl.to(teamNameBg,  { opacity: 1, duration: 0.7, ease: 'sine.inOut', force3D: true }, '-=0.2');
    if (teamLogo) tl.to(teamLogo, { opacity: 0.35, scale: 1, duration: 0.8, ease: 'power2.out', force3D: true }, '-=0.5');
    tl.to(teamNameText, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', force3D: true }, '-=0.5');
    tl.to({}, { duration: 0.9 }); // hold

    // PHASE 2: Color wipe clears team intro (2.5–3.1s)
    tl.to(wipe,      { scaleX: 1, duration: 0.55, ease: 'power2.inOut', force3D: true });
    tl.to(teamIntro, { opacity: 0, duration: 0.25, ease: 'power1.in', force3D: true }, '-=0.25');

    // PHASE 3: Draft card in as wipe retracts (3.1–5.1s)
    tl.to(draftCard, { opacity: 1, duration: 0.4, ease: 'power2.out', force3D: true }, '-=0.1');
    tl.to(wipe,      { scaleX: 0, transformOrigin: 'right center', duration: 0.5, ease: 'power2.inOut', force3D: true }, '-=0.3');
    if (draftYear) tl.to(draftYear, { opacity: 1, y: 0, duration: 0.5,  ease: 'power2.out', force3D: true }, '-=0.2');
    if (draftWord) tl.to(draftWord, { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out', force3D: true }, '-=0.35');
    tl.to({}, { duration: 1.1 }); // hold

    // PHASE 4: Draft card out (5.1–5.5s)
    tl.to(draftCard, { opacity: 0, duration: 0.4, ease: 'power2.in', force3D: true });

    // PHASE 5: Player card in (5.5–7.2s)
    tl.to(playerCard, { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', force3D: true }, '-=0.1');
    if (playerDets) tl.to(playerDets, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', force3D: true }, '-=0.25');
    if (playerName) tl.to(playerName, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', force3D: true }, '-=0.3');
    if (pickInfo)   tl.to(pickInfo,   { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', force3D: true }, '-=0.3');

    // PHASE 6: Broadcast hold (7.2–9.4s)
    tl.to({}, { duration: 2.2 });

    // PHASE 7: Exit (9.4–10.2s)
    tl.to(container, { opacity: 0, duration: 0.8, ease: 'power2.inOut', force3D: true });

    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
        timelineRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c1 = fantasyTeam.colors[0];
  const c2 = fantasyTeam.colors[1] || fantasyTeam.colors[0];
  const teamLogo = getTeamLogoPath(fantasyTeam.name);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
      style={{ backgroundColor: '#0a0a0a', willChange: 'opacity' }}
    >
      {/* ── PHASE 1: Team Intro ── */}
      <div
        className="gsap-team-intro absolute inset-0"
        style={{ willChange: 'opacity' }}
      >
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse at 50% 50%, ${c1}22 0%, #0d0d0d 70%)` }}
        />
        <div
          className="gsap-team-name-bg absolute inset-0"
          style={{ willChange: 'opacity' }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='320' height='160' xmlns='http://www.w3.org/2000/svg'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial Black,sans-serif' font-size='28' font-weight='900' fill='${encodeURIComponent(c2.replace('#', '%23'))}' fill-opacity='0.09' transform='rotate(-12 160 80)'%3E${encodeURIComponent(fantasyTeam.name.toUpperCase())}%3C%2Ftext%3E%3C%2Fsvg%3E")`,
              backgroundSize: '320px 160px',
            }}
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          {teamLogo && (
            <img
              src={teamLogo}
              alt=""
              className="gsap-team-logo w-80 h-80 object-contain"
              style={{ willChange: 'transform, opacity' }}
            />
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="gsap-team-name-text text-center px-8 leading-none font-black text-white uppercase"
            style={{
              fontFamily: 'Impact, "Arial Black", sans-serif',
              fontSize: 'clamp(4rem, 10vw, 9rem)',
              letterSpacing: '0.12em',
              textShadow: `0 4px 24px rgba(0,0,0,0.95), 0 0 60px ${c1}55`,
              WebkitTextStroke: `3px ${c2}`,
              willChange: 'transform, opacity',
            }}
          >
            {fantasyTeam.name}
          </div>
        </div>
      </div>

      {/* ── PHASE 2: Color wipe ── */}
      <div
        className="gsap-transition-wipe absolute inset-0"
        style={{
          background: `linear-gradient(90deg, ${c1} 0%, ${c2} 100%)`,
          willChange: 'transform',
        }}
      />

      {/* ── PHASE 3: Draft card ── */}
      <div
        className="gsap-draft-card absolute inset-0 flex flex-col items-center justify-center"
        style={{ willChange: 'opacity' }}
      >
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse at 50% 40%, ${c1}33 0%, #0d0d0d 65%)` }}
        />
        <div className="relative z-10 flex flex-col items-center select-none">
          <div
            className="gsap-draft-year font-black"
            style={{
              fontSize: 'clamp(3rem, 7vw, 6rem)',
              letterSpacing: '0.2em',
              color: '#e0e0e0',
              textShadow: '0 2px 12px rgba(0,0,0,0.9)',
              willChange: 'transform, opacity',
            }}
          >
            {year}
          </div>
          <div
            className="gsap-draft-word font-black uppercase"
            style={{
              fontSize: 'clamp(6rem, 18vw, 14rem)',
              letterSpacing: '0.08em',
              lineHeight: 0.9,
              color: c1,
              textShadow: `0 4px 24px rgba(0,0,0,0.8)`,
              WebkitTextStroke: `2px ${c2}`,
              willChange: 'transform, opacity',
            }}
          >
            DRAFT
          </div>
        </div>
      </div>

      {/* ── PHASE 5: Player card ── */}
      <div
        className="gsap-player-card absolute inset-0 flex items-center justify-center"
        style={{ willChange: 'transform, opacity' }}
      >
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse at 50% 50%, ${c1}28 0%, #0d0d0d 70%)` }}
        />
        <div
          className="relative z-10 rounded-2xl overflow-hidden"
          style={{
            width: 'min(900px, 90vw)',
            background: `linear-gradient(135deg, ${c1}ee 0%, ${c2}ee 100%)`,
            boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 60px ${c1}44`,
          }}
        >
          <div className="flex items-stretch" style={{ minHeight: '420px' }}>
            <div className="w-3 flex-shrink-0" style={{ background: c2 }} />
            <div
              className="flex-shrink-0 flex items-center justify-center p-8"
              style={{ width: '220px', background: `${c1}88` }}
            >
              {teamLogo && (
                <img
                  src={teamLogo}
                  alt={fantasyTeam.name}
                  className="w-40 h-40 object-contain"
                />
              )}
            </div>
            <div className="flex-1 flex flex-col justify-center px-10 py-8">
              <div
                className="gsap-player-details mb-5"
                style={{ willChange: 'transform, opacity' }}
              >
                <span
                  className="inline-block font-black text-3xl px-6 py-2 rounded-lg"
                  style={{ background: '#fff', color: c1, boxShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
                >
                  {player.position}
                </span>
                {(player.team || player.college) && (
                  <span className="ml-4 text-white/80 text-xl font-bold uppercase tracking-wider">
                    {player.team || player.college}
                  </span>
                )}
              </div>
              <div
                className="gsap-player-name mb-6"
                style={{ willChange: 'transform, opacity' }}
              >
                <h1
                  className="font-black text-white leading-none uppercase"
                  style={{
                    fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
                    textShadow: '0 3px 12px rgba(0,0,0,0.8)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {player.name}
                </h1>
              </div>
              <div
                className="gsap-pick-info flex gap-8"
                style={{ willChange: 'transform, opacity' }}
              >
                {[
                  { label: 'ROUND', value: round },
                  { label: 'PICK', value: pickInRound },
                  { label: 'OVERALL', value: pickNumber },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center">
                    <div className="text-white/70 text-sm font-bold tracking-widest mb-1">{label}</div>
                    <div
                      className="font-black text-white"
                      style={{ fontSize: '3.5rem', textShadow: '0 2px 8px rgba(0,0,0,0.8)', lineHeight: 1 }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
