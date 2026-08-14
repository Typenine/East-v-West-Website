import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getPlayerProfile } from '@/lib/players/player-profile-service';
import { getTeamColorStyle } from '@/lib/utils/team-utils';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import SectionHeader from '@/components/ui/SectionHeader';
import Chip from '@/components/ui/Chip';
import StatCard from '@/components/ui/StatCard';

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

function transactionLabel(type: string): string {
  switch (type) {
    case 'drafted': return 'Drafted';
    case 'traded': return 'Traded';
    case 'added': return 'Added';
    case 'dropped': return 'Dropped';
    case 'waiver': return 'Waiver Claim';
    case 'free_agent': return 'Free Agent Signing';
    case 'reacquired': return 'Reacquired';
    default: return type;
  }
}

export default async function PlayerProfilePage({ params }: { params: Promise<PageParams> }) {
  const { playerId } = await params;
  const profile = await getPlayerProfile(playerId);
  if (!profile) notFound();

  const { identity, currentStatus, nflSeasons, evwCareer, seasonHistory, draftHistory, transactions, dataCoverage } = profile;

  const currentTeamColors = currentStatus.franchiseName ? getTeamColorStyle(currentStatus.franchiseName, 'primary') : undefined;

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Player header */}
      <Card>
        <CardContent className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-6">
          <div className="relative w-20 h-20 rounded-full overflow-hidden bg-[var(--surface-2)] shrink-0">
            {identity.headshotUrl && (
              <Image
                src={identity.headshotUrl}
                alt={identity.fullName}
                fill
                sizes="80px"
                className="object-cover"
                unoptimized
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text)]">{identity.fullName}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {identity.position && <Chip>{identity.position}</Chip>}
              {identity.nflTeam && <Chip>{identity.nflTeam}</Chip>}
              {identity.status && <Chip>{identity.status}</Chip>}
              {currentStatus.isRostered && currentStatus.franchiseName ? (
                <Chip style={currentTeamColors}>{currentStatus.franchiseName}</Chip>
              ) : (
                <Chip>Free Agent</Chip>
              )}
              {currentStatus.rosterStatus === 'taxi' && <Chip>Taxi Squad</Chip>}
              {currentStatus.rosterStatus === 'ir' && <Chip>IR</Chip>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overview */}
      <section>
        <SectionHeader title="Overview" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Current Team" value={currentStatus.franchiseName ?? 'Free Agent'} />
          <StatCard label="EVW Seasons" value={evwCareer.seasonsRepresented.length} />
          <StatCard label="EVW Career Points" value={evwCareer.totalPoints.toFixed(1)} />
          <StatCard label="Franchises Played For" value={evwCareer.franchiseCount} />
        </div>
      </section>

      {/* NFL Production */}
      <section>
        <SectionHeader
          title="NFL Production"
          subtitle="Season fantasy totals under East v. West scoring — independent of East v. West roster ownership."
        />
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Season</Th>
                  <Th>Total Points</Th>
                  <Th>Games Played</Th>
                  <Th>PPG</Th>
                </Tr>
              </THead>
              <TBody>
                {nflSeasons.length === 0 && (
                  <Tr><Td colSpan={4} className="text-[var(--muted)]">No NFL production data available.</Td></Tr>
                )}
                {nflSeasons.map((s) => (
                  <Tr key={s.season}>
                    <Td>{s.season}</Td>
                    <Td>{s.totalPoints.toFixed(1)}</Td>
                    <Td>{s.gamesPlayed ?? '—'}</Td>
                    <Td>{s.ppg != null ? s.ppg.toFixed(1) : '—'}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* East v. West Career */}
      <section>
        <SectionHeader
          title="East v. West Career"
          subtitle="Only points actually scored while a franchise owned this player, week by week."
        />
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Franchise</Th>
                  <Th>Seasons</Th>
                  <Th>Total Points</Th>
                  <Th>Rostered Weeks</Th>
                  <Th>Starts</Th>
                </Tr>
              </THead>
              <TBody>
                {evwCareer.franchises.length === 0 && (
                  <Tr><Td colSpan={5} className="text-[var(--muted)]">No East v. West franchise history available.</Td></Tr>
                )}
                {evwCareer.franchises.map((f) => (
                  <Tr key={f.franchiseName}>
                    <Td>{f.franchiseName}</Td>
                    <Td>{f.firstSeason === f.lastSeason ? f.firstSeason : `${f.firstSeason}–${f.lastSeason}`}</Td>
                    <Td>{f.totalPoints.toFixed(1)}</Td>
                    <Td>{f.rosteredWeeks}</Td>
                    <Td>{f.starts}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Season History */}
      <section>
        <SectionHeader title="Season History" subtitle="East v. West production by season. Multiple rows for a season indicate a midseason trade." />
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Season</Th>
                  <Th>Franchise</Th>
                  <Th>Points</Th>
                  <Th>Rostered Weeks</Th>
                  <Th>Starts</Th>
                </Tr>
              </THead>
              <TBody>
                {seasonHistory.length === 0 && (
                  <Tr><Td colSpan={5} className="text-[var(--muted)]">No season history available.</Td></Tr>
                )}
                {seasonHistory.flatMap((season) =>
                  season.stints.map((stint) => (
                    <Tr key={`${season.season}-${stint.franchiseName}`}>
                      <Td>{season.season}</Td>
                      <Td>{stint.franchiseName}</Td>
                      <Td>{stint.totalPoints.toFixed(1)}</Td>
                      <Td>{stint.rosteredWeeks}</Td>
                      <Td>{stint.starts}</Td>
                    </Tr>
                  )),
                )}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {/* Transactions */}
      <section>
        <SectionHeader title="Transactions" subtitle="Draft, trade, and add/drop history from Sleeper league data." />
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Season</Th>
                  <Th>Week</Th>
                  <Th>Event</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Details</Th>
                </Tr>
              </THead>
              <TBody>
                {transactions.length === 0 && (
                  <Tr><Td colSpan={6} className="text-[var(--muted)]">No transaction history available for the covered seasons.</Td></Tr>
                )}
                {transactions.map((t) => (
                  <Tr key={t.id}>
                    <Td>{t.season}</Td>
                    <Td>{t.week ?? '—'}</Td>
                    <Td>{transactionLabel(t.type)}</Td>
                    <Td>{t.fromFranchise ?? '—'}</Td>
                    <Td>{t.toFranchise ?? '—'}</Td>
                    <Td className="text-[var(--muted)]">{t.details ?? '—'}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        {draftHistory.length > 0 && (
          <p className="text-xs text-[var(--muted)] mt-2">
            Draft history: {draftHistory.map((d) => `${d.year} Round ${d.round}, Pick ${d.pick} (${d.franchiseName ?? 'Unknown'})`).join(' · ')}
          </p>
        )}
        {dataCoverage.notes && (
          <ul className="text-xs text-[var(--muted)] mt-2 list-disc list-inside">
            {dataCoverage.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-[var(--muted)]">
        Player ID: {playerId} · Data available for seasons: {dataCoverage.seasonsAvailable.join(', ') || 'none'}
      </p>
    </div>
  );
}
