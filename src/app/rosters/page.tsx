'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ErrorState from '@/components/ui/error-state';
import LoadingState from '@/components/ui/loading-state';
import { Card, CardContent } from '@/components/ui/Card';
import SectionHeader from '@/components/ui/SectionHeader';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getAllPlayers, getTeamsData, type SleeperPlayer, type TeamData } from '@/lib/utils/sleeper-api';
import { getTeamColorStyle, getTeamLogoPath } from '@/lib/utils/team-utils';

const POSITION_GROUP_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF/DST', 'Other'] as const;
type PositionGroup = (typeof POSITION_GROUP_ORDER)[number];
type PositionFilter = 'ALL' | PositionGroup;

function toPositionGroup(position?: string | null): PositionGroup {
  const normalized = (position || '').toUpperCase();
  if (normalized === 'DST' || normalized === 'DEF') return 'DEF/DST';
  if (normalized === 'HB' || normalized === 'FB') return 'RB';
  if (normalized === 'PK') return 'K';
  if (POSITION_GROUP_ORDER.includes(normalized as PositionGroup)) return normalized as PositionGroup;
  return 'Other';
}

function playerName(playerId: string, players: Record<string, SleeperPlayer>): string {
  const player = players[playerId];
  const name = [player?.first_name, player?.last_name].filter(Boolean).join(' ').trim();
  return name || `Player ${playerId}`;
}

function groupPlayers(playerIds: string[], players: Record<string, SleeperPlayer>) {
  const groups = new Map<PositionGroup, string[]>();

  for (const playerId of playerIds) {
    const group = toPositionGroup(players[playerId]?.position);
    const current = groups.get(group) || [];
    current.push(playerId);
    groups.set(group, current);
  }

  return POSITION_GROUP_ORDER
    .filter((group) => groups.has(group))
    .map((group) => ({
      group,
      playerIds: (groups.get(group) || []).sort((a, b) =>
        playerName(a, players).localeCompare(playerName(b, players)),
      ),
    }));
}

