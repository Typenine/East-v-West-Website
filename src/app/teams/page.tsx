'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getTeamsData, getTeamAllTimeStatsByOwner, getWeeklyHighScoreTallyAcrossSeasons, TeamData } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import { Card, CardContent } from '@/components/ui/Card';
import SectionHeader from '@/components/ui/SectionHeader';

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allTimeByOwner, setAllTimeByOwner] = useState<Record<string, { wins: number; losses: number; ties: number }>>({});
  const [weeklyHighsByOwner, setWeeklyHighsByOwner] = useState<Record<string, number>>({});
  
  const fetchTeams = useCallback(async () => {
    try {
      setLoading(true);
      const teamsData = await getTeamsData(LEAGUE_IDS.CURRENT);
      setTeams(teamsData);

      // Aggregate all-time records per owner across seasons and weekly high score tallies
      const uniqueOwners = Array.from(new Set(teamsData.map(t => t.ownerId)));
      const [allTimeRecords, weeklyHighs] = await Promise.all([
        (async () => {
          const pairs = await Promise.all(
            uniqueOwners.map(async (ownerId) => {
              const stats = await getTeamAllTimeStatsByOwner(ownerId);
              return [ownerId, { wins: stats.wins, losses: stats.losses, ties: stats.ties }] as const;
            })
          );
          const map: Record<string, { wins: number; losses: number; ties: number }> = {};
          for (const [ownerId, rec] of pairs) map[ownerId] = rec;
          return map;
        })(),
        getWeeklyHighScoreTallyAcrossSeasons(),
      ]);

      setAllTimeByOwner(allTimeRecords);
      setWeeklyHighsByOwner(weeklyHighs);
      setError(null);
    } catch (err) {
      console.error('Error fetching teams:', err);
      setError('Failed to load teams. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);
  
  // Function to handle missing logo images
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    target.style.display = 'none';
    const parent = target.parentElement;
    if (parent) {
      const fallback = document.createElement('div');
      fallback.className = 'flex items-center justify-center h-full w-full';
      fallback.innerHTML = `<span class="text-5xl font-bold">${target.alt.charAt(0)}</span>`;
      parent.appendChild(fallback);
    }
  };
  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Teams" />
        <LoadingState message="Loading teams..." />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Teams" />
        <ErrorState message={error} retry={fetchTeams} homeLink />
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Teams" />
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {teams.map((team) => (
          <Link 
            href={`/teams/${team.rosterId}`} 
            key={team.rosterId}
            className="block transition-transform duration-200 hover:opacity-90"
          >
            <Card className="overflow-hidden" style={{ borderTop: `4px solid ${getTeamColorStyle(team.teamName).backgroundColor as string}` }}>
              <div 
                className="h-32 flex items-center justify-center relative" 
                style={getTeamColorStyle(team.teamName)}
              >
                <Image
                  src={getTeamLogoPath(team.teamName)}
                  alt={team.teamName}
                  width={100}
                  height={100}
                  className="object-contain p-2"
                  onError={handleImageError}
                />
              </div>
              <CardContent>
                <h3 className="font-bold text-center text-lg">{team.teamName}</h3>
                <div className="text-center text-sm text-[var(--muted)] mt-2">
                  {/* All-time aggregated record */}
                  {(allTimeByOwner[team.ownerId]?.wins ?? 0)}-
                  {(allTimeByOwner[team.ownerId]?.losses ?? 0)}
                  {((allTimeByOwner[team.ownerId]?.ties ?? 0) > 0) ? `-${allTimeByOwner[team.ownerId]!.ties}` : ''}
                </div>
                <div className="text-center text-xs text-[var(--muted)] mt-1">
                  Weekly Highs: {weeklyHighsByOwner[team.ownerId] ?? 0}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
