'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { CURRENT_SEASON, LEAGUE_IDS, TEAM_NAMES } from '@/lib/constants/league';
import type { TradeFeedPayload } from '@/lib/trades/trade-card-model';
import { TradeCard, TradeCardSkeleton } from '@/components/trades/TradeCard';
import EmptyState from '@/components/ui/empty-state';
import { Chip } from '@/components/ui/Chip';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

// Trade Block code is only loaded when the tab is opened, keeping it out of
// the initial feed bundle.
const TradeBlockTab = dynamic(() => import('@/components/trades/TradeBlockTab'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <TradeCardSkeleton />
      <TradeCardSkeleton />
    </div>
  ),
});

const BUST_KEY = 'EVW_TRADES_CACHE_BUST';
const REFRESH_AFTER_MS = 60 * 1000;

type AssetFilter = 'all' | 'QB' | 'RB' | 'WR' | 'TE' | 'DEF' | 'K' | 'r1' | 'r2' | 'r3' | 'r4';
const VALID_ASSET_FILTERS: AssetFilter[] = ['all', 'QB', 'RB', 'WR', 'TE', 'DEF', 'K', 'r1', 'r2', 'r3', 'r4'];

export default function TradesFeedClient({ initialFeed }: { initialFeed: TradeFeedPayload }) {
  const router = useRouter();

  const [feed, setFeed] = useState<TradeFeedPayload>(initialFeed);
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedAssetType, setSelectedAssetType] = useState<AssetFilter>('all');
  const [sortBy, setSortBy] = useState('date-desc');
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<'feed' | 'block'>('feed');
  const [refreshing, setRefreshing] = useState(false);

  const hydratedFromUrlRef = useRef(false);
  const refreshingRef = useRef(false);
  const feedTsRef = useRef(initialFeed.generatedAt);
  feedTsRef.current = feed.generatedAt;

  // Restore deep-linked filters from the URL after hydration (the server
  // renders the default view so the card markup is in the initial HTML).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const year = params.get('year');
    const team = params.get('team');
    const assetType = params.get('assetType');
    const sort = params.get('sort');
    if (year) setSelectedYear(year);
    if (team) setSelectedTeam(team);
    if (assetType && (VALID_ASSET_FILTERS as string[]).includes(assetType)) {
      setSelectedAssetType(assetType as AssetFilter);
    }
    if (sort) setSortBy(sort);
    hydratedFromUrlRef.current = true;
  }, []);

  // Keep the URL in sync with the active filters
  useEffect(() => {
    if (!hydratedFromUrlRef.current) return;
    const params = new URLSearchParams();
    if (selectedYear !== 'all') params.set('year', selectedYear);
    if (selectedTeam) params.set('team', selectedTeam);
    if (selectedAssetType !== 'all') params.set('assetType', selectedAssetType);
    if (sortBy !== 'date-desc') params.set('sort', sortBy);
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [selectedYear, selectedTeam, selectedAssetType, sortBy]);

  // Background refresh against the precomputed server feed (cheap JSON).
  const refreshFeed = useCallback(async (opts?: { fresh?: boolean }) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/trades/feed${opts?.fresh ? '?fresh=1' : ''}`, { cache: 'no-store' });
      if (!res.ok) return;
      const next = (await res.json()) as TradeFeedPayload;
      if (Array.isArray(next?.trades) && next.generatedAt >= feedTsRef.current) {
        setFeed(next);
      }
    } catch {
      // keep showing the data we have
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  // Refresh once on mount if the server-rendered payload is older than the TTL
  useEffect(() => {
    if (Date.now() - feedTsRef.current > REFRESH_AFTER_MS) {
      refreshFeed();
    }
  }, [refreshFeed]);

  // Refetch when the user returns to the tab so new Sleeper trades appear quickly
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      if (Date.now() - feedTsRef.current > REFRESH_AFTER_MS) refreshFeed();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshFeed]);

  // Cross-tab cache busts (edits from Admin) force a fresh server rebuild
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === BUST_KEY) refreshFeed({ fresh: true });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refreshFeed]);

  // Admin status for Add/Edit controls
  useEffect(() => {
    fetch('/api/admin-login')
      .then((r) => r.json())
      .then((j) => setIsAdmin(Boolean(j?.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, []);

  const seasonOptions = useMemo(
    () => [CURRENT_SEASON, ...Object.keys(LEAGUE_IDS.PREVIOUS || {})].sort((a, b) => b.localeCompare(a)),
    []
  );

  const teamOptions = useMemo(() => {
    const names = new Set<string>(TEAM_NAMES);
    for (const t of feed.trades) for (const team of t.teams) names.add(team.name);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [feed.trades]);

  const filteredTrades = useMemo(() => {
    const list = feed.trades.filter((trade) => {
      if (selectedYear !== 'all' && trade.season !== selectedYear) return false;
      if (selectedTeam && !trade.teams.some((t) => t.name === selectedTeam)) return false;
      if (selectedAssetType !== 'all') {
        const isRoundFilter = selectedAssetType.startsWith('r');
        const matches = trade.teams.some((team) =>
          team.assets.some((asset) => {
            if (isRoundFilter) {
              const roundWanted = Number(selectedAssetType.slice(1));
              return asset.kind === 'pick' && asset.round === roundWanted;
            }
            return (
              (asset.kind === 'player' && asset.position === selectedAssetType) ||
              (asset.kind === 'pick' && asset.becamePosition === selectedAssetType)
            );
          })
        );
        if (!matches) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      switch (sortBy) {
        case 'date-asc':
          return a.date.localeCompare(b.date);
        case 'teams-asc':
          return (a.teams[0]?.name || '').localeCompare(b.teams[0]?.name || '');
        case 'teams-desc':
          return (b.teams[0]?.name || '').localeCompare(a.teams[0]?.name || '');
        case 'date-desc':
        default:
          return b.date.localeCompare(a.date);
      }
    });
  }, [feed.trades, selectedYear, selectedTeam, selectedAssetType, sortBy]);

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader
        title="Trades"
        actions={isAdmin ? (
          <Button onClick={() => router.push('/admin/trades')} aria-label="Add a manual trade">
            Add Trade
          </Button>
        ) : undefined}
      />
      <h1 id="trades-heading" className="sr-only">Trades</h1>

      <div className="mb-4 flex gap-2" role="tablist" aria-orientation="horizontal">
        <Chip
          role="tab"
          aria-selected={tab === 'feed'}
          id="tab-feed"
          aria-controls="panel-feed"
          selected={tab === 'feed'}
          onClick={() => setTab('feed')}
        >
          Feed
        </Chip>
        <Chip
          role="tab"
          aria-selected={tab === 'block'}
          id="tab-block"
          aria-controls="panel-block"
          selected={tab === 'block'}
          onClick={() => setTab('block')}
        >
          Trade Block
        </Chip>
      </div>

      {tab === 'feed' ? (
        <div role="tabpanel" id="panel-feed" aria-labelledby="tab-feed">
          {/* Filters */}
          <Card role="search" aria-labelledby="filter-heading" className="mb-8">
            <CardContent>
              <h2 id="filter-heading" className="sr-only">Trade filters</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="year-filter">Season</Label>
                  <Select
                    id="year-filter"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                  >
                    <option value="all">All Time</option>
                    {seasonOptions.map((season) => (
                      <option key={season} value={season}>{season} Season</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="team-filter">Team</Label>
                  <Select
                    id="team-filter"
                    value={selectedTeam || ''}
                    onChange={(e) => setSelectedTeam(e.target.value || null)}
                  >
                    <option value="">All Teams</option>
                    {teamOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="asset-filter">Asset Filter</Label>
                  <Select
                    id="asset-filter"
                    value={selectedAssetType}
                    onChange={(e) => setSelectedAssetType(e.target.value as AssetFilter)}
                  >
                    <option value="all">All Assets</option>
                    <option value="QB">QB</option>
                    <option value="RB">RB</option>
                    <option value="WR">WR</option>
                    <option value="TE">TE</option>
                    <option value="DEF">DEF</option>
                    <option value="K">K</option>
                    <option value="r1">1st Round Pick</option>
                    <option value="r2">2nd Round Pick</option>
                    <option value="r3">3rd Round Pick</option>
                    <option value="r4">4th Round Pick</option>
                  </Select>
                </div>

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
          <div className="space-y-5" aria-labelledby="trades-heading" aria-busy={refreshing}>
            {filteredTrades.length > 0 ? (
              filteredTrades.map((trade, index) => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  priority={index === 0}
                  deferRender={index >= 5}
                  editHref={
                    isAdmin && trade.status === 'completed'
                      ? `/admin/trades?edit=${encodeURIComponent(trade.id)}`
                      : undefined
                  }
                />
              ))
            ) : feed.trades.length === 0 ? (
              <EmptyState
                title="No Trades Available"
                message="Trade data could not be loaded right now."
                action={{ label: 'Refresh trades', onClick: () => refreshFeed({ fresh: true }) }}
              />
            ) : (
              <EmptyState
                title="No Trades Found"
                message="There are no trades matching your current filters."
                action={{
                  label: 'Clear all trade filters',
                  onClick: () => {
                    setSelectedYear('all');
                    setSelectedTeam(null);
                    setSelectedAssetType('all');
                    setSortBy('date-desc');
                  },
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <div role="tabpanel" id="panel-block" aria-labelledby="tab-block">
          <TradeBlockTab />
        </div>
      )}
    </div>
  );
}
