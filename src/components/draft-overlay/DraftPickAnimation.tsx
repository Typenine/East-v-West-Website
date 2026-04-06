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
    imageUrl?: string;
  };
  fantasyTeam: {
    name: string;
    colors: [string, string, string | null];
    logoPath: string | null;
  };
  pickNumber: number;
  round: number;
  pickInRound: number;
  onComplete?: () => void;
  eventLogoUrl?: string | null;
}

function toOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function DraftPickAnimation({
  player,
  fantasyTeam,
  pickNumber,
  round,
  pickInRound,
  onComplete,
  eventLogoUrl,
}: DraftPickAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    if (timelineRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    // Scoped DOM queries — guaranteed to find elements within this instance only
    const teamIntro    = container.querySelector<HTMLElement>('.gsap-team-intro');
    const teamNameBg   = container.querySelector<HTMLElement>('.gsap-team-name-bg');
    const teamLogo     = container.querySelector<HTMLElement>('.gsap-team-logo');
    const teamNameText = container.querySelector<HTMLElement>('.gsap-team-name-text');
    const wipe         = container.querySelector<HTMLElement>('.gsap-transition-wipe');
    const draftCard    = container.querySelector<HTMLElement>('.gsap-draft-card');
    const draftOrdinal  = container.querySelector<HTMLElement>('.gsap-draft-ordinal');
    const draftOverall  = container.querySelector<HTMLElement>('.gsap-draft-overall');
    const textReveal    = container.querySelector<HTMLElement>('.gsap-text-reveal');
    const revealName    = container.querySelector<HTMLElement>('.gsap-reveal-name');
    const revealDetails = container.querySelector<HTMLElement>('.gsap-reveal-details');
    const playerCard      = container.querySelector<HTMLElement>('.gsap-player-card');
    const playerDets      = container.querySelector<HTMLElement>('.gsap-player-details');
    const playerName      = container.querySelector<HTMLElement>('.gsap-player-name');
    const pickInfo        = container.querySelector<HTMLElement>('.gsap-pick-info');
    const eventLogoFeat   = container.querySelector<HTMLElement>('.gsap-event-logo-feat');
    const eventLogoCorner = container.querySelector<HTMLElement>('.gsap-event-logo-corner');

    if (!teamIntro || !wipe || !draftCard || !textReveal || !playerCard) {
      console.error('[DraftPickAnimation] Missing critical DOM elements — aborting');
      return;
    }
    if (eventLogoFeat)   gsap.set(eventLogoFeat,   { opacity: 0, scale: 0.7, force3D: true });
    if (eventLogoCorner) gsap.set(eventLogoCorner, { opacity: 0, force3D: true });

    console.log('[DraftPickAnimation] Starting for:', player.name);

    // ── INITIAL STATES ───────────────────────────────────────────────────────
    // Full-screen layers: opacity only (no scale — scaling viewport = slow repaint)
    // Small elements: scale + opacity allowed (compositor handles them cheaply)
    gsap.set(teamIntro,    { opacity: 0, force3D: true });
    gsap.set(teamNameBg,   { opacity: 0, force3D: true });
    gsap.set(teamNameText, { opacity: 0, y: 40, force3D: true });
    if (teamLogo) gsap.set(teamLogo, { opacity: 0, scale: 0.8, force3D: true });
    gsap.set(wipe,         { scaleX: 0, transformOrigin: 'left center', force3D: true });
    gsap.set(draftCard,    { opacity: 0, force3D: true });
    if (draftOrdinal)  gsap.set(draftOrdinal,  { opacity: 0, y: -30, force3D: true });
    if (draftOverall)  gsap.set(draftOverall,  { opacity: 0, y: 30, force3D: true });
    gsap.set(textReveal,   { opacity: 0, force3D: true });
    if (revealName)    gsap.set(revealName,    { opacity: 0, y: 36, force3D: true });
    if (revealDetails) gsap.set(revealDetails, { opacity: 0, y: 24, force3D: true });
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

    // PHASE 0: Featured event logo moment — opens the sequence before team intro
    if (eventLogoFeat) {
      tl.to(eventLogoFeat, { opacity: 1, scale: 1, duration: 0.55, ease: 'back.out(1.4)', force3D: true });
      tl.to({}, { duration: 1.3 }); // hold
      tl.to(eventLogoFeat, { opacity: 0, duration: 0.35, ease: 'power2.in', force3D: true });
    }

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
    if (draftOrdinal) tl.to(draftOrdinal, { opacity: 1, y: 0, duration: 0.5,  ease: 'power2.out', force3D: true }, '-=0.2');
    if (draftOverall) tl.to(draftOverall, { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out', force3D: true }, '-=0.35');
    tl.to({}, { duration: 0.9 }); // hold

    // PHASE 4: Ordinal card out
    tl.to(draftCard, { opacity: 0, duration: 0.35, ease: 'power2.in', force3D: true });

    // PHASE 5: Text reveal — name + details before card (5.5–7.3s)
    tl.to(textReveal,   { opacity: 1, duration: 0.4,  ease: 'power2.out', force3D: true }, '-=0.1');
    if (revealName)    tl.to(revealName,    { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', force3D: true }, '-=0.25');
    if (revealDetails) tl.to(revealDetails, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', force3D: true }, '-=0.3');
    tl.to({}, { duration: 1.0 }); // hold on text

    // PHASE 6: Player card sweeps in over text (7.3–9.0s)
    tl.to(textReveal, { opacity: 0, duration: 0.3, ease: 'power1.in', force3D: true });
    tl.to(playerCard, { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', force3D: true }, '-=0.15');
    if (playerDets)      tl.to(playerDets,      { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', force3D: true }, '-=0.25');
    if (playerName)      tl.to(playerName,      { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', force3D: true }, '-=0.3');
    if (pickInfo)        tl.to(pickInfo,        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', force3D: true }, '-=0.3');
    // Corner watermark fades in on the broadcast hold frame
    if (eventLogoCorner) tl.to(eventLogoCorner, { opacity: 0.55, duration: 0.5, ease: 'power2.out', force3D: true }, '-=0.2');

    // PHASE 7: Broadcast hold (9.0–12.0s)
    tl.to({}, { duration: 3.0 });

    // PHASE 8: Exit
    tl.to(container, { opacity: 0, duration: 0.8, ease: 'power2.inOut', force3D: true });

    return () => {
      const tl = timelineRef.current;
      if (tl) {
        tl.kill();
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
            className="gsap-draft-ordinal font-black"
            style={{
              fontSize: 'clamp(7rem, 18vw, 16rem)',
              letterSpacing: '-0.02em',
              lineHeight: 0.9,
              color: c1,
              textShadow: `0 4px 32px rgba(0,0,0,0.85)`,
              WebkitTextStroke: `2px ${c2}`,
              willChange: 'transform, opacity',
            }}
          >
            {toOrdinal(pickNumber)}
          </div>
          <div
            className="gsap-draft-overall font-black uppercase"
            style={{
              fontSize: 'clamp(1.75rem, 4vw, 3.5rem)',
              letterSpacing: '0.25em',
              color: '#d0d0d0',
              textShadow: '0 2px 12px rgba(0,0,0,0.9)',
              willChange: 'transform, opacity',
            }}
          >
            Overall Pick
          </div>
        </div>
      </div>

      {/* ── PHASE 4b: Featured event logo moment ── */}
      {eventLogoUrl && (
        <div
          className="gsap-event-logo-feat absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ willChange: 'transform, opacity' }}
        >
          <img
            src={eventLogoUrl}
            alt=""
            className="object-contain"
            style={{ width: 'clamp(140px, 22vw, 200px)', height: 'clamp(140px, 22vw, 200px)' }}
          />
        </div>
      )}

      {/* ── PHASE 5: Text reveal ── */}
      <div
        className="gsap-text-reveal absolute inset-0 flex flex-col items-center justify-center"
        style={{ willChange: 'opacity' }}
      >
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse at 50% 45%, ${c1}2a 0%, #0d0d0d 65%)` }}
        />
        <div className="relative z-10 text-center px-8 select-none">
          <div
            className="gsap-reveal-name font-black text-white uppercase leading-none"
            style={{
              fontSize: 'clamp(3rem, 8vw, 7rem)',
              letterSpacing: '-0.01em',
              textShadow: `0 4px 24px rgba(0,0,0,0.9), 0 0 60px ${c1}44`,
              willChange: 'transform, opacity',
            }}
          >
            {player.name}
          </div>
          <div
            className="gsap-reveal-details mt-6 flex items-center justify-center gap-4 flex-wrap"
            style={{ willChange: 'transform, opacity' }}
          >
            <span
              className="inline-block font-black text-2xl px-5 py-1.5 rounded-lg"
              style={{ background: c1, color: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}
            >
              {player.position}
            </span>
            {player.college && (
              <span className="text-white/75 text-xl font-bold uppercase tracking-wider">
                {player.college}
              </span>
            )}
            {player.team && (
              <span className="text-white/75 text-xl font-bold uppercase tracking-wider">
                {player.team}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── PHASE 6: Player card ── */}
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
              className="flex-shrink-0 flex items-center justify-center overflow-hidden"
              style={{ width: '220px', background: `${c1}88` }}
            >
              {player.imageUrl ? (
                <img
                  src={player.imageUrl}
                  alt={player.name}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: 'top center' }}
                />
              ) : teamLogo ? (
                <img
                  src={teamLogo}
                  alt={fantasyTeam.name}
                  className="w-40 h-40 object-contain"
                />
              ) : null}
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

      {/* ── Corner watermark: event logo on player card phase ── */}
      {eventLogoUrl && (
        <img
          src={eventLogoUrl}
          alt=""
          className="gsap-event-logo-corner absolute bottom-6 right-8 object-contain pointer-events-none"
          style={{ width: '56px', height: '56px', willChange: 'opacity' }}
        />
      )}
    </div>
  );
}
