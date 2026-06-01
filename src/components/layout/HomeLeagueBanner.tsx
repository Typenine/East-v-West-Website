'use client';

import Image from 'next/image';
import Link from 'next/link';
import { TEAM_NAMES } from '@/lib/constants/league';
import { getTeamColors, getTeamLogoPath } from '@/lib/utils/team-utils';

const leftTeams = TEAM_NAMES.slice(0, 6);
const rightTeams = TEAM_NAMES.slice(6, 12);

function TeamGrid({ teams }: { teams: string[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 lg:gap-4 items-center">
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
            className="relative overflow-hidden rounded-[18px] border backdrop-blur-md shadow-[0_16px_36px_rgba(0,0,0,0.22)] min-h-[84px] sm:min-h-[94px] lg:min-h-[106px] px-2.5 py-2.5 sm:px-3 sm:py-3 flex items-center justify-center"
            style={{
              borderColor: 'rgba(255,255,255,0.18)',
              background: 'linear-gradient(180deg, rgba(10,14,24,0.9) 0%, rgba(14,18,30,0.88) 100%)',
              boxShadow: `0 0 0 1px ${colors.secondary}26 inset, 0 16px 36px rgba(0,0,0,0.22)`,
            }}
            title={team}
          >
            <div
              aria-hidden
              className="absolute inset-y-0 right-0 w-[34%]"
              style={{
                background: `linear-gradient(180deg, ${stripeBackground})`,
                boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.12)',
              }}
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(270deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 34%, rgba(255,255,255,0) 55%)',
              }}
            />
            <Image
              src={getTeamLogoPath(team)}
              alt={team}
              width={120}
              height={120}
              className="relative z-10 h-[3.7rem] sm:h-[4.35rem] lg:h-[5rem] w-auto object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.42)]"
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
      <div className="container mx-auto px-4 sm:px-5 py-2.5 sm:py-3 lg:py-3 relative z-10">
        <div
          className="relative overflow-hidden rounded-[20px] border p-2.5 sm:p-3 lg:p-3"
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
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 lg:gap-4 items-center">
            <TeamGrid teams={leftTeams} />
            <div className="grid place-items-center gap-1.5 w-full lg:w-[clamp(120px,9.6vw,152px)] order-first lg:order-none mx-auto">
              <Link
                href="/"
                className="w-full aspect-square rounded-[14px] border p-1.5 sm:p-2 lg:p-2.5 backdrop-blur-md flex items-center justify-center"
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
                  className="w-[94%] h-[94%] object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.48)]"
                />
              </Link>
              <div className="text-center uppercase tracking-[0.18em]">
                <div className="text-[7px] sm:text-[8px] lg:text-[9px] font-extrabold text-[#bf9944]">Dynasty Fantasy Football</div>
                <div className="mt-0.5 text-[12px] sm:text-[13px] lg:text-[15px] font-black leading-none text-[var(--text)]">East v. West League</div>
              </div>
            </div>
            <TeamGrid teams={rightTeams} />
          </div>
        </div>
      </div>
    </div>
  );
}
