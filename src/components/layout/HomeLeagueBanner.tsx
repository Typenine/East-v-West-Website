'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LEAGUE_IDS, TEAM_NAMES } from '@/lib/constants/league';
import { getTeamsData } from '@/lib/utils/sleeper-api';
import { getTeamColors, getTeamLogoPath } from '@/lib/utils/team-utils';

const allTeams = TEAM_NAMES;
const leftTeams = TEAM_NAMES.slice(0, 6);
const rightTeams = TEAM_NAMES.slice(6, 12);

function TeamTile({ team, compact = false, href }: { team: string; compact?: boolean; href?: string }) {
  const colors = getTeamColors(team);
  const isCakeEaters = team === 'Mt. Lebanon Cake Eaters';
  const isLoneGinger = team === 'The Lone Ginger';
  const isDoubleTrouble = team === 'Double Trouble';
  const needsRoundCrop = isCakeEaters || isLoneGinger || isDoubleTrouble;
  const logoSrc = isDoubleTrouble ? `${getTeamLogoPath(team)}?v=double-trouble-transparent-2` : getTeamLogoPath(team);
  const stripeColors = [colors.primary, colors.secondary, colors.tertiary].filter(Boolean) as string[];
  const stripeCount = stripeColors.length;
  const stripeBackground = stripeColors
    .map((color, index) => {
      const start = (index / stripeCount) * 100;
      const end = ((index + 1) / stripeCount) * 100;
      return `${color} ${start}%, ${color} ${end}%`;
    })
    .join(', ');
  const tileClassName = compact
    ? 'relative overflow-hidden rounded-[14px] border backdrop-blur-md shadow-[0_12px_26px_rgba(0,0,0,0.2)] min-h-[62px] px-2 py-1.5 flex items-center justify-center'
    : 'relative overflow-hidden rounded-[16px] border backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.22)] min-h-[64px] sm:min-h-[72px] lg:min-h-[80px] px-2 py-2 sm:px-2.5 sm:py-2.5 flex items-center justify-center';
  const logoFrameClassName = compact
    ? needsRoundCrop
      ? 'relative z-10 overflow-hidden rounded-full h-[2.45rem] w-[2.45rem]'
      : 'relative z-10 overflow-hidden h-[2.45rem] w-[2.45rem]'
    : needsRoundCrop
      ? 'relative z-10 overflow-hidden rounded-full h-[2.8rem] w-[2.8rem] sm:h-[3.2rem] sm:w-[3.2rem] lg:h-[3.75rem] lg:w-[3.75rem]'
      : 'relative z-10 overflow-hidden h-[2.8rem] w-[2.8rem] sm:h-[3.2rem] sm:w-[3.2rem] lg:h-[3.75rem] lg:w-[3.75rem]';
  const logoClassName = isDoubleTrouble
    ? 'object-cover scale-[2.18]'
    : isCakeEaters || isLoneGinger
      ? 'object-cover scale-[1.16]'
      : 'object-contain';
  const logoPosition = isDoubleTrouble
    ? '56% 44%'
    : 'center';
  const tileContents = (
    <>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(120deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 28%, rgba(255,255,255,0) 58%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, rgba(5,8,14,0.18) 0%, rgba(5,8,14,0.1) 42%, rgba(5,8,14,0.06) 100%)',
        }}
      />
      <div className={logoFrameClassName}>
        <Image
          src={logoSrc}
          alt={team}
          fill
          sizes={compact ? '2.45rem' : '(min-width: 1024px) 3.75rem, (min-width: 640px) 3.2rem, 2.8rem'}
          className={`${logoClassName} drop-shadow-[0_10px_14px_rgba(0,0,0,0.42)]`}
          style={{ objectPosition: logoPosition }}
        />
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={`View ${team} team page`}
        className={`${tileClassName} cursor-pointer transition-transform duration-150 hover:scale-[1.015] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1322]`}
        style={{
          borderColor: 'rgba(255,255,255,0.16)',
          backgroundImage: `linear-gradient(180deg, rgba(7,10,18,0.54) 0%, rgba(9,13,22,0.66) 100%), linear-gradient(90deg, ${stripeBackground})`,
          boxShadow: `0 0 0 1px ${colors.secondary}1f inset, ${compact ? '0 12px 26px rgba(0,0,0,0.2)' : '0 12px 30px rgba(0,0,0,0.22)'}`,
        }}
        title={team}
      >
        {tileContents}
      </Link>
    );
  }

  return (
    <div
      className={tileClassName}
      style={{
        borderColor: 'rgba(255,255,255,0.16)',
        backgroundImage: `linear-gradient(180deg, rgba(7,10,18,0.54) 0%, rgba(9,13,22,0.66) 100%), linear-gradient(90deg, ${stripeBackground})`,
        boxShadow: `0 0 0 1px ${colors.secondary}1f inset, ${compact ? '0 12px 26px rgba(0,0,0,0.2)' : '0 12px 30px rgba(0,0,0,0.22)'}`,
      }}
      title={team}
    >
      {tileContents}
    </div>
  );
}

