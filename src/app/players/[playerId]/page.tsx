import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPlayerProfile } from '@/lib/players/player-profile-service';
import { getPlayerProfileWithHonors } from '@/lib/players/player-honors';
import { getPlayerHallOfFameHonors } from '@/lib/hall-of-fame/service';
import {
  PlayerHeaderSection,
  PlayerOverviewSection,
  PlayerNFLProductionSection,
  PlayerEVWCareerSection,
  PlayerSeasonHistorySection,
  PlayerTransactionsSection,
} from '@/components/players/PlayerProfileSections';
import PlayerHonorsSection from '@/components/players/PlayerHonorsSection';
import PlayerHallOfFameBadges from '@/components/hall-of-fame/PlayerHallOfFameBadges';

// Server-rendered on demand — the underlying Sleeper fetch helpers already cache
// aggressively in-process, so we don't force full static generation here.
export const dynamic = 'force-dynamic';

type PageParams = { playerId: string };

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { playerId } = await params;
  const profile = await getPlayerProfile(playerId).catch(() => null);
  if (!profile) return { title: 'Player Not Found — East v. West' };
  return { title: `${profile.identity.fullName} — East v. West` };
}

export default async function PlayerProfilePage({ params }: { params: Promise<PageParams> }) {
  const { playerId } = await params;
  const [profile, hallOfFameHonors] = await Promise.all([
    getPlayerProfileWithHonors(playerId),
    getPlayerHallOfFameHonors(playerId),
  ]);
  if (!profile) notFound();

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <PlayerHallOfFameBadges honors={hallOfFameHonors} />
      <PlayerHeaderSection profile={profile} />
      <PlayerOverviewSection profile={profile} />
      <PlayerHonorsSection honors={profile.honors} />
      <PlayerNFLProductionSection profile={profile} />
      <PlayerEVWCareerSection profile={profile} />
      <PlayerSeasonHistorySection profile={profile} />
      <PlayerTransactionsSection profile={profile} />
      <p className="text-xs text-[var(--muted)]">
        Player ID: {playerId} · Data available for seasons: {profile.dataCoverage.seasonsAvailable.join(', ') || 'none'}
      </p>
    </div>
  );
}
