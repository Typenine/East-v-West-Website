import Link from 'next/link';
import Image from 'next/image';
import { getTeamColors, getTeamLogoPath, getReadableTextForColors } from '@/lib/utils/team-utils';
import type { PlayerHallOfFameHonor } from '@/lib/hall-of-fame/types';

export default function PlayerHallOfFameBadges({ honors }: { honors: PlayerHallOfFameHonor[] }) {
  if (honors.length === 0) return null;

  return (
    <section aria-label="Team Hall of Fame honors" className="space-y-2">
      {honors.map((honor) => {
        const colors = getTeamColors(honor.franchiseName);
        const textColor = getReadableTextForColors([colors.primary, colors.secondary]);
        return (
          <Link
            key={honor.id}
            href={`/hall-of-fame?franchise=${encodeURIComponent(honor.franchiseId)}`}
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-4 py-3 shadow-sm transition-transform hover:-translate-y-0.5"
            style={{
              background: `linear-gradient(120deg, ${colors.primary}, ${colors.secondary})`,
              color: textColor,
            }}
          >
            <div className="relative h-11 w-11 shrink-0 rounded-full bg-black/15 p-1.5">
              <Image src={getTeamLogoPath(honor.franchiseName)} alt="" fill sizes="44px" className="object-contain p-1.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">Team Hall of Fame</div>
              <div className="font-black leading-tight">{honor.franchiseName} · Class of {honor.inductionYear}</div>
            </div>
            <span className="ml-auto hidden text-xs font-bold uppercase tracking-wider opacity-80 sm:inline">View Hall</span>
          </Link>
        );
      })}
    </section>
  );
}