function TeamGrid({ teams, compact = false, className, teamLinks }: { teams: string[]; compact?: boolean; className?: string; teamLinks: Record<string, string> }) {
  return (
    <div className={className ?? 'grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5 lg:gap-3 items-center'}>
      {teams.map((team) => (
        <TeamTile key={team} team={team} compact={compact} href={teamLinks[team]} />
      ))}
    </div>
  );
}

export default function HomeLeagueBanner() {
  const [teamLinks, setTeamLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadTeamLinks() {
      try {
        const teams = await getTeamsData(LEAGUE_IDS.CURRENT);
        if (cancelled) return;
        const nextLinks = teams.reduce<Record<string, string>>((acc, team) => {
          acc[team.teamName] = `/teams/${team.rosterId}`;
          return acc;
        }, {});
        setTeamLinks(nextLinks);
      } catch {
        if (!cancelled) {
          setTeamLinks({});
        }
      }
    }

    loadTeamLinks();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative overflow-hidden border-b border-[var(--border)] bg-[linear-gradient(135deg,#08111f_0%,#101d33_100%)]">
      <div
        aria-hidden
        className="absolute inset-0 opacity-100"
        style={{
          background: `
            radial-gradient(circle at 50% 50%, rgba(191, 153, 68, 0.16), transparent 28%),
            radial-gradient(circle at 18% 35%, rgba(11, 95, 152, 0.18), transparent 26%),
            radial-gradient(circle at 82% 65%, rgba(190, 22, 30, 0.14), transparent 25%)
          `,
        }}
      />
      <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-2.5 lg:py-2.5 relative z-10">
        <div
          className="relative overflow-hidden rounded-[18px] border p-2 sm:p-2.5 lg:p-2.5"
          style={{
            borderColor: 'rgba(255,255,255,0.18)',
            background: 'linear-gradient(90deg, rgba(255,255,255,0.05), transparent 18%, transparent 82%, rgba(255,255,255,0.05)), rgba(255,255,255,0.045)',
            boxShadow: '0 28px 80px rgba(0,0,0,0.38)',
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '42px 42px',
              WebkitMaskImage: 'radial-gradient(circle at center, black, transparent 76%)',
              maskImage: 'radial-gradient(circle at center, black, transparent 76%)',
            }}
          />
          <div
            aria-hidden
            className="absolute left-[4%] right-[4%] top-1/2 hidden lg:block h-px"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(191, 153, 68, 0.45), transparent)',
              transform: 'translateY(-50%)',
            }}
          />
          <div className="relative z-10 flex flex-col gap-2.5 lg:hidden">
            <div className="grid place-items-center gap-1 w-full max-w-[92px] mx-auto">
              <Link
                href="/"
                className="w-full aspect-square rounded-[12px] border p-1.5 backdrop-blur-md flex items-center justify-center"
                style={{
                  borderColor: 'rgba(191,153,68,0.52)',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.08))',
                  boxShadow: '0 0 0 1px rgba(191,153,68,0.22), 0 16px 42px rgba(0,0,0,0.34), 0 0 56px rgba(191,153,68,0.14)',
                }}
                aria-label="East v. West Fantasy Football home"
              >
                <Image
                  src="/assets/teams/East v West Logos/Official East v. West Logo.png"
                  alt="East v. West League Logo"
                  width={220}
                  height={220}
                  priority
                  className="w-[92%] h-[92%] object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.44)]"
                />
              </Link>
              <div className="text-center uppercase tracking-[0.16em]">
                <div className="text-[10px] font-black leading-none text-[var(--text)]">East v. West League</div>
              </div>
            </div>
            <TeamGrid teams={allTeams} compact className="grid grid-cols-3 gap-1.5 items-center" teamLinks={teamLinks} />
          </div>
          <div className="relative z-10 hidden lg:grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 lg:gap-3 items-center">
            <TeamGrid teams={leftTeams} className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5 lg:gap-3 items-center" teamLinks={teamLinks} />
            <div className="grid place-items-center gap-1 w-full lg:w-[clamp(92px,7.2vw,115px)] order-first lg:order-none mx-auto">
              <Link
                href="/"
                className="w-full aspect-square rounded-[12px] border p-1.5 sm:p-1.5 lg:p-2 backdrop-blur-md flex items-center justify-center"
                style={{
                  borderColor: 'rgba(191,153,68,0.52)',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.08))',
                  boxShadow: '0 0 0 1px rgba(191,153,68,0.22), 0 18px 48px rgba(0,0,0,0.36), 0 0 58px rgba(191,153,68,0.15)',
                }}
                aria-label="East v. West Fantasy Football home"
              >
                <Image
                  src="/assets/teams/East v West Logos/Official East v. West Logo.png"
                  alt="East v. West League Logo"
                  width={220}
                  height={220}
                  priority
                  className="w-[92%] h-[92%] object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.46)]"
                />
              </Link>
              <div className="text-center uppercase tracking-[0.16em]">
                <div className="text-[10px] sm:text-[11px] lg:text-[13px] font-black leading-none text-[var(--text)]">East v. West League</div>
              </div>
            </div>
            <TeamGrid teams={rightTeams} className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5 lg:gap-3 items-center" teamLinks={teamLinks} />
          </div>
        </div>
      </div>
    </div>
  );
}
