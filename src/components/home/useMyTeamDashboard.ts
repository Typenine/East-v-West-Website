'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HomepagePhase } from '@/lib/utils/countdown-resolver';
import type { TradeAsset, TradeWants } from '@/types/trade-block';
import type {
  TeamDashboardPlayer,
  TeamDashboardResponse,
  TeamDashboardSeverity,
} from '@/lib/home/team-dashboard-types';
import { compactTeamName } from '@/components/home/MyTeamCardParts';
import type { MyTeamNewsItem } from '@/components/home/MyTeamSecondaryPanels';

export type MyTeamData = {
  teamName: string;
  rosterCount: number;
  taxiCount: number;
  irCount: number;
  wins: number;
  losses: number;
  fpts: number;
  seed?: number;
  tradeBlock: TradeAsset[];
  tradeWants: TradeWants | null;
  tradeBlockUpdatedAt: string | null;
  tradeBlockPlayerIds: string[];
  tradeBlockPickCount: number;
  ownedPickCount?: number;
};

type PlayerNameResponse = {
  players?: Record<string, { name?: string }>;
};

export function useMyTeamDashboard(data: MyTeamData, phase: HomepagePhase) {
  const [dashboard, setDashboard] = useState<TeamDashboardResponse | null>(null);
  const [news, setNews] = useState<MyTeamNewsItem[]>([]);
  const [tradePlayerNames, setTradePlayerNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { teamName, tradeBlock, tradeWants } = data;
  const tradePlayerIdsKey = data.tradeBlockPlayerIds.join(',');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    fetch('/api/home/my-team', { signal: controller.signal, cache: 'no-store' })
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error('Team dashboard unavailable'))
      )
      .then((teamResponse) => setDashboard(teamResponse as TeamDashboardResponse))
      .catch((error) => {
        if (error?.name !== 'AbortError') setDashboard(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    fetch(
      `/api/league-news?limit=2&sinceHours=336&teamFilter=${encodeURIComponent(teamName)}`,
      { signal: controller.signal }
    )
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((newsResponse) => {
        setNews(Array.isArray(newsResponse?.items) ? newsResponse.items.slice(0, 2) : []);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setNews([]);
      });

    return () => controller.abort();
  }, [teamName]);

  useEffect(() => {
    const ids = data.tradeBlockPlayerIds;
    if (!ids.length) {
      setTradePlayerNames({});
      return;
    }

    const controller = new AbortController();
    setTradePlayerNames({});
    fetch(`/api/players/names?ids=${encodeURIComponent(ids.join(','))}`, {
      signal: controller.signal,
      cache: 'force-cache',
    })
      .then((response) => (response.ok ? response.json() : { players: {} }))
      .then((payload: PlayerNameResponse) => {
        const resolved: Record<string, string> = {};
        for (const id of ids) {
          const name = payload.players?.[id]?.name?.trim();
          if (name && name !== id) resolved[id] = name;
        }
        setTradePlayerNames(resolved);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setTradePlayerNames({});
      });

    return () => controller.abort();
  }, [tradePlayerIdsKey]);

  const playerLookup = useMemo(() => {
    const map = new Map<string, TeamDashboardPlayer>();
    for (const player of dashboard?.roster.players || []) map.set(player.id, player);
    return map;
  }, [dashboard]);

  const activeBlock = tradeBlock.filter(
    (asset) => asset.type === 'player' || asset.type === 'pick' || asset.type === 'faab'
  );
  const featuredAssets = activeBlock.slice(0, 3);
  const wantedPositions = tradeWants?.positions ?? [];
  const tradeLabelsLoading = featuredAssets.some(
    (asset) =>
      asset.type === 'player'
      && !tradePlayerNames[asset.playerId]
      && !playerLookup.get(asset.playerId)?.name
  );
  const tradeLabels = featuredAssets
    .map((asset) => {
      if (asset.type === 'player') {
        return tradePlayerNames[asset.playerId] || playerLookup.get(asset.playerId)?.name || null;
      }
      if (asset.type === 'pick') {
        const original = asset.originalTeam && asset.originalTeam !== teamName
          ? ` (${compactTeamName(asset.originalTeam)})`
          : '';
        return `${asset.year} R${asset.round}${original}`;
      }
      return asset.amount ? `$${asset.amount} FAAB` : 'FAAB';
    })
    .filter((label): label is string => Boolean(label));

  // Team attention is limited to roster and lineup issues. Trade-block age is
  // displayed only as neutral metadata and never creates an alert.
  const alerts = dashboard?.alerts || [];
  const status: TeamDashboardSeverity = dashboard?.status || 'good';

  return {
    data,
    phase,
    dashboard,
    news,
    loading,
    alerts,
    status,
    activeBlock,
    wantedPositions,
    tradeLabels,
    tradeLabelsLoading,
    teamPath: dashboard ? `/teams/${dashboard.rosterId}` : '/teams',
  };
}

export type MyTeamDashboardModel = ReturnType<typeof useMyTeamDashboard>;
