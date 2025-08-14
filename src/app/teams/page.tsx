'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getTeamsData, getTeamAllTimeStatsByOwner, TeamData } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allTimeByOwner, setAllTimeByOwner] = useState<Record<string, { wins: number; losses: number; ties: number }>>({});
  
  useEffect(() => {
    async function fetchTeams() {
      try {
        setLoading(true);
        const teamsData = await getTeamsData(LEAGUE_IDS.CURRENT);
        setTeams(teamsData);

        // Aggregate all-time records per owner across seasons
        const uniqueOwners = Array.from(new Set(teamsData.map(t => t.ownerId)));
        const results = await Promise.all(
          uniqueOwners.map(async (ownerId) => {
            const stats = await getTeamAllTimeStatsByOwner(ownerId);
            return [ownerId, { wins: stats.wins, losses: stats.losses, ties: stats.ties }] as const;
          })
        );
        const map: Record<string, { wins: number; losses: number; ties: number }> = {};
        for (const [ownerId, rec] of results) map[ownerId] = rec;
        setAllTimeByOwner(map);
        setError(null);
      } catch (err) {
        console.error('Error fetching teams:', err);
        setError('Failed to load teams. Please try again later.');
      } finally {
        setLoading(false);
      }
    }
    
    fetchTeams();
  }, []);
  
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
        <h1 className="text-3xl font-bold text-center mb-8">Teams</h1>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="h-40 bg-slate-200 rounded-lg mb-2"></div>
              <div className="h-6 bg-slate-200 rounded w-3/4 mx-auto"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-center mb-8">Teams</h1>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline"> {error}</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Teams</h1>
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {teams.map((team) => (
          <Link 
            href={`/teams/${team.rosterId}`} 
            key={team.rosterId}
            className="block hover:transform hover:scale-105 transition-transform duration-200"
          >
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
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
              <div className="p-4">
                <h3 className="font-bold text-center text-lg">{team.teamName}</h3>
                <div className="text-center text-sm text-gray-600 mt-2">
                  {/* All-time aggregated record */}
                  {(allTimeByOwner[team.ownerId]?.wins ?? 0)}-
                  {(allTimeByOwner[team.ownerId]?.losses ?? 0)}
                  {((allTimeByOwner[team.ownerId]?.ties ?? 0) > 0) ? `-${allTimeByOwner[team.ownerId]!.ties}` : ''}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
