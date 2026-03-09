'use client';

import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { getTeamLogoPath } from '@/lib/utils/team-utils';

interface DraftPickAnimationProps {
  player: {
    name: string;
    position: string;
    team?: string; // NFL team
    college?: string;
  };
  fantasyTeam: {
    name: string;
    colors: [string, string, string | null];
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

  useEffect(() => {
    if (!containerRef.current) return;

    // Kill any existing timeline
    if (timelineRef.current) {
      timelineRef.current.kill();
    }

    // Create master timeline
    const tl = gsap.timeline({
      onComplete: () => {
        console.log('[GSAP] Draft animation completed');
        onComplete?.();
      },
    });

    timelineRef.current = tl;

    // Set initial states
    gsap.set('.gsap-team-intro', { opacity: 0, scale: 0.8 });
    gsap.set('.gsap-team-name-bg', { opacity: 0 });
    gsap.set('.gsap-transition-wipe', { scaleX: 0, transformOrigin: 'left' });
    gsap.set('.gsap-draft-card', { opacity: 0, scale: 0.9 });
    gsap.set('.gsap-player-card', { opacity: 0, scale: 0.9 });
    gsap.set('.gsap-player-name', { opacity: 0, y: 20 });
    gsap.set('.gsap-player-details', { opacity: 0, y: 20 });
    gsap.set('.gsap-pick-info', { opacity: 0, y: 20 });

    // Animation sequence - faster pacing to prevent glitches
    tl
      // PHASE 1: Team intro (1.5s)
      .to('.gsap-team-intro', {
        opacity: 1,
        scale: 1,
        duration: 0.6,
        ease: 'power2.out',
      })
      .to('.gsap-team-name-bg', {
        opacity: 1,
        duration: 0.6,
        ease: 'sine.inOut',
      }, '-=0.4')
      .to('.gsap-team-intro', {
        scale: 1.05,
        duration: 1.0,
        ease: 'sine.inOut',
      }, '-=0.8')
      
      // PHASE 2: Transition wipe (0.6s)
      .to('.gsap-transition-wipe', {
        scaleX: 1,
        duration: 0.6,
        ease: 'power2.inOut',
      }, '+=0.8')
      .to('.gsap-team-intro', {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in',
      }, '-=0.3')
      
      // PHASE 3: Draft card reveal (1.5s)
      .to('.gsap-draft-card', {
        opacity: 1,
        scale: 1,
        duration: 0.8,
        ease: 'back.out(1.7)',
      }, '-=0.2')
      .to('.gsap-transition-wipe', {
        scaleX: 0,
        transformOrigin: 'right',
        duration: 0.6,
        ease: 'power2.inOut',
      }, '-=0.4')
      
      // Hold draft card (reduced)
      .to('.gsap-draft-card', {
        scale: 1.02,
        duration: 0.4,
        ease: 'sine.inOut',
      }, '+=0.2')
      
      // PHASE 4: Transition to player card (0.4s)
      .to('.gsap-draft-card', {
        opacity: 0,
        scale: 0.95,
        duration: 0.4,
        ease: 'power2.in',
      }, '+=0.3')
      
      // PHASE 5: Player card reveal (1s)
      .to('.gsap-player-card', {
        opacity: 1,
        scale: 1,
        duration: 0.5,
        ease: 'back.out(1.7)',
      }, '-=0.2')
      .to('.gsap-player-name', {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: 'power2.out',
      }, '-=0.3')
      .to('.gsap-player-details', {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: 'power2.out',
      }, '-=0.3')
      .to('.gsap-pick-info', {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: 'power2.out',
      }, '-=0.3')
      
      // PHASE 6: Hold (1s only)
      .to({}, { duration: 1.0 })
      
      // PHASE 7: Exit (0.5s)
      .to(containerRef.current, {
        opacity: 0,
        scale: 0.98,
        duration: 0.5,
        ease: 'power2.inOut',
      });

    // Cleanup
    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
      }
    };
  }, [player, fantasyTeam, pickNumber, round, pickInRound, year, onComplete]);

  const teamLogo = getTeamLogoPath(fantasyTeam.name);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 pointer-events-none"
    >
      {/* PHASE 1: Team Intro */}
      <div className="gsap-team-intro absolute inset-0">
        {/* Metallic background with team colors */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%),
              radial-gradient(circle at 30% 30%, ${fantasyTeam.colors[0]}20 0%, transparent 50%),
              radial-gradient(circle at 70% 70%, ${fantasyTeam.colors[1]}15 0%, transparent 50%)
            `,
          }}
        />

        {/* Animated team name pattern */}
        <div className="gsap-team-name-bg absolute inset-0 opacity-0">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='300' height='150' xmlns='http://www.w3.org/2000/svg'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial Black' font-size='32' font-weight='900' fill='${encodeURIComponent(
                (fantasyTeam.colors[1] || fantasyTeam.colors[0]).replace('#', '%23')
              )}' fill-opacity='0.15' transform='rotate(-15 150 75)'%3E${encodeURIComponent(
                fantasyTeam.name.toUpperCase()
              )}%3C/text%3E%3C/svg%3E")`,
              backgroundSize: '300px 150px',
              backgroundRepeat: 'repeat',
            }}
          />
        </div>

        {/* Centered team logo */}
        <div className="absolute inset-0 flex items-center justify-center">
          {teamLogo && (
            <img
              src={teamLogo}
              alt={`${fantasyTeam.name} logo`}
              className="w-96 h-96 object-contain opacity-30"
            />
          )}
        </div>

        {/* Large team name */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="text-9xl font-black text-white tracking-wider leading-none text-center px-8"
            style={{
              fontFamily: 'Impact, "Arial Black", sans-serif',
              textShadow: '0 8px 16px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.6)',
              WebkitTextStroke: `4px ${fantasyTeam.colors[1] || fantasyTeam.colors[0]}`,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
            }}
          >
            {fantasyTeam.name}
          </div>
        </div>
      </div>

      {/* PHASE 2: Transition wipe */}
      <div
        className="gsap-transition-wipe absolute inset-0"
        style={{
          background: `linear-gradient(90deg, ${fantasyTeam.colors[0]}, ${
            fantasyTeam.colors[1] || fantasyTeam.colors[0]
          })`,
          transform: 'scaleX(0)',
          transformOrigin: 'left',
        }}
      />

      {/* PHASE 3: Draft card */}
      <div className="gsap-draft-card absolute inset-0 flex items-center justify-center">
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%),
              radial-gradient(circle at 30% 30%, ${fantasyTeam.colors[0]}20 0%, transparent 50%),
              radial-gradient(circle at 70% 70%, ${fantasyTeam.colors[1]}15 0%, transparent 50%)
            `,
          }}
        />

        <div className="relative z-10 text-center">
          <div
            className="text-9xl font-black tracking-wider mb-8"
            style={{
              background: 'linear-gradient(145deg, #ffffff, #e0e0e0, #ffffff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.8))',
            }}
          >
            {year}
          </div>
          <div
            className="text-[12rem] font-black tracking-wider"
            style={{
              background: `linear-gradient(145deg, ${fantasyTeam.colors[0]}, ${
                fantasyTeam.colors[1] || fantasyTeam.colors[0]
              }, ${fantasyTeam.colors[0]})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.8))',
            }}
          >
            DRAFT
          </div>
        </div>
      </div>

      {/* PHASE 5: Player card */}
      <div className="gsap-player-card absolute inset-0 flex items-center justify-center">
        <div
          className="w-[900px] h-[500px] rounded-2xl overflow-hidden shadow-2xl"
          style={{
            background: `linear-gradient(135deg, ${fantasyTeam.colors[0]}dd 0%, ${
              fantasyTeam.colors[1] || fantasyTeam.colors[0]
            }dd 100%)`,
          }}
        >
          {/* Player info section */}
          <div className="h-full flex flex-col justify-center items-center p-12 relative">
            {/* Team logo watermark */}
            {teamLogo && (
              <img
                src={teamLogo}
                alt=""
                className="absolute top-8 right-8 w-32 h-32 object-contain opacity-20"
              />
            )}

            {/* Position badge */}
            <div className="gsap-player-details mb-6">
              <div
                className="px-8 py-3 bg-white text-black font-black text-4xl rounded-lg inline-block"
                style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
              >
                {player.position}
              </div>
              {player.college && (
                <div className="text-white text-2xl font-bold mt-3 opacity-90">
                  {player.college.toUpperCase()}
                </div>
              )}
            </div>

            {/* Player name */}
            <div className="gsap-player-name mb-8">
              <h1
                className="text-7xl font-black text-white leading-tight text-center"
                style={{
                  textShadow: '4px 4px 8px rgba(0,0,0,0.9)',
                }}
              >
                {player.name.toUpperCase()}
              </h1>
              {player.team && (
                <div className="text-white text-3xl font-bold mt-3 opacity-90">
                  {player.team}
                </div>
              )}
            </div>

            {/* Pick info */}
            <div className="gsap-pick-info flex gap-12 justify-center">
              <div className="text-center">
                <div className="text-white text-2xl font-medium mb-2">ROUND</div>
                <div
                  className="text-7xl font-black text-white"
                  style={{
                    textShadow: '3px 3px 6px rgba(0,0,0,0.9)',
                  }}
                >
                  {round}
                </div>
              </div>
              <div className="text-center">
                <div className="text-white text-2xl font-medium mb-2">PICK</div>
                <div
                  className="text-7xl font-black text-white"
                  style={{
                    textShadow: '3px 3px 6px rgba(0,0,0,0.9)',
                  }}
                >
                  {pickInRound}
                </div>
              </div>
              <div className="text-center">
                <div className="text-white text-2xl font-medium mb-2">OVERALL</div>
                <div
                  className="text-7xl font-black text-white"
                  style={{
                    textShadow: '3px 3px 6px rgba(0,0,0,0.9)',
                  }}
                >
                  {pickNumber}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