export default function RostersPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [players, setPlayers] = useState<Record<string, SleeperPlayer>>({});
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState<PositionFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRosters = useCallback(async () => {
    try {
      setLoading(true);
      const [teamsData, playersData] = await Promise.all([
        getTeamsData(LEAGUE_IDS.CURRENT),
        getAllPlayers(),
      ]);

      setTeams(teamsData.slice().sort((a, b) => a.teamName.localeCompare(b.teamName)));
      setPlayers(playersData);
      setError(null);
    } catch (err) {
      console.error('Error loading league rosters:', err);
      setError('Failed to load league rosters. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRosters();
  }, [loadRosters]);

  const positionCounts = useMemo(() => {
    const counts: Record<PositionGroup, number> = {
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      K: 0,
      'DEF/DST': 0,
      Other: 0,
    };

    for (const team of teams) {
      for (const playerId of team.players || []) {
        counts[toPositionGroup(players[playerId]?.position)] += 1;
      }
    }

    return counts;
  }, [players, teams]);

  const visibleTeams = useMemo(() => {
    const query = search.trim().toLowerCase();

    return teams
      .map((team) => {
        const teamMatches = query.length > 0 && team.teamName.toLowerCase().includes(query);
        const filteredPlayerIds = (team.players || []).filter((playerId) => {
          const player = players[playerId];
          const group = toPositionGroup(player?.position);
          if (position !== 'ALL' && group !== position) return false;
          if (!query || teamMatches) return true;

          const searchable = [
            playerName(playerId, players),
            player?.team || '',
            player?.position || '',
          ].join(' ').toLowerCase();

          return searchable.includes(query);
        });

        return { team, playerIds: filteredPlayerIds, teamMatches };
      })
      .filter(({ playerIds, teamMatches }) => {
        if (!query) return true;
        return teamMatches || playerIds.length > 0;
      });
  }, [players, position, search, teams]);

  const visiblePlayerCount = useMemo(
    () => visibleTeams.reduce((total, item) => total + item.playerIds.length, 0),
    [visibleTeams],
  );

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="League Rosters" />
        <LoadingState message="Loading every roster..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="League Rosters" />
        <ErrorState message={error} retry={loadRosters} homeLink />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="League Rosters" />
      <p className="mb-6 max-w-3xl text-sm text-[var(--muted)]">
        View and search every current roster in the league. Select a team name to open its full team page.
      </p>

      <Card className="mb-6">
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Search teams or players
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by team, player, position, or NFL team"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_25%,transparent)]"
              />
            </label>

            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Position
              </div>
              <div className="flex flex-wrap gap-2">
                {(['ALL', ...POSITION_GROUP_ORDER] as PositionFilter[]).map((option) => {
                  const active = position === option;
                  const count = option === 'ALL'
                    ? teams.reduce((total, team) => total + (team.players?.length || 0), 0)
                    : positionCounts[option];

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setPosition(option)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-[var(--accent)] bg-accent-soft text-accent'
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]'
                      }`}
                    >
                      {option === 'ALL' ? 'All' : option} <span className="opacity-70">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4 text-sm">
            <div className="text-[var(--muted)]">
              Showing <span className="font-semibold text-[var(--text)]">{visiblePlayerCount}</span> players across{' '}
              <span className="font-semibold text-[var(--text)]">{visibleTeams.length}</span> teams
            </div>
            {(search || position !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setPosition('ALL');
                }}
                className="font-semibold text-accent hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {visibleTeams.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
              {visibleTeams.map(({ team }) => (
                <a
                  key={team.rosterId}
                  href={`#team-${team.rosterId}`}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--surface-strong)]"
                >
                  {team.teamName}
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {visibleTeams.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <h2 className="text-lg font-bold text-[var(--text)]">No roster matches</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Try a different player, team, or position.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleTeams.map(({ team, playerIds }) => {
            const groupedPlayers = groupPlayers(playerIds, players);
            const teamColor = getTeamColorStyle(team.teamName).backgroundColor as string;

            return (
              <section key={team.rosterId} id={`team-${team.rosterId}`} className="scroll-mt-24">
                <Card className="h-full overflow-hidden" style={{ borderTop: `4px solid ${teamColor}` }}>
                  <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3">
                    <div
                      className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                      style={getTeamColorStyle(team.teamName)}
                    >
                      <Image
                        src={getTeamLogoPath(team.teamName)}
                        alt={`${team.teamName} logo`}
                        width={50}
                        height={50}
                        className="h-12 w-12 object-contain p-1"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/teams/${team.rosterId}`}
                        className="block truncate text-base font-bold text-[var(--text)] hover:text-accent hover:underline"
                      >
                        {team.teamName}
                      </Link>
                      <div className="mt-0.5 text-xs text-[var(--muted)]">
                        {playerIds.length} of {team.players?.length || 0} players shown
                      </div>
                    </div>
                  </div>

                  <CardContent className="p-4">
                    {groupedPlayers.length === 0 ? (
                      <div className="py-8 text-center text-sm text-[var(--muted)]">
                        No players match the current filters.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                        {groupedPlayers.map(({ group, playerIds: groupPlayerIds }) => (
                          <div key={group} className="min-w-0">
                            <div className="mb-1.5 flex items-center justify-between border-b border-[var(--border)] pb-1">
                              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text)]">{group}</h3>
                              <span className="text-[11px] text-[var(--muted)]">{groupPlayerIds.length}</span>
                            </div>
                            <div className="space-y-0.5">
                              {groupPlayerIds.map((playerId) => {
                                const player = players[playerId];
                                return (
                                  <div
                                    key={playerId}
                                    className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-[var(--surface-strong)]"
                                  >
                                    <span className="min-w-0 truncate font-medium text-[var(--text)]">
                                      {playerName(playerId, players)}
                                    </span>
                                    <span className="shrink-0 text-[11px] font-semibold text-[var(--muted)]">
                                      {player?.team || 'FA'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 border-t border-[var(--border)] pt-3 text-right">
                      <Link href={`/teams/${team.rosterId}`} className="text-sm font-semibold text-accent hover:underline">
                        View full team page
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
