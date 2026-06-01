'use client';

import Image from 'next/image';
import Link from 'next/link';
import { TEAM_NAMES } from '@/lib/constants/league';
import { getTeamColors, getTeamLogoPath } from '@/lib/utils/team-utils';

const leftTeams = TEAM_NAMES.slice(0, 6);
const rightTeams = TEAM_NAMES.slice(6, 12);

function TeamGrid({ teams }: { teams: string[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 items-center">
      {teams.map((team) => {
        const colors = getTeamColors(team);
        const stripeColors = [colors.primary, colors.secondary, colors.tertiary].filter(Boolean) as string[];
        const stripeCount = stripeColors.length;
        const stripeBackground = stripeColors
          .map((color, index) => {
            const start = (index / stripeCount) * 100;
            const end = ((index + 1) / stripeCount) * 100;
            return `${color} ${start}%, ${color} ${end}%`;
          })
          .join(', ');
        return (
          <div
            key={team}
            className="rounded-[22px] border backdrop-blur-md shadow-[0_16px_36px_rgba(0,0,0,0.22)] min-h-[104px] sm:min-h-[118px] lg:min-h-[132px] px-3 py-3 sm:px-4 sm:py-4 flex items-center justify-center"
            style={{
              borderColor: 'rgba(255,255,255,0.18)',
              background: `linear-gradient(180deg, ${stripeBackground}), linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)`,
              boxShadow: `0 0 0 1px ${colors.secondary}26 inset, 0 16px 36px rgba(0,0,0,0.22)`,
            }}
            title={team}
          >
            <Image
              src={getTeamLogoPath(team)}
              alt={team}
              width={120}
              height={120}
              className="h-16 sm:h-20 lg:h-24 w-auto object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.42)]"
            />
          </div>
        );
      })}
    </div>
  );
}

export default function HomeLeagueBanner() {
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
      <div className="container mx-auto px-4 sm:px-5 py-3 sm:py-4 lg:py-4 relative z-10">
        <div
          className="relative overflow-hidden rounded-[24px] border p-3 sm:p-4 lg:p-4"
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
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 lg:gap-5 items-center">
            <TeamGrid teams={leftTeams} />
            <div className="grid place-items-center gap-2 w-full lg:w-[clamp(170px,14vw,220px)] order-first lg:order-none mx-auto">
              <Link
                href="/"
                className="w-full aspect-square rounded-[22px] border p-3 sm:p-4 lg:p-4 backdrop-blur-md flex items-center justify-center"
                style={{
                  borderColor: 'rgba(191,153,68,0.52)',
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.08))',
                  boxShadow: '0 0 0 1px rgba(191,153,68,0.22), 0 22px 60px rgba(0,0,0,0.38), 0 0 70px rgba(191,153,68,0.16)',
                }}
                aria-label="East v. West Fantasy Football home"
              >
                <Image
                  src="/assets/teams/East v West Logos/Official East v. West Logo.png"
                  alt="East v. West League Logo"
                  width={280}
                  height={280}
                  priority
                  className="w-[82%] h-[82%] object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.48)]"
                />
              </Link>
              <div className="text-center uppercase tracking-[0.18em]">
                <div className="text-[9px] sm:text-[10px] lg:text-[11px] font-extrabold text-[#bf9944]">Dynasty Fantasy Football</div>
                <div className="mt-0.5 text-[15px] sm:text-[16px] lg:text-[19px] font-black leading-none text-[var(--text)]">East v. West League</div>
              </div>
            </div>
            <TeamGrid teams={rightTeams} />
          </div>
        </div>
      </div>
    </div>
  );
}
