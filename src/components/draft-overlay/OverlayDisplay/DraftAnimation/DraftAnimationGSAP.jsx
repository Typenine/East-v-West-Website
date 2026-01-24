import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { getTeamLogoPath } from '../../../utils/logoUtils';

const DraftAnimationGSAP = ({ player, team, currentPickIndex, onComplete }) => {
  const containerRef = useRef();
  const timelineRef = useRef();

  // Debug logging for mount/unmount in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEBUG] DraftAnimationGSAP mounted - Player: ${player?.name}, Team: ${team?.name}`);
      return () => console.log(`[DEBUG] DraftAnimationGSAP unmounted - Player: ${player?.name}, Team: ${team?.name}`);
    }
  }, [player?.name, team?.name]);

  useEffect(() => {
    if (!player || !team || !containerRef.current) return;

    // Kill any existing timeline
    if (timelineRef.current) {
      timelineRef.current.kill();
    }

    // Create master timeline
    const tl = gsap.timeline({
      onComplete: () => {
        console.log('[GSAP] Draft animation completed');
        onComplete?.();
      }
    });

    timelineRef.current = tl;

    // Set initial states for NFL broadcast horizontal layout
    // Set initial states for three-phase animation
    // Phase 1: Team intro
    gsap.set('.gsap-team-intro', { opacity: 0, scale: 0.8 });
    gsap.set('.gsap-team-name-bg', { opacity: 0 });
    // Phase 2: Transition wipe
    gsap.set('.gsap-transition-wipe', { scaleX: 0, transformOrigin: 'left' });
    // Phase 3: Draft card
    gsap.set('.gsap-draft-card', { opacity: 0, scale: 0.9 });
    // Player card elements (for later)
    gsap.set('.gsap-metallic-bg', { opacity: 0 });
    gsap.set('.gsap-embossed-pattern', { opacity: 0 });
    gsap.set('.gsap-info-card', { opacity: 0, scale: 0.8 });
    gsap.set('.gsap-player-section', { x: -400, opacity: 0 });
    gsap.set('.gsap-info-section', { y: 100, opacity: 0 });
    gsap.set('.gsap-team-logo-section', { x: 400, opacity: 0 });
    gsap.set('.gsap-position-badge', { scale: 0, opacity: 0 });
    gsap.set('.gsap-player-name', { opacity: 0, scale: 1.2, letterSpacing: '20px' });
    gsap.set('.gsap-draft-info', { opacity: 0, y: 50 });
    gsap.set('.gsap-color-wash', { opacity: 0, scale: 1 });
    gsap.set('.gsap-confetti', { opacity: 0, y: 0, rotation: 0 });

    // THREE-PHASE NFL BROADCAST ANIMATION SEQUENCE
    tl
      // PHASE 1: Team Intro with Sliding Background
      .to('.gsap-team-intro', {
        opacity: 1,
        scale: 1,
        duration: 0.8,
        ease: 'power2.out'
      })
      // Fade in sliding team name background
      .to('.gsap-team-name-bg', {
        opacity: 1,
        duration: 0.8,
        ease: 'sine.inOut'
      }, '-=0.6')
      .to('.gsap-team-intro', {
        scale: 1.05,
        duration: 1.0,
        ease: 'sine.inOut'
      }, '-=2.4')
      
      // PHASE 2: Transition Wipe Effect (like Image 2)
      .to('.gsap-transition-wipe', {
        scaleX: 1,
        duration: 0.6,
        ease: 'power2.inOut'
      }, '+=0.8')
      .to('.gsap-team-intro', {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in'
      }, '-=0.3')
      
      // PHASE 3: Draft Card Reveal (like Image 3)
      .to('.gsap-draft-card', {
        opacity: 1,
        scale: 1,
        duration: 0.8,
        ease: 'back.out(1.7)'
      }, '-=0.2')
      .to('.gsap-transition-wipe', {
        scaleX: 0,
        transformOrigin: 'right',
        duration: 0.6,
        ease: 'power2.inOut'
      }, '-=0.4')
      
      // Hold draft card briefly
      .to('.gsap-draft-card', {
        scale: 1.02,
        duration: 0.8,
        ease: 'sine.inOut'
      }, '+=0.5')
      
      // PHASE 4: Transition to Player Card
      .to('.gsap-draft-card', {
        opacity: 0,
        scale: 0.95,
        duration: 0.6,
        ease: 'power2.in'
      }, '+=0.8')
      
      // PHASE 2: "Player Card Reveal" - Now that draft card is gone
      // Final embossed pattern
      .to('.gsap-embossed-pattern', {
        opacity: 1,
        duration: 0.6,
        ease: 'sine.inOut'
      }, '-=0.2')
      
      // Player card background
      .to('.gsap-info-card', {
        opacity: 1,
        scale: 1,
        duration: 0.8,
        ease: 'back.out(1.7)'
      }, '-=0.4')

      // PHASE 3: "Horizontal Layout Reveal" (2.5-4.0s)
      // Player section slides in from left
      .to('.gsap-player-section', {
        x: 0,
        opacity: 1,
        duration: 1.0,
        ease: 'power3.out'
      }, '-=0.3')
      
      // Team logo section slides in from right
      .to('.gsap-team-logo-section', {
        x: 0,
        opacity: 1,
        duration: 1.0,
        ease: 'power3.out'
      }, '-=0.8')
      
      // Info section rises from bottom
      .to('.gsap-info-section', {
        y: 0,
        opacity: 1,
        duration: 1.2,
        ease: 'power3.out'
      }, '-=0.6')

      // PHASE 4: "Information Typography Build" (4.0-6.0s)
      // Position badge pops in
      .to('.gsap-position-badge', {
        scale: 1,
        opacity: 1,
        duration: 0.6,
        ease: 'back.out(2)'
      }, '-=0.4')
      
      // Player name dramatic reveal
      .to('.gsap-player-name', {
        opacity: 1,
        scale: 1,
        letterSpacing: '2px',
        duration: 1.0,
        ease: 'power2.out'
      }, '-=0.2')
      
      // Draft info (round/pick) appears
      .to('.gsap-draft-info', {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power2.out'
      }, '-=0.4')

      // PHASE 5: "Broadcast Hold" (6.0-8.0s)
      // Clean hold for viewing - NFL broadcast style
      .to({}, { duration: 2.0 })

      // PHASE 6: "Professional Exit" (8.0-9.0s)
      // All elements fade out in broadcast fashion
      .to(['.gsap-player-section', '.gsap-info-section', '.gsap-team-logo-section'], {
        opacity: 0.8,
        scale: 1.02,
        duration: 0.4,
        ease: 'power2.out'
      })
      .to(['.gsap-team-logo', '.gsap-player-card'], {
        opacity: 0,
        scale: 0.95,
        duration: 0.8,
        ease: 'power3.in'
      }, '-=0.2')
      
      // Final container fade for clean handoff
      .to(containerRef.current, {
        opacity: 0,
        scale: 0.98,
        duration: 0.6,
        ease: 'power2.inOut'
      }, '-=0.2');

    // Cleanup function
    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
      }
    };
  }, [player, team]); // onComplete intentionally excluded to prevent animation restart glitch (fixes lint warning)

  if (!player || !team) return null;

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-95 pointer-events-none overflow-hidden"
    >
      {/* PHASE 1: Team Intro with Player Card Style Background */}
      <div className="gsap-team-intro absolute inset-0">
        {/* Layer 1: Metallic Background (matching player card) */}
        <div className="absolute inset-0"
             style={{
               background: `
                 linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%),
                 radial-gradient(circle at 30% 30%, ${team?.colors?.[0] || '#3B82F6'}20 0%, transparent 50%),
                 radial-gradient(circle at 70% 70%, ${team?.colors?.[1] || '#1E40AF'}15 0%, transparent 50%)
               `
             }} />
        
        {/* Layer 2: Animated Sliding Team Name Background (diagonal pattern like player card) */}
        <div className="gsap-team-name-bg absolute inset-0 opacity-0">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='300' height='150' xmlns='http://www.w3.org/2000/svg'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial Black' font-size='32' font-weight='900' fill='${encodeURIComponent((team?.colors?.[1] || team?.colors?.[0] || '#666').replace('#', '%23'))}' fill-opacity='0.15' transform='rotate(-15 150 75)'%3E${encodeURIComponent(team?.name?.toUpperCase() || 'TEAM')}%3C/text%3E%3C/svg%3E")`,
            backgroundSize: '300px 150px',
            backgroundRepeat: 'repeat'
          }} />
        </div>
        
        {/* Layer 3: Geometric Pattern (matching player card) */}
        <div className="absolute inset-0 opacity-10"
             style={{
               backgroundImage: `
                 repeating-linear-gradient(
                   45deg,
                   transparent,
                   transparent 12px,
                   ${team?.colors?.[0] || '#3B82F6'}30 12px,
                   ${team?.colors?.[0] || '#3B82F6'}30 14px
                 ),
                 repeating-linear-gradient(
                   -45deg,
                   transparent,
                   transparent 12px,
                   ${team?.colors?.[1] || '#1E40AF'}20 12px,
                   ${team?.colors?.[1] || '#1E40AF'}20 14px
                 )
               `
             }} />
        
        {/* Layer 4: Centered Team Logo */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img 
            src={getTeamLogoPath(team)} 
            alt={`${team?.name} logo`}
            className="w-96 h-96 object-contain opacity-30"
          />
        </div>
        
        {/* Layer 5: Large Team Name Overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div 
            className="text-9xl font-black text-white tracking-wider leading-none text-center"
            style={{
              fontFamily: 'Impact, "Arial Black", sans-serif',
              textShadow: '0 8px 16px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.6)',
              WebkitTextStroke: `4px ${team?.colors?.[1] || team?.colors?.[0] || '#666'}`,
              textTransform: 'uppercase',
              letterSpacing: '0.15em'
            }}>
            {team?.name || 'TEAM NAME'}
          </div>
        </div>
      </div>
      
      {/* PHASE 2: Transition Effect (like Image 2) */}
      <div className="gsap-transition-wipe absolute inset-0"
           style={{
             background: `linear-gradient(90deg, ${team?.colors?.[0] || '#3B82F6'}, ${team?.colors?.[1] || team?.colors?.[0] || '#1E40AF'})`,
             transform: 'scaleX(0)',
             transformOrigin: 'left'
           }} />
      
      {/* PHASE 3: Draft Card matching Player Card Style (like Image 3) */}
      <div className="gsap-draft-card absolute inset-0 flex items-center justify-center">
        {/* Background matching player card */}
        <div className="absolute inset-0"
             style={{
               background: `
                 linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%),
                 radial-gradient(circle at 30% 30%, ${team?.colors?.[0] || '#3B82F6'}20 0%, transparent 50%),
                 radial-gradient(circle at 70% 70%, ${team?.colors?.[1] || '#1E40AF'}15 0%, transparent 50%)
               `
             }} />
        
        {/* Geometric pattern matching player card */}
        <div className="absolute inset-0 opacity-15"
             style={{
               backgroundImage: `
                 repeating-linear-gradient(
                   45deg,
                   transparent,
                   transparent 12px,
                   ${team?.colors?.[0] || '#3B82F6'}30 12px,
                   ${team?.colors?.[0] || '#3B82F6'}30 14px
                 ),
                 repeating-linear-gradient(
                   -45deg,
                   transparent,
                   transparent 12px,
                   ${team?.colors?.[1] || '#1E40AF'}20 12px,
                   ${team?.colors?.[1] || '#1E40AF'}20 14px
                 )
               `
             }} />
        
        {/* Draft Card Content */}
        <div className="relative z-10 text-center">
          <div className="text-9xl font-black tracking-wider mb-8"
               style={{
                 background: `linear-gradient(145deg, #ffffff, #e0e0e0, #ffffff)`,
                 WebkitBackgroundClip: 'text',
                 WebkitTextFillColor: 'transparent',
                 filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.8))',
                 textShadow: '0 0 30px rgba(255,255,255,0.3)'
               }}>
            2026
          </div>
          <div className="text-12xl font-black tracking-wider"
               style={{
                 background: `linear-gradient(145deg, ${team?.colors?.[0] || '#3B82F6'}, ${team?.colors?.[1] || '#1E40AF'}, ${team?.colors?.[0] || '#3B82F6'})`,
                 WebkitBackgroundClip: 'text',
                 WebkitTextFillColor: 'transparent',
                 filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.8))',
                 textShadow: '0 0 40px rgba(255,255,255,0.2)'
               }}>
            DRAFT
          </div>
        </div>
      </div>
      
      {/* NFL Broadcast Metallic Background */}
      <div className="absolute inset-0">
        {/* Team-colored metallic base */}
        <div className="gsap-metallic-bg absolute inset-0 opacity-0" style={{
          background: `linear-gradient(135deg, 
            ${team?.colors?.[0] || '#3B82F6'}60 0%, 
            ${team?.colors?.[0] || '#3B82F6'}80 25%, 
            ${team?.colors?.[0] || '#3B82F6'}50 50%, 
            ${team?.colors?.[0] || '#3B82F6'}80 75%, 
            ${team?.colors?.[0] || '#3B82F6'}60 100%
          )`
        }} />
        
        {/* Embossed team name pattern - reduced opacity */}
        <div className="gsap-embossed-pattern absolute inset-0 opacity-0">
          <div className="absolute inset-0" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='300' height='150' xmlns='http://www.w3.org/2000/svg'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial Black' font-size='32' font-weight='900' fill='rgba(255,255,255,0.08)' transform='rotate(-15 150 75)'%3E${encodeURIComponent(team?.name?.toUpperCase() || 'TEAM')}%3C/text%3E%3C/svg%3E")`,
            backgroundSize: '300px 150px',
            backgroundRepeat: 'repeat'
          }} />
        </div>
        
        {/* Lighter vignette overlay to prevent clipping */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.2) 85%, rgba(0,0,0,0.4) 100%)'
        }} />
      </div>



      {/* NFL Broadcast Horizontal Layout */}
      <div className="gsap-broadcast-layout flex items-center justify-center w-full h-full px-16 py-8 relative z-20">
        
        {/* Left Section: Player Card - NFL Style */}
        <div className="gsap-player-section flex-shrink-0">
          <div className="gsap-player-card w-[48rem] h-[28rem] relative">
            {/* Player card matching reference images */}
            <div className="w-full h-full rounded-lg relative overflow-hidden flex" style={{
              boxShadow: '0 10px 20px rgba(0,0,0,0.4)'
            }}>
              {/* Left: Drafted Sidebar */}
              <div className="w-16 h-full flex items-center justify-center" style={{
                background: team?.colors?.[1] || team?.colors?.[0] || '#1E40AF'
              }}>
                <div className="text-white font-black text-lg transform -rotate-90 whitespace-nowrap tracking-wider">
                  2026 DRAFTED
                </div>
              </div>
              
              {/* Middle: Player Image Area */}
              <div className="w-64 h-full relative" style={{
                background: team?.colors?.[0] || '#3B82F6'
              }}>
                {/* Geometric pattern background */}
                <div className="absolute inset-0 opacity-25" style={{
                  backgroundImage: `
                    linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%),
                    linear-gradient(-45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%),
                    radial-gradient(circle at 25% 25%, rgba(255,255,255,0.05) 0%, transparent 50%),
                    radial-gradient(circle at 75% 75%, rgba(255,255,255,0.05) 0%, transparent 50%)
                  `,
                  backgroundSize: '60px 60px, 60px 60px, 120px 120px, 120px 120px'
                }} />
                
                {/* Faint university/player background image */}
                <div className="absolute inset-0 opacity-15" style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='300' height='300' xmlns='http://www.w3.org/2000/svg'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='Arial Black' font-size='48' font-weight='900' fill='white'%3E${encodeURIComponent(player?.college?.toUpperCase() || 'COLLEGE')}%3C/text%3E%3C/svg%3E")`,
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center'
                }} />
                
                {/* Player Image or Silhouette */}
                <div className="gsap-player-image absolute inset-0 flex items-center justify-center">
                  {player?.image ? (
                    <img
                      src={player.image}
                      alt={player.name}
                      className="w-48 h-64 object-cover object-top rounded-lg shadow-lg"
                    />
                  ) : (
                    <div className="w-32 h-40 relative flex items-center justify-center flex-col">
                    {/* Simple player outline */}
                    <div className="w-16 h-20 bg-white bg-opacity-70 rounded-lg mb-2 relative">
                      {/* Jersey number */}
                      <div className="absolute inset-0 flex items-center justify-center text-black font-bold text-2xl">00</div>
                    </div>
                    {/* Legs */}
                    <div className="flex justify-center space-x-2">
                      <div className="w-4 h-16 bg-white bg-opacity-70 rounded"></div>
                      <div className="w-4 h-16 bg-white bg-opacity-70 rounded"></div>
                    </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Right: Info Panel */}
              <div className="flex-1 h-full relative p-6 flex flex-col justify-center" style={{
                background: team?.colors?.[0] || '#3B82F6'
              }}>
                {/* Geometric pattern background */}
                <div className="absolute inset-0 opacity-20" style={{
                  backgroundImage: `
                    linear-gradient(30deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%),
                    linear-gradient(-30deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%),
                    linear-gradient(60deg, transparent 45%, rgba(255,255,255,0.05) 50%, transparent 55%)
                  `,
                  backgroundSize: '80px 80px, 80px 80px, 40px 40px'
                }} />
                
                {/* Position Badge and College */}
                <div className="relative z-10 mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="bg-white text-black px-4 py-2 font-black text-2xl">
                      {player?.position || 'POS'}
                    </div>
                    <div className="text-lg font-bold text-white" style={{
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
                    }}>
                      {player?.college?.toUpperCase() || 'COLLEGE'}
                    </div>
                  </div>
                  {/* Divider line */}
                  <div className="w-full h-1 bg-white mt-3 mb-4" />
                </div>
                
                {/* Player Name */}
                <div className="relative z-10 mb-4">
                  <h1 className="text-4xl font-black text-white leading-none tracking-tight" style={{
                    textShadow: '3px 3px 6px rgba(0,0,0,0.9)'
                  }}>
                    {player?.name?.toUpperCase() || 'PLAYER NAME'}
                  </h1>
                </div>
                
                {/* Round/Pick Info */}
                <div className="relative z-10 flex space-x-6">
                  <div>
                    <span className="text-lg font-medium text-white" style={{
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
                    }}>RD</span>
                    <span className="text-4xl font-black ml-2 text-white" style={{
                      textShadow: '3px 3px 6px rgba(0,0,0,0.9)'
                    }}>
                      {Math.floor((currentPickIndex - 1) / 12) + 1}
                    </span>
                  </div>
                  <div>
                    <span className="text-lg font-medium text-white" style={{
                      textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
                    }}>PICK</span>
                    <span className="text-4xl font-black ml-2 text-white" style={{
                      textShadow: '3px 3px 6px rgba(0,0,0,0.9)'
                    }}>
                      {((currentPickIndex - 1) % 12) + 1}
                    </span>
                  </div>
                </div>
                
                {/* Team Logo */}
                <div className="absolute bottom-4 right-4 w-20 h-20 bg-white bg-opacity-90 rounded-full p-2" style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
                }}>
                  <img
                    src={getTeamLogoPath(team)}
                    alt={team?.name || 'Team'}
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>


      </div>

      {/* Confetti Particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="gsap-confetti absolute w-2 h-2 opacity-0"
            style={{
              backgroundColor: i % 2 === 0 ? team?.colors?.[0] || '#3B82F6' : team?.colors?.[1] || '#1E40AF',
              left: `${10 + (i * 7)}%`,
              top: `${20 + (i * 5)}%`,
              borderRadius: i % 3 === 0 ? '50%' : '2px'
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default DraftAnimationGSAP;
