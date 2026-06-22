import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel, BroadcastTeamLogo } from '@/components/ui/BroadcastPanel';
import { broadcastBodyTextStyle, broadcastMutedTextStyle, teamAccent } from '@/components/ui/BroadcastPanel';
import type { SeasonRecapData } from './SeasonRecapGrid';

export default function CompactSeasonRecap({
  recap,
  year,
}: {
  recap: SeasonRecapData;
  year: string;
}) {
  const champion = recap.podium?.champion;
  const runnerUp = recap.podium?.runnerUp;
  if (!champion || champion === 'TBD') return null;

  const accent = teamAccent(champion);

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader
        title={`${year} Season recap`}
        actions={
          <Link
            href="/history"
            className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
          >
            Full history →
          </Link>
        }
      />
      <BroadcastPanel
        accent={accent}
        title="Champion"
        meta={year}
        bodyClassName="flex items-center gap-4"
      >
        <BroadcastTeamLogo team={champion} accent={accent} size="md" />
        <div>
          <Link
            href="/history"
            className="text-base font-bold hover:underline"
            style={broadcastBodyTextStyle}
          >
            {champion}
          </Link>
          {runnerUp && runnerUp !== 'TBD' && (
            <p className="text-xs mt-0.5" style={broadcastMutedTextStyle}>
              Runner-up: {runnerUp}
            </p>
          )}
          {recap.regularSeasonWinner && (
            <p className="text-xs" style={broadcastMutedTextStyle}>
              Regular season: {recap.regularSeasonWinner.teamName} ({recap.regularSeasonWinner.wins}W)
            </p>
          )}
        </div>
      </BroadcastPanel>
    </section>
  );
}
