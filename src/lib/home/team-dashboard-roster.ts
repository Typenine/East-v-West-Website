import type { SleeperPlayer } from '@/lib/utils/sleeper-api';
import type { HomepagePhase } from '@/lib/utils/countdown-resolver';
import type {
  TeamDashboardAlert,
  TeamDashboardLoosePlayer,
  TeamDashboardLooseRoster,
  TeamDashboardLooseTransaction,
  TeamDashboardPlayer,
  TeamDashboardSeverity,
} from '@/lib/home/team-dashboard-types';
import {
  dashboardCoreRole,
  dashboardCoreScore,
  dashboardInjurySeverity,
  dashboardNumber,
  dashboardPlayerName,
  dashboardPosition,
  summarizeDashboardTransaction,
} from '@/lib/home/team-dashboard-helpers';

function dynastyCoreRole(player: TeamDashboardPlayer, value: number): string {
  if (value >= 7000) return 'Elite dynasty asset';
  if (value >= 4500) return 'Core dynasty asset';
  if (value > 0) return 'Dynasty asset';
  return dashboardCoreRole(player);
}

export function buildDashboardRoster(args: {
  roster: TeamDashboardLooseRoster;
  playerMap: Record<string, SleeperPlayer>;
  playerValues: Map<string, number>;
  activeLimit: number;
  starterCount: number;
  taxiLimit: number;
  irLimit: number;
  phase: HomepagePhase;
  nflWeek: number;
}) {
  const {
    roster,
    playerMap,
    playerValues,
    activeLimit,
    starterCount,
    taxiLimit,
    irLimit,
    phase,
    nflWeek,
  } = args;
  const taxiIds = new Set((roster.taxi || []).filter(Boolean));
  const reserveIds = new Set((roster.reserve || []).filter(Boolean));
  const starterIds = new Set((roster.starters || []).filter((id) => id && id !== '0'));
  const inSeason = [
    'regular_season',
    'post_deadline_pre_postseason',
    'postseason',
  ].includes(phase);
  const allIds = new Set<string>((roster.players || []).filter(Boolean));
  for (const id of taxiIds) allIds.add(id);
  for (const id of reserveIds) allIds.add(id);

  const players: TeamDashboardPlayer[] = Array.from(allIds).map((id) => {
    const player = playerMap[id] as TeamDashboardLoosePlayer | undefined;
    const ageValue = dashboardNumber(player?.age, NaN);
    const yearsExpValue = dashboardNumber(player?.years_exp, NaN);
    return {
      id,
      name: dashboardPlayerName(playerMap[id], id),
      position: dashboardPosition(player?.position),
      nflTeam: player?.team || null,
      age: Number.isFinite(ageValue) ? ageValue : null,
      yearsExp: Number.isFinite(yearsExpValue) ? yearsExpValue : null,
      injuryStatus: player?.injury_status || null,
      // Sleeper's starter array can be months old during the offseason. Only use
      // it when lineups are currently meaningful.
      isStarter: inSeason && starterIds.has(id),
      onTaxi: taxiIds.has(id),
      onIR: reserveIds.has(id),
    };
  });

  const activePlayers = players.filter((player) => !player.onTaxi && !player.onIR);
  const openSpots = Math.max(0, activeLimit - activePlayers.length);
  const cutsRequired = Math.max(0, activePlayers.length - activeLimit);
  const emptyLineupSlots = inSeason ? Math.max(0, starterCount - starterIds.size) : 0;
  const allowedReserveStatus = /IR|OUT|PUP|NFI|SUSP|NA|COVID/i;
  const irIneligible = inSeason
    ? players.filter(
        (player) => player.onIR && !allowedReserveStatus.test(player.injuryStatus || '')
      ).length
    : 0;

  const positionCounts: Record<string, number> = {};
  for (const player of players) {
    positionCounts[player.position] = (positionCounts[player.position] || 0) + 1;
  }

  // FantasyCalc dynasty values are the primary ranking signal. This prevents
  // stale offseason lineup slots from elevating a low-value player over a true
  // cornerstone such as Brock Bowers. The existing heuristic remains a fallback
  // when the value feed is unavailable.
  const corePlayers = players
    .filter((player) => ['QB', 'RB', 'WR', 'TE'].includes(player.position))
    .sort((a, b) => {
      const valueDifference = (playerValues.get(b.id) || 0) - (playerValues.get(a.id) || 0);
      return valueDifference || dashboardCoreScore(b) - dashboardCoreScore(a);
    })
    .slice(0, 3)
    .map((player) => ({
      ...player,
      role: dynastyCoreRole(player, playerValues.get(player.id) || 0),
    }));
  const rookies = players
    .filter((player) => player.yearsExp === 0)
    .sort((a, b) => {
      const valueDifference = (playerValues.get(b.id) || 0) - (playerValues.get(a.id) || 0);
      return valueDifference
        || Number(b.isStarter) - Number(a.isStarter)
        || dashboardCoreScore(b) - dashboardCoreScore(a);
    })
    .slice(0, 4);

  const alerts: TeamDashboardAlert[] = [];
  if (cutsRequired > 0) {
    alerts.push({
      severity: 'critical',
      title: `${cutsRequired} roster cut${cutsRequired === 1 ? '' : 's'} required`,
      detail: `Active roster is ${activePlayers.length}/${activeLimit}.`,
    });
  }
  if (emptyLineupSlots > 0) {
    alerts.push({
      severity: 'critical',
      title: `${emptyLineupSlots} empty lineup slot${emptyLineupSlots === 1 ? '' : 's'}`,
      detail: `Fill the lineup before Week ${nflWeek} locks.`,
    });
  }
  if (inSeason) {
    const unavailableStarters = players.filter(
      (player) => player.isStarter && dashboardInjurySeverity(player.injuryStatus) >= 2
    );
    if (unavailableStarters.length) {
      alerts.push({
        severity: 'critical',
        title: `${unavailableStarters.length} starter${unavailableStarters.length === 1 ? '' : 's'} unlikely to play`,
        detail: unavailableStarters
          .slice(0, 3)
          .map((player) => `${player.name} (${player.injuryStatus})`)
          .join(', '),
      });
    }
    const questionableStarters = players.filter(
      (player) => player.isStarter && dashboardInjurySeverity(player.injuryStatus) === 1
    );
    if (questionableStarters.length) {
      alerts.push({
        severity: 'warning',
        title: `${questionableStarters.length} starter status update${questionableStarters.length === 1 ? '' : 's'}`,
        detail: questionableStarters
          .slice(0, 3)
          .map((player) => `${player.name} (${player.injuryStatus})`)
          .join(', '),
      });
    }
    const byeStarters = players.filter((player) => {
      const metadata = playerMap[player.id] as TeamDashboardLoosePlayer | undefined;
      return player.isStarter && dashboardNumber(metadata?.bye_week, -1) === nflWeek;
    });
    if (byeStarters.length) {
      alerts.push({
        severity: 'warning',
        title: `${byeStarters.length} starter${byeStarters.length === 1 ? '' : 's'} on bye`,
        detail: byeStarters.slice(0, 3).map((player) => player.name).join(', '),
      });
    }
  }
  if (irIneligible > 0) {
    alerts.push({
      severity: 'warning',
      title: `${irIneligible} possible IR eligibility issue${irIneligible === 1 ? '' : 's'}`,
      detail: 'Review healthy players still occupying reserve slots.',
    });
  }
  if (taxiLimit > 0 && taxiIds.size > taxiLimit) {
    alerts.push({
      severity: 'critical',
      title: 'Taxi squad is over the limit',
      detail: `${taxiIds.size}/${taxiLimit} taxi spots are occupied.`,
    });
  }
  if (openSpots > 0 && cutsRequired === 0) {
    alerts.push({
      severity: 'info',
      title: `${openSpots} open active roster spot${openSpots === 1 ? '' : 's'}`,
      detail: 'The team can add players without making a corresponding cut.',
    });
  }
  if (!alerts.length) {
    alerts.push({
      severity: 'good',
      title: 'Roster is currently compliant',
      detail: 'No lineup, roster-limit, taxi, or reserve issues were detected.',
    });
  }

  const status: TeamDashboardSeverity = alerts.some((alert) => alert.severity === 'critical')
    ? 'critical'
    : alerts.some((alert) => alert.severity === 'warning')
      ? 'warning'
      : alerts.some((alert) => alert.severity === 'info')
        ? 'info'
        : 'good';

  return {
    active: activePlayers.length,
    activeLimit,
    openSpots,
    cutsRequired,
    taxi: taxiIds.size,
    taxiLimit,
    ir: reserveIds.size,
    irLimit,
    irIneligible,
    emptyLineupSlots,
    positionCounts,
    players: players.sort(
      (a, b) => a.position.localeCompare(b.position) || a.name.localeCompare(b.name)
    ),
    rookies,
    corePlayers,
    alerts,
    status,
  };
}

