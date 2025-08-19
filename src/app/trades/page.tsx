'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamsData, TeamData } from '@/lib/utils/sleeper-api';
import { Trade, fetchTradesByYear, fetchTradesAllTime } from '@/lib/utils/trades';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import EmptyState from '@/components/ui/empty-state';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

// Create a client component that uses searchParams
function TradesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Get filter values from URL parameters or use defaults
  const yearParam = searchParams.get('year');
  const teamParam = searchParams.get('team');
  const assetTypeParam = searchParams.get('assetType');
  const sortParam = searchParams.get('sort') || 'date-desc';
  
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(yearParam || 'all');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(teamParam);
  const [selectedAssetType, setSelectedAssetType] = useState<'all' | 'player' | 'pick'>(
    (assetTypeParam as 'all' | 'player' | 'pick') || 'all'
  );
  const [sortBy, setSortBy] = useState<string>(sortParam);
  const [teams, setTeams] = useState<TeamData[]>([]);

  // Helper: map selected year to leagueId
  const getLeagueIdForYear = (year: string) => {
    if (year === '2025' || year === 'all') return LEAGUE_IDS.CURRENT;
    return LEAGUE_IDS.PREVIOUS[year as keyof typeof LEAGUE_IDS.PREVIOUS];
  };
  
  // Update URL with current filter parameters
  useEffect(() => {
    // Create a new URLSearchParams object
    const params = new URLSearchParams();
    
    // Add parameters only if they're not default values
    if (selectedYear !== 'all') {
      params.set('year', selectedYear);
    }
    
    if (selectedTeam) {
      params.set('team', selectedTeam);
    }
    
    if (selectedAssetType !== 'all') {
      params.set('assetType', selectedAssetType);
    }
    
    if (sortBy !== 'date-desc') {
      params.set('sort', sortBy);
    }
    
    // Update the URL without refreshing the page
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [selectedYear, selectedTeam, selectedAssetType, sortBy]);
  
  // Fetch trades when year changes
  useEffect(() => {
    const fetchTrades = async () => {
      try {
        setLoading(true);
        const tradesPromise = selectedYear === 'all' ? fetchTradesAllTime() : fetchTradesByYear(selectedYear);
        const [yearTrades, teamList] = await Promise.all([
          tradesPromise,
          getTeamsData(getLeagueIdForYear(selectedYear))
        ]);
        setTrades(yearTrades);
        setTeams(teamList);
        setError(null);
      } catch (err) {
        console.error('Error fetching trades:', err);
        setError('Failed to load trades. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTrades();
  }, [selectedYear]);
  
  // Filter and sort trades based on selected criteria
  const filteredAndSortedTrades = trades
    .filter(trade => {
      // Filter by team if selected
      if (selectedTeam) {
        const teamInvolved = trade.teams.some(team => team.name === selectedTeam);
        if (!teamInvolved) return false;
      }
      
      // Filter by asset type if not 'all'
      if (selectedAssetType !== 'all') {
        const hasAssetType = trade.teams.some(team => 
          team.assets.some(asset => asset.type === selectedAssetType)
        );
        if (!hasAssetType) return false;
      }
      
      return true;
    })
    .sort((a, b) => {
      // Sort based on selected sort criteria
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'date-asc':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'teams-asc':
          return a.teams[0].name.localeCompare(b.teams[0].name);
        case 'teams-desc':
          return b.teams[0].name.localeCompare(a.teams[0].name);
        default:
          return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
    });
  
  if (loading) {
    return <LoadingState message="Loading trades..." fullPage />;
  }

  if (error) {
    return (
      <ErrorState 
        message={`Error loading trades: ${error}`}
        fullPage
        retry={() => setLoading(true)}
        homeLink
      />
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Trades" />
      <h1 id="trades-heading" className="sr-only">Trades</h1>
      
      {/* Filters */}
      <Card role="search" aria-labelledby="filter-heading" className="mb-8">
        <CardContent>
          <h2 id="filter-heading" className="sr-only">Trade filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Year Filter */}
            <div>
              <Label htmlFor="year-filter">Season</Label>
              <Select
                id="year-filter"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                <option value="all">All Time</option>
                <option value="2025">2025 Season</option>
                <option value="2024">2024 Season</option>
                <option value="2023">2023 Season</option>
              </Select>
            </div>
            
            {/* Team Filter */}
            <div>
              <Label htmlFor="team-filter">Team</Label>
              <Select
                id="team-filter"
                value={selectedTeam || ''}
                onChange={(e) => setSelectedTeam(e.target.value || null)}
              >
                <option value="">All Teams</option>
                {teams
                  .map((t) => t.teamName)
                  .sort((a, b) => a.localeCompare(b))
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
              </Select>
            </div>
            
            {/* Asset Type Filter */}
            <div>
              <Label htmlFor="asset-filter">Asset Type</Label>
              <Select
                id="asset-filter"
                value={selectedAssetType}
                onChange={(e) => setSelectedAssetType(e.target.value as 'all' | 'player' | 'pick')}
              >
                <option value="all">All Assets</option>
                <option value="player">Players Only</option>
                <option value="pick">Draft Picks Only</option>
              </Select>
            </div>
            
            {/* Sort Filter */}
            <div>
              <Label htmlFor="sort-filter">Sort By</Label>
              <Select
                id="sort-filter"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="date-desc">Newest First</option>
                <option value="date-asc">Oldest First</option>
                <option value="teams-asc">Teams (A-Z)</option>
                <option value="teams-desc">Teams (Z-A)</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Trade Feed */}
      <div className="space-y-6" aria-labelledby="trades-heading">
        {filteredAndSortedTrades.length > 0 ? (
          filteredAndSortedTrades.map((trade) => (
            <Link
              key={trade.id}
              href={`/trades/${trade.id}`}
              className="block"
              aria-label={`View details of trade between ${trade.teams.map(t => t.name).join(' and ')} from ${new Date(trade.date).toLocaleDateString()}`}
            >
              <Card className="hover:shadow-[var(--shadow-hover)] transition-shadow">
                <CardHeader className="bg-[var(--surface)]">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-[var(--text)]">
                      Trade between {trade.teams.map(t => t.name).join(' and ')}
                    </CardTitle>
                    <span className="text-sm text-[var(--muted)]">
                      {new Date(trade.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {trade.teams.map((team, index) => (
                      <div key={index} className="border-l-4 pl-4" style={{ borderLeftColor: getTeamColorStyle(team.name).backgroundColor }}>
                        <div className="flex items-center mb-2">
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center mr-3 overflow-hidden" 
                            style={getTeamColorStyle(team.name)}
                          >
                            <Image
                              src={getTeamLogoPath(team.name)}
                              alt={team.name}
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
                                  fallback.innerHTML = `<span class=\"text-xs font-bold\">${team.name.charAt(0)}</span>`;
                                  parent.appendChild(fallback);
                                }
                              }}
                            />
                          </div>
                          <h4 className="font-bold" style={{ color: getTeamColorStyle(team.name).backgroundColor }}>{team.name} received:</h4>
                        </div>
                        <ul className="space-y-1">
                          {team.assets.map((asset, assetIndex) => (
                            <li key={assetIndex} className="text-sm flex justify-between items-center">
                              <div>
                                {asset.type === 'player' ? (
                                  <span>
                                    {asset.name} ({asset.position}, {asset.team})
                                  </span>
                                ) : (
                                  <div>
                                    <span>
                                      {asset.name}
                                      {typeof asset.pickInRound === 'number' ? (
                                        <>
                                          {' '}#{asset.pickInRound}
                                        </>
                                      ) : null}
                                      {asset.became ? (
                                        <>
                                          {' '}(
                                          {asset.becamePosition ? `${asset.becamePosition} - ` : ''}
                                          {asset.became})
                                        </>
                                      ) : null}
                                    </span>
                                    {asset.originalOwner && (
                                      <div className="text-xs text-[var(--muted)] mt-0.5">
                                        originally {asset.originalOwner}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                {(asset.type === 'player' && asset.playerId) ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/trades/tracker?rootType=player&playerId=${asset.playerId}`);
                                    }}
                                    aria-label={`Track lineage for ${asset.name}`}
                                  >
                                    Track
                                  </Button>
                                ) : null}
                                {(asset.type === 'pick' && asset.year && asset.round && (asset.draftSlot ?? asset.pickInRound)) ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/trades/tracker?rootType=pick&season=${asset.year}&round=${asset.round}&slot=${(asset.draftSlot ?? asset.pickInRound) as number}`);
                                    }}
                                    aria-label={`Track lineage for ${asset.name}`}
                                  >
                                    Track
                                  </Button>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </CardContent>
                <CardFooter>
                  <div className="text-sm text-[var(--muted)]" aria-hidden="true">
                    View trade details →
                  </div>
                </CardFooter>
              </Card>
            </Link>
          ))
        ) : (
          <EmptyState
            title="No Trades Found"
            message="There are no trades matching your current filters."
            action={{
              label: "Clear all trade filters",
              onClick: () => {
                setSelectedTeam(null);
                setSelectedAssetType('all');
                setSortBy('date-desc');
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

// Export the page component with Suspense boundary
export default function TradesPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading trades..." />}>
      <TradesContent />
    </Suspense>
  );
}
