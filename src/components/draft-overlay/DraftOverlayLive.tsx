'use client';

import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useDraftData } from './useDraftData';
import { getTeamLogoPath } from './teams';
import styles from './OverlayDisplay.module.css';

// Position colors for player cards
const positionColors: Record<string, string> = {
  'QB': '#C00000',
  'RB': '#FFC000',
  'WR': '#0070C0',
  'TE': '#00B050',
  'DEF': '#7030A0',
  'K': '#FF8C42',
};

export default function DraftOverlayLive() {
  const {
    draft,
    currentTeam,
    currentPickIndex,
    timerSeconds,
    draftGrid,
    nextTeams,
    lastPick,
    isNewPick,
    available,
    usingCustom,
    localRemainingSec,
  } = useDraftData(2000);

  const [showPickBanner, setShowPickBanner] = useState(false);
  const pickBannerRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);

  // Format time as MM:SS
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Animate pick banner when new pick comes in
  useEffect(() => {
    if (isNewPick && lastPick && pickBannerRef.current) {
      setShowPickBanner(true);
      gsap.killTweensOf(pickBannerRef.current);
      gsap.fromTo(
        pickBannerRef.current,
        { y: 80, opacity: 0, scale: 0.9 },
        { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)' }
      );
      const timeout = setTimeout(() => {
        if (pickBannerRef.current) {
          gsap.to(pickBannerRef.current, {
            y: -40,
            opacity: 0,
            duration: 0.4,
            ease: 'power2.in',
            onComplete: () => setShowPickBanner(false),
          });
        }
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [isNewPick, lastPick]);

  // Pulse clock when low time
  useEffect(() => {
    if (clockRef.current && localRemainingSec <= 10 && localRemainingSec > 0) {
      gsap.to(clockRef.current, {
        scale: 1.05,
        duration: 0.3,
        yoyo: true,
        repeat: 1,
        ease: 'power1.inOut',
      });
    }
  }, [localRemainingSec]);

  const roundNumber = Math.floor(currentPickIndex / 12) + 1;
  const pickInRound = (currentPickIndex % 12) + 1;
  const teamColors = currentTeam?.colors || ['#333', '#555', null];
  const teamLogo = currentTeam ? getTeamLogoPath(currentTeam) : null;

  return (
    <div className={styles.overlay}>
      {/* Draft Board Grid */}
      <div className={styles.draftBoardContainer}>
        <div className="grid grid-cols-5 gap-1 h-full p-2 bg-black/80 rounded-lg">
          {/* Header Row */}
          <div className="text-center text-xs font-bold text-zinc-400 py-1">Pick</div>
          {[1, 2, 3, 4].map(r => (
            <div key={r} className="text-center text-xs font-bold text-zinc-400 py-1">Round {r}</div>
          ))}
          
          {/* Pick Rows */}
          {Array.from({ length: 12 }, (_, pickIdx) => (
            <React.Fragment key={pickIdx}>
              {/* Pick number */}
              <div className={`text-center text-sm font-bold py-2 ${currentPickIndex % 12 === pickIdx ? 'text-yellow-400' : 'text-zinc-500'}`}>
                {pickIdx + 1}
              </div>
              {/* Round cells */}
              {[0, 1, 2, 3].map(roundIdx => {
                const gridIdx = roundIdx * 12 + pickIdx;
                const pick = draftGrid[gridIdx];
                const isCurrentPick = currentPickIndex === gridIdx;
                return (
                  <div
                    key={gridIdx}
                    className={`relative rounded text-xs p-1 transition-all ${
                      isCurrentPick
                        ? 'ring-2 ring-yellow-400 bg-yellow-400/20'
                        : pick
                        ? 'bg-zinc-800'
                        : 'bg-zinc-900/50'
                    }`}
                    style={{
                      borderLeft: pick ? `3px solid ${positionColors[pick.position] || '#666'}` : undefined,
                    }}
                  >
                    {pick ? (
                      <div className="truncate">
                        <div className="font-semibold text-white truncate">{pick.player}</div>
                        <div className="text-zinc-400 text-[10px]">{pick.position}</div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Bottom Bar: ClockBox + InfoBar */}
      <div className={styles.topRow}>
        {/* ClockBox */}
        <div
          className="flex items-stretch h-full"
          style={{
            width: '420px',
            background: 'linear-gradient(to bottom, #202020, #282828)',
            borderRadius: '4px',
            border: '1px solid #333',
          }}
        >
          {/* Left: Team Abbrev + Round/Pick */}
          <div className="flex flex-col justify-between p-3 w-36">
            <div
              className="px-3 py-1 rounded-md text-center font-black text-2xl text-white"
              style={{
                background: `linear-gradient(135deg, ${teamColors[0]}cc 0%, ${teamColors[0]}cc 50%, ${teamColors[1]}cc 50%, ${teamColors[1]}cc 100%)`,
                border: '2px solid #a4c810',
                boxShadow: '0 0 10px rgba(196, 255, 0, 0.4)',
                animation: 'pulse 3s ease-in-out infinite',
              }}
            >
              {currentTeam?.abbrev || '---'}
            </div>
            <div className="text-white text-lg mt-2">
              <span className="font-bold">RD</span> {roundNumber} PK {pickInRound}
            </div>
          </div>

          {/* Center: Timer */}
          <div className="flex-1 flex items-center justify-center">
            <div
              ref={clockRef}
              className={`text-6xl font-bold font-mono ${localRemainingSec <= 10 ? 'text-red-500' : 'text-[#a4c810]'}`}
              style={{ textShadow: '0 0 10px rgba(196, 255, 0, 0.4)' }}
            >
              {formatTime(localRemainingSec)}
            </div>
          </div>

          {/* Right: Next Up + Team Logo */}
          <div className="flex flex-col p-2 w-60">
            <div className="flex items-center gap-2 bg-zinc-700 rounded px-2 py-1 mb-2">
              <span className="text-xs text-zinc-400">NEXT</span>
              <div className="flex gap-1">
                {nextTeams.slice(0, 2).map((t, i) => (
                  <div key={i} className="w-8 h-8 bg-zinc-600 rounded overflow-hidden">
                    {t.logoPath && <img src={t.logoPath} alt={t.name} className="w-full h-full object-contain" />}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div
                className="w-24 h-28 bg-zinc-700 rounded-lg overflow-hidden border-2 border-[#a4c810]"
                style={{ boxShadow: '0 0 10px rgba(196, 255, 0, 0.4)' }}
              >
                {teamLogo && <img src={teamLogo} alt={currentTeam?.name} className="w-full h-full object-contain" />}
              </div>
            </div>
          </div>
        </div>

        {/* InfoBar: Best Available */}
        <div
          className="flex-1 h-full p-4"
          style={{
            background: teamColors[0],
            borderRadius: '4px',
          }}
        >
          <div className="text-white/80 text-sm font-semibold mb-2">
            Best Available{usingCustom ? ' (Custom)' : ''}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {available.slice(0, 10).map((p, i) => (
              <div key={p.id} className="bg-black/30 rounded px-2 py-1 text-xs">
                <div className="font-semibold text-white truncate">{i + 1}. {p.name}</div>
                <div className="text-white/60">{p.pos} - {p.nfl || '-'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pick Banner Animation */}
      {showPickBanner && lastPick && (
        <div
          ref={pickBannerRef}
          className="fixed bottom-40 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-emerald-600 to-emerald-500 px-8 py-6 rounded-xl shadow-2xl"
          style={{ minWidth: '400px' }}
        >
          <div className="text-center text-3xl font-bold text-white">🏈 PICK IS IN!</div>
          <div className="text-center text-2xl font-semibold text-white mt-2">
            {lastPick.playerName || lastPick.playerId}
            {lastPick.playerPos && (
              <span className="ml-3 px-2 py-1 bg-white/20 rounded text-lg">
                {lastPick.playerPos}{lastPick.playerNfl ? ` • ${lastPick.playerNfl}` : ''}
              </span>
            )}
          </div>
          <div className="text-center text-lg text-emerald-100 mt-2">
            Pick #{lastPick.overall} (Round {lastPick.round}) • {lastPick.team}
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="fixed top-0 left-0 right-0 bg-zinc-900/90 border-b border-zinc-700 px-6 py-3 flex items-center justify-between z-40">
        <div className="text-xl font-bold text-white">
          East v West Draft {draft?.year ?? new Date().getFullYear()}
        </div>
        <div className="text-zinc-400">
          Overall #{draft?.curOverall ?? 1} • {draft?.status ?? 'NOT_STARTED'}
        </div>
      </div>
    </div>
  );
}