export function buildDashboardTransactions(args: {
  transactions: TeamDashboardLooseTransaction[];
  rosterId: number;
  playerMap: Record<string, SleeperPlayer>;
  nameMap: Map<number, string>;
}) {
  const { transactions, rosterId, playerMap, nameMap } = args;
  return transactions
    .filter((tx) => {
      const status = String(tx.status || '').toLowerCase();
      const complete = !status || status === 'complete' || status === 'completed';
      if (!complete) return false;
      if ((tx.roster_ids || []).includes(rosterId)) return true;
      if (Object.values(tx.adds || {}).includes(rosterId)) return true;
      if (Object.values(tx.drops || {}).includes(rosterId)) return true;
      return (tx.draft_picks || []).some(
        (pick) => pick.owner_id === rosterId || pick.previous_owner_id === rosterId
      );
    })
    .sort(
      (a, b) =>
        dashboardNumber(b.status_updated ?? b.created)
        - dashboardNumber(a.status_updated ?? a.created)
    )
    .map((tx) => ({
      id: tx.transaction_id || `${tx.type || 'transaction'}-${tx.status_updated || tx.created || 0}`,
      type: tx.type || 'transaction',
      summary: summarizeDashboardTransaction(tx, rosterId, playerMap, nameMap),
      timestamp: dashboardNumber(tx.status_updated ?? tx.created) > 0
        ? new Date(dashboardNumber(tx.status_updated ?? tx.created)).toISOString()
        : null,
    }))
    .filter(
      (entry): entry is { id: string; type: string; summary: string; timestamp: string | null } =>
        Boolean(entry.summary)
    )
    .slice(0, 3);
}
