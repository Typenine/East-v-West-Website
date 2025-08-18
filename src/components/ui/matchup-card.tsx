'use client';

import Image from 'next/image';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';
import { Card, CardContent } from '@/components/ui/Card';

interface MatchupCardProps {
  homeTeam: string;
  awayTeam: string;
  homeScore?: number;
  awayScore?: number;
  kickoffTime?: string;
  week: number;
  className?: string;
}

export default function MatchupCard({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  kickoffTime,
  week,
  className = ''
}: MatchupCardProps) {
  const hasScores = homeScore !== undefined && awayScore !== undefined;
  const awayStyle = getTeamColorStyle(awayTeam);
  const homeStyle = getTeamColorStyle(homeTeam);
  const awayBg = (awayStyle.backgroundColor as string) || 'transparent';
  const homeBg = (homeStyle.backgroundColor as string) || 'transparent';
  
  return (
    <Card
      className={className}
      style={{ borderTop: `4px solid ${homeBg}`, borderBottom: `4px solid ${awayBg}` }}
    >
      <CardContent className="p-4">
        <div className="text-xs text-[var(--muted)] mb-2">Week {week}</div>
        
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center mr-3 overflow-hidden" 
              style={awayStyle}
            >
              <Image
                src={getTeamLogoPath(awayTeam)}
                alt={awayTeam}
                width={24}
                height={24}
                className="object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    const fallback = document.createElement('div');
                    fallback.className = 'flex items-center justify-center h-full w-full';
                    fallback.innerHTML = `<span class="text-xs font-bold">${awayTeam.charAt(0)}</span>`;
                    parent.appendChild(fallback);
                  }
                }}
              />
            </div>
            <div className="font-medium" style={{ color: awayBg }}>{awayTeam}</div>
          </div>
          {hasScores ? (
            <div className="font-bold">{awayScore}</div>
          ) : null}
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center mr-3 overflow-hidden" 
              style={homeStyle}
            >
              <Image
                src={getTeamLogoPath(homeTeam)}
                alt={homeTeam}
                width={24}
                height={24}
                className="object-contain"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    const fallback = document.createElement('div');
                    fallback.className = 'flex items-center justify-center h-full w-full';
                    fallback.innerHTML = `<span class='text-xs font-bold'>${homeTeam.charAt(0)}</span>`;
                    parent.appendChild(fallback);
                  }
                }}
              />
            </div>
            <div className="font-medium" style={{ color: homeBg }}>{homeTeam}</div>
          </div>
          {hasScores ? (
            <div className="font-bold">{homeScore}</div>
          ) : null}
        </div>
        
        {!hasScores && kickoffTime && (
          <div className="mt-2 text-center text-sm text-[var(--muted)]">
            Kickoff: {kickoffTime}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

