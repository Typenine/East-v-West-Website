'use client';

import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel, BroadcastTeamLogo } from '@/components/ui/BroadcastPanel';
import { broadcastBodyTextStyle, broadcastMutedTextStyle, broadcastFaintTextStyle, teamAccent } from '@/lib/ui/broadcast-styles';
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

  // Show a placeholder card if no champion data is available at all
  if (!champion) {
    return (
      <section className="mb-10 sm:mb-12">
        <SectionHeader
          title={`${year} Season recap`}
          actions={
            <Link href="/history" className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              Full history →
            </Link>
          }
        />
        <BroadcastPanel accent="#6b7280" title="Season recap" meta={year}>
          <p className="text-sm" style={broadcastFaintTextStyle}>
            Recap data is not yet available for the {year} season.
          </p>
        </BroadcastPanel>
      </section>
    );
  }

  const isTBD = champion === 'TBD';
  const accent = isTBD ? '#6b7280' : teamAccent(champion);

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
        title={isTBD ? 'Season in progress' : 'Champion'}
        meta={year}
        bodyClassName="flex items-center gap-4"
      >
        {!isTBD && <BroadcastTeamLogo team={champion} accent={accent} size="md" />}
        <div>
          {isTBD ? (
            <p className="text-base font-bold" style={broadcastFaintTextStyle}>
              Champion TBD
            </p>
          ) : (
            <Link
              href="/history"
              className="text-base font-bold hover:underline"
              style={broadcastBodyTextStyle}
            >
              {champion}
            </Link>
          )}
          {!isTBD && runnerUp && runnerUp !== 'TBD' && (
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
