'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { TEAM_NAMES } from '@/lib/constants/league';
import { Trade, fetchTradesByYear } from '@/lib/utils/trades';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import EmptyState from '@/components/ui/empty-state';
import { getTeamLogoPath, getTeamColorStyle } from '@/lib/utils/team-utils';

// Create a client component that uses searchParams
function TradesContent() {
  const searchParams = useSearchParams();
  
  // Get filter values from URL parameters or use defaults
  const yearParam = searchParams.get('year');
  const teamParam = searchParams.get('team');
  const assetTypeParam = searchParams.get('assetType');
  const sortParam = searchParams.get('sort') || 'date-desc';
  
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(yearParam || '2025');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(teamParam);
  const [selectedAssetType, setSelectedAssetType] = useState<'all' | 'player' | 'pick'>(
    (assetTypeParam as 'all' | 'player' | 'pick') || 'all'
  );
  const [sortBy, setSortBy] = useState<string>(sortParam);
  
  // Update URL with current filter parameters
  useEffect(() => {
    // Create a new URLSearchParams object
    const params = new URLSearchParams();
    
    // Add parameters only if they're not default values
    if (selectedYear !== '2025') {
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
        const yearTrades = await fetchTradesByYear(selectedYear);
        setTrades(yearTrades);
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
      <h1 className="text-3xl font-bold text-center mb-8" id="trades-heading">Trades</h1>
      
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-8" role="search" aria-labelledby="filter-heading">
        <h2 id="filter-heading" className="sr-only">Trade filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Year Filter */}
          <div>
            <label htmlFor="year-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Season
            </label>
            <select
              id="year-filter"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="2025">2025 Season</option>
              <option value="2024">2024 Season</option>
              <option value="2023">2023 Season</option>
            </select>
          </div>
          
          {/* Team Filter */}
          <div>
            <label htmlFor="team-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Team
            </label>
            <select
              id="team-filter"
              value={selectedTeam || ''}
              onChange={(e) => setSelectedTeam(e.target.value || null)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="">All Teams</option>
              {TEAM_NAMES.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </div>
          
          {/* Asset Type Filter */}
          <div>
            <label htmlFor="asset-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Asset Type
            </label>
            <select
              id="asset-filter"
              value={selectedAssetType}
              onChange={(e) => setSelectedAssetType(e.target.value as 'all' | 'player' | 'pick')}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="all">All Assets</option>
              <option value="player">Players Only</option>
              <option value="pick">Draft Picks Only</option>
            </select>
          </div>
          
          {/* Sort Filter */}
          <div>
            <label htmlFor="sort-filter" className="block text-sm font-medium text-gray-700 mb-1">
              Sort By
            </label>
            <select
              id="sort-filter"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="teams-asc">Teams (A-Z)</option>
              <option value="teams-desc">Teams (Z-A)</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Trade Feed */}
      <div className="space-y-6" aria-labelledby="trades-heading">
        {filteredAndSortedTrades.length > 0 ? (
          filteredAndSortedTrades.map((trade) => (
            <Link
              key={trade.id}
              href={`/trades/${trade.id}`}
              className="block bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
              aria-label={`View details of trade between ${trade.teams.map(t => t.name).join(' and ')} from ${new Date(trade.date).toLocaleDateString()}`}
            >
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 sm:px-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    Trade between {trade.teams.map(t => t.name).join(' and ')}
                  </h3>
                  <span className="text-sm text-gray-500">
                    {new Date(trade.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              </div>
              
              <div className="px-4 py-5 sm:p-6">
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
                                fallback.innerHTML = `<span class="text-xs font-bold">${team.name.charAt(0)}</span>`;
                                parent.appendChild(fallback);
                              }
                            }}
                          />
                        </div>
                        <h4 className="font-bold" style={{ color: getTeamColorStyle(team.name).backgroundColor }}>{team.name} received:</h4>
                      </div>
                      <ul className="space-y-1">
                        {team.assets.map((asset, assetIndex) => (
                          <li key={assetIndex} className="text-sm">
                            {asset.type === 'player' ? (
                              <span>
                                {asset.name} ({asset.position}, {asset.team})
                              </span>
                            ) : (
                              <span>
                                {asset.name}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </div>
            
            <div className="bg-gray-50 px-4 py-3 sm:px-6">
              <div className="text-sm">
                <div className="text-blue-600 hover:text-blue-900" aria-hidden="true">
                  View trade details →
                </div>
              </div>
            </div>
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
