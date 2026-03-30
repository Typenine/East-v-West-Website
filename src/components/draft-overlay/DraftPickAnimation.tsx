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

    if (timelineRef.current) timelineRef.current.kill();

    const tl = gsap.timeline({ onComplete: () => onComplete?.() });
    timelineRef.current = tl;

    // ── GPU LAYER PROMOTION ──────────────────────────────────────────────────
    // Promote all animated elements to their own compositor layers up front.
    // This prevents the browser from repainting the whole screen on each frame.
    // We ONLY use opacity + translateY/translateX on full-screen layers (never
    // scale), because scaling a viewport-sized element repaints every pixel.
    gsap.set([
      '.gsap-team-intro',
      '.gsap-team-name-bg',
      '.gsap-team-logo',
      '.gsap-team-name-text',
      '.gsap-transition-wipe',
      '.gsap-draft-card',
      '.gsap-draft-year',
      '.gsap-draft-word',
      '.gsap-player-card',
      '.gsap-player-details',
      '.gsap-player-name',
      '.gsap-pick-info',
    ], { force3D: true, willChange: 'transform, opacity' });

    // ── INITIAL STATES ───────────────────────────────────────────────────────
    // Use translateY instead of scale on full-screen layers — GPU-cheap.
    gsap.set('.gsap-team-intro',    { opacity: 0, y: 0 });
    gsap.set('.gsap-team-name-bg',  { opacity: 0 });
    gsap.set('.gsap-team-logo',     { opacity: 0, scale: 0.85 });
    gsap.set('.gsap-team-name-text',{ opacity: 0, y: 40 });
    gsap.set('.gsap-transition-wipe', { scaleX: 0, transformOrigin: 'left center' });
    gsap.set('.gsap-draft-card',    { opacity: 0 });
    gsap.set('.gsap-draft-year',    { opacity: 0, y: -30 });
    gsap.set('.gsap-draft-word',    { opacity: 0, y: 30 });
    gsap.set('.gsap-player-card',   { opacity: 0, y: 30 });
    gsap.set('.gsap-player-details',{ opacity: 0, y: 24 });
    gsap.set('.gsap-player-name',   { opacity: 0, y: 24 });
    gsap.set('.gsap-pick-info',     { opacity: 0, y: 24 });

    // ── TIMELINE ─────────────────────────────────────────────────────────────
    tl
      // PHASE 1: Team intro — fade in background, then logo + name slide up (0–2.4s)
      .to('.gsap-team-intro', { opacity: 1, duration: 0.5, ease: 'power2.out' })
      .to('.gsap-team-name-bg', { opacity: 1, duration: 0.7, ease: 'sine.inOut' }, '-=0.2')
      .to('.gsap-team-logo', {
        opacity: 0.35, scale: 1, duration: 0.8, ease: 'power2.out',
      }, '-=0.5')
      .to('.gsap-team-name-text', {
        opacity: 1, y: 0, duration: 0.7, ease: 'power3.out',
      }, '-=0.5')

      // hold on team intro
      .to({}, { duration: 0.9 })

      // PHASE 2: Color wipe sweeps across, clearing team intro (2.4–3.1s)
      .to('.gsap-transition-wipe', {
        scaleX: 1, duration: 0.55, ease: 'power2.inOut',
      })
      .to('.gsap-team-intro', {
        opacity: 0, duration: 0.25, ease: 'power1.in',
      }, '-=0.25')

      // PHASE 3: Draft card fades in as wipe retracts (3.1–5.0s)
      .to('.gsap-draft-card', { opacity: 1, duration: 0.4, ease: 'power2.out' }, '-=0.1')
      .to('.gsap-transition-wipe', {
        scaleX: 0, transformOrigin: 'right center', duration: 0.5, ease: 'power2.inOut',
      }, '-=0.3')
      .to('.gsap-draft-year', { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, '-=0.2')
      .to('.gsap-draft-word', { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out' }, '-=0.35')

      // hold on draft card
      .to({}, { duration: 1.1 })

      // PHASE 4: Draft card fades out (5.0–5.4s)
      .to('.gsap-draft-card', { opacity: 0, duration: 0.4, ease: 'power2.in' })

      // PHASE 5: Player card rises in (5.4–7.0s)
      .to('.gsap-player-card', { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out' }, '-=0.1')
      .to('.gsap-player-details', { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, '-=0.25')
      .to('.gsap-player-name',    { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, '-=0.3')
      .to('.gsap-pick-info',      { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, '-=0.3')

      // PHASE 6: Broadcast hold (7.0–9.2s)
      .to({}, { duration: 2.2 })

      // PHASE 7: Clean exit — fade whole container (9.2–10.0s)
      .to(container, { opacity: 0, duration: 0.8, ease: 'power2.inOut' });

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
      style={{ backgroundColor: '#0a0a0a' }}
    >
      {/* ── PHASE 1: Team Intro ── */}
      <div className="gsap-team-intro absolute inset-0">
        {/* Solid dark background with team color tint */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 50% 50%, ${c1}22 0%, #0d0d0d 70%)`,
          }}
        />
        {/* Repeating team-name watermark pattern */}
        <div className="gsap-team-name-bg absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='320' height='160' xmlns='http://www.w3.org/2000/svg'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial Black,sans-serif' font-size='28' font-weight='900' fill='${encodeURIComponent(c2.replace('#', '%23'))}' fill-opacity='0.09' transform='rotate(-12 160 80)'%3E${encodeURIComponent(fantasyTeam.name.toUpperCase())}%3C%2Ftext%3E%3C%2Fsvg%3E")`,
              backgroundSize: '320px 160px',
            }}
          />
        </div>
        {/* Team logo — centered, large, subtle */}
        <div className="absolute inset-0 flex items-center justify-center">
          {teamLogo && (
            <img
              src={teamLogo}
              alt=""
              className="gsap-team-logo w-80 h-80 object-contain"
            />
          )}
        </div>
        {/* Team name — big, bold, slides up */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="gsap-team-name-text text-center px-8 leading-none font-black text-white uppercase"
            style={{
              fontFamily: 'Impact, "Arial Black", sans-serif',
              fontSize: 'clamp(4rem, 10vw, 9rem)',
              letterSpacing: '0.12em',
              textShadow: `0 4px 24px rgba(0,0,0,0.95), 0 0 60px ${c1}55`,
              WebkitTextStroke: `3px ${c2}`,
            }}
          >
            {fantasyTeam.name}
          </div>
        </div>
      </div>

      {/* ── PHASE 2: Color wipe ── */}
      <div
        className="gsap-transition-wipe absolute inset-0"
        style={{ background: `linear-gradient(90deg, ${c1} 0%, ${c2} 100%)` }}
      />

      {/* ── PHASE 3: Draft card ── */}
      <div className="gsap-draft-card absolute inset-0 flex flex-col items-center justify-center">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 50% 40%, ${c1}33 0%, #0d0d0d 65%)`,
          }}
        />
        <div className="relative z-10 flex flex-col items-center select-none">
          <div
            className="gsap-draft-year font-black text-white"
            style={{
              fontSize: 'clamp(3rem, 7vw, 6rem)',
              letterSpacing: '0.2em',
              textShadow: `0 2px 16px rgba(0,0,0,0.9)`,
              color: '#e0e0e0',
            }}
          >
            {year}
          </div>
          <div
            className="gsap-draft-word font-black uppercase"
            style={{
              fontSize: 'clamp(6rem, 18vw, 16rem)',
              letterSpacing: '0.1em',
              lineHeight: 0.9,
              color: c1,
              textShadow: `0 4px 32px rgba(0,0,0,0.8), 0 0 80px ${c1}66`,
              WebkitTextStroke: `2px ${c2}`,
            }}
          >
            DRAFT
          </div>
        </div>
      </div>

      {/* ── PHASE 5: Player card ── */}
      <div className="gsap-player-card absolute inset-0 flex items-center justify-center">
        {/* Colored background behind card */}
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse at 50% 50%, ${c1}28 0%, #0d0d0d 70%)` }}
        />
        {/* The card itself */}
        <div
          className="relative z-10 rounded-2xl overflow-hidden"
          style={{
            width: 'min(900px, 90vw)',
            background: `linear-gradient(135deg, ${c1}ee 0%, ${c2}ee 100%)`,
            boxShadow: `0 24px 80px rgba(0,0,0,0.7), 0 0 60px ${c1}44`,
          }}
        >
          <div className="flex items-stretch" style={{ minHeight: '420px' }}>
            {/* Left accent bar */}
            <div className="w-3 flex-shrink-0" style={{ background: c2 }} />

            {/* Logo column */}
            <div
              className="flex-shrink-0 flex items-center justify-center p-8"
              style={{ width: '220px', background: `${c1}88` }}
            >
              {teamLogo && (
                <img
                  src={teamLogo}
                  alt={fantasyTeam.name}
                  className="w-40 h-40 object-contain drop-shadow-2xl"
                />
              )}
            </div>

            {/* Content column */}
            <div className="flex-1 flex flex-col justify-center px-10 py-8">
              {/* Position badge */}
              <div className="gsap-player-details mb-5">
                <span
                  className="inline-block font-black text-3xl px-6 py-2 rounded-lg"
                  style={{
                    background: '#fff',
                    color: c1,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                  }}
                >
                  {player.position}
                </span>
                {(player.team || player.college) && (
                  <span className="ml-4 text-white/80 text-xl font-bold uppercase tracking-wider">
                    {player.team || player.college}
                  </span>
                )}
              </div>

              {/* Player name */}
              <div className="gsap-player-name mb-6">
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

              {/* Round / Pick / Overall */}
              <div className="gsap-pick-info flex gap-8">
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
