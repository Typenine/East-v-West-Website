import { getLeagueMatchups, type SleeperPlayer } from '@/lib/utils/sleeper-api';
import type { HomepagePhase } from '@/lib/utils/countdown-resolver';
import type {
  TeamDashboardLooseTeam,
  TeamDashboardLooseTransaction,
  TeamDashboardPlayer,
  TeamDashboardResponse,
} from '@/lib/home/team-dashboard-types';

export function dashboardNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function dashboardPlayerName(player: SleeperPlayer | undefined, fallback: string): string {
  if (!player) return fallback;
  return `${player.first_name || ''} ${player.last_name || ''}`.trim() || fallback;
}

export function sleeperStat(settings: Record<string, unknown> | undefined, key: string): number {
  if (!settings) return 0;
  return dashboardNumber(settings[key]) + dashboardNumber(settings[`${key}_decimal`]) / 100;
}

export function dashboardPosition(position: string | null | undefined): string {
  const pos = String(position || 'Other').toUpperCase();
  if (pos === 'DST') return 'DEF';
  if (pos === 'HB' || pos === 'FB') return 'RB';
  if (['DE', 'DT', 'DL', 'EDGE'].includes(pos)) return 'DL';
  if (['CB', 'S', 'FS', 'SS', 'DB'].includes(pos)) return 'DB';
  return pos;
}

export function roundOrdinal(round: number): string {
  if (round === 1) return '1st';
  if (round === 2) return '2nd';
  if (round === 3) return '3rd';
  return `${round}th`;
}

export function rankDashboardValues(
  rows: Array<{ team: string; value: number }>,
  direction: 'asc' | 'desc'
): Map<string, number> {
  const sorted = [...rows].sort((a, b) =>
    direction === 'desc' ? b.value - a.value : a.value - b.value
  );
  const ranks = new Map<string, number>();
  let previous: number | null = null;
  let previousRank = 0;
  sorted.forEach((row, index) => {
    const rank = previous !== null && row.value === previous ? previousRank : index + 1;
    ranks.set(row.team, rank);
    previous = row.value;
    previousRank = rank;
  });
  return ranks;
}

export function dashboardDraftPickValue(
  year: number,
  round: number,
  slot: number | null,
  currentYear: number,
  teamCount: number
): number {
  const roundBase: Record<number, number> = { 1: 100, 2: 45, 3: 20, 4: 8 };
  const base = roundBase[round] ?? Math.max(2, 12 - round * 2);
  const futureDiscount = Math.pow(0.82, Math.max(0, year - currentYear));
  if (slot == null || teamCount <= 1) return base * futureDiscount;
  const slotMultiplier = 1.3 - ((slot - 1) / (teamCount - 1)) * 0.6;
  return base * slotMultiplier * futureDiscount;
}

export function dashboardPowerPercent(rank: number | undefined, leagueSize: number): number {
  if (!rank || leagueSize <= 1) return 0.5;
  return (leagueSize - rank) / (leagueSize - 1);
}

export function dashboardInjurySeverity(status: string | null): number {
  const normalized = String(status || '').toUpperCase();
  if (/IR|OUT|PUP|NFI|SUSP/.test(normalized)) return 3;
  if (/DOUBTFUL/.test(normalized)) return 2;
  if (/QUESTIONABLE|LIMITED|DAY/.test(normalized)) return 1;
  return 0;
}

export function dashboardCoreScore(player: TeamDashboardPlayer): number {
  const positionBase: Record<string, number> = {
    QB: 100,
    WR: 82,
    RB: 78,
    TE: 72,
    DEF: 30,
    K: 10,
  };
  let score = positionBase[player.position] ?? 35;
  if (player.isStarter) score += 24;
  if (player.age != null) {
    if (player.age <= 24) score += 18;
    else if (player.age <= 27) score += 11;
    else if (player.age >= 31) score -= 8;
  }
  if (player.yearsExp != null && player.yearsExp <= 2) score += 8;
  if (player.onTaxi) score -= 10;
  return score - dashboardInjurySeverity(player.injuryStatus) * 4;
}

export function dashboardCoreRole(player: TeamDashboardPlayer): string {
  if (player.onTaxi) return 'Taxi prospect';
  if (player.isStarter && player.age != null && player.age <= 25) return 'Young starter';
  if (player.isStarter) return 'Starter';
  if (player.yearsExp != null && player.yearsExp <= 1) return 'Young core';
  return 'Core asset';
}

