'use client';

import { useEffect, useMemo, useState } from 'react';
import type { HomepagePhase } from '@/lib/utils/countdown-resolver';
import type { TradeAsset, TradeWants } from '@/types/trade-block';
import type {
  TeamDashboardAlert,
  TeamDashboardPlayer,
  TeamDashboardResponse,
  TeamDashboardSeverity,
} from '@/lib/home/team-dashboard-types';
import {
  compactTeamName,
  isTeamDataStale,
  teamTimeAgo,
} from '@/components/home/MyTeamCardParts';
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

export function useMyTeamDashboard(data: MyTeamData, phase: HomepagePhase) {
  const [dashboard, setDashboard] = useState<TeamDashboardResponse | null>(null);
  const [news, setNews] = useState<MyTeamNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { teamName, tradeBlock, tradeWants, tradeBlockUpdatedAt } = data;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      fetch('/api/home/my-team', { signal: controller.signal, cache: 'no-store' })
        .then((response) =>
          response.ok
            ? response.json()
            : Promise.reject(new Error('Team dashboard unavailable'))
        ),
      fetch(
        `/api/league-news?limit=2&sinceHours=336&teamFilter=${encodeURIComponent(teamName)}`,
        { signal: controller.signal }
      )
        .then((response) => (response.ok ? response.json() : { items: [] }))
        .catch(() => ({ items: [] })),
    ])
      .then(([teamResponse, newsResponse]) => {
        setDashboard(teamResponse as TeamDashboardResponse);
        setNews(Array.isArray(newsResponse?.items) ? newsResponse.items.slice(0, 2) : []);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setDashboard(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [teamName]);

  const playerLookup = useMemo(() => {
    const map = new Map<string, TeamDashboardPlayer>();
    for (const player of dashboard?.roster.players || []) map.set(player.id, player);
    return map;
  }, [dashboard]);

  const activeBlock = tradeBlock.filter(
    (asset) => asset.type === 'player' || asset.type === 'pick' || asset.type === 'faab'
  );
  const wantedPositions = tradeWants?.positions ?? [];
  const tradeLabels = activeBlock.slice(0, 3).map((asset) => {
    if (asset.type === 'player') {
      return playerLookup.get(asset.playerId)?.name || `Player ${asset.playerId}`;
    }
    if (asset.type === 'pick') {
      const original = asset.originalTeam && asset.originalTeam !== teamName
        ? ` (${compactTeamName(asset.originalTeam)})`
        : '';
      return `${asset.year} R${asset.round}${original}`;
    }
    return asset.amount ? `$${asset.amount} FAAB` : 'FAAB';
  });

  const alerts = useMemo(() => {
    const rows: TeamDashboardAlert[] = [...(dashboard?.alerts || [])];
    if (activeBlock.length > 0 && isTeamDataStale(tradeBlockUpdatedAt, 14)) {
      rows.push({
        severity: 'warning',
        title: 'Trade block is stale',
        detail: `The team last updated this trade block ${teamTimeAgo(tradeBlockUpdatedAt)}. Confirm the listed assets and team needs.`,
      });
    }
    return rows;
  }, [dashboard, activeBlock.length, tradeBlockUpdatedAt]);

  // The header status reflects roster and lineup readiness only. Trade-block
  // freshness remains visible as a separate management reminder below.
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
    teamPath: dashboard ? `/teams/${dashboard.rosterId}` : '/teams',
  };
}

export type MyTeamDashboardModel = ReturnType<typeof useMyTeamDashboard>;
