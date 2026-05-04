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
  /** Draft branding from DB (e.g. city / event title). Shown in subline with year when set. */
  eventName?: string | null;
  /** Draft year — paired with eventName for sublines like "Pittsburgh 2026". */
  eventYear?: number | null;
  eventLogoUrl?: string | null;
  eventColor1?: string | null;
}

const HOLD_SEC = 7;

/** Fluid type for long franchise names — full name visible, wraps instead of clipping. */
function nocTeamNameFontSize(name: string): string {
  const len = name.length;
  if (len > 26) return 'clamp(1.15rem, 2.8vw + 0.4rem, 2.35rem)';
  if (len > 18) return 'clamp(1.45rem, 3.6vw + 0.35rem, 3.1rem)';
  if (len > 12) return 'clamp(1.75rem, 4.2vw + 0.3rem, 3.75rem)';
  return 'clamp(2rem, 5vw + 0.25rem, 4.5rem)';
}

/** Subline: prefer draft branding; otherwise overall pick # (this animation’s pickNumber is upcoming overall). */
function buildSubline(
  eventName: string | null | undefined,
  eventYear: number | null | undefined,
  overallPick: number,
): string {
  const name = eventName?.trim() || '';
  const year = eventYear != null && Number.isFinite(eventYear) ? Math.trunc(eventYear) : null;
  if (name && year != null) return `Next selection · ${name} ${year}`;
  if (name) return `Next selection · ${name}`;
  if (year != null) return `Next selection · ${year} draft`;
  return `Next selection · Pick #${overallPick}`;
}