export function summarizeDashboardTransaction(
  tx: TeamDashboardLooseTransaction,
  rosterId: number,
  players: Record<string, SleeperPlayer>,
  nameMap: Map<number, string>
): string | null {
  const added = Object.entries(tx.adds || {})
    .filter(([, receivingRoster]) => receivingRoster === rosterId)
    .map(([playerId]) => dashboardPlayerName(players[playerId], playerId));
  const dropped = Object.entries(tx.drops || {})
    .filter(([, droppingRoster]) => droppingRoster === rosterId)
    .map(([playerId]) => dashboardPlayerName(players[playerId], playerId));
  const receivedPicks = (tx.draft_picks || [])
    .filter((pick) => pick.owner_id === rosterId && pick.previous_owner_id !== rosterId)
    .map((pick) => `${pick.season || ''} ${roundOrdinal(dashboardNumber(pick.round, 1))}`.trim());
  const sentPicks = (tx.draft_picks || [])
    .filter((pick) => pick.previous_owner_id === rosterId && pick.owner_id !== rosterId)
    .map((pick) => `${pick.season || ''} ${roundOrdinal(dashboardNumber(pick.round, 1))}`.trim());

  const parts: string[] = [];
  if (added.length) parts.push(`Added ${added.slice(0, 3).join(', ')}`);
  if (receivedPicks.length) parts.push(`Received ${receivedPicks.slice(0, 2).join(', ')}`);
  if (dropped.length) parts.push(`Moved ${dropped.slice(0, 3).join(', ')}`);
  if (sentPicks.length) parts.push(`Sent ${sentPicks.slice(0, 2).join(', ')}`);

  if (!parts.length && tx.type === 'trade') {
    const otherTeams = (tx.roster_ids || [])
      .filter((id) => id !== rosterId)
      .map((id) => nameMap.get(id) || `Roster ${id}`);
    return otherTeams.length ? `Trade with ${otherTeams.join(', ')}` : 'Trade completed';
  }
  return parts.length ? parts.join(' · ') : null;
}

export async function loadDashboardMatchup(args: {
  leagueId: string;
  rosterId: number;
  nameMap: Map<number, string>;
  teams: TeamDashboardLooseTeam[];
  phase: HomepagePhase;
  nflWeek: number;
  playoffTeams: number;
}): Promise<TeamDashboardResponse['matchup']> {
  const { leagueId, rosterId, nameMap, teams, phase, nflWeek, playoffTeams } = args;
  if (!['regular_season', 'post_deadline_pre_postseason', 'postseason'].includes(phase)) {
    return null;
  }

  const week = Math.max(1, Math.min(17, nflWeek));
  const matchups = await getLeagueMatchups(leagueId, week).catch(() => []);
  const mine = matchups.find((entry) => entry.roster_id === rosterId);
  if (!mine) return null;
  const opponent = matchups.find(
    (entry) => entry.matchup_id === mine.matchup_id && entry.roster_id !== rosterId
  );
  if (!opponent) return null;

  const minePoints = dashboardNumber(mine.custom_points ?? mine.points);
  const opponentPoints = dashboardNumber(opponent.custom_points ?? opponent.points);
  const hasScore = minePoints > 0 || opponentPoints > 0;
  const opponentTeam = teams.find((team) => team.rosterId === opponent.roster_id);

  const previousWeeks = Array.from({ length: 3 }, (_, index) => week - 3 + index)
    .filter((value) => value >= 1);
  const previousMatchups = await Promise.all(
    previousWeeks.map((previousWeek) =>
      getLeagueMatchups(leagueId, previousWeek).catch(() => [])
    )
  );
  const recentForm: Array<'W' | 'L' | 'T'> = [];
  for (const weekRows of previousMatchups) {
    const teamRow = weekRows.find((entry) => entry.roster_id === rosterId);
    if (!teamRow) continue;
    const opponentRow = weekRows.find(
      (entry) => entry.matchup_id === teamRow.matchup_id && entry.roster_id !== rosterId
    );
    if (!opponentRow) continue;
    const teamPoints = dashboardNumber(teamRow.custom_points ?? teamRow.points);
    const otherPoints = dashboardNumber(opponentRow.custom_points ?? opponentRow.points);
    if (teamPoints === 0 && otherPoints === 0) continue;
    recentForm.push(teamPoints > otherPoints ? 'W' : teamPoints < otherPoints ? 'L' : 'T');
  }

  const postseasonPath = phase === 'postseason'
    ? (teams
        .slice()
        .sort((a, b) =>
          dashboardNumber(b.wins) - dashboardNumber(a.wins)
          || dashboardNumber(b.fpts) - dashboardNumber(a.fpts)
        )
        .findIndex((team) => team.rosterId === rosterId) + 1 <= playoffTeams
      ? 'Championship bracket'
      : 'Toilet Bowl')
    : null;

  return {
    week,
    opponent: nameMap.get(opponent.roster_id)
      || opponentTeam?.teamName
      || `Roster ${opponent.roster_id}`,
    opponentRosterId: opponent.roster_id,
    opponentWins: dashboardNumber(opponentTeam?.wins),
    opponentLosses: dashboardNumber(opponentTeam?.losses),
    teamScore: hasScore ? minePoints : null,
    opponentScore: hasScore ? opponentPoints : null,
    recentForm,
    postseasonPath,
  };
}
