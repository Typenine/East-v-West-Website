'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { getTeamLogoPath } from '@/lib/utils/team-utils';

interface NowOnClockAnimationProps {
  team: {
    name: string;
    colors: [string, string, string | null];
  };
  pickNumber: number;
  round: number;
  pickInRound: number;
  onComplete?: () => void;
}

export default function NowOnClockAnimation({
  team,
  pickNumber,
  round,
  pickInRound,
  onComplete,
}: NowOnClockAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const container = containerRef.current;
    if (!container) return;

    const bg        = container.querySelector<HTMLElement>('.noc-bg');
    const stripe    = container.querySelector<HTMLElement>('.noc-stripe');
    const label     = container.querySelector<HTMLElement>('.noc-label');
    const logo      = container.querySelector<HTMLElement>('.noc-logo');
    const teamName  = container.querySelector<HTMLElement>('.noc-team-name');
    const pickMeta  = container.querySelector<HTMLElement>('.noc-pick-meta');

    if (!bg || !stripe || !label) {
      console.error('[NowOnClockAnimation] Missing critical elements');
      return;
    }

    console.log('[NowOnClockAnimation] Starting for:', team.name);

    gsap.set(bg,       { opacity: 0, force3D: true });
    gsap.set(stripe,   { scaleX: 0, transformOrigin: 'left center', force3D: true });
    gsap.set(label,    { opacity: 0, y: -30, force3D: true });
    if (logo)     gsap.set(logo,     { opacity: 0, scale: 0.7, force3D: true });
    if (teamName) gsap.set(teamName, { opacity: 0, x: -40, force3D: true });
    if (pickMeta) gsap.set(pickMeta, { opacity: 0, y: 20, force3D: true });

    const tl = gsap.timeline({
      onComplete: () => {
        console.log('[NowOnClockAnimation] Complete');
        onComplete?.();
      },
    });
    timelineRef.current = tl;

    // Background pulse in
    tl.to(bg, { opacity: 1, duration: 0.4, ease: 'power2.out', force3D: true });
    // Stripe sweeps across
    tl.to(stripe, { scaleX: 1, duration: 0.5, ease: 'power2.inOut', force3D: true }, '-=0.1');
    // "NOW ON THE CLOCK" label drops in
    tl.to(label, { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', force3D: true }, '-=0.2');
    // Logo pops in
    if (logo) tl.to(logo, { opacity: 1, scale: 1, duration: 0.55, ease: 'back.out(1.4)', force3D: true }, '-=0.2');
    // Team name slides in
    if (teamName) tl.to(teamName, { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out', force3D: true }, '-=0.35');
    // Pick meta fades up
    if (pickMeta) tl.to(pickMeta, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', force3D: true }, '-=0.3');
    // Hold
    tl.to({}, { duration: 3.5 });
    // Fade out
    tl.to(container, { opacity: 0, duration: 0.7, ease: 'power2.inOut', force3D: true });

    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
        timelineRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const c1 = team.colors[0];
  const c2 = team.colors[1] || team.colors[0];
  const logo = getTeamLogoPath(team.name);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
    >
      {/* Background */}
      <div
        className="noc-bg absolute inset-0"
        style={{ background: `linear-gradient(135deg, #0a0a0a 0%, ${c1}22 60%, ${c2}18 100%)` }}
      />

      {/* Diagonal color stripe */}
      <div
        className="noc-stripe absolute inset-0"
        style={{
          background: `linear-gradient(100deg, ${c1} 0%, ${c2} 100%)`,
          clipPath: 'polygon(0 35%, 100% 20%, 100% 55%, 0 70%)',
        }}
      />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
        {/* NOW ON THE CLOCK label */}
        <div
          className="noc-label font-black uppercase tracking-[0.35em] text-white mb-8"
          style={{
            fontSize: 'clamp(1.2rem, 3vw, 2.2rem)',
            textShadow: '0 2px 12px rgba(0,0,0,0.9)',
            letterSpacing: '0.35em',
            willChange: 'transform, opacity',
          }}
        >
          Now on the Clock
        </div>

        {/* Logo + Team name row */}
        <div className="flex items-center gap-8">
          {logo && (
            <img
              src={logo}
              alt={team.name}
              className="noc-logo w-36 h-36 object-contain drop-shadow-2xl"
              style={{ willChange: 'transform, opacity' }}
            />
          )}
          <div
            className="noc-team-name font-black text-white uppercase leading-none"
            style={{
              fontSize: 'clamp(3.5rem, 8vw, 7rem)',
              textShadow: `0 4px 32px rgba(0,0,0,0.9), 0 0 60px ${c1}55`,
              WebkitTextStroke: `2px ${c2}`,
              letterSpacing: '-0.02em',
              willChange: 'transform, opacity',
            }}
          >
            {team.name}
          </div>
        </div>

        {/* Pick meta */}
        <div
          className="noc-pick-meta mt-8 flex gap-8 items-center px-10 py-4 rounded-2xl"
          style={{
            background: `linear-gradient(135deg, rgba(0,0,0,0.78) 0%, ${c1}cc 100%)`,
            border: `2px solid ${c1}`,
            boxShadow: `0 4px 32px rgba(0,0,0,0.85), 0 0 24px ${c1}55, inset 0 1px 0 rgba(255,255,255,0.12)`,
            willChange: 'transform, opacity',
          }}
        >
          {[
            { label: 'ROUND', value: round },
            { label: 'PICK', value: pickInRound },
            { label: 'OVERALL', value: pickNumber },
          ].map(({ label, value }, i) => (
            <div key={label} className="text-center flex items-center gap-8">
              {i > 0 && <div className="w-px h-10 self-stretch" style={{ background: `${c1}44` }} />}
              <div>
                <div className="text-white/60 text-xs font-bold tracking-widest mb-1">{label}</div>
                <div
                  className="font-black"
                  style={{
                    fontSize: '2.8rem',
                    lineHeight: 1,
                    textShadow: `0 2px 12px rgba(0,0,0,0.9), 0 0 20px ${c1}88`,
                    color: c1,
                  }}
                >
                  {value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