export default function NowOnClockAnimation({
  team,
  pickNumber,
  round,
  pickInRound,
  onComplete,
  eventName,
  eventYear,
  eventLogoUrl,
  eventColor1,
}: NowOnClockAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const hasStartedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const container = containerRef.current;
    if (!container) return;

    const ambient = container.querySelector<HTMLElement>('.noc-ambient');
    const ltWrap = container.querySelector<HTMLElement>('.noc-lt-wrap');
    const accent = container.querySelector<HTMLElement>('.noc-accent');
    const liveDot = container.querySelector<HTMLElement>('.noc-live-dot');
    const liveLabel = container.querySelector<HTMLElement>('.noc-live-label');
    const headline = container.querySelector<HTMLElement>('.noc-headline');
    const subline = container.querySelector<HTMLElement>('.noc-subline');
    const logoFrame = container.querySelector<HTMLElement>('.noc-logo-frame');
    const logoImg = container.querySelector<HTMLElement>('.noc-logo-img');
    const teamName = container.querySelector<HTMLElement>('.noc-team-name');
    const chyron = container.querySelector<HTMLElement>('.noc-chyron');
    const shine = container.querySelector<HTMLElement>('.noc-shine');
    const metaCols = container.querySelectorAll<HTMLElement>('.noc-meta-col');
    const draftBrandLogo = container.querySelector<HTMLElement>('.noc-draft-logo');

    if (!ambient || !ltWrap || !accent || !headline || !chyron) return;

    gsap.set(ambient, { opacity: 0 });
    gsap.set(ltWrap, { yPercent: 100, opacity: 1 });
    gsap.set(accent, { scaleY: 0, transformOrigin: '50% 100%' });
    gsap.set([liveDot, liveLabel], { opacity: 0, x: -12 });
    gsap.set(headline, { opacity: 0, y: 18 });
    if (subline) gsap.set(subline, { opacity: 0 });
    if (logoFrame) gsap.set(logoFrame, { opacity: 0, scale: 0.92 });
    if (logoImg) gsap.set(logoImg, { opacity: 0, scale: 0.88 });
    if (teamName) gsap.set(teamName, { opacity: 0, y: 14 });
    gsap.set(chyron, { opacity: 0, y: 10 });
    if (shine) gsap.set(shine, { xPercent: -120, opacity: 0.9 });
    metaCols.forEach((el) => gsap.set(el, { opacity: 0, y: 12 }));
    if (draftBrandLogo) gsap.set(draftBrandLogo, { opacity: 0, scale: 0.88 });

    const tl = gsap.timeline({
      onComplete: () => {
        onCompleteRef.current?.();
      },
    });
    timelineRef.current = tl;

    tl.to(ambient, { opacity: 1, duration: 0.35, ease: 'power2.out' });
    tl.to(ltWrap, { yPercent: 0, duration: 0.72, ease: 'power3.out' }, '-=0.08');
    tl.to(accent, { scaleY: 1, duration: 0.55, ease: 'power2.inOut' }, '-=0.5');
    tl.to([liveDot, liveLabel], { opacity: 1, x: 0, duration: 0.4, stagger: 0.06, ease: 'power2.out' }, '-=0.25');
    if (draftBrandLogo) {
      tl.to(draftBrandLogo, { opacity: 1, scale: 1, duration: 0.48, ease: 'back.out(1.25)' }, '-=0.2');
    }
    tl.to(headline, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, draftBrandLogo ? '-=0.35' : '-=0.2');
    if (subline) tl.to(subline, { opacity: 1, duration: 0.35, ease: 'power2.out' }, '-=0.25');
    if (logoFrame) tl.to(logoFrame, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.35)' }, '-=0.2');
    if (logoImg) tl.to(logoImg, { opacity: 1, scale: 1, duration: 0.45, ease: 'power2.out' }, '-=0.35');
    if (teamName) tl.to(teamName, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, '-=0.35');
    tl.to(chyron, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, '-=0.2');
    tl.to(metaCols, { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: 'power2.out' }, '-=0.25');

    if (shine) {
      tl.to(shine, { xPercent: 140, duration: 1.15, ease: 'power2.inOut' }, '-=0.5');
    }

    let livePulse: gsap.core.Tween | null = null;
    tl.add(() => {
      if (liveDot) {
        gsap.set(liveDot, { opacity: 1 });
        livePulse = gsap.to(liveDot, {
          opacity: 0.35,
          duration: 0.55,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        });
      }
    });

    tl.to({}, { duration: HOLD_SEC });

    tl.add(() => {
      livePulse?.kill();
      livePulse = null;
    });

    tl.to(container, { opacity: 0, duration: 0.85, ease: 'power2.inOut' });

    return () => {
      livePulse?.kill();
      timelineRef.current?.kill();
      timelineRef.current = null;
    };
  }, []);

  const c1 = team.colors[0];
  const c2 = team.colors[1] || team.colors[0];
  const ec = eventColor1 || c1;
  const logo = getTeamLogoPath(team.name);
  const barTopLine = `linear-gradient(90deg, transparent 0%, ${ec} 15%, ${ec} 85%, transparent 100%)`;
  const sublineText = buildSubline(eventName, eventYear, pickNumber);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
      style={{ background: '#020203' }}
    >
      {/* Upper field — vignette + faint grid (broadcast booth) */}
      <div
        className="noc-ambient absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 85% 65% at 50% 35%, ${c1}14 0%, transparent 55%),
            linear-gradient(180deg, #0a0b10 0%, #050508 45%, #020203 100%)
          `,
          boxShadow: `inset 0 -120px 100px -40px rgba(0,0,0,0.85)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)`,
          backgroundSize: '100% 4px',
        }}
      />

      {/* Lower third — slides up */}
      <div
        className="noc-lt-wrap absolute left-0 right-0 bottom-0 flex"
        style={{
          minHeight: 'min(34vh, 320px)',
          maxHeight: '42vh',
        }}
      >
        <div
          className="noc-accent shrink-0 w-2 sm:w-3 self-stretch"
          style={{
            background: `linear-gradient(180deg, ${c1} 0%, ${c2} 100%)`,
            boxShadow: `4px 0 24px ${c1}55`,
          }}
        />

        <div
          className="flex-1 flex flex-col min-w-0 relative"
          style={{
            background: `linear-gradient(180deg, rgba(12,13,20,0.97) 0%, rgba(6,7,11,0.99) 100%)`,
            boxShadow: `0 -12px 48px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}
        >
          {/* Top accent (broadcast bar) */}
          <div
            className="absolute top-0 left-0 right-0 h-0.5 pointer-events-none opacity-90"
            style={{ background: barTopLine }}
          />
          <div
            className="absolute top-0.5 left-0 right-0 h-px pointer-events-none"
            style={{ background: `linear-gradient(90deg, transparent, ${ec}66, transparent)` }}
          />

          <div className="flex-1 flex flex-col justify-end px-4 sm:px-8 pb-5 pt-6 min-w-0 gap-4">
            {/* LIVE + headline row */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-5">
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="noc-live-dot w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: '#f43f5e', boxShadow: '0 0 12px #f43f5e' }}
                />
                <span
                  className="noc-live-label font-black uppercase tracking-[0.2em] text-white/95"
                  style={{ fontSize: 'clamp(0.65rem, 1.1vw, 0.8rem)' }}
                >
                  Live
                </span>
              </div>
              <div className="h-4 w-px bg-white/15 shrink-0 hidden sm:block" />
              {eventLogoUrl ? (
                <img
                  src={eventLogoUrl}
                  alt=""
                  className="noc-draft-logo object-contain shrink-0 drop-shadow-lg"
                  style={{
                    width: 'clamp(40px, 7vw, 56px)',
                    height: 'clamp(40px, 7vw, 56px)',
                  }}
                />
              ) : null}
              <h1
                className="noc-headline font-black uppercase tracking-[0.12em] text-white leading-none"
                style={{
                  fontSize: 'clamp(1.35rem, 3.2vw, 2.4rem)',
                  textShadow: `0 2px 24px rgba(0,0,0,0.95), 0 0 40px ${ec}33`,
                }}
              >
                On the clock
              </h1>
            </div>

            <p
              className="noc-subline text-white/50 font-semibold uppercase tracking-widest max-w-[min(96vw,900px)] break-words leading-snug"
              style={{ fontSize: 'clamp(0.6rem, 1vw, 0.72rem)' }}
            >
              {sublineText}
            </p>

            {/* Logo + team lockup */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-8 min-w-0">
              {logo && (
                <div
                  className="noc-logo-frame rounded-xl overflow-hidden shrink-0 border-2 flex items-center justify-center"
                  style={{
                    width: 'clamp(88px, 14vw, 132px)',
                    height: 'clamp(88px, 14vw, 132px)',
                    borderColor: c2,
                    background: `linear-gradient(145deg, ${c1}33 0%, rgba(0,0,0,0.5) 100%)`,
                    boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08) inset`,
                  }}
                >
                  <img
                    src={logo}
                    alt=""
                    className="noc-logo-img object-contain w-[82%] h-[82%] drop-shadow-lg"
                  />
                </div>
              )}
              <div
                className="noc-team-name font-black text-white uppercase min-w-0 max-w-full break-words leading-tight"
                style={{
                  fontSize: nocTeamNameFontSize(team.name),
                  textShadow: `0 3px 28px rgba(0,0,0,0.95), 0 0 48px ${c1}44`,
                  WebkitTextStroke: `1px ${c2}99`,
                }}
              >
                {team.name}
              </div>
            </div>

            {/* Chyron strip */}
            <div
              className="noc-chyron relative rounded-lg overflow-hidden"
              style={{
                background: `linear-gradient(90deg, rgba(0,0,0,0.55) 0%, ${c1}22 50%, rgba(0,0,0,0.55) 100%)`,
                border: `1px solid ${c1}55`,
              }}
            >
              <div
                className="noc-shine pointer-events-none absolute inset-y-0 w-1/3 z-10"
                style={{
                  background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)`,
                }}
              />
              <div className="relative z-20 flex flex-wrap justify-between sm:justify-start gap-y-3 gap-x-6 sm:gap-x-12 px-4 py-3 sm:px-6 sm:py-3.5">
                {[
                  { label: 'Round', value: round },
                  { label: 'Pick', value: pickInRound },
                  { label: 'Overall', value: pickNumber },
                ].map(({ label, value }) => (
                  <div key={label} className="noc-meta-col flex items-baseline gap-3">
                    <span
                      className="font-bold uppercase tracking-widest text-white/45 shrink-0"
                      style={{ fontSize: 'clamp(0.58rem, 0.95vw, 0.7rem)' }}
                    >
                      {label}
                    </span>
                    <span
                      className="font-black tabular-nums text-white"
                      style={{
                        fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
                        lineHeight: 1,
                        textShadow: `0 0 24px ${c1}99`,
                        color: '#fff',
                      }}
                    >
                      {value}
                    </span>
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
